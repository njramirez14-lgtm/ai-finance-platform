from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


AlertKindLiteral = Literal["monthly", "trigger", "info"]
AlertLevelLiteral = Literal["info", "warning", "opportunity"]
AlertStatusLiteral = Literal["pending", "confirmed", "dismissed", "expired"]
AlertActionLiteral = Literal["invest_core", "invest_reserve", "invest_both", "noop"]
SemaphoreLiteral = Literal["green", "yellow", "orange", "red"]


# ── Investment Plan ────────────────────────────────────────────────────

class InvestmentPlanBase(BaseModel):
    active: bool = True
    monthly_core_amount: Decimal = Field(default=Decimal("400"), ge=0)
    monthly_reserve_amount: Decimal = Field(default=Decimal("100"), ge=0)
    core_symbol: str = Field(default="VOO", max_length=20)
    core_symbol_label: str = Field(default="S&P 500 (Vanguard VOO)", max_length=120)


class InvestmentPlanCreate(InvestmentPlanBase):
    pass


class InvestmentPlanUpdate(BaseModel):
    active: bool | None = None
    monthly_core_amount: Decimal | None = Field(default=None, ge=0)
    monthly_reserve_amount: Decimal | None = Field(default=None, ge=0)
    core_symbol: str | None = Field(default=None, max_length=20)
    core_symbol_label: str | None = Field(default=None, max_length=120)


class InvestmentPlanOut(InvestmentPlanBase):
    id: int
    user_id: int
    reserve_balance: Decimal
    last_monthly_executed_at: datetime | None = None
    last_trigger_fired_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


# ── Market signals (read-only snapshot) ────────────────────────────────

class MarketSignals(BaseModel):
    vix: float | None = None
    vix_change_pct: float | None = None
    sp500_price: float | None = None
    sp500_peak: float | None = None
    sp500_drawdown_pct: float | None = None  # negative number: -12.5 means 12.5% below peak
    core_etf_price: float | None = None
    core_etf_symbol: str = "VOO"
    semaphore: SemaphoreLiteral = "green"
    semaphore_label: str = "Mercado en calma"
    triggers_fired: list[str] = []
    suggested_action: AlertActionLiteral = "noop"
    suggested_reserve_deploy: Decimal = Decimal("0")
    rationale: str = ""
    as_of: datetime


# ── Market Alerts ──────────────────────────────────────────────────────

class MarketAlertOut(BaseModel):
    id: int
    user_id: int
    kind: AlertKindLiteral
    level: AlertLevelLiteral
    title: str
    message: str
    suggested_action: AlertActionLiteral | None = None
    suggested_amount: Decimal | None = None
    signal_data: dict[str, Any] | None = None
    status: AlertStatusLiteral
    telegram_sent_at: datetime | None = None
    confirmed_at: datetime | None = None
    dismissed_at: datetime | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class AlertConfirmPayload(BaseModel):
    amount: Decimal | None = Field(default=None, ge=0)
    note: str | None = None
