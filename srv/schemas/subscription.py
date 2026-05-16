from datetime import date as date_type, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


BillingCycleLiteral = Literal["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]
SubStatusLiteral = Literal["ACTIVE", "PAUSED", "CANCELLED"]
SubKindLiteral = Literal["EXPENSE", "INCOME"]


class SubscriptionBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="EUR", max_length=8)
    billing_cycle: BillingCycleLiteral = "MONTHLY"
    next_charge_date: date_type | None = None
    started_at: date_type | None = None
    status: SubStatusLiteral = "ACTIVE"
    kind: SubKindLiteral = "EXPENSE"
    notes: str | None = None
    entity_id: int | None = None
    card_id: int | None = None
    account_id: int | None = None
    category_id: int | None = None


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    billing_cycle: BillingCycleLiteral | None = None
    next_charge_date: date_type | None = None
    started_at: date_type | None = None
    status: SubStatusLiteral | None = None
    kind: SubKindLiteral | None = None
    notes: str | None = None
    entity_id: int | None = None
    card_id: int | None = None
    account_id: int | None = None
    category_id: int | None = None


class SubscriptionOut(SubscriptionBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class SubscriptionSummary(BaseModel):
    monthly_total: Decimal
    yearly_total: Decimal
    active_count: int
    paused_count: int
    cancelled_count: int
