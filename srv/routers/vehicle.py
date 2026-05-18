from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.liability import Liability
from srv.models.vehicle import Vehicle
from srv.schemas.vehicle import (
    VehicleCreate,
    VehicleOut,
    VehicleSummary,
    VehicleUpdate,
)

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


def _verify_liability(db: Session, liability_id: int | None, user_id: int) -> None:
    if liability_id is None:
        return
    exists = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == user_id)
        .first()
    )
    if not exists:
        raise HTTPException(status_code=400, detail="Liability does not belong to user")


def _get_owned(db: Session, vehicle_id: int, user_id: int) -> Vehicle:
    v = (
        db.query(Vehicle)
        .filter(Vehicle.id == vehicle_id, Vehicle.user_id == user_id)
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return v


def _to_out(v: Vehicle, liability: Liability | None) -> dict:
    purchase = Decimal(str(v.purchase_price or 0))
    current = Decimal(str(v.current_value or 0)) if v.current_value else purchase
    income = Decimal(str(v.monthly_income or 0))
    expenses = Decimal(str(v.monthly_expenses or 0))

    loan_balance = Decimal(str(liability.current_balance or 0)) if liability else Decimal("0")
    loan_payment = Decimal(str(liability.monthly_payment or 0)) if liability and liability.monthly_payment else Decimal("0")
    equity = (current - loan_balance).quantize(Decimal("0.01"))

    net = (income - expenses - loan_payment).quantize(Decimal("0.01"))
    depreciation = (current - purchase).quantize(Decimal("0.01"))
    depreciation_pct = float((depreciation / purchase) * 100) if purchase > 0 else None

    return {
        "id": v.id,
        "user_id": v.user_id,
        "liability_id": v.liability_id,
        "name": v.name,
        "vehicle_type": v.vehicle_type,
        "make": v.make,
        "model": v.model,
        "year": v.year,
        "license_plate": v.license_plate,
        "purchase_date": v.purchase_date,
        "purchase_price": purchase,
        "current_value": v.current_value,
        "monthly_income": income,
        "monthly_expenses": expenses,
        "currency": v.currency,
        "notes": v.notes,
        "created_at": v.created_at,
        "equity": equity,
        "monthly_loan_payment": loan_payment if loan_payment > 0 else None,
        "monthly_net_cashflow": net,
        "depreciation": depreciation,
        "depreciation_pct": round(depreciation_pct, 2) if depreciation_pct is not None else None,
    }


def _load_liabilities(db: Session, ids: list[int]) -> dict[int, Liability]:
    if not ids:
        return {}
    rows = db.query(Liability).filter(Liability.id.in_(ids)).all()
    return {r.id: r for r in rows}


@router.post("/", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_liability(db, payload.liability_id, current_user.id)
    v = Vehicle(
        user_id=current_user.id,
        liability_id=payload.liability_id,
        name=payload.name,
        vehicle_type=payload.vehicle_type,
        make=payload.make,
        model=payload.model,
        year=payload.year,
        license_plate=payload.license_plate,
        purchase_date=payload.purchase_date,
        purchase_price=payload.purchase_price or Decimal("0"),
        current_value=payload.current_value,
        monthly_income=payload.monthly_income or Decimal("0"),
        monthly_expenses=payload.monthly_expenses or Decimal("0"),
        currency=(payload.currency or "EUR").upper(),
        notes=payload.notes,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    liab = db.query(Liability).filter(Liability.id == v.liability_id).first() if v.liability_id else None
    return _to_out(v, liab)


@router.get("/", response_model=list[VehicleOut])
def list_vehicles(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    vs = (
        db.query(Vehicle)
        .filter(Vehicle.user_id == current_user.id)
        .order_by(Vehicle.created_at.desc().nullslast(), Vehicle.id.desc())
        .all()
    )
    liab_ids = [v.liability_id for v in vs if v.liability_id]
    liabs = _load_liabilities(db, liab_ids)
    return [_to_out(v, liabs.get(v.liability_id)) for v in vs]


@router.get("/summary", response_model=VehicleSummary)
def vehicles_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    vs = db.query(Vehicle).filter(Vehicle.user_id == current_user.id).all()
    liab_ids = [v.liability_id for v in vs if v.liability_id]
    liabs = _load_liabilities(db, liab_ids)

    total_value = Decimal("0")
    total_purchase = Decimal("0")
    total_loan = Decimal("0")
    total_income = Decimal("0")
    total_expenses = Decimal("0")
    total_loan_payment = Decimal("0")

    for v in vs:
        purchase = Decimal(str(v.purchase_price or 0))
        current = Decimal(str(v.current_value or 0)) if v.current_value else purchase
        total_purchase += purchase
        total_value += current
        total_income += Decimal(str(v.monthly_income or 0))
        total_expenses += Decimal(str(v.monthly_expenses or 0))
        liab = liabs.get(v.liability_id) if v.liability_id else None
        if liab:
            total_loan += Decimal(str(liab.current_balance or 0))
            if liab.monthly_payment:
                total_loan_payment += Decimal(str(liab.monthly_payment))

    equity = (total_value - total_loan).quantize(Decimal("0.01"))
    net = (total_income - total_expenses - total_loan_payment).quantize(Decimal("0.01"))
    return VehicleSummary(
        count=len(vs),
        total_value=total_value.quantize(Decimal("0.01")),
        total_purchase=total_purchase.quantize(Decimal("0.01")),
        total_equity=equity,
        total_monthly_income=total_income.quantize(Decimal("0.01")),
        total_monthly_expenses=total_expenses.quantize(Decimal("0.01")),
        total_monthly_loan=total_loan_payment.quantize(Decimal("0.01")),
        total_monthly_net=net,
    )


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    v = _get_owned(db, vehicle_id, current_user.id)
    liab = db.query(Liability).filter(Liability.id == v.liability_id).first() if v.liability_id else None
    return _to_out(v, liab)


@router.put("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(
    vehicle_id: int,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    v = _get_owned(db, vehicle_id, current_user.id)
    if payload.liability_id is not None:
        _verify_liability(db, payload.liability_id, current_user.id)
    for field in (
        "name", "vehicle_type", "make", "model", "year", "license_plate",
        "purchase_date", "purchase_price", "current_value",
        "monthly_income", "monthly_expenses", "currency", "notes",
        "liability_id",
    ):
        new_val = getattr(payload, field, None)
        if new_val is not None:
            if field == "currency" and isinstance(new_val, str):
                new_val = new_val.upper()
            setattr(v, field, new_val)
    db.commit()
    db.refresh(v)
    liab = db.query(Liability).filter(Liability.id == v.liability_id).first() if v.liability_id else None
    return _to_out(v, liab)


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    v = _get_owned(db, vehicle_id, current_user.id)
    db.delete(v)
    db.commit()
    return None
