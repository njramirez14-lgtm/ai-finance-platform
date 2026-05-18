from datetime import date as date_type, datetime
from typing import Literal

from pydantic import BaseModel, Field


DocTypeLiteral = Literal[
    "CONTRACT", "ID", "PAYSLIP", "SICK_NOTE", "VACATION_REQUEST",
    "NDA", "TAX_FORM", "CV", "OTHER",
]
ProviderLiteral = Literal["GOOGLE_DRIVE", "DROPBOX", "ONEDRIVE", "LOCAL", "LINK"]
DocStatusLiteral = Literal["ACTIVE", "EXPIRED", "ARCHIVED"]


class EmployeeDocumentBase(BaseModel):
    employee_id: int
    title: str = Field(min_length=1, max_length=200)
    doc_type: DocTypeLiteral = "OTHER"
    file_url: str | None = Field(default=None, max_length=2000)
    drive_file_id: str | None = None
    provider: ProviderLiteral | None = None
    issued_date: date_type | None = None
    expires_at: date_type | None = None
    status: DocStatusLiteral = "ACTIVE"
    notes: str | None = None


class EmployeeDocumentCreate(EmployeeDocumentBase):
    pass


class EmployeeDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    doc_type: DocTypeLiteral | None = None
    file_url: str | None = Field(default=None, max_length=2000)
    drive_file_id: str | None = None
    provider: ProviderLiteral | None = None
    issued_date: date_type | None = None
    expires_at: date_type | None = None
    status: DocStatusLiteral | None = None
    notes: str | None = None


class EmployeeDocumentOut(EmployeeDocumentBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True
