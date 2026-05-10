from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


AccountTypeLiteral = Literal["CHECKING", "SAVINGS", "CASH", "CARD", "CRYPTO", "OTHER"]


class AccountBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: AccountTypeLiteral
    currency: str = Field(default="EUR", max_length=8)
    initial_balance: Decimal = Field(default=Decimal("0"))
    entity_id: int | None = None


class AccountCreate(AccountBase):
    pass


class AccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    type: AccountTypeLiteral | None = None
    currency: str | None = Field(default=None, max_length=8)
    initial_balance: Decimal | None = None
    entity_id: int | None = None


class AccountOut(AccountBase):
    id: int
    user_id: int
    created_at: datetime | None = None
    balance: Decimal = Decimal("0")  # computed: initial_balance + transactions

    class Config:
        from_attributes = True
