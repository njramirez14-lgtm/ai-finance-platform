import asyncio

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/markets", tags=["markets"])

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

DEFAULT_COINS = "bitcoin,ethereum,solana,binancecoin,ripple,cardano,dogecoin,avalanche-2,polkadot,chainlink"
DEFAULT_STOCKS = ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA", "META", "AMZN", "^GSPC", "^IXIC", "GC=F"]

UA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    )
}


@router.get("/crypto")
async def get_crypto(
    ids: str = Query(default=DEFAULT_COINS, description="Comma-separated CoinGecko ids"),
    vs_currency: str = Query(default="eur"),
):
    url = f"{COINGECKO_BASE}/coins/markets"
    params = {
        "vs_currency": vs_currency,
        "ids": ids,
        "order": "market_cap_desc",
        "per_page": 50,
        "page": 1,
        "sparkline": "true",
        "price_change_percentage": "24h,7d",
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"CoinGecko error {r.status_code}")
        data = r.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Error de red: {exc}")

    return [
        {
            "id": c["id"],
            "symbol": c["symbol"].upper(),
            "name": c["name"],
            "image": c.get("image"),
            "price": c.get("current_price"),
            "market_cap": c.get("market_cap"),
            "change_24h_pct": c.get("price_change_percentage_24h_in_currency"),
            "change_7d_pct": c.get("price_change_percentage_7d_in_currency"),
            "high_24h": c.get("high_24h"),
            "low_24h": c.get("low_24h"),
            "sparkline": (c.get("sparkline_in_7d") or {}).get("price", []),
            "currency": vs_currency.upper(),
        }
        for c in data
    ]


async def _fetch_yahoo(client: httpx.AsyncClient, symbol: str) -> dict | None:
    try:
        r = await client.get(
            f"{YAHOO_BASE}/{symbol}",
            params={"interval": "1d", "range": "1mo"},
        )
        if r.status_code != 200:
            return None
        data = r.json()
        result = (data.get("chart") or {}).get("result") or []
        if not result:
            return None
        chart = result[0]
        meta = chart.get("meta", {})
        quote = (chart.get("indicators", {}).get("quote") or [{}])[0]
        closes = [c for c in (quote.get("close") or []) if c is not None]
        price = meta.get("regularMarketPrice")
        if price is None and closes:
            price = closes[-1]
        prev = meta.get("chartPreviousClose")
        if prev is None and len(closes) > 1:
            prev = closes[-2]
        change = (price - prev) if (price is not None and prev is not None) else 0
        pct = ((change / prev) * 100) if prev else 0
        return {
            "symbol": symbol,
            "name": meta.get("longName") or meta.get("shortName") or symbol,
            "exchange": meta.get("exchangeName"),
            "currency": meta.get("currency", "USD"),
            "price": price,
            "prev_close": prev,
            "change": change,
            "change_pct": pct,
            "high": meta.get("regularMarketDayHigh"),
            "low": meta.get("regularMarketDayLow"),
            "sparkline": closes[-30:],
        }
    except Exception:
        return None


@router.get("/stocks")
async def get_stocks(
    symbols: str = Query(default=None, description="Comma-separated tickers (e.g. AAPL,MSFT,^GSPC)")
):
    syms = [s.strip() for s in symbols.split(",")] if symbols else DEFAULT_STOCKS
    syms = [s for s in syms if s]
    if not syms:
        return []
    async with httpx.AsyncClient(timeout=12, headers=UA_HEADERS) as client:
        results = await asyncio.gather(*(_fetch_yahoo(client, s) for s in syms))
    return [r for r in results if r]


@router.get("/quote")
async def get_quote(symbol: str = Query(..., min_length=1, max_length=20)):
    async with httpx.AsyncClient(timeout=12, headers=UA_HEADERS) as client:
        data = await _fetch_yahoo(client, symbol.upper())
    if data is None:
        raise HTTPException(status_code=404, detail=f"No se ha encontrado el símbolo {symbol}")
    return data
