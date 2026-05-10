from datetime import date as date_type, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


LiabilityTypeLiteral = Literal[
    "MORTGAGE", "LOAN", "CREDIT_CARD", "LINE_OF_CREDIT", "STUDENT", "OTHER"
]


class LiabilityBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type: LiabilityTypeLiteral
    lender: str | None = None
    original_amount: Decimal = Field(default=Decimal("0"), ge=0)
    current_balance: Decimal = Field(default=Decimal("0"), ge=0)
    interest_rate: Decimal | None = Field(default=None, ge=0, le=Decimal("100"))
    monthly_payment: Decimal | None = Field(default=None, ge=0)
    start_date: date_type | None = None
    end_date: date_type | None = None
    currency: str = Field(default="EUR", max_length=8)
    notes: str | None = None
    entity_id: int | None = None


class LiabilityCreate(LiabilityBase):
    pass


class LiabilityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    type: LiabilityTypeLiteral | None = None
    lender: str | None = None
    original_amount: Decimal | None = Field(default=None, ge=0)
    current_balance: Decimal | None = Field(default=None, ge=0)
    interest_rate: Decimal | None = Field(default=None, ge=0, le=Decimal("100"))
    monthly_payment: Decimal | None = Field(default=None, ge=0)
    start_date: date_type | None = None
    end_date: date_type | None = None
    currency: str | None = Field(default=None, max_length=8)
    notes: str | None = None
    entity_id: int | None = None


class LiabilityOut(LiabilityBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class LiabilitySummary(BaseModel):
    total_debt: Decimal
    total_monthly_payment: Decimal
    count: int
