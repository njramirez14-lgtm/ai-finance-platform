from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.card import Card
from srv.schemas.card import CardCreate, CardOut, CardUpdate

router = APIRouter(prefix="/cards", tags=["cards"])


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


@router.post("/", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def create_card(
    payload: CardCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_account(db, payload.account_id, current_user.id)
    card = Card(
        user_id=current_user.id,
        account_id=payload.account_id,
        alias=payload.alias,
        last4=payload.last4,
        brand=payload.brand,
        type=payload.type,
        bank_name=payload.bank_name,
        expiry_month=payload.expiry_month,
        expiry_year=payload.expiry_year,
        color=payload.color,
        notes=payload.notes,
        active=payload.active if payload.active is not None else True,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.get("/", response_model=list[CardOut])
def list_cards(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(Card)
        .filter(Card.user_id == current_user.id)
        .order_by(Card.bank_name.asc().nulls_last(), Card.created_at.asc())
        .all()
    )


@router.put("/{card_id}", response_model=CardOut)
def update_card(
    card_id: int,
    payload: CardUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    card = (
        db.query(Card)
        .filter(Card.id == card_id, Card.user_id == current_user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    if payload.account_id is not None:
        _verify_account(db, payload.account_id, current_user.id)
        card.account_id = payload.account_id
    for field in ("alias", "last4", "brand", "type", "bank_name",
                  "expiry_month", "expiry_year", "color", "notes", "active"):
        v = getattr(payload, field)
        if v is not None:
            setattr(card, field, v)

    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    card = (
        db.query(Card)
        .filter(Card.id == card_id, Card.user_id == current_user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    db.delete(card)
    db.commit()
    return None
