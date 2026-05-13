from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.entity import Entity
from srv.models.transaction import Transaction, TransactionType
from srv.schemas.account import AccountCreate, AccountOut, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])


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


def _account_balance(db: Session, account: Account) -> Decimal:
    initial = Decimal(str(account.initial_balance or 0))
    income = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.account_id == account.id,
            Transaction.type == TransactionType.INCOME,
        )
        .scalar()
        or 0
    )
    expense = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.account_id == account.id,
            Transaction.type == TransactionType.EXPENSE,
        )
        .scalar()
        or 0
    )
    return initial + Decimal(str(income)) - Decimal(str(expense))


def _to_out(db: Session, account: Account) -> dict:
    return {
        "id": account.id,
        "user_id": account.user_id,
        "name": account.name,
        "type": account.type,
        "currency": account.currency,
        "initial_balance": Decimal(str(account.initial_balance or 0)),
        "entity_id": account.entity_id,
        "created_at": account.created_at,
        "balance": _account_balance(db, account),
    }


@router.post("/", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_entity(db, payload.entity_id, current_user.id)
    account = Account(
        user_id=current_user.id,
        entity_id=payload.entity_id,
        name=payload.name,
        type=payload.type,
        currency=payload.currency or "EUR",
        initial_balance=payload.initial_balance or Decimal("0"),
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return _to_out(db, account)


@router.get("/", response_model=list[AccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    accounts = (
        db.query(Account)
        .filter(Account.user_id == current_user.id)
        .order_by(Account.created_at.asc())
        .all()
    )
    return [_to_out(db, a) for a in accounts]


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if payload.entity_id is not None:
        _verify_entity(db, payload.entity_id, current_user.id)
        account.entity_id = payload.entity_id
    if payload.name is not None:
        account.name = payload.name
    if payload.type is not None:
        account.type = payload.type
    if payload.currency is not None:
        account.currency = payload.currency
    if payload.initial_balance is not None:
        account.initial_balance = payload.initial_balance

    db.commit()
    db.refresh(account)
    return _to_out(db, account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == current_user.id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return None
