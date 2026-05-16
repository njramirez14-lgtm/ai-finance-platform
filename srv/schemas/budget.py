from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints


MonthStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}$")]


class BudgetBase(BaseModel):
    category_id: int | None = None
    month: MonthStr
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="EUR", max_length=8)


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=8)


class BudgetOut(BudgetBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class BudgetProgressItem(BaseModel):
    budget_id: int
    category_id: int | None
    category_name: str | None
    month: str
    amount: Decimal
    spent: Decimal
    remaining: Decimal
    pct: float
    over_budget: bool


class BudgetProgressResponse(BaseModel):
    month: str
    items: list[BudgetProgressItem]
    total_budget: Decimal
    total_spent: Decimal
    total_remaining: Decimal
