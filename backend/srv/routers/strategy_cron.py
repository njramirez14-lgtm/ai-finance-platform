"""Daily strategy cron — invoked by Vercel scheduled function.

Flow:
1. Fetch global market signals (VIX + S&P 500 drawdown).
2. For each trigger that fires today and was NOT fired in the last 7 days,
   log it in `market_trigger_log` (global) and create a `market_alerts` row
   for each active user. If the user has Telegram linked, push the alert.
3. Around the 1st of each month, fire a monthly reminder per active user
   asking them to confirm the 400€ core DCA contribution.

Protected by `X-Cron-Secret` header matching env var `STRATEGY_CRON_SECRET`.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from fastapi import Depends
from srv.models.strategy import InvestmentPlan, MarketAlert, MarketTriggerLog
from srv.models.telegram import TelegramLink
from srv.routers.strategy import (
    UA_HEADERS,
    _fetch_yahoo_history,
    _evaluate_semaphore,
)
from srv.routers.telegram import tg_send_message

router = APIRouter(prefix="/strategy/cron", tags=["strategy-cron"])

CRON_SECRET = (os.getenv("CRON_SECRET") or os.getenv("STRATEGY_CRON_SECRET") or "").strip()

TRIGGER_DEDUPE_DAYS = 7

TRIGGER_LABELS = {
    "vix_above_30": ("Volatilidad elevada", "El VIX ha superado 30. Históricamente, una buena ventana para añadir capital."),
    "sp500_drawdown_10": ("S&P 500 -10% desde máximos", "Caída del 10% desde el último pico. Despliegue parcial de la reserva."),
    "sp500_drawdown_15": ("S&P 500 -15% desde máximos", "Bajada significativa. Despliegue importante de la reserva."),
    "sp500_drawdown_20": ("S&P 500 -20% desde máximos — bear market", "Oportunidad histórica. Despliegue total de la reserva acumulada."),
}

TRIGGER_DEPLOY_PCT = {
    "vix_above_30": Decimal("0.30"),
    "sp500_drawdown_10": Decimal("0.30"),
    "sp500_drawdown_15": Decimal("0.50"),
    "sp500_drawdown_20": Decimal("1.00"),
}


def _check_secret(x_cron_secret: str | None, authorization: str | None) -> None:
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="CRON_SECRET not configured")
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization.split(" ", 1)[1].strip()
    if x_cron_secret != CRON_SECRET and bearer != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


def _is_same_month(a: datetime | None, b: datetime) -> bool:
    if a is None:
        return False
    return a.year == b.year and a.month == b.month


async def _fetch_global_signals() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=12, headers=UA_HEADERS) as client:
        vix_data = await _fetch_yahoo_history(client, "^VIX", "1mo")
        sp_data = await _fetch_yahoo_history(client, "^GSPC", "1y")
    vix = vix_data["price"] if vix_data else None
    sp_price = sp_data["price"] if sp_data else None
    sp_peak = max(sp_data["highs"]) if (sp_data and sp_data["highs"]) else None
    sp_drawdown = None
    if sp_price and sp_peak and sp_peak > 0:
        sp_drawdown = (sp_price - sp_peak) / sp_peak * 100
    color, label, triggers, action, _, _ = _evaluate_semaphore(vix, sp_drawdown)
    return {
        "vix": vix,
        "sp500_price": sp_price,
        "sp500_peak": sp_peak,
        "sp500_drawdown_pct": sp_drawdown,
        "triggers": triggers,
        "semaphore": color,
        "semaphore_label": label,
    }


def _was_trigger_recently_fired(db: Session, trigger_kind: str, now: datetime) -> bool:
    cutoff = now - timedelta(days=TRIGGER_DEDUPE_DAYS)
    existing = (
        db.query(MarketTriggerLog)
        .filter(
            MarketTriggerLog.trigger_kind == trigger_kind,
            MarketTriggerLog.fired_at >= cutoff,
        )
        .first()
    )
    return existing is not None


async def _push_telegram(
    db: Session, user_id: int, title: str, body: str, alert_id: int
) -> bool:
    link = db.query(TelegramLink).filter(TelegramLink.user_id == user_id).first()
    if not link:
        return False
    text = f"<b>{title}</b>\n\n{body}\n\n<i>Abre la app para confirmar o descartar.</i>"
    keyboard = {
        "inline_keyboard": [
            [{"text": "Abrir app", "url": "https://ai-finance-frontend-six.vercel.app/strategy"}],
        ]
    }
    try:
        await tg_send_message(link.chat_id, text, reply_markup=keyboard)
        return True
    except Exception:
        return False


@router.get("/daily")
@router.post("/daily")
async def run_daily_cron(
    x_cron_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _check_secret(x_cron_secret, authorization)

    now = datetime.now(timezone.utc)
    signals = await _fetch_global_signals()
    triggers: list[str] = signals["triggers"]

    active_plans = (
        db.query(InvestmentPlan).filter(InvestmentPlan.active.is_(True)).all()
    )

    alerts_created = 0
    telegram_sent = 0
    triggers_processed: list[str] = []

    # ── Trigger-driven alerts ─────────────────────────────────────────
    for trig in triggers:
        if _was_trigger_recently_fired(db, trig, now):
            continue
        triggers_processed.append(trig)
        title, message = TRIGGER_LABELS.get(trig, (trig, "Disparador de mercado activo."))
        deploy_pct = TRIGGER_DEPLOY_PCT.get(trig, Decimal("0.30"))

        log = MarketTriggerLog(
            trigger_kind=trig,
            fired_at=now,
            signal_value=(
                Decimal(str(signals["sp500_drawdown_pct"]))
                if trig.startswith("sp500_") and signals["sp500_drawdown_pct"] is not None
                else (Decimal(str(signals["vix"])) if trig == "vix_above_30" and signals["vix"] else None)
            ),
            notes=signals["semaphore_label"],
        )
        db.add(log)

        for plan in active_plans:
            reserve = Decimal(str(plan.reserve_balance or 0))
            suggested_amt = (reserve * deploy_pct).quantize(Decimal("0.01"))
            alert = MarketAlert(
                user_id=plan.user_id,
                kind="trigger",
                level="opportunity",
                title=title,
                message=message,
                suggested_action="invest_reserve",
                suggested_amount=suggested_amt,
                signal_data={
                    "trigger": trig,
                    "vix": signals["vix"],
                    "sp500_drawdown_pct": signals["sp500_drawdown_pct"],
                    "deploy_pct": float(deploy_pct),
                    "reserve_balance": float(reserve),
                },
                status="pending",
            )
            db.add(alert)
            db.flush()
            alerts_created += 1

            sent = await _push_telegram(
                db,
                plan.user_id,
                title,
                f"{message}\n\nReserva disponible: <b>{reserve:.2f} €</b>\n"
                f"Sugerencia del agente: invertir <b>{suggested_amt:.2f} €</b> en {plan.core_symbol_label}.",
                alert.id,
            )
            if sent:
                alert.telegram_sent_at = now
                telegram_sent += 1

    # ── Monthly DCA reminder (days 1-3) ───────────────────────────────
    monthly_fired = 0
    if now.day <= 3:
        for plan in active_plans:
            if _is_same_month(plan.last_monthly_executed_at, now):
                continue
            # Avoid duplicate monthly alert pending for this month
            existing = (
                db.query(MarketAlert)
                .filter(
                    MarketAlert.user_id == plan.user_id,
                    MarketAlert.kind == "monthly",
                    MarketAlert.status == "pending",
                )
                .first()
            )
            if existing:
                continue

            core_amt = Decimal(str(plan.monthly_core_amount or 0))
            reserve_amt = Decimal(str(plan.monthly_reserve_amount or 0))
            title = "Aportación mensual del plan"
            message = (
                f"Te toca aportar <b>{core_amt:.0f} €</b> a {plan.core_symbol_label} "
                f"y reservar <b>{reserve_amt:.0f} €</b> para oportunidades."
            )
            alert = MarketAlert(
                user_id=plan.user_id,
                kind="monthly",
                level="info",
                title=title,
                message=message,
                suggested_action="invest_core",
                suggested_amount=core_amt,
                signal_data={
                    "monthly_core": float(core_amt),
                    "monthly_reserve": float(reserve_amt),
                },
                status="pending",
            )
            db.add(alert)
            db.flush()
            monthly_fired += 1
            alerts_created += 1

            sent = await _push_telegram(db, plan.user_id, title, message, alert.id)
            if sent:
                alert.telegram_sent_at = now
                telegram_sent += 1

    db.commit()

    return {
        "ok": True,
        "as_of": now.isoformat(),
        "signals": signals,
        "active_plans": len(active_plans),
        "alerts_created": alerts_created,
        "telegram_sent": telegram_sent,
        "triggers_processed": triggers_processed,
        "monthly_reminders": monthly_fired,
    }
