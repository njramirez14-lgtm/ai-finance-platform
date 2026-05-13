from datetime import date as date_type
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.category import Category
from srv.models.entity import Entity
from srv.models.transaction import Transaction, TransactionType
from srv.schemas.transaction import (
    TransactionCreate,
    TransactionOut,
    TransactionSummary,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _verify_category(db: Session, category_id: int | None, user_id: int) -> None:
    if category_id is None:
        return
    exists = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == user_id)
        .first()
    )
    if not exists:
        raise HTTPException(status_code=400, detail="Category does not belong to user")


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


@router.post("/", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_category(db, payload.category_id, current_user.id)
    _verify_account(db, payload.account_id, current_user.id)
    _verify_entity(db, payload.entity_id, current_user.id)
    tx = Transaction(
        amount=float(payload.amount),
        type=payload.type,
        description=payload.description,
        date=payload.date,
        category_id=payload.category_id,
        account_id=payload.account_id,
        entity_id=payload.entity_id,
        user_id=current_user.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("/", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    type: TransactionType | None = Query(default=None),
    category_id: int | None = Query(default=None),
    account_id: int | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    start_date: date_type | None = Query(default=None),
    end_date: date_type | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    query = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if type is not None:
        query = query.filter(Transaction.type == type)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if account_id is not None:
        query = query.filter(Transaction.account_id == account_id)
    if entity_id is not None:
        query = query.filter(Transaction.entity_id == entity_id)
    if start_date is not None:
        query = query.filter(Transaction.date >= start_date)
    if end_date is not None:
        query = query.filter(Transaction.date <= end_date)
    return (
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/summary", response_model=TransactionSummary)
def transactions_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    start_date: date_type | None = Query(default=None),
    end_date: date_type | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    account_id: int | None = Query(default=None),
):
    base = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if start_date is not None:
        base = base.filter(Transaction.date >= start_date)
    if end_date is not None:
        base = base.filter(Transaction.date <= end_date)
    if entity_id is not None:
        base = base.filter(Transaction.entity_id == entity_id)
    if account_id is not None:
        base = base.filter(Transaction.account_id == account_id)

    income = (
        base.with_entities(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(Transaction.type == TransactionType.INCOME)
        .scalar()
    )
    expense = (
        base.with_entities(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(Transaction.type == TransactionType.EXPENSE)
        .scalar()
    )
    count = base.count()

    return TransactionSummary(
        income_total=Decimal(str(income or 0)),
        expense_total=Decimal(str(expense or 0)),
        balance=Decimal(str((income or 0) - (expense or 0))),
        transaction_count=count,
        period_start=start_date,
        period_end=end_date,
    )


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@router.put("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if payload.category_id is not None:
        _verify_category(db, payload.category_id, current_user.id)
        tx.category_id = payload.category_id
    if payload.account_id is not None:
        _verify_account(db, payload.account_id, current_user.id)
        tx.account_id = payload.account_id
    if payload.entity_id is not None:
        _verify_entity(db, payload.entity_id, current_user.id)
        tx.entity_id = payload.entity_id
    if payload.amount is not None:
        tx.amount = float(payload.amount)
    if payload.type is not None:
        tx.type = payload.type
    if payload.description is not None:
        tx.description = payload.description
    if payload.date is not None:
        tx.date = payload.date

    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .filter(Transaction.id == transaction_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return None
