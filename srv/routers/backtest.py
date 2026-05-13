"""Historical backtest of trading strategies. No real money — only simulation.

Strategies supported:
- buy_hold: invest all at the first day, hold to the end.
- dca:      invest a fixed amount every N days regardless of price.
- sma:      moving-average crossover (fast SMA crosses slow SMA).
- rsi:      mean-reversion (buy at RSI<oversold, sell at RSI>overbought).

Data sources:
- Stocks/indices: Yahoo Finance chart endpoint (no key, daily candles).
- Crypto:        CoinGecko market_chart (no key, daily prices).

This endpoint is read-only. It never places orders anywhere.
"""

from __future__ import annotations

import math
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/backtest", tags=["backtest"])


YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
BINANCE_BASE = "https://api.binance.com/api/v3"
UA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    )
}

# Map CoinGecko-ish names to Binance trading pairs (USDT)
CRYPTO_BINANCE_MAP = {
    "bitcoin": "BTCUSDT",
    "ethereum": "ETHUSDT",
    "solana": "SOLUSDT",
    "binancecoin": "BNBUSDT",
    "ripple": "XRPUSDT",
    "cardano": "ADAUSDT",
    "dogecoin": "DOGEUSDT",
    "avalanche-2": "AVAXUSDT",
    "polkadot": "DOTUSDT",
    "chainlink": "LINKUSDT",
}

# Map CoinGecko-ish names to Yahoo Finance crypto tickers (no geo-block, full history)
CRYPTO_YAHOO_MAP = {
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "solana": "SOL-USD",
    "binancecoin": "BNB-USD",
    "ripple": "XRP-USD",
    "cardano": "ADA-USD",
    "dogecoin": "DOGE-USD",
    "avalanche-2": "AVAX-USD",
    "polkadot": "DOT-USD",
    "chainlink": "LINK-USD",
}


async def fetch_yahoo_crypto(coin_id_or_symbol: str, range_str: str) -> list[tuple[int, float]]:
    """Resolve a crypto id/symbol to Yahoo's BTC-USD style ticker and fetch."""
    sym = CRYPTO_YAHOO_MAP.get(coin_id_or_symbol.lower())
    if not sym:
        # Already a Yahoo-style ticker?
        sym = coin_id_or_symbol.upper()
        if "-" not in sym:
            sym = f"{sym}-USD"
    return await fetch_yahoo_daily(sym, range_str)


# ─────────────────────────────────────────────────────────────────────
# Data fetching
# ─────────────────────────────────────────────────────────────────────

async def fetch_yahoo_daily(symbol: str, range_str: str) -> list[tuple[int, float]]:
    """Return list of (timestamp_seconds, close_price)."""
    async with httpx.AsyncClient(timeout=15, headers=UA_HEADERS) as client:
        r = await client.get(
            f"{YAHOO_BASE}/{symbol}",
            params={"interval": "1d", "range": range_str},
        )
    if r.status_code != 200:
        raise HTTPException(404, f"Símbolo Yahoo no encontrado: {symbol}")
    data = r.json()
    result = (data.get("chart") or {}).get("result") or []
    if not result:
        raise HTTPException(404, f"Sin datos para {symbol}")
    chart = result[0]
    ts: list[int] = chart.get("timestamp") or []
    closes: list[float | None] = (chart.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    pairs: list[tuple[int, float]] = []
    for t, c in zip(ts, closes):
        if c is not None:
            pairs.append((t, float(c)))
    return pairs


async def fetch_binance_daily(symbol_or_id: str, days: int) -> list[tuple[int, float]]:
    """Fetch daily candles from Binance. Accepts either a CoinGecko-style id (bitcoin)
    or a direct USDT pair (BTCUSDT). No auth, no historical-range limits.
    """
    pair = CRYPTO_BINANCE_MAP.get(symbol_or_id.lower(), symbol_or_id.upper())
    if not pair.endswith("USDT") and not pair.endswith("USD"):
        pair = pair + "USDT"
    limit = min(max(days, 30), 1000)  # Binance hard cap: 1000 candles per call
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{BINANCE_BASE}/klines",
            params={"symbol": pair, "interval": "1d", "limit": limit},
        )
    if r.status_code != 200:
        raise HTTPException(404, f"Cripto no encontrada en Binance: {pair}")
    data = r.json()
    # Each kline: [openTime, open, high, low, close, volume, closeTime, ...]
    return [(int(k[0] / 1000), float(k[4])) for k in data]


async def fetch_coingecko_daily(coin_id: str, days: int, vs_currency: str = "usd") -> list[tuple[int, float]]:
    """Fallback: CoinGecko free API. Limited to ~365 days of history."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{COINGECKO_BASE}/coins/{coin_id}/market_chart",
            params={"vs_currency": vs_currency, "days": min(days, 365), "interval": "daily"},
        )
    if r.status_code != 200:
        raise HTTPException(404, f"CoinGecko no encontrado: {coin_id}")
    data = r.json()
    prices = data.get("prices") or []
    return [(int(t / 1000), float(p)) for t, p in prices]


# ─────────────────────────────────────────────────────────────────────
# Indicators (pure stdlib, no numpy)
# ─────────────────────────────────────────────────────────────────────

def sma(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = []
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= period:
            s -= values[i - period]
        if i >= period - 1:
            out.append(s / period)
        else:
            out.append(None)
    return out


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        if diff >= 0:
            gains += diff
        else:
            losses += -diff
    avg_gain = gains / period
    avg_loss = losses / period
    rs = (avg_gain / avg_loss) if avg_loss > 0 else float("inf")
    out[period] = 100 - (100 / (1 + rs)) if math.isfinite(rs) else 100
    for i in range(period + 1, len(values)):
        diff = values[i] - values[i - 1]
        gain = max(diff, 0)
        loss = max(-diff, 0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        rs = (avg_gain / avg_loss) if avg_loss > 0 else float("inf")
        out[i] = 100 - (100 / (1 + rs)) if math.isfinite(rs) else 100
    return out


# ─────────────────────────────────────────────────────────────────────
# Backtest engine
# ─────────────────────────────────────────────────────────────────────

class BacktestResult(BaseModel):
    strategy: str
    symbol: str
    initial_cash: float
    final_value: float
    total_return_pct: float
    buy_hold_return_pct: float
    max_drawdown_pct: float
    win_rate_pct: float
    trades_count: int
    sharpe: float
    period_days: int
    equity_curve: list[dict]  # {t, v}
    trades: list[dict]
    notes: list[str]


def _drawdown(equity: list[float]) -> float:
    peak = equity[0]
    max_dd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (peak - v) / peak
            if dd > max_dd:
                max_dd = dd
    return max_dd * 100


def _sharpe_annualized(equity: list[float]) -> float:
    if len(equity) < 2:
        return 0.0
    rets = [(equity[i] / equity[i - 1] - 1) for i in range(1, len(equity)) if equity[i - 1] > 0]
    if not rets:
        return 0.0
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / len(rets)
    std = math.sqrt(var) if var > 0 else 0.0
    if std == 0:
        return 0.0
    return (mean / std) * math.sqrt(252)


def _simulate(prices: list[tuple[int, float]], signals: list[str], initial_cash: float) -> tuple[list[float], list[dict]]:
    """Walk through prices, on 'buy' signal use all cash, on 'sell' liquidate.

    Returns (equity_curve_values, trades).
    """
    cash = initial_cash
    units = 0.0
    last_buy_price = 0.0
    equity: list[float] = []
    trades: list[dict] = []

    for i, (t, p) in enumerate(prices):
        sig = signals[i]
        if sig == "buy" and cash > 0:
            units = cash / p
            last_buy_price = p
            cash = 0.0
            trades.append({"t": t, "side": "buy", "price": p})
        elif sig == "sell" and units > 0:
            proceeds = units * p
            pnl = proceeds - (units * last_buy_price)
            trades.append({"t": t, "side": "sell", "price": p, "pnl": pnl, "pct": ((p / last_buy_price) - 1) * 100 if last_buy_price else 0})
            cash = proceeds
            units = 0.0
        equity.append(cash + units * p)

    return equity, trades


def strat_buy_hold(prices: list[tuple[int, float]]) -> list[str]:
    sigs = ["hold"] * len(prices)
    if sigs:
        sigs[0] = "buy"
    return sigs


def strat_sma(prices: list[tuple[int, float]], fast: int, slow: int) -> list[str]:
    closes = [p for _, p in prices]
    f = sma(closes, fast)
    s = sma(closes, slow)
    sigs = ["hold"] * len(prices)
    in_pos = False
    for i in range(len(prices)):
        fi, si = f[i], s[i]
        if fi is None or si is None:
            continue
        if not in_pos and fi > si:
            sigs[i] = "buy"
            in_pos = True
        elif in_pos and fi < si:
            sigs[i] = "sell"
            in_pos = False
    return sigs


def strat_rsi(prices: list[tuple[int, float]], period: int, oversold: float, overbought: float) -> list[str]:
    closes = [p for _, p in prices]
    r = rsi(closes, period)
    sigs = ["hold"] * len(prices)
    in_pos = False
    for i in range(len(prices)):
        ri = r[i]
        if ri is None:
            continue
        if not in_pos and ri < oversold:
            sigs[i] = "buy"
            in_pos = True
        elif in_pos and ri > overbought:
            sigs[i] = "sell"
            in_pos = False
    return sigs


def strat_dca(prices: list[tuple[int, float]], every_days: int, monthly_amount: float, initial_cash: float) -> tuple[list[float], list[dict]]:
    """Special-case: DCA injects more cash periodically. Returns (equity_curve, trades) directly."""
    cash = initial_cash
    units = 0.0
    equity = []
    trades = []
    invested = 0.0
    for i, (t, p) in enumerate(prices):
        if i % every_days == 0:
            cash += monthly_amount
            buy_units = monthly_amount / p
            units += buy_units
            invested += monthly_amount
            cash -= monthly_amount
            trades.append({"t": t, "side": "buy", "price": p, "amount": monthly_amount})
        equity.append(cash + units * p)
    # Mark the "initial cash" as the total invested (for return % calc reference)
    return equity, trades


# ─────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────

@router.get("/run", response_model=BacktestResult)
async def run_backtest(
    asset_type: str = Query("stock", regex="^(stock|crypto)$"),
    symbol: str = Query(..., description="Yahoo ticker (AAPL, ^GSPC, BTC-USD) o CoinGecko id (bitcoin)"),
    strategy: str = Query("buy_hold", regex="^(buy_hold|dca|sma|rsi)$"),
    range_str: str = Query("2y", alias="range"),
    initial_cash: float = Query(1000, ge=10, le=1_000_000),
    fast: int = Query(20, ge=2, le=200),
    slow: int = Query(50, ge=5, le=400),
    rsi_period: int = Query(14, ge=2, le=50),
    rsi_oversold: float = Query(30, ge=5, le=45),
    rsi_overbought: float = Query(70, ge=55, le=95),
    dca_every_days: int = Query(30, ge=1, le=120),
    dca_amount: float = Query(100, ge=1, le=10_000),
):
    # Map range to days for crypto
    range_days = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}.get(range_str, 730)

    if asset_type == "stock":
        prices = await fetch_yahoo_daily(symbol, range_str)
    else:
        # Yahoo first (no geo-block, full history). Fall back to Binance, then CoinGecko.
        try:
            prices = await fetch_yahoo_crypto(symbol, range_str)
        except HTTPException:
            try:
                prices = await fetch_binance_daily(symbol, range_days)
            except HTTPException:
                prices = await fetch_coingecko_daily(symbol, range_days)

    if len(prices) < 30:
        raise HTTPException(400, "Pocos datos históricos para hacer backtest fiable.")

    notes: list[str] = []
    if strategy == "dca":
        equity, trades = strat_dca(prices, dca_every_days, dca_amount, 0.0)
        # Compute total invested for ROI calc
        invested = sum(t.get("amount", 0) for t in trades)
        final_value = equity[-1] if equity else 0
        total_return_pct = ((final_value / invested) - 1) * 100 if invested > 0 else 0
        ref_initial = invested
    else:
        if strategy == "buy_hold":
            sigs = strat_buy_hold(prices)
        elif strategy == "sma":
            if fast >= slow:
                raise HTTPException(400, "Fast SMA debe ser menor que slow SMA")
            sigs = strat_sma(prices, fast, slow)
        elif strategy == "rsi":
            if rsi_oversold >= rsi_overbought:
                raise HTTPException(400, "RSI oversold debe ser menor que overbought")
            sigs = strat_rsi(prices, rsi_period, rsi_oversold, rsi_overbought)
        else:
            raise HTTPException(400, f"Estrategia desconocida: {strategy}")
        equity, trades = _simulate(prices, sigs, initial_cash)
        final_value = equity[-1] if equity else initial_cash
        total_return_pct = ((final_value / initial_cash) - 1) * 100
        ref_initial = initial_cash

    # Buy-and-hold reference for any strategy
    bh_equity, _ = _simulate(prices, strat_buy_hold(prices), initial_cash if strategy != "dca" else (sum(t.get("amount", 0) for t in trades) or initial_cash))
    bh_return_pct = ((bh_equity[-1] / (initial_cash if strategy != "dca" else (sum(t.get("amount", 0) for t in trades) or initial_cash))) - 1) * 100 if bh_equity else 0

    win_trades = [t for t in trades if t.get("side") == "sell" and t.get("pnl", 0) > 0]
    sell_trades = [t for t in trades if t.get("side") == "sell"]
    win_rate = (len(win_trades) / len(sell_trades) * 100) if sell_trades else 0

    if strategy == "dca":
        notes.append(f"DCA: invertiste {dca_amount}€ cada {dca_every_days} días, total {sum(t.get('amount', 0) for t in trades):.0f}€")
        win_rate = 0  # no sells in DCA

    period_days = max(1, (prices[-1][0] - prices[0][0]) // 86400) if len(prices) >= 2 else 0

    # Build a downsampled equity curve (max 200 points for chart)
    sample_n = min(200, len(equity))
    step = max(1, len(equity) // sample_n)
    curve = [{"t": prices[i][0], "v": equity[i]} for i in range(0, len(equity), step)]
    if curve and curve[-1]["t"] != prices[-1][0]:
        curve.append({"t": prices[-1][0], "v": equity[-1]})

    return BacktestResult(
        strategy=strategy,
        symbol=symbol,
        initial_cash=ref_initial,
        final_value=final_value,
        total_return_pct=total_return_pct,
        buy_hold_return_pct=bh_return_pct,
        max_drawdown_pct=_drawdown(equity),
        win_rate_pct=win_rate,
        trades_count=len(trades),
        sharpe=_sharpe_annualized(equity),
        period_days=period_days,
        equity_curve=curve,
        trades=trades[-30:],
        notes=notes,
    )
