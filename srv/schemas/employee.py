from datetime import date as date_type, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


ContractTypeLiteral = Literal["FULL_TIME", "PART_TIME", "FREELANCE", "INTERN", "OTHER"]
EmployeeStatusLiteral = Literal["ACTIVE", "INACTIVE", "TERMINATED"]


class EmployeeBase(BaseModel):
    entity_id: int
    name: str = Field(min_length=1, max_length=160)
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    contract_type: ContractTypeLiteral | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None
    status: EmployeeStatusLiteral = "ACTIVE"
    monthly_salary: Decimal = Field(default=Decimal("0"), ge=0)
    payment_day: int | None = Field(default=None, ge=1, le=31)
    currency: str = Field(default="EUR", max_length=8)
    notes: str | None = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    contract_type: ContractTypeLiteral | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None
    status: EmployeeStatusLiteral | None = None
    monthly_salary: Decimal | None = Field(default=None, ge=0)
    payment_day: int | None = Field(default=None, ge=1, le=31)
    currency: str | None = Field(default=None, max_length=8)
    notes: str | None = None


class EmployeeOut(EmployeeBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class PayrollSummary(BaseModel):
    entity_id: int | None
    active_employees: int
    total_monthly: Decimal
    total_annual: Decimal
    next_paydays: list[dict]
