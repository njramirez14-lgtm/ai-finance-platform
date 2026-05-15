from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


CardTypeLiteral = Literal["DEBIT", "CREDIT", "PREPAID", "VIRTUAL"]


class CardBase(BaseModel):
    alias: str = Field(min_length=1, max_length=120)
    last4: str | None = Field(default=None, max_length=4)
    brand: str | None = Field(default=None, max_length=30)
    type: CardTypeLiteral
    bank_name: str | None = None
    expiry_month: int | None = Field(default=None, ge=1, le=12)
    expiry_year: int | None = Field(default=None, ge=2000, le=2099)
    color: str | None = None
    notes: str | None = None
    active: bool = True
    account_id: int | None = None
    credit_limit: Decimal | None = None


class CardCreate(CardBase):
    pass


class CardUpdate(BaseModel):
    alias: str | None = Field(default=None, min_length=1, max_length=120)
    last4: str | None = Field(default=None, max_length=4)
    brand: str | None = None
    type: CardTypeLiteral | None = None
    bank_name: str | None = None
    expiry_month: int | None = Field(default=None, ge=1, le=12)
    expiry_year: int | None = Field(default=None, ge=2000, le=2099)
    color: str | None = None
    notes: str | None = None
    active: bool | None = None
    account_id: int | None = None
    credit_limit: Decimal | None = None


class CardOut(CardBase):
    id: int
    user_id: int
    created_at: datetime | None = None
    monthly_spend: Decimal = Decimal("0")
    account_name: str | None = None

    class Config:
        from_attributes = True
