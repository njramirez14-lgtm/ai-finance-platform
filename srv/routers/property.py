from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.liability import Liability
from srv.models.property import Property
from srv.schemas.property import (
    PropertyCreate,
    PropertyOut,
    PropertySummary,
    PropertyUpdate,
)

router = APIRouter(prefix="/properties", tags=["properties"])


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


def _get_owned(db: Session, prop_id: int, user_id: int) -> Property:
    p = (
        db.query(Property)
        .filter(Property.id == prop_id, Property.user_id == user_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Property not found")
    return p


def _to_out(prop: Property, liability: Liability | None) -> dict:
    purchase = Decimal(str(prop.purchase_price or 0))
    current = Decimal(str(prop.current_value or 0)) if prop.current_value else purchase
    rental = Decimal(str(prop.monthly_rental_income or 0))
    expenses = Decimal(str(prop.monthly_expenses or 0))

    mortgage_balance = Decimal(str(liability.current_balance or 0)) if liability else Decimal("0")
    mortgage_payment = Decimal(str(liability.monthly_payment or 0)) if liability and liability.monthly_payment else Decimal("0")
    equity = (current - mortgage_balance).quantize(Decimal("0.01"))

    net = (rental - expenses - mortgage_payment).quantize(Decimal("0.01"))
    appreciation = (current - purchase).quantize(Decimal("0.01"))
    appreciation_pct = float((appreciation / purchase) * 100) if purchase > 0 else None
    annual_yield = float(((rental * 12) / current) * 100) if current > 0 and rental > 0 else None

    return {
        "id": prop.id,
        "user_id": prop.user_id,
        "liability_id": prop.liability_id,
        "name": prop.name,
        "property_type": prop.property_type,
        "address": prop.address,
        "city": prop.city,
        "country": prop.country,
        "area_m2": prop.area_m2,
        "purchase_date": prop.purchase_date,
        "purchase_price": purchase,
        "current_value": prop.current_value,
        "monthly_rental_income": rental,
        "monthly_expenses": expenses,
        "currency": prop.currency,
        "notes": prop.notes,
        "created_at": prop.created_at,
        "equity": equity,
        "monthly_mortgage_payment": mortgage_payment if mortgage_payment > 0 else None,
        "monthly_net_cashflow": net,
        "appreciation": appreciation,
        "appreciation_pct": round(appreciation_pct, 2) if appreciation_pct is not None else None,
        "annual_yield_pct": round(annual_yield, 2) if annual_yield is not None else None,
    }


def _load_liabilities(db: Session, ids: list[int]) -> dict[int, Liability]:
    if not ids:
        return {}
    rows = db.query(Liability).filter(Liability.id.in_(ids)).all()
    return {r.id: r for r in rows}


@router.post("/", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_liability(db, payload.liability_id, current_user.id)
    p = Property(
        user_id=current_user.id,
        liability_id=payload.liability_id,
        name=payload.name,
        property_type=payload.property_type,
        address=payload.address,
        city=payload.city,
        country=payload.country,
        area_m2=payload.area_m2,
        purchase_date=payload.purchase_date,
        purchase_price=payload.purchase_price or Decimal("0"),
        current_value=payload.current_value,
        monthly_rental_income=payload.monthly_rental_income or Decimal("0"),
        monthly_expenses=payload.monthly_expenses or Decimal("0"),
        currency=(payload.currency or "EUR").upper(),
        notes=payload.notes,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    liab = db.query(Liability).filter(Liability.id == p.liability_id).first() if p.liability_id else None
    return _to_out(p, liab)


@router.get("/", response_model=list[PropertyOut])
def list_properties(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    props = (
        db.query(Property)
        .filter(Property.user_id == current_user.id)
        .order_by(Property.created_at.desc().nullslast(), Property.id.desc())
        .all()
    )
    liab_ids = [p.liability_id for p in props if p.liability_id]
    liabs = _load_liabilities(db, liab_ids)
    return [_to_out(p, liabs.get(p.liability_id)) for p in props]


@router.get("/summary", response_model=PropertySummary)
def properties_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    props = db.query(Property).filter(Property.user_id == current_user.id).all()
    liab_ids = [p.liability_id for p in props if p.liability_id]
    liabs = _load_liabilities(db, liab_ids)

    total_value = Decimal("0")
    total_purchase = Decimal("0")
    total_mortgage = Decimal("0")
    total_income = Decimal("0")
    total_expenses = Decimal("0")
    total_mortgage_payment = Decimal("0")

    for p in props:
        purchase = Decimal(str(p.purchase_price or 0))
        current = Decimal(str(p.current_value or 0)) if p.current_value else purchase
        total_purchase += purchase
        total_value += current
        total_income += Decimal(str(p.monthly_rental_income or 0))
        total_expenses += Decimal(str(p.monthly_expenses or 0))
        liab = liabs.get(p.liability_id) if p.liability_id else None
        if liab:
            total_mortgage += Decimal(str(liab.current_balance or 0))
            if liab.monthly_payment:
                total_mortgage_payment += Decimal(str(liab.monthly_payment))

    equity = (total_value - total_mortgage).quantize(Decimal("0.01"))
    net = (total_income - total_expenses - total_mortgage_payment).quantize(Decimal("0.01"))
    return PropertySummary(
        count=len(props),
        total_value=total_value.quantize(Decimal("0.01")),
        total_purchase=total_purchase.quantize(Decimal("0.01")),
        total_equity=equity,
        total_monthly_income=total_income.quantize(Decimal("0.01")),
        total_monthly_expenses=total_expenses.quantize(Decimal("0.01")),
        total_monthly_mortgage=total_mortgage_payment.quantize(Decimal("0.01")),
        total_monthly_net=net,
    )


@router.get("/{property_id}", response_model=PropertyOut)
def get_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = _get_owned(db, property_id, current_user.id)
    liab = db.query(Liability).filter(Liability.id == p.liability_id).first() if p.liability_id else None
    return _to_out(p, liab)


@router.put("/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: int,
    payload: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = _get_owned(db, property_id, current_user.id)
    if payload.liability_id is not None:
        _verify_liability(db, payload.liability_id, current_user.id)
    for field in (
        "name", "property_type", "address", "city", "country", "area_m2",
        "purchase_date", "purchase_price", "current_value",
        "monthly_rental_income", "monthly_expenses", "currency", "notes",
        "liability_id",
    ):
        v = getattr(payload, field, None)
        if v is not None:
            if field == "currency" and isinstance(v, str):
                v = v.upper()
            setattr(p, field, v)
    db.commit()
    db.refresh(p)
    liab = db.query(Liability).filter(Liability.id == p.liability_id).first() if p.liability_id else None
    return _to_out(p, liab)


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = _get_owned(db, property_id, current_user.id)
    db.delete(p)
    db.commit()
    return None
