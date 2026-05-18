"""Automated Core + Tactical investment strategy.

The agent decides — the user only confirms.

- Core: monthly DCA of `monthly_core_amount` into `core_symbol` (default VOO).
- Reserve: `monthly_reserve_amount` accumulates each month as a virtual pot, deployed
  on triggers (VIX>30, S&P drawdowns from 52-week peak).

`/signals` is read-only and recomputes the market snapshot each call.
Alerts and the daily trigger engine live elsewhere (see strategy_cron).
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.strategy import InvestmentPlan, MarketAlert, MarketTriggerLog
from srv.models.transaction import Transaction, TransactionType
from srv.schemas.strategy import (
    AlertConfirmPayload,
    InvestmentPlanCreate,
    InvestmentPlanOut,
    InvestmentPlanUpdate,
    MarketAlertOut,
    MarketSignals,
)

router = APIRouter(prefix="/strategy", tags=["strategy"])

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
UA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    )
}


# ── helpers ────────────────────────────────────────────────────────────


async def _fetch_yahoo_history(
    client: httpx.AsyncClient, symbol: str, range_str: str = "1y"
) -> dict[str, Any] | None:
    try:
        r = await client.get(
            f"{YAHOO_BASE}/{symbol}",
            params={"interval": "1d", "range": range_str},
        )
        if r.status_code != 200:
            return None
        data = r.json()
        result = (data.get("chart") or {}).get("result") or []
        if not result:
            return None
        chart = result[0]
        meta = chart.get("meta", {})
        quote = (chart.get("indicators", {}).get("quote") or [{}])[0]
        closes = [c for c in (quote.get("close") or []) if c is not None]
        highs = [h for h in (quote.get("high") or []) if h is not None]
        price = meta.get("regularMarketPrice") or (closes[-1] if closes else None)
        prev = meta.get("chartPreviousClose") or (closes[-2] if len(closes) > 1 else None)
        change_pct = ((price - prev) / prev * 100) if (price and prev) else None
        return {
            "symbol": symbol,
            "price": price,
            "prev_close": prev,
            "change_pct": change_pct,
            "closes": closes,
            "highs": highs,
        }
    except Exception:
        return None


def _evaluate_semaphore(
    vix: float | None,
    sp_drawdown_pct: float | None,
) -> tuple[str, str, list[str], str, Decimal, str]:
    """Compute semaphore color, label, triggers, suggested action, suggested deploy, rationale.

    Drawdown is negative (e.g. -12.5 means S&P is 12.5% below 52w peak).

    Reserve deployment ladder (of current reserve_balance):
      VIX > 30 → 30%
      S&P -10% → 30%
      S&P -15% → 50% of remaining
      S&P -20%+ → 100% of remaining
    """
    triggers: list[str] = []
    deploy_pct = 0.0

    if vix is not None and vix >= 30:
        triggers.append("vix_above_30")
        deploy_pct = max(deploy_pct, 0.30)
    if sp_drawdown_pct is not None:
        if sp_drawdown_pct <= -20:
            triggers.append("sp500_drawdown_20")
            deploy_pct = 1.0
        elif sp_drawdown_pct <= -15:
            triggers.append("sp500_drawdown_15")
            deploy_pct = max(deploy_pct, 0.50)
        elif sp_drawdown_pct <= -10:
            triggers.append("sp500_drawdown_10")
            deploy_pct = max(deploy_pct, 0.30)

    # Determine semaphore
    if not triggers:
        if (vix is not None and vix >= 25) or (sp_drawdown_pct is not None and sp_drawdown_pct <= -5):
            color, label = "yellow", "Mercado nervioso — mantén el plan"
        else:
            color, label = "green", "Mercado en calma — solo DCA mensual"
        action = "noop"
        rationale = "Sin disparadores activos. Continúa con la aportación mensual habitual."
    elif deploy_pct >= 1.0:
        color, label = "red", "Oportunidad histórica — despliega la reserva"
        action = "invest_both"
        rationale = "Caída ≥20% desde máximos. Las bajadas profundas suelen recompensar al inversor paciente."
    elif deploy_pct >= 0.5:
        color, label = "red", "Bajada fuerte — invierte parte importante de la reserva"
        action = "invest_reserve"
        rationale = "Caída ≥15%. Buen momento para añadir capital extra al plan."
    else:
        color, label = "orange", "Señal de oportunidad — despliega parte de la reserva"
        action = "invest_reserve"
        rationale = "Disparador activo (VIX alto o S&P -10%). Despliegue parcial de la reserva."

    return color, label, triggers, action, Decimal(str(deploy_pct)), rationale


def _ensure_plan(db: Session, user_id: int) -> InvestmentPlan:
    plan = db.query(InvestmentPlan).filter(InvestmentPlan.user_id == user_id).first()
    if plan is None:
        plan = InvestmentPlan(user_id=user_id)
        db.add(plan)
        db.commit()
        db.refresh(plan)
    return plan


# ── /signals (read-only market snapshot) ───────────────────────────────


@router.get("/signals", response_model=MarketSignals)
async def get_signals(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    plan = _ensure_plan(db, current_user.id)
    core_symbol = plan.core_symbol or "VOO"

    async with httpx.AsyncClient(timeout=12, headers=UA_HEADERS) as client:
        vix_data = await _fetch_yahoo_history(client, "^VIX", "1mo")
        sp_data = await _fetch_yahoo_history(client, "^GSPC", "1y")
        core_data = await _fetch_yahoo_history(client, core_symbol, "5d")

    vix = vix_data["price"] if vix_data else None
    vix_change_pct = vix_data["change_pct"] if vix_data else None

    sp_price = sp_data["price"] if sp_data else None
    sp_peak = max(sp_data["highs"]) if (sp_data and sp_data["highs"]) else None
    sp_drawdown_pct = None
    if sp_price and sp_peak and sp_peak > 0:
        sp_drawdown_pct = (sp_price - sp_peak) / sp_peak * 100

    core_price = core_data["price"] if core_data else None

    color, label, triggers, action, deploy_pct, rationale = _evaluate_semaphore(
        vix, sp_drawdown_pct
    )

    reserve_balance = Decimal(str(plan.reserve_balance or 0))
    suggested_reserve = (reserve_balance * deploy_pct).quantize(Decimal("0.01"))

    return MarketSignals(
        vix=vix,
        vix_change_pct=vix_change_pct,
        sp500_price=sp_price,
        sp500_peak=sp_peak,
        sp500_drawdown_pct=sp_drawdown_pct,
        core_etf_price=core_price,
        core_etf_symbol=core_symbol,
        semaphore=color,
        semaphore_label=label,
        triggers_fired=triggers,
        suggested_action=action,
        suggested_reserve_deploy=suggested_reserve,
        rationale=rationale,
        as_of=datetime.now(timezone.utc),
    )


# ── /plan CRUD ─────────────────────────────────────────────────────────


@router.get("/plan", response_model=InvestmentPlanOut)
def get_plan(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return _ensure_plan(db, current_user.id)


@router.post("/plan", response_model=InvestmentPlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: InvestmentPlanCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(InvestmentPlan)
        .filter(InvestmentPlan.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Plan already exists. Use PUT to update.")
    plan = InvestmentPlan(
        user_id=current_user.id,
        active=payload.active,
        monthly_core_amount=payload.monthly_core_amount,
        monthly_reserve_amount=payload.monthly_reserve_amount,
        core_symbol=payload.core_symbol,
        core_symbol_label=payload.core_symbol_label,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.put("/plan", response_model=InvestmentPlanOut)
def update_plan(
    payload: InvestmentPlanUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    plan = _ensure_plan(db, current_user.id)
    if payload.active is not None:
        plan.active = payload.active
    if payload.monthly_core_amount is not None:
        plan.monthly_core_amount = payload.monthly_core_amount
    if payload.monthly_reserve_amount is not None:
        plan.monthly_reserve_amount = payload.monthly_reserve_amount
    if payload.core_symbol is not None:
        plan.core_symbol = payload.core_symbol
    if payload.core_symbol_label is not None:
        plan.core_symbol_label = payload.core_symbol_label
    plan.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(plan)
    return plan


# ── AI-assisted plan generation ────────────────────────────────────────


class AIPlanRequest(BaseModel):
    intent: str = Field(min_length=1, max_length=2000)
    apply: bool = False  # if True, save the plan; if False, just propose


class AIPlanResponse(BaseModel):
    proposed: dict
    rationale: str
    applied: bool
    plan: InvestmentPlanOut | None = None


@router.post("/plan/ai-generate", response_model=AIPlanResponse)
def ai_generate_plan(
    payload: "AIPlanRequest",
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Ask Claude to propose an investment plan based on a natural-language intent.
    The user describes goals (risk, horizon, monthly capacity), Claude returns
    {monthly_core_amount, monthly_reserve_amount, core_symbol, core_symbol_label}.
    Set apply=true to immediately save it as the active plan."""
    import json as _json
    import os as _os

    api_key = _os.environ.get("ANTHROPIC_API_KEY")
    current_plan = _ensure_plan(db, current_user.id)

    sys_prompt = (
        "You are a conservative European DCA investment advisor. Given the user's "
        "intent, propose a Core+Reserve monthly plan. Output STRICT JSON with keys: "
        "monthly_core_amount (number, EUR), monthly_reserve_amount (number, EUR), "
        "core_symbol (string, ticker — prefer accumulating UCITS ETFs for EU residents "
        "like VWCE, VUAA, SXR8, or VOO if dist preferred), core_symbol_label (string), "
        "rationale (string, max 400 chars, Spanish). No markdown, no extra text."
    )
    user_prompt = (
        f"Plan actual del usuario:\n"
        f"- Core mensual: {current_plan.monthly_core_amount}€ en {current_plan.core_symbol}\n"
        f"- Reserva mensual: {current_plan.monthly_reserve_amount}€\n"
        f"- Activo: {current_plan.active}\n\n"
        f"Intencion del usuario:\n{payload.intent}\n\n"
        "Devuelve JSON estricto con los campos pedidos."
    )

    proposed: dict
    rationale: str
    if not api_key:
        # Fallback: rule-based proposal
        amount = 500
        for word in payload.intent.split():
            try:
                w = float(word.replace("€", "").replace(",", "."))
                if 50 <= w <= 10000:
                    amount = w
                    break
            except ValueError:
                continue
        core = round(amount * 0.7, 2)
        reserve = round(amount - core, 2)
        proposed = {
            "monthly_core_amount": core,
            "monthly_reserve_amount": reserve,
            "core_symbol": "VWCE.DE",
            "core_symbol_label": "MSCI All-World UCITS Acc (VWCE)",
        }
        rationale = (
            f"Sin API key de Claude. Reparto por defecto 70/30 sobre {amount}€/mes "
            "en VWCE (mundial, acumulativo, sin retencion de dividendos)."
        )
    else:
        try:
            r = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 600,
                    "system": sys_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
                timeout=30,
            )
            r.raise_for_status()
            text = r.json()["content"][0]["text"].strip()
            # Strip markdown fences if model added them despite instructions
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
            data = _json.loads(text)
            proposed = {
                "monthly_core_amount": float(data["monthly_core_amount"]),
                "monthly_reserve_amount": float(data["monthly_reserve_amount"]),
                "core_symbol": str(data["core_symbol"]).upper(),
                "core_symbol_label": str(data["core_symbol_label"]),
            }
            rationale = str(data.get("rationale", ""))[:400]
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Claude failed: {exc}") from exc

    applied_plan = None
    if payload.apply:
        current_plan.monthly_core_amount = Decimal(str(proposed["monthly_core_amount"]))
        current_plan.monthly_reserve_amount = Decimal(str(proposed["monthly_reserve_amount"]))
        current_plan.core_symbol = proposed["core_symbol"]
        current_plan.core_symbol_label = proposed["core_symbol_label"]
        current_plan.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(current_plan)
        applied_plan = current_plan

    return AIPlanResponse(
        proposed=proposed,
        rationale=rationale,
        applied=payload.apply,
        plan=applied_plan,
    )


# ── /alerts ────────────────────────────────────────────────────────────


@router.get("/alerts", response_model=list[MarketAlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    status_filter: str | None = None,
):
    q = db.query(MarketAlert).filter(MarketAlert.user_id == current_user.id)
    if status_filter:
        q = q.filter(MarketAlert.status == status_filter)
    return q.order_by(MarketAlert.created_at.desc()).limit(50).all()


@router.post("/alerts/{alert_id}/confirm", response_model=MarketAlertOut)
def confirm_alert(
    alert_id: int,
    payload: AlertConfirmPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    alert = (
        db.query(MarketAlert)
        .filter(MarketAlert.id == alert_id, MarketAlert.user_id == current_user.id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status != "pending":
        raise HTTPException(status_code=400, detail=f"Alert is already {alert.status}")

    plan = _ensure_plan(db, current_user.id)
    now = datetime.now(timezone.utc)
    action = alert.suggested_action or "noop"
    amount = payload.amount or alert.suggested_amount or Decimal("0")

    # Mint transactions + adjust reserve for the chosen action
    if action in ("invest_core", "invest_both"):
        core_amt = Decimal(str(plan.monthly_core_amount or 0))
        if core_amt > 0:
            db.add(Transaction(
                amount=float(core_amt),
                type=TransactionType.EXPENSE,
                description=f"Inversión mensual {plan.core_symbol_label}",
                date=now,
                user_id=current_user.id,
            ))
        # accumulate this month's reserve contribution
        plan.reserve_balance = Decimal(str(plan.reserve_balance or 0)) + Decimal(
            str(plan.monthly_reserve_amount or 0)
        )
        plan.last_monthly_executed_at = now

    if action in ("invest_reserve", "invest_both"):
        deploy = Decimal(str(amount or 0))
        available = Decimal(str(plan.reserve_balance or 0))
        if deploy > available:
            deploy = available
        if deploy > 0:
            db.add(Transaction(
                amount=float(deploy),
                type=TransactionType.EXPENSE,
                description=f"Inversión táctica reserva → {plan.core_symbol_label}",
                date=now,
                user_id=current_user.id,
            ))
            plan.reserve_balance = available - deploy
            plan.last_trigger_fired_at = now

    alert.status = "confirmed"
    alert.confirmed_at = now
    db.commit()
    db.refresh(alert)
    return alert


@router.post("/alerts/{alert_id}/dismiss", response_model=MarketAlertOut)
def dismiss_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    alert = (
        db.query(MarketAlert)
        .filter(MarketAlert.id == alert_id, MarketAlert.user_id == current_user.id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status != "pending":
        raise HTTPException(status_code=400, detail=f"Alert is already {alert.status}")
    alert.status = "dismissed"
    alert.dismissed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(alert)
    return alert
