"""Notifications config + email cron."""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.employee import Employee
from srv.models.employee_document import EmployeeDocument
from srv.models.reminder import Reminder
from srv.models.settings import Settings
from srv.models.user import User
from srv.services.email import is_configured as email_is_configured
from srv.services.email import render_digest, send_email

log = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])

CRON_SECRET = (os.getenv("CRON_SECRET") or "").strip()


def _check_cron(x_cron_secret: str | None, authorization: str | None) -> None:
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="CRON_SECRET not configured")
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization.split(" ", 1)[1].strip()
    if x_cron_secret != CRON_SECRET and bearer != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


def _ensure_settings(db: Session, user_id: int) -> Settings:
    s = db.query(Settings).filter(Settings.user_id == user_id).first()
    if not s:
        s = Settings(user_id=user_id, currency="EUR", theme="light")
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


class PrefsPayload(BaseModel):
    notify_email: str | None = None
    email_alerts_enabled: bool | None = None
    notify_reminders: bool | None = None
    notify_payroll: bool | None = None
    notify_documents: bool | None = None
    notify_investment_alerts: bool | None = None


@router.get("/preferences")
def get_preferences(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    s = _ensure_settings(db, current_user.id)
    return {
        "notify_email": s.notify_email or current_user.email,
        "email_alerts_enabled": bool(s.email_alerts_enabled),
        "notify_reminders": bool(s.notify_reminders),
        "notify_payroll": bool(s.notify_payroll),
        "notify_documents": bool(s.notify_documents),
        "notify_investment_alerts": bool(s.notify_investment_alerts),
        "provider_configured": email_is_configured(),
    }


@router.put("/preferences")
def update_preferences(
    payload: PrefsPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    s = _ensure_settings(db, current_user.id)
    for field in (
        "notify_email", "email_alerts_enabled", "notify_reminders",
        "notify_payroll", "notify_documents", "notify_investment_alerts",
    ):
        v = getattr(payload, field, None)
        if v is not None:
            setattr(s, field, v)
    db.commit()
    return get_preferences(db, current_user)


@router.post("/test-email")
def send_test_email(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not email_is_configured():
        raise HTTPException(status_code=501, detail="RESEND_API_KEY no configurada en el backend")
    s = _ensure_settings(db, current_user.id)
    to = s.notify_email or current_user.email
    subject, html, text = render_digest(
        to,
        reminders=[{"title": "Esto es un test", "due": "ahora", "category": "TEST"}],
        paydays=[],
        expiring_docs=[],
    )
    res = send_email(to=to, subject="[test] " + subject, html=html, text=text)
    return {"ok": True, "to": to, "provider_response": res}


def _build_user_digest(db: Session, user: User, settings: Settings) -> tuple[list, list, list]:
    today = date.today()
    now = datetime.now(timezone.utc)
    reminders_out = []
    paydays_out = []
    docs_out = []

    if settings.notify_reminders:
        cutoff = now + timedelta(days=7)
        rs = (
            db.query(Reminder)
            .filter(
                Reminder.user_id == user.id,
                Reminder.status == "PENDING",
                Reminder.due_at <= cutoff,
            )
            .order_by(Reminder.due_at.asc())
            .all()
        )
        for r in rs:
            reminders_out.append({
                "title": r.title,
                "due": r.due_at.strftime("%d/%m/%Y %H:%M"),
                "category": r.category,
            })

    if settings.notify_payroll:
        emps = (
            db.query(Employee)
            .filter(Employee.user_id == user.id, Employee.status == "ACTIVE")
            .all()
        )
        for e in emps:
            if not e.payment_day:
                continue
            year, month = today.year, today.month
            if e.payment_day < today.day:
                month += 1
                if month > 12:
                    month, year = 1, year + 1
            try:
                day = min(e.payment_day, 28)
                next_pay = date(year, month, day)
            except ValueError:
                continue
            delta = (next_pay - today).days
            if 0 <= delta <= 3:
                paydays_out.append({
                    "name": e.name,
                    "amount": f"{float(e.monthly_salary or 0):.0f}€",
                    "date": next_pay.strftime("%d/%m/%Y"),
                    "days": delta,
                })

    if settings.notify_documents:
        cutoff = today + timedelta(days=30)
        docs = (
            db.query(EmployeeDocument, Employee.name)
            .join(Employee, EmployeeDocument.employee_id == Employee.id)
            .filter(
                EmployeeDocument.user_id == user.id,
                EmployeeDocument.expires_at.isnot(None),
                EmployeeDocument.expires_at <= cutoff,
                EmployeeDocument.status == "ACTIVE",
            )
            .all()
        )
        for d, emp_name in docs:
            docs_out.append({
                "title": d.title,
                "employee": emp_name,
                "expires": d.expires_at.strftime("%d/%m/%Y"),
            })

    return reminders_out, paydays_out, docs_out


@router.get("/cron/email-daily")
@router.post("/cron/email-daily")
def cron_email_daily(
    x_cron_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Daily email digest: pending reminders (7d), upcoming paydays (3d),
    expiring docs (30d). One email per user with email_alerts_enabled."""
    _check_cron(x_cron_secret, authorization)
    if not email_is_configured():
        return {"ok": False, "reason": "RESEND_API_KEY not configured"}

    users = db.query(User).all()
    sent = 0
    skipped_empty = 0
    skipped_optout = 0
    errors = []

    for u in users:
        s = _ensure_settings(db, u.id)
        if not s.email_alerts_enabled:
            skipped_optout += 1
            continue
        reminders, paydays, docs = _build_user_digest(db, u, s)
        if not (reminders or paydays or docs):
            skipped_empty += 1
            continue
        to = s.notify_email or u.email
        subject, html, text = render_digest(to, reminders, paydays, docs)
        try:
            send_email(to=to, subject=subject, html=html, text=text)
            sent += 1
        except Exception as exc:
            errors.append({"user_id": u.id, "error": str(exc)[:200]})
            log.exception("Email send failed for user %s", u.id)

    return {
        "ok": True,
        "as_of": datetime.utcnow().isoformat(),
        "sent": sent,
        "skipped_empty": skipped_empty,
        "skipped_optout": skipped_optout,
        "errors": errors,
    }
