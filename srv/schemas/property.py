from datetime import date as date_type, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


PropertyTypeLiteral = Literal["RESIDENCE", "RENTAL", "VACATION", "COMMERCIAL", "LAND", "OTHER"]


class PropertyBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    property_type: PropertyTypeLiteral = "RESIDENCE"
    address: str | None = None
    city: str | None = None
    country: str | None = None
    area_m2: Decimal | None = Field(default=None, ge=0)
    purchase_date: date_type | None = None
    purchase_price: Decimal = Field(default=Decimal("0"), ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    monthly_rental_income: Decimal = Field(default=Decimal("0"), ge=0)
    monthly_expenses: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="EUR", max_length=8)
    notes: str | None = None
    liability_id: int | None = None


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    property_type: PropertyTypeLiteral | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    area_m2: Decimal | None = Field(default=None, ge=0)
    purchase_date: date_type | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    monthly_rental_income: Decimal | None = Field(default=None, ge=0)
    monthly_expenses: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    notes: str | None = None
    liability_id: int | None = None


class PropertyOut(PropertyBase):
    id: int
    user_id: int
    created_at: datetime | None = None
    # Derived
    equity: Decimal | None = None
    monthly_mortgage_payment: Decimal | None = None
    monthly_net_cashflow: Decimal | None = None
    appreciation: Decimal | None = None
    appreciation_pct: float | None = None
    annual_yield_pct: float | None = None

    class Config:
        from_attributes = True


class PropertySummary(BaseModel):
    count: int
    total_value: Decimal
    total_purchase: Decimal
    total_equity: Decimal
    total_monthly_income: Decimal
    total_monthly_expenses: Decimal
    total_monthly_mortgage: Decimal
    total_monthly_net: Decimal
