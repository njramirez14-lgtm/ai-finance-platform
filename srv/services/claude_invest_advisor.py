"""Investment advisor backed by Claude Opus 4.7 with tool-use.

This is the upgrade path from Gemini Flash for the `invest` persona. The model
runs an agentic loop where it can call our tools (holdings, news, smart money,
price) plus Anthropic's server-side web_search to assemble live context before
answering — instead of receiving everything pre-baked in the prompt.

Other personas (fiscal, savings, general) still use Gemini for cost reasons.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta
from typing import Any

import anthropic
import httpx
from sqlalchemy import desc
from sqlalchemy.orm import Session

from srv.models.holding import Holding
from srv.models.smart_money_trade import SmartMoneyTrade

log = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
INVEST_MODEL = os.getenv("INVEST_ADVISOR_MODEL", "claude-opus-4-7")

YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    )
}


# ---------- Tool implementations (run server-side here, returned to Claude) ----------

def _tool_get_holdings(db: Session, user_id: int) -> dict[str, Any]:
    rows = db.query(Holding).filter(Holding.user_id == user_id).all()
    if not rows:
        return {"holdings": [], "note": "User has not registered any holdings in /portfolio yet."}
    items = []
    total_cost = 0.0
    for h in rows:
        qty = float(h.quantity or 0)
        avg = float(h.avg_buy_price or 0)
        cost = qty * avg
        total_cost += cost
        items.append({
            "symbol": h.symbol,
            "name": h.name,
            "asset_type": h.asset_type,
            "quantity": qty,
            "avg_buy_price": avg,
            "currency": h.currency,
            "broker": h.broker,
            "cost_basis": round(cost, 2),
        })
    return {
        "holdings": items,
        "total_cost_basis_eur_approx": round(total_cost, 2),
        "count": len(items),
    }


async def _yahoo_news(ticker: str, count: int = 8) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=6, headers=UA) as client:
            r = await client.get(
                YAHOO_SEARCH_URL,
                params={"q": ticker, "newsCount": count, "quotesCount": 0},
            )
        if r.status_code != 200:
            return []
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return []

    out = []
    for n in (data.get("news") or [])[:count]:
        ts = n.get("providerPublishTime")
        try:
            published = datetime.utcfromtimestamp(ts).isoformat() if ts else None
        except (TypeError, ValueError, OSError):
            published = None
        out.append({
            "title": n.get("title"),
            "publisher": n.get("publisher"),
            "url": n.get("link"),
            "published_at": published,
            "related_tickers": n.get("relatedTickers") or [],
        })
    return out


def _tool_get_news(ticker: str, count: int = 8) -> dict[str, Any]:
    items = asyncio.run(_yahoo_news(ticker, count))
    return {"ticker": ticker.upper(), "count": len(items), "items": items}


async def _yahoo_quote(symbols: list[str]) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=6, headers=UA) as client:
            r = await client.get(YAHOO_QUOTE_URL, params={"symbols": ",".join(symbols)})
        if r.status_code != 200:
            return []
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return []
    result = data.get("quoteResponse", {}).get("result", []) or []
    return [
        {
            "symbol": q.get("symbol"),
            "price": q.get("regularMarketPrice"),
            "currency": q.get("currency"),
            "change_pct": q.get("regularMarketChangePercent"),
            "day_high": q.get("regularMarketDayHigh"),
            "day_low": q.get("regularMarketDayLow"),
            "volume": q.get("regularMarketVolume"),
            "name": q.get("shortName") or q.get("longName"),
        }
        for q in result
    ]


def _tool_get_price(ticker: str) -> dict[str, Any]:
    rows = asyncio.run(_yahoo_quote([ticker]))
    if not rows:
        return {"ticker": ticker.upper(), "price": None, "note": "Price unavailable"}
    return rows[0]


def _tool_get_smart_money(
    db: Session,
    ticker: str | None = None,
    days: int = 30,
    limit: int = 25,
) -> dict[str, Any]:
    cutoff = date.today() - timedelta(days=days)
    q = (
        db.query(SmartMoneyTrade)
        .filter(SmartMoneyTrade.transaction_date >= cutoff)
    )
    if ticker:
        q = q.filter(SmartMoneyTrade.ticker == ticker.upper())
    rows = q.order_by(desc(SmartMoneyTrade.transaction_date)).limit(limit).all()
    items = [
        {
            "date": t.transaction_date.isoformat() if t.transaction_date else None,
            "actor": t.actor_name,
            "party": t.actor_party,
            "chamber": t.actor_chamber,
            "ticker": t.ticker,
            "action": t.transaction_type,
            "amount_min_usd": float(t.amount_min) if t.amount_min is not None else None,
            "amount_max_usd": float(t.amount_max) if t.amount_max is not None else None,
            "asset": t.asset_name,
        }
        for t in rows
    ]
    return {
        "ticker": ticker.upper() if ticker else None,
        "days": days,
        "count": len(items),
        "trades": items,
    }


# ---------- Tool schemas the model sees ----------

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_holdings",
        "description": (
            "Returns the user's current portfolio holdings (symbol, quantity, "
            "average buy price, broker). Call this whenever you need to know "
            "what the user actually owns before giving any advice."
        ),
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_news",
        "description": (
            "Recent news headlines for one ticker from Yahoo Finance (last "
            "24-72h typically). Use this to check if there is fresh news that "
            "would change your advice on a position."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Yahoo symbol (AAPL, BTC-USD, VWCE.DE, ...)"},
                "count": {"type": "integer", "description": "How many headlines (1-20)", "default": 8},
            },
            "required": ["ticker"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_price",
        "description": (
            "Current quote for one ticker (price, day change %, volume). Use "
            "to know the live price before suggesting buy/sell levels."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"ticker": {"type": "string"}},
            "required": ["ticker"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_smart_money",
        "description": (
            "Recent US Congress / Senate stock trades (House + Senate via "
            "Lambda Finance). Filter by ticker to see if politicians are "
            "buying/selling something specific. Empty ticker returns the "
            "most recent trades across all politicians."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Optional ticker filter"},
                "days": {"type": "integer", "description": "Look back N days (default 30)", "default": 30},
                "limit": {"type": "integer", "default": 25},
            },
            "additionalProperties": False,
        },
    },
    {
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": 5,
    },
]


def _dispatch_tool(name: str, inputs: dict[str, Any], db: Session, user_id: int) -> dict[str, Any]:
    """Run a tool call and return its result. Anything we can't recognize
    becomes an error result the model can react to."""
    try:
        if name == "get_holdings":
            return _tool_get_holdings(db, user_id)
        if name == "get_news":
            return _tool_get_news(inputs.get("ticker", ""), int(inputs.get("count", 8) or 8))
        if name == "get_price":
            return _tool_get_price(inputs.get("ticker", ""))
        if name == "get_smart_money":
            return _tool_get_smart_money(
                db,
                inputs.get("ticker") or None,
                int(inputs.get("days", 30) or 30),
                int(inputs.get("limit", 25) or 25),
            )
        return {"error": f"Unknown tool {name}"}
    except Exception as exc:
        log.exception("Tool %s failed", name)
        return {"error": f"Tool {name} raised: {exc}"}


SYSTEM_PROMPT = (
    "Eres el asesor de inversión personal del usuario. Hablas en español de España, "
    "tono profesional pero directo, sin paja. Acceso real a su cartera, precios "
    "de mercado, noticias recientes y trades del Congreso US.\n\n"
    "Reglas:\n"
    "- Antes de opinar sobre cualquier posición, comprueba qué tiene REALMENTE "
    "  con get_holdings(). No asumas.\n"
    "- Si hay un ticker concreto en juego, mira el precio actual (get_price) "
    "  y las noticias de los últimos días (get_news). Cita las fuentes.\n"
    "- Usa get_smart_money cuando el usuario pregunte qué están comprando "
    "  congresistas/senadores o cuando un movimiento institucional pueda "
    "  afectar a una posición suya.\n"
    "- Usa web_search SOLO para cosas que las otras tools no cubren "
    "  (macro, análisis sectoriales, eventos puntuales). Máximo 5 búsquedas.\n"
    "- Sé CONCRETO: tickers, niveles de precio razonables, qué acción tomar "
    "  (comprar, mantener, recortar, vender). No el rollo de 'diversifica con "
    "  ETFs indexados a largo plazo' salvo que aplique de verdad.\n"
    "- Recuerda al usuario que no eres asesor regulado y que esto no es "
    "  recomendación financiera personalizada cuando vayas a sugerir compras "
    "  o ventas específicas.\n\n"
    "Formato de respuesta:\n"
    "### Tu cartera ahora\n"
    "### Lo que pasa (datos, no opinión)\n"
    "### Recomendaciones concretas\n"
    "### Riesgos a vigilar"
)


def is_available() -> bool:
    return bool(ANTHROPIC_API_KEY)


def run_invest_advisor(
    db: Session,
    user_id: int,
    user_question: str,
    history: list[dict[str, Any]] | None = None,
    summary: str | None = None,
    max_iterations: int = 8,
) -> str:
    """Run one agentic turn for the invest persona. Returns Claude's final
    text. Tool calls happen here on the server; we only return the synthesis.

    `history` is the prior conversation in Anthropic message shape (alternating
    user/assistant). `summary` is the optional long-term memory string."""
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY no configurada en el backend")

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    system = SYSTEM_PROMPT
    if summary:
        system += f"\n\nResumen de conversaciones anteriores con el usuario:\n{summary}"

    messages: list[dict[str, Any]] = []
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_question})

    for _ in range(max_iterations):
        response = client.messages.create(
            model=INVEST_MODEL,
            max_tokens=8000,
            system=system,
            tools=TOOLS,
            messages=messages,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
        )

        # Always append the assistant turn — preserves tool_use blocks for the next round.
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            return _final_text(response.content)
        if response.stop_reason == "pause_turn":
            # Server-side tool (web_search) hit its internal pause — just send another
            # request with the same messages and the API resumes.
            continue
        if response.stop_reason != "tool_use":
            return _final_text(response.content) or "(sin respuesta)"

        tool_results: list[dict[str, Any]] = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            result = _dispatch_tool(block.name, dict(block.input or {}), db, user_id)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": _stringify_result(result),
            })
        if not tool_results:
            return _final_text(response.content) or "(sin respuesta)"
        messages.append({"role": "user", "content": tool_results})

    return "Agotado el límite de iteraciones del asesor. Replantéa la pregunta."


def _final_text(content: list[Any]) -> str:
    parts = []
    for block in content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "\n".join(parts).strip()


def _stringify_result(result: Any) -> str:
    """Tool results are sent as text content blocks. Anthropic accepts JSON
    strings — keep them compact so they don't blow the context."""
    import json
    try:
        return json.dumps(result, default=str, ensure_ascii=False)[:60000]
    except (TypeError, ValueError):
        return str(result)[:60000]
