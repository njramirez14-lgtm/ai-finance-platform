from datetime import date as date_type, datetime
from typing import Literal

from pydantic import BaseModel, Field


LeaveTypeLiteral = Literal[
    "SICK", "VACATION", "UNPAID", "MATERNITY", "PATERNITY", "FAMILY", "OTHER",
]
LeaveStatusLiteral = Literal["REQUESTED", "APPROVED", "REJECTED", "TAKEN", "CANCELLED"]


class EmployeeLeaveBase(BaseModel):
    employee_id: int
    leave_type: LeaveTypeLiteral = "SICK"
    start_date: date_type
    end_date: date_type | None = None
    status: LeaveStatusLiteral = "APPROVED"
    document_id: int | None = None
    reason: str | None = None


class EmployeeLeaveCreate(EmployeeLeaveBase):
    pass


class EmployeeLeaveUpdate(BaseModel):
    leave_type: LeaveTypeLiteral | None = None
    start_date: date_type | None = None
    end_date: date_type | None = None
    status: LeaveStatusLiteral | None = None
    document_id: int | None = None
    reason: str | None = None


class EmployeeLeaveOut(EmployeeLeaveBase):
    id: int
    user_id: int
    days: int | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class LeaveSummary(BaseModel):
    employee_id: int
    year: int
    vacation_taken_days: int
    vacation_planned_days: int
    sick_days: int
    by_type: dict[str, int]
