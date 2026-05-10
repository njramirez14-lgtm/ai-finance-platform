from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.entity import Entity
from srv.models.liability import Liability
from srv.schemas.liability import (
    LiabilityCreate,
    LiabilityOut,
    LiabilitySummary,
    LiabilityUpdate,
)

router = APIRouter(prefix="/liabilities", tags=["liabilities"])


def _verify_entity(db: Session, entity_id: int | None, user_id: int) -> None:
    if entity_id is None:
        return
    exists = (
        db.query(Entity)
        .filter(Entity.id == entity_id, Entity.user_id == user_id)
        .first()
    )
    if not exists:
        raise HTTPException(status_code=400, detail="Entity does not belong to user")


@router.post("/", response_model=LiabilityOut, status_code=status.HTTP_201_CREATED)
def create_liability(
    payload: LiabilityCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_entity(db, payload.entity_id, current_user.id)
    liability = Liability(
        user_id=current_user.id,
        entity_id=payload.entity_id,
        name=payload.name,
        type=payload.type,
        lender=payload.lender,
        original_amount=payload.original_amount or Decimal("0"),
        current_balance=payload.current_balance or Decimal("0"),
        interest_rate=payload.interest_rate,
        monthly_payment=payload.monthly_payment,
        start_date=payload.start_date,
        end_date=payload.end_date,
        currency=payload.currency or "EUR",
        notes=payload.notes,
    )
    db.add(liability)
    db.commit()
    db.refresh(liability)
    return liability


@router.get("/", response_model=list[LiabilityOut])
def list_liabilities(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(Liability)
        .filter(Liability.user_id == current_user.id)
        .order_by(Liability.created_at.asc())
        .all()
    )


@router.get("/summary", response_model=LiabilitySummary)
def liabilities_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(Liability)
        .filter(Liability.user_id == current_user.id)
        .all()
    )
    total_debt = sum((Decimal(str(r.current_balance or 0)) for r in rows), Decimal("0"))
    total_monthly = sum((Decimal(str(r.monthly_payment or 0)) for r in rows), Decimal("0"))
    return LiabilitySummary(
        total_debt=total_debt,
        total_monthly_payment=total_monthly,
        count=len(rows),
    )


@router.put("/{liability_id}", response_model=LiabilityOut)
def update_liability(
    liability_id: int,
    payload: LiabilityUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    liability = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == current_user.id)
        .first()
    )
    if not liability:
        raise HTTPException(status_code=404, detail="Liability not found")

    if payload.entity_id is not None:
        _verify_entity(db, payload.entity_id, current_user.id)
        liability.entity_id = payload.entity_id
    if payload.name is not None: liability.name = payload.name
    if payload.type is not None: liability.type = payload.type
    if payload.lender is not None: liability.lender = payload.lender
    if payload.original_amount is not None: liability.original_amount = payload.original_amount
    if payload.current_balance is not None: liability.current_balance = payload.current_balance
    if payload.interest_rate is not None: liability.interest_rate = payload.interest_rate
    if payload.monthly_payment is not None: liability.monthly_payment = payload.monthly_payment
    if payload.start_date is not None: liability.start_date = payload.start_date
    if payload.end_date is not None: liability.end_date = payload.end_date
    if payload.currency is not None: liability.currency = payload.currency
    if payload.notes is not None: liability.notes = payload.notes

    db.commit()
    db.refresh(liability)
    return liability


@router.delete("/{liability_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_liability(
    liability_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    liability = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == current_user.id)
        .first()
    )
    if not liability:
        raise HTTPException(status_code=404, detail="Liability not found")
    db.delete(liability)
    db.commit()
    return None
