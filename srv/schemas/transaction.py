from datetime import date as date_type, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from srv.models.transaction import TransactionType


class TransactionBase(BaseModel):
    amount: Decimal = Field(gt=0, description="Positive amount in account currency")
    type: TransactionType
    description: str | None = None
    date: date_type
    category_id: int | None = None
    account_id: int | None = None
    entity_id: int | None = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0)
    type: TransactionType | None = None
    description: str | None = None
    date: date_type | None = None
    category_id: int | None = None
    account_id: int | None = None
    entity_id: int | None = None


class TransactionOut(TransactionBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class TransactionSummary(BaseModel):
    income_total: Decimal
    expense_total: Decimal
    balance: Decimal
    transaction_count: int
    period_start: date_type | None = None
    period_end: date_type | None = None
