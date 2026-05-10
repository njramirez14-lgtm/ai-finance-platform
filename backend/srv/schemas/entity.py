from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


EntityTypeLiteral = Literal["PERSONAL", "BUSINESS"]


class EntityBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: EntityTypeLiteral
    tax_id: str | None = None


class EntityCreate(EntityBase):
    pass


class EntityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    type: EntityTypeLiteral | None = None
    tax_id: str | None = None


class EntityOut(EntityBase):
    id: int
    user_id: int
    created_at: datetime | None = None

    class Config:
        from_attributes = True
