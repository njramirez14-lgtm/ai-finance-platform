from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.entity import Entity
from srv.models.reminder import Reminder
from srv.schemas.reminder import ReminderCreate, ReminderOut, ReminderUpdate

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _verify_entity(db: Session, entity_id: int | None, user_id: int) -> None:
    if entity_id is None:
        return
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.user_id == user_id).first()
    if not e:
        raise HTTPException(status_code=400, detail="Entity not found or not yours")


def _get_owned(db: Session, reminder_id: int, user_id: int) -> Reminder:
    r = (
        db.query(Reminder)
        .filter(Reminder.id == reminder_id, Reminder.user_id == user_id)
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return r


@router.post("/", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
def create_reminder(
    payload: ReminderCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_entity(db, payload.entity_id, current_user.id)
    r = Reminder(
        user_id=current_user.id,
        entity_id=payload.entity_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        due_at=payload.due_at,
        repeat_rule=payload.repeat_rule or "NONE",
        status=payload.status,
        notify_at=payload.notify_at,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/", response_model=list[ReminderOut])
def list_reminders(
    entity_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    horizon_days: int = Query(default=365, ge=1, le=3650),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Reminder).filter(Reminder.user_id == current_user.id)
    if entity_id is not None:
        q = q.filter(Reminder.entity_id == entity_id)
    if status_filter:
        q = q.filter(Reminder.status == status_filter.upper())
    cutoff = datetime.now(timezone.utc) + timedelta(days=horizon_days)
    q = q.filter(Reminder.due_at <= cutoff)
    return q.order_by(Reminder.status.asc(), Reminder.due_at.asc()).all()


@router.put("/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: int,
    payload: ReminderUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    r = _get_owned(db, reminder_id, current_user.id)
    if payload.entity_id is not None:
        _verify_entity(db, payload.entity_id, current_user.id)
        r.entity_id = payload.entity_id
    for field in ("title", "description", "category", "due_at", "repeat_rule", "status", "notify_at"):
        v = getattr(payload, field, None)
        if v is not None:
            setattr(r, field, v)
    if payload.status == "DONE" and not r.completed_at:
        r.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(r)
    return r


@router.post("/{reminder_id}/complete", response_model=ReminderOut)
def complete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    r = _get_owned(db, reminder_id, current_user.id)
    r.status = "DONE"
    r.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    r = _get_owned(db, reminder_id, current_user.id)
    db.delete(r)
    db.commit()
    return None
