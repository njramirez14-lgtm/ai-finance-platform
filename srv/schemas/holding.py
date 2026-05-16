from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


AssetTypeLiteral = Literal["STOCK", "ETF", "CRYPTO", "BOND", "OTHER"]


class HoldingBase(BaseModel):
    symbol: str = Field(min_length=1, max_length=32)
    isin: str | None = Field(default=None, max_length=20)
    name: str | None = Field(default=None, max_length=200)
    asset_type: AssetTypeLiteral = "STOCK"
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    avg_buy_price: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = Field(default="EUR", max_length=8)
    broker: str | None = Field(default=None, max_length=80)
    account_id: int | None = None
    notes: str | None = Field(default=None, max_length=500)


class HoldingCreate(HoldingBase):
    pass


class HoldingUpdate(BaseModel):
    symbol: str | None = Field(default=None, min_length=1, max_length=32)
    isin: str | None = None
    name: str | None = None
    asset_type: AssetTypeLiteral | None = None
    quantity: Decimal | None = Field(default=None, ge=0)
    avg_buy_price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = None
    broker: str | None = None
    account_id: int | None = None
    notes: str | None = None


class HoldingOut(HoldingBase):
    id: int
    user_id: int
    created_at: datetime | None = None
    # Live data (filled by the route, not the DB)
    current_price: Decimal | None = None
    current_value: Decimal | None = None
    cost_basis: Decimal | None = None
    unrealized_pnl: Decimal | None = None
    unrealized_pnl_pct: float | None = None
    change_today_pct: float | None = None

    class Config:
        from_attributes = True


class TradePayload(BaseModel):
    """Add a buy or sell against a holding."""
    quantity: Decimal = Field(gt=0)
    price: Decimal = Field(gt=0)
    date: datetime | None = None
