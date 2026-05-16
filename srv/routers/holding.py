import asyncio
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

# Yahoo Finance public endpoints — no auth required, covers US, EU stocks,
# ETFs (BME, Xetra…), crypto. The User-Agent header is required or Yahoo 403s.
YF_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YF_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
YF_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ai-finance/0.1)"}


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


def _fetch_one_yahoo(symbol: str) -> dict | None:
    """Single Yahoo Finance quote. Returns dict or None on any failure."""
    try:
        resp = httpx.get(
            YF_CHART_URL.format(symbol=symbol),
            params={"interval": "1d", "range": "5d"},
            headers=YF_HEADERS,
            timeout=8.0,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        result = (data.get("chart") or {}).get("result") or []
        if not result:
            return None
        meta = result[0].get("meta") or {}
        price = meta.get("regularMarketPrice")
        prev = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price is None:
            return None
        try:
            change_pct = ((float(price) - float(prev)) / float(prev) * 100) if prev else None
            change_abs = (float(price) - float(prev)) if prev else None
        except (TypeError, ValueError):
            change_pct = None
            change_abs = None
        return {
            "price": float(price),
            "change": change_abs,
            "changesPercentage": change_pct,
            "name": meta.get("longName") or meta.get("shortName"),
            "currency": meta.get("currency"),
        }
    except Exception:
        return None


def _fetch_quotes(symbols: list[str]) -> dict[str, dict]:
    """Fetch live quotes from Yahoo Finance. Caches per-symbol 60s in-process.
    Runs symbols in parallel via httpx within an asyncio loop."""
    if not symbols:
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
        async def _gather() -> dict[str, dict]:
            sem = asyncio.Semaphore(10)
            async def _one(sym: str):
                async with sem:
                    return sym, await asyncio.to_thread(_fetch_one_yahoo, sym)
            tasks = [_one(s) for s in to_fetch]
            results = await asyncio.gather(*tasks, return_exceptions=False)
            return {s: q for s, q in results if q is not None}
        try:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # We're inside an async context (FastAPI route is async-friendly);
                    # use run_until_complete only when there's no loop. Otherwise
                    # fall back to sequential as last resort.
                    raise RuntimeError("inside async loop")
                results = loop.run_until_complete(_gather())
            except RuntimeError:
                # Either no loop, or we're inside one; create a fresh loop in a thread.
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                    results = ex.submit(asyncio.run, _gather()).result()
        except Exception:
            results = {}
        for sym, quote in results.items():
            _quotes_cache[sym] = (now, quote)
            fresh[sym] = quote
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
    """Search Yahoo Finance for matching symbols/names. Returns up to 10 results."""
    if len(query) < 1:
        return []
    try:
        resp = httpx.get(
            YF_SEARCH_URL,
            params={"q": query, "quotesCount": 10, "newsCount": 0},
            headers=YF_HEADERS,
            timeout=8.0,
        )
        if resp.status_code != 200:
            return []
        data = resp.json() or {}
        quotes = data.get("quotes") or []
        # Normalize to the shape the frontend expects (symbol/name/exchange).
        return [
            {
                "symbol": q.get("symbol"),
                "name": q.get("shortname") or q.get("longname") or q.get("symbol"),
                "exchangeShortName": q.get("exchange") or q.get("exchDisp"),
                "exchange": q.get("exchDisp") or q.get("exchange"),
                "currency": q.get("currency"),
                "quoteType": q.get("quoteType"),
            }
            for q in quotes
            if q.get("symbol")
        ]
    except Exception:
        return []
