"""Public sandbox demo for property/vehicle advisor.

Self-contained: zero auth, isolated in-memory store, no DB writes.
Each session_id keys an independent sandbox so you can mail the link to a
prospect and let them poke at the UI without touching prod data.
"""
import secrets
import threading
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/demo", tags=["demo"])

_LOCK = threading.Lock()
_SESSIONS: dict[str, dict] = {}
_MAX_SESSIONS = 500
_MAX_ITEMS_PER_SESSION = 50


def _seed(session_id: str) -> dict:
    return {
        "session_id": session_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "properties": [
            {
                "id": 1, "name": "Piso Madrid Salamanca", "property_type": "RESIDENCE",
                "address": "Calle Velázquez 100", "city": "Madrid", "country": "España",
                "area_m2": 95, "purchase_date": "2018-06-01",
                "purchase_price": 380000, "current_value": 520000,
                "monthly_rental_income": 0, "monthly_expenses": 320,
                "monthly_mortgage_payment": 1180, "mortgage_balance": 215000,
                "currency": "EUR", "notes": "Vivienda habitual",
            },
            {
                "id": 2, "name": "Apartamento Malasaña (alquiler)", "property_type": "RENTAL",
                "address": "Calle Fuencarral 80", "city": "Madrid", "country": "España",
                "area_m2": 55, "purchase_date": "2021-03-15",
                "purchase_price": 245000, "current_value": 295000,
                "monthly_rental_income": 1350, "monthly_expenses": 180,
                "monthly_mortgage_payment": 780, "mortgage_balance": 165000,
                "currency": "EUR", "notes": "Inquilino estable, contrato 5 años",
            },
        ],
        "vehicles": [
            {
                "id": 1, "name": "Tesla Model 3", "vehicle_type": "CAR",
                "make": "Tesla", "model": "Model 3 LR", "year": 2023,
                "license_plate": "1234-ABC", "purchase_date": "2023-09-01",
                "purchase_price": 52000, "current_value": 38000,
                "monthly_income": 0, "monthly_expenses": 240,
                "monthly_loan_payment": 580, "loan_balance": 28000,
                "currency": "EUR", "notes": "Seguro a todo riesgo + parking",
            },
            {
                "id": 2, "name": "BMW R1250GS", "vehicle_type": "MOTORCYCLE",
                "make": "BMW", "model": "R 1250 GS", "year": 2022,
                "license_plate": "5678-XYZ", "purchase_date": "2022-04-10",
                "purchase_price": 22000, "current_value": 16500,
                "monthly_income": 0, "monthly_expenses": 95,
                "monthly_loan_payment": 0, "loan_balance": 0,
                "currency": "EUR", "notes": "Sin financiación, pagada al contado",
            },
        ],
        "next_property_id": 3,
        "next_vehicle_id": 3,
    }


def _get_session(session_id: str) -> dict:
    with _LOCK:
        session = _SESSIONS.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Sesión demo no encontrada o expirada")
        return session


def _enrich_property(p: dict) -> dict:
    purchase = Decimal(str(p.get("purchase_price") or 0))
    current = Decimal(str(p.get("current_value") or purchase))
    rental = Decimal(str(p.get("monthly_rental_income") or 0))
    expenses = Decimal(str(p.get("monthly_expenses") or 0))
    mortgage_balance = Decimal(str(p.get("mortgage_balance") or 0))
    mortgage_payment = Decimal(str(p.get("monthly_mortgage_payment") or 0))
    equity = (current - mortgage_balance).quantize(Decimal("0.01"))
    net = (rental - expenses - mortgage_payment).quantize(Decimal("0.01"))
    appreciation = (current - purchase).quantize(Decimal("0.01"))
    appreciation_pct = float((appreciation / purchase) * 100) if purchase > 0 else None
    annual_yield = float(((rental * 12) / current) * 100) if current > 0 and rental > 0 else None
    return {
        **p,
        "equity": str(equity),
        "monthly_net_cashflow": str(net),
        "appreciation": str(appreciation),
        "appreciation_pct": round(appreciation_pct, 2) if appreciation_pct is not None else None,
        "annual_yield_pct": round(annual_yield, 2) if annual_yield is not None else None,
    }


def _enrich_vehicle(v: dict) -> dict:
    purchase = Decimal(str(v.get("purchase_price") or 0))
    current = Decimal(str(v.get("current_value") or purchase))
    income = Decimal(str(v.get("monthly_income") or 0))
    expenses = Decimal(str(v.get("monthly_expenses") or 0))
    loan_balance = Decimal(str(v.get("loan_balance") or 0))
    loan_payment = Decimal(str(v.get("monthly_loan_payment") or 0))
    equity = (current - loan_balance).quantize(Decimal("0.01"))
    net = (income - expenses - loan_payment).quantize(Decimal("0.01"))
    depreciation = (current - purchase).quantize(Decimal("0.01"))
    depreciation_pct = float((depreciation / purchase) * 100) if purchase > 0 else None
    return {
        **v,
        "equity": str(equity),
        "monthly_net_cashflow": str(net),
        "depreciation": str(depreciation),
        "depreciation_pct": round(depreciation_pct, 2) if depreciation_pct is not None else None,
    }


class DemoSessionOut(BaseModel):
    session_id: str
    share_url: str | None = None


@router.post("/sessions", response_model=DemoSessionOut, status_code=201)
def create_session():
    """Create a new isolated demo session with seed data."""
    with _LOCK:
        if len(_SESSIONS) >= _MAX_SESSIONS:
            # evict oldest
            oldest = min(_SESSIONS.keys(), key=lambda k: _SESSIONS[k]["created_at"])
            del _SESSIONS[oldest]
        session_id = secrets.token_urlsafe(16)
        _SESSIONS[session_id] = _seed(session_id)
    return {"session_id": session_id}


@router.get("/sessions/{session_id}")
def get_session_summary(session_id: str):
    s = _get_session(session_id)
    return {
        "session_id": session_id,
        "created_at": s["created_at"],
        "property_count": len(s["properties"]),
        "vehicle_count": len(s["vehicles"]),
    }


# ---------- Properties ----------

class DemoPropertyIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    property_type: str = "RESIDENCE"
    address: str | None = None
    city: str | None = None
    country: str | None = None
    area_m2: float | None = None
    purchase_date: str | None = None
    purchase_price: float = 0
    current_value: float | None = None
    monthly_rental_income: float = 0
    monthly_expenses: float = 0
    monthly_mortgage_payment: float = 0
    mortgage_balance: float = 0
    currency: str = "EUR"
    notes: str | None = None


@router.get("/sessions/{session_id}/properties")
def list_demo_properties(session_id: str):
    s = _get_session(session_id)
    return [_enrich_property(p) for p in s["properties"]]


@router.post("/sessions/{session_id}/properties", status_code=201)
def add_demo_property(session_id: str, payload: DemoPropertyIn):
    s = _get_session(session_id)
    if len(s["properties"]) >= _MAX_ITEMS_PER_SESSION:
        raise HTTPException(status_code=400, detail="Límite alcanzado en demo")
    with _LOCK:
        new_id = s["next_property_id"]
        s["next_property_id"] += 1
        item = {"id": new_id, **payload.model_dump()}
        s["properties"].append(item)
    return _enrich_property(item)


@router.delete("/sessions/{session_id}/properties/{property_id}", status_code=204)
def delete_demo_property(session_id: str, property_id: int):
    s = _get_session(session_id)
    with _LOCK:
        s["properties"] = [p for p in s["properties"] if p["id"] != property_id]
    return None


# ---------- Vehicles ----------

class DemoVehicleIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    vehicle_type: str = "CAR"
    make: str | None = None
    model: str | None = None
    year: int | None = None
    license_plate: str | None = None
    purchase_date: str | None = None
    purchase_price: float = 0
    current_value: float | None = None
    monthly_income: float = 0
    monthly_expenses: float = 0
    monthly_loan_payment: float = 0
    loan_balance: float = 0
    currency: str = "EUR"
    notes: str | None = None


@router.get("/sessions/{session_id}/vehicles")
def list_demo_vehicles(session_id: str):
    s = _get_session(session_id)
    return [_enrich_vehicle(v) for v in s["vehicles"]]


@router.post("/sessions/{session_id}/vehicles", status_code=201)
def add_demo_vehicle(session_id: str, payload: DemoVehicleIn):
    s = _get_session(session_id)
    if len(s["vehicles"]) >= _MAX_ITEMS_PER_SESSION:
        raise HTTPException(status_code=400, detail="Límite alcanzado en demo")
    with _LOCK:
        new_id = s["next_vehicle_id"]
        s["next_vehicle_id"] += 1
        item = {"id": new_id, **payload.model_dump()}
        s["vehicles"].append(item)
    return _enrich_vehicle(item)


@router.delete("/sessions/{session_id}/vehicles/{vehicle_id}", status_code=204)
def delete_demo_vehicle(session_id: str, vehicle_id: int):
    s = _get_session(session_id)
    with _LOCK:
        s["vehicles"] = [v for v in s["vehicles"] if v["id"] != vehicle_id]
    return None


@router.get("/sessions/{session_id}/summary")
def session_financial_summary(session_id: str):
    s = _get_session(session_id)
    props = [_enrich_property(p) for p in s["properties"]]
    vehs = [_enrich_vehicle(v) for v in s["vehicles"]]

    prop_value = sum(Decimal(str(p["current_value"] or p["purchase_price"] or 0)) for p in s["properties"])
    veh_value = sum(Decimal(str(v["current_value"] or v["purchase_price"] or 0)) for v in s["vehicles"])
    prop_mortgage = sum(Decimal(str(p.get("mortgage_balance") or 0)) for p in s["properties"])
    veh_loan = sum(Decimal(str(v.get("loan_balance") or 0)) for v in s["vehicles"])
    total_assets = prop_value + veh_value
    total_debt = prop_mortgage + veh_loan
    net_worth = total_assets - total_debt

    monthly_in = (
        sum(Decimal(str(p.get("monthly_rental_income") or 0)) for p in s["properties"])
        + sum(Decimal(str(v.get("monthly_income") or 0)) for v in s["vehicles"])
    )
    monthly_out = (
        sum(Decimal(str(p.get("monthly_expenses") or 0)) + Decimal(str(p.get("monthly_mortgage_payment") or 0)) for p in s["properties"])
        + sum(Decimal(str(v.get("monthly_expenses") or 0)) + Decimal(str(v.get("monthly_loan_payment") or 0)) for v in s["vehicles"])
    )

    return {
        "session_id": session_id,
        "property_count": len(props),
        "vehicle_count": len(vehs),
        "total_assets": str(total_assets.quantize(Decimal("0.01"))),
        "total_debt": str(total_debt.quantize(Decimal("0.01"))),
        "net_worth": str((total_assets - total_debt).quantize(Decimal("0.01"))),
        "monthly_cashflow_in": str(monthly_in.quantize(Decimal("0.01"))),
        "monthly_cashflow_out": str(monthly_out.quantize(Decimal("0.01"))),
        "monthly_net": str((monthly_in - monthly_out).quantize(Decimal("0.01"))),
    }
