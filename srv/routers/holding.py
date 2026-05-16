import os
from datetime import datetime
from decimal import Decimal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.holding import Holding
from srv.schemas.holding import HoldingCreate, HoldingOut, HoldingUpdate, TradePayload

router = APIRouter(prefix="/holdings", tags=["holdings"])

FMP_API_KEY = os.getenv("FMP_API_KEY")
FMP_BASE = "https://financialmodelingprep.com/api/v3"


def _verify_account(db: Session, account_id: int | None, user_id: int) -> None:
    if account_id is None:
        return
    exists = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user_id)
        .first()
    )
    if not exists:
        raise HTTPException(status_code=400, detail="Account does not belong to user")


_quotes_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_SEC = 60.0


def _fetch_quotes(symbols: list[str]) -> dict[str, dict]:
    """Fetch live quotes from FMP. Returns dict keyed by symbol with price + change.
    Caches in-process for 60 seconds to avoid hammering FMP."""
    if not symbols or not FMP_API_KEY:
        return {}
    now = datetime.utcnow().timestamp()
    fresh: dict[str, dict] = {}
    to_fetch: list[str] = []
    for s in symbols:
        cached = _quotes_cache.get(s)
        if cached and (now - cached[0]) < _CACHE_TTL_SEC:
            fresh[s] = cached[1]
        else:
            to_fetch.append(s)
    if to_fetch:
        try:
            url = f"{FMP_BASE}/quote/{','.join(to_fetch)}"
            resp = httpx.get(url, params={"apikey": FMP_API_KEY}, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json() or []
                for item in data:
                    sym = item.get("symbol")
                    if not sym:
                        continue
                    quote = {
                        "price": item.get("price"),
                        "change": item.get("change"),
                        "changesPercentage": item.get("changesPercentage"),
                        "name": item.get("name"),
                    }
                    _quotes_cache[sym] = (now, quote)
                    fresh[sym] = quote
        except Exception:
            pass
    return fresh


def _to_out(holding: Holding, quote: dict | None = None) -> dict:
    qty = Decimal(str(holding.quantity or 0))
    avg = Decimal(str(holding.avg_buy_price or 0))
    cost_basis = (qty * avg).quantize(Decimal("0.01"))
    current_price = None
    current_value = None
    unrealized = None
    unrealized_pct = None
    change_today = None
    if quote and quote.get("price") is not None:
        try:
            cp = Decimal(str(quote["price"]))
            current_price = cp
            current_value = (qty * cp).quantize(Decimal("0.01"))
            unrealized = (current_value - cost_basis).quantize(Decimal("0.01"))
            if cost_basis > 0:
                unrealized_pct = float((unrealized / cost_basis) * 100)
        except Exception:
            pass
        if quote.get("changesPercentage") is not None:
            try:
                change_today = float(quote["changesPercentage"])
            except Exception:
                pass
    return {
        "id": holding.id,
        "user_id": holding.user_id,
        "account_id": holding.account_id,
        "symbol": holding.symbol,
        "isin": holding.isin,
        "name": holding.name or (quote.get("name") if quote else None),
        "asset_type": holding.asset_type,
        "quantity": qty,
        "avg_buy_price": avg,
        "currency": holding.currency,
        "broker": holding.broker,
        "notes": holding.notes,
        "created_at": holding.created_at,
        "current_price": current_price,
        "current_value": current_value,
        "cost_basis": cost_basis,
        "unrealized_pnl": unrealized,
        "unrealized_pnl_pct": unrealized_pct,
        "change_today_pct": change_today,
    }


def _get_owned(db: Session, holding_id: int, user_id: int) -> Holding:
    h = (
        db.query(Holding)
        .filter(Holding.id == holding_id, Holding.user_id == user_id)
        .first()
    )
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    return h


@router.post("/", response_model=HoldingOut, status_code=status.HTTP_201_CREATED)
def create_holding(
    payload: HoldingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_account(db, payload.account_id, current_user.id)
    h = Holding(
        user_id=current_user.id,
        account_id=payload.account_id,
        symbol=payload.symbol.upper().strip(),
        isin=(payload.isin or "").upper().strip() or None,
        name=payload.name,
        asset_type=payload.asset_type,
        quantity=payload.quantity or Decimal("0"),
        avg_buy_price=payload.avg_buy_price or Decimal("0"),
        currency=(payload.currency or "EUR").upper(),
        broker=payload.broker,
        notes=payload.notes,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    quotes = _fetch_quotes([h.symbol])
    return _to_out(h, quotes.get(h.symbol))


@router.get("/", response_model=list[HoldingOut])
def list_holdings(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == current_user.id)
        .order_by(Holding.broker.asc().nulls_last(), Holding.symbol.asc())
        .all()
    )
    symbols = list({h.symbol for h in holdings})
    quotes = _fetch_quotes(symbols)
    return [_to_out(h, quotes.get(h.symbol)) for h in holdings]


@router.get("/summary")
def portfolio_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == current_user.id)
        .all()
    )
    if not holdings:
        return {
            "positions": 0,
            "total_cost": "0.00",
            "total_value": "0.00",
            "total_pnl": "0.00",
            "total_pnl_pct": 0.0,
            "by_broker": {},
            "by_asset_type": {},
        }
    quotes = _fetch_quotes(list({h.symbol for h in holdings}))
    total_cost = Decimal("0")
    total_value = Decimal("0")
    by_broker: dict[str, Decimal] = {}
    by_asset: dict[str, Decimal] = {}
    for h in holdings:
        qty = Decimal(str(h.quantity or 0))
        avg = Decimal(str(h.avg_buy_price or 0))
        cb = qty * avg
        total_cost += cb
        q = quotes.get(h.symbol)
        if q and q.get("price") is not None:
            try:
                cv = qty * Decimal(str(q["price"]))
            except Exception:
                cv = cb
        else:
            cv = cb
        total_value += cv
        broker = h.broker or "Sin broker"
        by_broker[broker] = by_broker.get(broker, Decimal("0")) + cv
        atype = h.asset_type or "OTHER"
        by_asset[atype] = by_asset.get(atype, Decimal("0")) + cv
    pnl = total_value - total_cost
    pnl_pct = float((pnl / total_cost) * 100) if total_cost > 0 else 0.0
    return {
        "positions": len(holdings),
        "total_cost": str(total_cost.quantize(Decimal("0.01"))),
        "total_value": str(total_value.quantize(Decimal("0.01"))),
        "total_pnl": str(pnl.quantize(Decimal("0.01"))),
        "total_pnl_pct": round(pnl_pct, 2),
        "by_broker": {k: str(v.quantize(Decimal("0.01"))) for k, v in by_broker.items()},
        "by_asset_type": {k: str(v.quantize(Decimal("0.01"))) for k, v in by_asset.items()},
    }


@router.put("/{holding_id}", response_model=HoldingOut)
def update_holding(
    holding_id: int,
    payload: HoldingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    h = _get_owned(db, holding_id, current_user.id)
    if payload.account_id is not None:
        _verify_account(db, payload.account_id, current_user.id)
        h.account_id = payload.account_id
    for field in ("symbol", "isin", "name", "asset_type", "quantity",
                  "avg_buy_price", "currency", "broker", "notes"):
        v = getattr(payload, field, None)
        if v is not None:
            if field == "symbol":
                v = v.upper().strip()
            elif field in ("isin", "currency") and isinstance(v, str):
                v = v.upper().strip() or None
            setattr(h, field, v)
    db.commit()
    db.refresh(h)
    quotes = _fetch_quotes([h.symbol])
    return _to_out(h, quotes.get(h.symbol))


@router.delete("/{holding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holding(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    h = _get_owned(db, holding_id, current_user.id)
    db.delete(h)
    db.commit()
    return None


@router.post("/{holding_id}/buy", response_model=HoldingOut)
def add_buy(
    holding_id: int,
    payload: TradePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Add purchased units; recompute weighted average buy price."""
    h = _get_owned(db, holding_id, current_user.id)
    new_qty = Decimal(str(payload.quantity))
    new_price = Decimal(str(payload.price))
    current_qty = Decimal(str(h.quantity or 0))
    current_avg = Decimal(str(h.avg_buy_price or 0))
    total_units = current_qty + new_qty
    if total_units <= 0:
        raise HTTPException(status_code=400, detail="Cantidad total inválida")
    h.avg_buy_price = (
        (current_qty * current_avg + new_qty * new_price) / total_units
    ).quantize(Decimal("0.0001"))
    h.quantity = total_units
    db.commit()
    db.refresh(h)
    quotes = _fetch_quotes([h.symbol])
    return _to_out(h, quotes.get(h.symbol))


@router.post("/{holding_id}/sell", response_model=HoldingOut)
def add_sell(
    holding_id: int,
    payload: TradePayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Reduce quantity. avg_buy_price stays as is (FIFO basis)."""
    h = _get_owned(db, holding_id, current_user.id)
    sell_qty = Decimal(str(payload.quantity))
    current_qty = Decimal(str(h.quantity or 0))
    if sell_qty > current_qty:
        raise HTTPException(status_code=400, detail="No tienes tantas unidades")
    h.quantity = (current_qty - sell_qty).quantize(Decimal("0.00000001"))
    if h.quantity == 0:
        h.avg_buy_price = Decimal("0")
    db.commit()
    db.refresh(h)
    quotes = _fetch_quotes([h.symbol])
    return _to_out(h, quotes.get(h.symbol))


@router.get("/search/{query}")
def search_symbol(
    query: str,
    current_user=Depends(get_current_user),
):
    """Search FMP for matching symbols/names. Returns up to 10 results."""
    if not FMP_API_KEY:
        raise HTTPException(status_code=500, detail="FMP_API_KEY no configurada")
    if len(query) < 1:
        return []
    try:
        url = f"{FMP_BASE}/search"
        resp = httpx.get(url, params={"query": query, "limit": 10, "apikey": FMP_API_KEY}, timeout=10.0)
        if resp.status_code != 200:
            return []
        return resp.json() or []
    except Exception:
        return []
