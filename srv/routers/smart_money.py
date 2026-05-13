"""Smart Money tracking — public disclosures from US politicians (STOCK Act)
and institutional investors (SEC 13F / Form 4).

Data sources (all open / free):
- Senate disclosures: senate-stock-watcher-data GitHub repo (aggregated JSON).
- House disclosures: clerk.house.gov scraping (placeholder — see /sync/house).
- Institutional 13F: SEC EDGAR (placeholder — see /sync/13f).
"""
from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.models.smart_money_trade import SmartMoneyTrade

router = APIRouter(prefix="/smart-money", tags=["smart-money"])

CRON_SECRET = (os.getenv("CRON_SECRET") or os.getenv("STRATEGY_CRON_SECRET") or "").strip()


def _check_cron_secret(x_cron_secret: str | None, authorization: str | None) -> None:
    if not CRON_SECRET:
        raise HTTPException(status_code=500, detail="CRON_SECRET not configured")
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization.split(" ", 1)[1].strip()
    if x_cron_secret != CRON_SECRET and bearer != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


SENATE_AGG_URL = os.environ.get(
    "SENATE_STOCK_WATCHER_URL",
    "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json",
)

FMP_BASE = os.environ.get("FMP_BASE_URL", "https://financialmodelingprep.com/stable")
FMP_API_KEY = os.environ.get("FMP_API_KEY")

UA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    )
}


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


_AMOUNT_RE = re.compile(r"\$?([\d,]+)\s*-\s*\$?([\d,]+)")
_AMOUNT_OVER_RE = re.compile(r"[Oo]ver\s+\$?([\d,]+)")


def _parse_amount(value: str | None) -> tuple[float | None, float | None]:
    if not value:
        return None, None
    text = value.strip()
    m = _AMOUNT_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", "")), float(m.group(2).replace(",", ""))
        except ValueError:
            return None, None
    m = _AMOUNT_OVER_RE.search(text)
    if m:
        try:
            return float(m.group(1).replace(",", "")), None
        except ValueError:
            return None, None
    return None, None


def _normalize_tx_type(raw: str | None) -> str | None:
    if not raw:
        return None
    t = raw.lower()
    if "purchase" in t or "buy" in t:
        return "BUY"
    if "sale" in t or "sell" in t:
        return "SELL"
    if "exchange" in t:
        return "EXCHANGE"
    return raw.upper()


def _trade_to_dict(t: SmartMoneyTrade) -> dict[str, Any]:
    return {
        "id": t.id,
        "source": t.source,
        "actor_type": t.actor_type,
        "actor_name": t.actor_name,
        "actor_party": t.actor_party,
        "actor_chamber": t.actor_chamber,
        "actor_state": t.actor_state,
        "ticker": t.ticker,
        "asset_name": t.asset_name,
        "asset_type": t.asset_type,
        "transaction_type": t.transaction_type,
        "transaction_date": t.transaction_date.isoformat() if t.transaction_date else None,
        "disclosure_date": t.disclosure_date.isoformat() if t.disclosure_date else None,
        "amount_min": float(t.amount_min) if t.amount_min is not None else None,
        "amount_max": float(t.amount_max) if t.amount_max is not None else None,
        "shares": float(t.shares) if t.shares is not None else None,
        "price": float(t.price) if t.price is not None else None,
        "value_usd": float(t.value_usd) if t.value_usd is not None else None,
        "raw_url": t.raw_url,
        "notes": t.notes,
        "fetched_at": t.fetched_at.isoformat() if t.fetched_at else None,
    }


@router.get("/trades")
def list_trades(
    db: Session = Depends(get_db),
    politician: str | None = Query(default=None, description="Filtra por nombre del politico/insider (substring, case-insensitive)"),
    ticker: str | None = Query(default=None, description="Filtra por ticker exacto"),
    transaction_type: str | None = Query(default=None, description="BUY / SELL / EXCHANGE"),
    source: str | None = Query(default=None, description="senate / house / 13f / form4"),
    actor_type: str | None = Query(default=None, description="politician / institution / insider"),
    days: int = Query(default=180, ge=1, le=3650, description="Solo trades de los ultimos N dias"),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    q = db.query(SmartMoneyTrade)
    if politician:
        q = q.filter(SmartMoneyTrade.actor_name.ilike(f"%{politician}%"))
    if ticker:
        q = q.filter(SmartMoneyTrade.ticker == ticker.upper())
    if transaction_type:
        q = q.filter(SmartMoneyTrade.transaction_type == transaction_type.upper())
    if source:
        q = q.filter(SmartMoneyTrade.source == source.lower())
    if actor_type:
        q = q.filter(SmartMoneyTrade.actor_type == actor_type.lower())
    if days:
        cutoff = date.today() - timedelta(days=days)
        q = q.filter(SmartMoneyTrade.transaction_date >= cutoff)

    total = q.count()
    rows = (
        q.order_by(desc(SmartMoneyTrade.transaction_date), desc(SmartMoneyTrade.id))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"total": total, "limit": limit, "offset": offset, "items": [_trade_to_dict(r) for r in rows]}


@router.get("/politicians")
def list_politicians(db: Session = Depends(get_db)):
    rows = (
        db.query(
            SmartMoneyTrade.actor_name,
            SmartMoneyTrade.actor_chamber,
            SmartMoneyTrade.actor_party,
            SmartMoneyTrade.actor_state,
            func.count(SmartMoneyTrade.id).label("trade_count"),
            func.max(SmartMoneyTrade.transaction_date).label("last_trade"),
        )
        .filter(SmartMoneyTrade.actor_type == "politician")
        .group_by(
            SmartMoneyTrade.actor_name,
            SmartMoneyTrade.actor_chamber,
            SmartMoneyTrade.actor_party,
            SmartMoneyTrade.actor_state,
        )
        .order_by(desc("trade_count"))
        .all()
    )
    return [
        {
            "name": r.actor_name,
            "chamber": r.actor_chamber,
            "party": r.actor_party,
            "state": r.actor_state,
            "trade_count": r.trade_count,
            "last_trade": r.last_trade.isoformat() if r.last_trade else None,
        }
        for r in rows
    ]


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    days: int = Query(default=30, ge=1, le=365),
):
    cutoff = date.today() - timedelta(days=days)
    base = db.query(SmartMoneyTrade).filter(SmartMoneyTrade.transaction_date >= cutoff)
    total = base.count()
    buys = base.filter(SmartMoneyTrade.transaction_type == "BUY").count()
    sells = base.filter(SmartMoneyTrade.transaction_type == "SELL").count()

    top_tickers = (
        db.query(
            SmartMoneyTrade.ticker,
            func.count(SmartMoneyTrade.id).label("n"),
        )
        .filter(SmartMoneyTrade.transaction_date >= cutoff)
        .filter(SmartMoneyTrade.ticker.isnot(None))
        .group_by(SmartMoneyTrade.ticker)
        .order_by(desc("n"))
        .limit(15)
        .all()
    )

    top_actors = (
        db.query(
            SmartMoneyTrade.actor_name,
            func.count(SmartMoneyTrade.id).label("n"),
        )
        .filter(SmartMoneyTrade.transaction_date >= cutoff)
        .group_by(SmartMoneyTrade.actor_name)
        .order_by(desc("n"))
        .limit(15)
        .all()
    )

    return {
        "window_days": days,
        "total_trades": total,
        "buys": buys,
        "sells": sells,
        "top_tickers": [{"ticker": t, "count": n} for t, n in top_tickers],
        "top_actors": [{"name": a, "count": n} for a, n in top_actors],
    }


def _ingest_senate_records(db: Session, records: list[dict[str, Any]]) -> tuple[int, int]:
    inserted = 0
    skipped = 0
    fetched_at = datetime.utcnow()

    seen_in_batch: set[tuple] = set()
    for rec in records:
        actor_name = (rec.get("senator") or rec.get("owner") or "").strip().rstrip(",").strip()
        if not actor_name:
            skipped += 1
            continue
        ticker = (rec.get("ticker") or "").strip().upper() or None
        if ticker in {"--", "N/A", ""}:
            ticker = None
        notes_raw = (rec.get("comment") or "").strip()
        notes = notes_raw if notes_raw and notes_raw != "--" else None
        tx_type = _normalize_tx_type(rec.get("type") or rec.get("transaction_type"))
        tx_date = _parse_date(rec.get("transaction_date"))
        disclosure = _parse_date(rec.get("disclosure_date"))
        amount_min, amount_max = _parse_amount(rec.get("amount"))

        dedup_key = (
            "senate", None, actor_name, ticker, tx_date, tx_type, amount_min,
        )
        if dedup_key in seen_in_batch:
            skipped += 1
            continue
        seen_in_batch.add(dedup_key)

        existing = (
            db.query(SmartMoneyTrade.id)
            .filter(
                SmartMoneyTrade.source == "senate",
                SmartMoneyTrade.actor_name == actor_name,
                SmartMoneyTrade.ticker == ticker,
                SmartMoneyTrade.transaction_date == tx_date,
                SmartMoneyTrade.transaction_type == tx_type,
                SmartMoneyTrade.amount_min == amount_min,
            )
            .first()
        )
        if existing:
            skipped += 1
            continue

        db.add(
            SmartMoneyTrade(
                source="senate",
                source_id=None,
                actor_type="politician",
                actor_name=actor_name,
                actor_party=rec.get("party"),
                actor_chamber="senate",
                actor_state=rec.get("state"),
                ticker=ticker,
                asset_name=(rec.get("asset_description") or rec.get("asset_name") or "").strip() or None,
                asset_type=(rec.get("asset_type") or "").strip() or None,
                transaction_type=tx_type,
                transaction_date=tx_date,
                disclosure_date=disclosure,
                amount_min=amount_min,
                amount_max=amount_max,
                raw_url=rec.get("ptr_link") or rec.get("link"),
                notes=notes,
                fetched_at=fetched_at,
            )
        )
        inserted += 1

        if inserted % 500 == 0:
            db.flush()

    db.commit()
    return inserted, skipped


@router.post("/sync/congress")
async def sync_congress(
    db: Session = Depends(get_db),
    limit: int | None = Query(default=None, ge=1, description="Procesar solo los primeros N registros (debug)"),
):
    """Descarga el agregado JSON de senate-stock-watcher-data y lo persiste.
    Idempotente: skip-if-exists por (source, actor, ticker, fecha, tipo, importe)."""
    try:
        async with httpx.AsyncClient(timeout=60, headers=UA_HEADERS) as client:
            r = await client.get(SENATE_AGG_URL)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Senate source HTTP {r.status_code}")
        data = r.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Network error: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Invalid JSON from source: {exc}") from exc

    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="Unexpected format from senate source")

    if limit:
        data = data[:limit]

    inserted, skipped = _ingest_senate_records(db, data)
    return {
        "source": "senate",
        "fetched_records": len(data),
        "inserted": inserted,
        "skipped": skipped,
        "url": SENATE_AGG_URL,
    }


def _ingest_fmp_house_records(db: Session, records: list[dict[str, Any]], chamber: str = "house") -> tuple[int, int]:
    """FMP /stable/house-latest payload schema:
    { symbol, disclosureDate, transactionDate, firstName, lastName, office, district,
      owner, assetDescription, assetType, type, amount, capitalGainsOver200USD, link }
    """
    inserted = 0
    skipped = 0
    fetched_at = datetime.utcnow()

    seen_in_batch: set[tuple] = set()
    for rec in records:
        actor_name = (
            rec.get("representative")
            or rec.get("senator")
            or rec.get("office")
            or " ".join(filter(None, [rec.get("firstName"), rec.get("lastName")]))
        ).strip().rstrip(",").strip()
        if not actor_name:
            skipped += 1
            continue
        ticker = (rec.get("symbol") or rec.get("ticker") or "").strip().upper() or None
        if ticker in {"--", "N/A", ""}:
            ticker = None
        tx_type = _normalize_tx_type(rec.get("type") or rec.get("transactionType"))
        tx_date = _parse_date(rec.get("transactionDate"))
        disclosure = _parse_date(rec.get("disclosureDate"))
        amount_min, amount_max = _parse_amount(rec.get("amount"))
        notes_raw = (rec.get("comment") or rec.get("owner") or "").strip()
        notes = notes_raw if notes_raw and notes_raw != "--" else None

        dedup_key = (chamber, None, actor_name, ticker, tx_date, tx_type, amount_min)
        if dedup_key in seen_in_batch:
            skipped += 1
            continue
        seen_in_batch.add(dedup_key)

        existing = (
            db.query(SmartMoneyTrade.id)
            .filter(
                SmartMoneyTrade.source == chamber,
                SmartMoneyTrade.actor_name == actor_name,
                SmartMoneyTrade.ticker == ticker,
                SmartMoneyTrade.transaction_date == tx_date,
                SmartMoneyTrade.transaction_type == tx_type,
                SmartMoneyTrade.amount_min == amount_min,
            )
            .first()
        )
        if existing:
            skipped += 1
            continue

        db.add(
            SmartMoneyTrade(
                source=chamber,
                source_id=None,
                actor_type="politician",
                actor_name=actor_name,
                actor_party=rec.get("party"),
                actor_chamber=chamber,
                actor_state=rec.get("district") or rec.get("state"),
                ticker=ticker,
                asset_name=(rec.get("assetDescription") or rec.get("asset_name") or "").strip() or None,
                asset_type=(rec.get("assetType") or rec.get("asset_type") or "").strip() or None,
                transaction_type=tx_type,
                transaction_date=tx_date,
                disclosure_date=disclosure,
                amount_min=amount_min,
                amount_max=amount_max,
                raw_url=rec.get("link") or rec.get("ptr_link"),
                notes=notes,
                fetched_at=fetched_at,
            )
        )
        inserted += 1
        if inserted % 500 == 0:
            db.flush()

    db.commit()
    return inserted, skipped


async def _fetch_fmp(endpoint: str) -> list[dict[str, Any]]:
    """Llama a un endpoint /stable/* de FMP con la API key del entorno.
    Free tier: ~100 registros, sin paginacion."""
    try:
        async with httpx.AsyncClient(timeout=30, headers=UA_HEADERS) as client:
            r = await client.get(
                f"{FMP_BASE}/{endpoint}",
                params={"apikey": FMP_API_KEY},
            )
        if r.status_code in (401, 402, 403):
            raise HTTPException(
                status_code=502,
                detail=f"FMP rechazo la peticion (HTTP {r.status_code}): {r.text[:240]}",
            )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"FMP HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"FMP network error: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"FMP returned invalid JSON: {exc}") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="FMP returned unexpected payload")
    return data


@router.post("/sync/house")
async def sync_house(db: Session = Depends(get_db)):
    """Descarga los ultimos ~100 trades de la House (Pelosi etc.) via Financial
    Modeling Prep. Requiere FMP_API_KEY en .env (registro gratis en
    https://site.financialmodelingprep.com — free tier: 250 calls/dia, sin paginacion)."""
    if not FMP_API_KEY:
        raise HTTPException(
            status_code=501,
            detail=(
                "House sync requiere FMP_API_KEY en .env. Registrate gratis en "
                "https://site.financialmodelingprep.com y reinicia el backend."
            ),
        )
    records = await _fetch_fmp("house-latest")
    inserted, skipped = _ingest_fmp_house_records(db, records, chamber="house")
    return {
        "source": "house",
        "via": "financialmodelingprep",
        "fetched_records": len(records),
        "inserted": inserted,
        "skipped": skipped,
    }


@router.post("/sync/senate-fmp")
async def sync_senate_fmp(db: Session = Depends(get_db)):
    """Descarga los ultimos ~100 trades del Senate via FMP (alternativa al sync
    de senate-stock-watcher, que solo se actualiza esporadicamente). Requiere FMP_API_KEY."""
    if not FMP_API_KEY:
        raise HTTPException(status_code=501, detail="senate-fmp sync requiere FMP_API_KEY en .env")
    records = await _fetch_fmp("senate-latest")
    inserted, skipped = _ingest_fmp_house_records(db, records, chamber="senate")
    return {
        "source": "senate",
        "via": "financialmodelingprep",
        "fetched_records": len(records),
        "inserted": inserted,
        "skipped": skipped,
    }


@router.post("/sync/13f")
def sync_13f():
    """SEC 13F (Buffett, Bridgewater, Citadel...) — pendiente integracion EDGAR.
    Plan: usar dokson/hedge-fund-tracker o git-shogg/finsec via cron job."""
    raise HTTPException(
        status_code=501,
        detail="13F sync no implementado todavia. Pendiente integracion SEC EDGAR.",
    )


@router.get("/cron/daily")
@router.post("/cron/daily")
async def run_daily_cron(
    x_cron_secret: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Cron diario: corre los tres syncs gratuitos (senate-stock-watcher,
    senate FMP, house FMP) en serie. Fail-soft: un error en uno no bloquea los otros.
    Sin coste si el FMP free tier respeta el limite (3 calls/dia por endpoint, ~9/dia totales)."""
    _check_cron_secret(x_cron_secret, authorization)

    results: dict[str, Any] = {}

    try:
        results["senate_watcher"] = await sync_congress(db=db, limit=None)
    except HTTPException as exc:
        results["senate_watcher"] = {"error": exc.detail, "status": exc.status_code}
    except Exception as exc:
        results["senate_watcher"] = {"error": str(exc)}

    if FMP_API_KEY:
        try:
            results["house_fmp"] = await sync_house(db=db)
        except HTTPException as exc:
            results["house_fmp"] = {"error": exc.detail, "status": exc.status_code}
        except Exception as exc:
            results["house_fmp"] = {"error": str(exc)}
        try:
            results["senate_fmp"] = await sync_senate_fmp(db=db)
        except HTTPException as exc:
            results["senate_fmp"] = {"error": exc.detail, "status": exc.status_code}
        except Exception as exc:
            results["senate_fmp"] = {"error": str(exc)}
    else:
        results["fmp"] = "skipped — FMP_API_KEY no configurada"

    total_inserted = sum(
        r.get("inserted", 0) for r in results.values() if isinstance(r, dict)
    )
    return {
        "ok": True,
        "as_of": datetime.utcnow().isoformat(),
        "total_inserted": total_inserted,
        "results": results,
    }


@router.delete("/trades")
def purge_trades(
    db: Session = Depends(get_db),
    source: str | None = Query(default=None, description="Borra solo de un source concreto"),
    confirm: bool = Query(default=False, description="Debe ser true para ejecutar"),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="Pasar confirm=true para ejecutar el borrado")
    q = db.query(SmartMoneyTrade)
    if source:
        q = q.filter(SmartMoneyTrade.source == source.lower())
    n = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": n}
