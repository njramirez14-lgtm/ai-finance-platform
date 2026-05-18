from datetime import date as date_type, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


VehicleTypeLiteral = Literal["CAR", "MOTORCYCLE", "BICYCLE", "BOAT", "TRUCK", "OTHER"]


class VehicleBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    vehicle_type: VehicleTypeLiteral = "CAR"
    make: str | None = None
    model: str | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)
    license_plate: str | None = None
    purchase_date: date_type | None = None
    purchase_price: Decimal = Field(default=Decimal("0"), ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    monthly_income: Decimal = Field(default=Decimal("0"), ge=0)
    monthly_expenses: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="EUR", max_length=8)
    notes: str | None = None
    liability_id: int | None = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    vehicle_type: VehicleTypeLiteral | None = None
    make: str | None = None
    model: str | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)
    license_plate: str | None = None
    purchase_date: date_type | None = None
    purchase_price: Decimal | None = Field(default=None, ge=0)
    current_value: Decimal | None = Field(default=None, ge=0)
    monthly_income: Decimal | None = Field(default=None, ge=0)
    monthly_expenses: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)
    notes: str | None = None
    liability_id: int | None = None


class VehicleOut(VehicleBase):
    id: int
    user_id: int
    created_at: datetime | None = None
    equity: Decimal | None = None
    monthly_loan_payment: Decimal | None = None
    monthly_net_cashflow: Decimal | None = None
    depreciation: Decimal | None = None
    depreciation_pct: float | None = None

    class Config:
        from_attributes = True


class VehicleSummary(BaseModel):
    count: int
    total_value: Decimal
    total_purchase: Decimal
    total_equity: Decimal
    total_monthly_income: Decimal
    total_monthly_expenses: Decimal
    total_monthly_loan: Decimal
    total_monthly_net: Decimal
