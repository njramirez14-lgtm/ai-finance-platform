"""Market news endpoints. Uses Yahoo Finance search API (no API key required)
to pull recent headlines per ticker. Live-fetched on every request; the
upstream is cached enough by Yahoo that we don't need our own table for now."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.holding import Holding

router = APIRouter(prefix="/news", tags=["news"])


YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    )
}


async def _fetch_yahoo_news(ticker: str, count: int = 10) -> list[dict[str, Any]]:
    """Hit Yahoo Finance search for one ticker. Returns normalized news items.
    Swallows network errors so a single bad ticker doesn't kill the whole
    batch — the caller can decide how to surface it."""
    try:
        async with httpx.AsyncClient(timeout=8, headers=UA) as client:
            r = await client.get(
                YAHOO_SEARCH_URL,
                params={"q": ticker, "newsCount": count, "quotesCount": 0},
            )
        if r.status_code != 200:
            return []
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return []

    items = []
    for n in data.get("news") or []:
        ts = n.get("providerPublishTime")
        try:
            published = datetime.utcfromtimestamp(ts).isoformat() if ts else None
        except (TypeError, ValueError, OSError):
            published = None
        items.append({
            "id": n.get("uuid"),
            "ticker": ticker.upper(),
            "title": n.get("title"),
            "publisher": n.get("publisher"),
            "url": n.get("link"),
            "published_at": published,
            "thumbnail": ((n.get("thumbnail") or {}).get("resolutions") or [{}])[0].get("url"),
            "related_tickers": n.get("relatedTickers") or [],
        })
    return items


@router.get("/tickers")
async def news_for_tickers(
    tickers: str = Query(..., description="Comma-separated list of tickers, e.g. AAPL,NVDA,BTC-USD"),
    per_ticker: int = Query(default=8, ge=1, le=20),
):
    """Pull recent news for an explicit list of tickers. Use this for ad-hoc
    lookups (e.g. ticker page); for the user's portfolio see /news/portfolio."""
    syms = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not syms:
        raise HTTPException(status_code=400, detail="No tickers provided")
    if len(syms) > 25:
        raise HTTPException(status_code=400, detail="Max 25 tickers per request")

    results = await asyncio.gather(*(_fetch_yahoo_news(s, per_ticker) for s in syms))
    flat = [item for batch in results for item in batch]
    # Sort newest first, de-dup by uuid (same story can appear for multiple
    # related tickers).
    seen = set()
    deduped = []
    for item in sorted(flat, key=lambda x: x.get("published_at") or "", reverse=True):
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        deduped.append(item)
    return {"tickers": syms, "count": len(deduped), "items": deduped}


@router.get("/portfolio")
async def news_for_portfolio(
    per_ticker: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Recent news for tickers the user currently holds. Pulls Yahoo Finance
    in parallel; deduplicates the same story across related tickers."""
    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == current_user.id)
        .all()
    )
    syms = sorted({(h.symbol or "").upper() for h in holdings if h.symbol})
    if not syms:
        return {"tickers": [], "count": 0, "items": [], "hint": "Añade holdings en /portfolio para ver noticias relevantes."}
    if len(syms) > 25:
        syms = syms[:25]

    results = await asyncio.gather(*(_fetch_yahoo_news(s, per_ticker) for s in syms))
    flat = [item for batch in results for item in batch]
    seen = set()
    deduped = []
    for item in sorted(flat, key=lambda x: x.get("published_at") or "", reverse=True):
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        deduped.append(item)
    return {"tickers": syms, "count": len(deduped), "items": deduped}


@router.get("/market")
async def news_market(
    per_index: int = Query(default=4, ge=1, le=10),
):
    """Macro / market-wide news from a fixed set of US indices and majors."""
    syms = ["^GSPC", "^IXIC", "^DJI", "BTC-USD", "ETH-USD"]
    results = await asyncio.gather(*(_fetch_yahoo_news(s, per_index) for s in syms))
    flat = [item for batch in results for item in batch]
    seen = set()
    deduped = []
    for item in sorted(flat, key=lambda x: x.get("published_at") or "", reverse=True):
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        deduped.append(item)
    return {"tickers": syms, "count": len(deduped), "items": deduped}
