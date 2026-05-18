from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


CategoryLiteral = Literal["TAX", "INVOICE", "PAYMENT", "LEGAL", "PAYROLL", "MEETING", "OTHER"]
StatusLiteral = Literal["PENDING", "DONE", "SNOOZED"]
RepeatLiteral = Literal["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]


class ReminderBase(BaseModel):
    entity_id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    category: CategoryLiteral | None = None
    due_at: datetime
    repeat_rule: RepeatLiteral | None = "NONE"
    status: StatusLiteral = "PENDING"
    notify_at: datetime | None = None


class ReminderCreate(ReminderBase):
    pass


class ReminderUpdate(BaseModel):
    entity_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: CategoryLiteral | None = None
    due_at: datetime | None = None
    repeat_rule: RepeatLiteral | None = None
    status: StatusLiteral | None = None
    notify_at: datetime | None = None


class ReminderOut(ReminderBase):
    id: int
    user_id: int
    completed_at: datetime | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True
