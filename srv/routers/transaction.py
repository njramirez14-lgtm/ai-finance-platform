import re
from collections import defaultdict
from datetime import date as date_type, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.category import Category
from srv.models.entity import Entity
from srv.models.subscription import Subscription
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
    transfer = (
        base.with_entities(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(Transaction.type == TransactionType.TRANSFER)
        .scalar()
    )
    count = base.count()

    return TransactionSummary(
        income_total=Decimal(str(income or 0)),
        expense_total=Decimal(str(expense or 0)),
        transfer_total=Decimal(str(transfer or 0)),
        balance=Decimal(str((income or 0) - (expense or 0))),  # transfers excluded
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


@router.post("/bulk-delete")
def bulk_delete_transactions(
    ids: list[int] = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete many transactions in one request. Only deletes ones owned
    by the current user; silently ignores foreign IDs."""
    if not ids:
        return {"deleted": 0}
    deleted = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.id.in_(ids),
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


_DESC_NOISE = re.compile(r"[\d#*]+|\b(compra|pago|cargo|tarj|tarjeta|nfc|contactless|online|web|en|el|la|de|del|por|ref|recibo)\b", re.IGNORECASE)
_WS = re.compile(r"\s+")


def _normalize_merchant(desc: str | None) -> str:
    if not desc:
        return ""
    s = _DESC_NOISE.sub(" ", desc.lower())
    s = _WS.sub(" ", s).strip()
    return s


def _classify_cycle(avg_gap_days: float) -> str | None:
    if 5 <= avg_gap_days <= 9:
        return "WEEKLY"
    if 25 <= avg_gap_days <= 35:
        return "MONTHLY"
    if 85 <= avg_gap_days <= 95:
        return "QUARTERLY"
    if 355 <= avg_gap_days <= 375:
        return "YEARLY"
    return None


@router.post("/detect-subscriptions")
def detect_subscriptions(
    days: int = Body(default=180, embed=True),
    include_matched: bool = Body(default=True, embed=True),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Find recurring expense patterns (likely subscriptions). Returns
    candidates with suggested amount, billing cycle, next charge date,
    source transaction IDs, and — when applicable — the existing
    subscription that matches the pattern. With include_matched=False
    the response only contains net-new patterns (used by the
    Transactions page); with include_matched=True (default) it also
    lists already-tracked subscriptions so the Subscriptions page can
    show coverage."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= cutoff,
        )
        .order_by(Transaction.date.asc())
        .all()
    )

    existing_subs = db.query(Subscription).filter(Subscription.user_id == current_user.id).all()
    existing_by_key: dict[str, Subscription] = {
        _normalize_merchant(s.name): s for s in existing_subs
    }

    groups: dict[str, list[Transaction]] = defaultdict(list)
    for t in rows:
        key = _normalize_merchant(t.description)
        if not key or len(key) < 3:
            continue
        groups[key].append(t)

    today = date_type.today()
    candidates = []
    for key, txs in groups.items():
        if len(txs) < 2:
            continue
        matched_sub = existing_by_key.get(key)
        if matched_sub is None and not include_matched:
            continue
        amounts = sorted(float(t.amount or 0) for t in txs)
        med = amounts[len(amounts) // 2]
        if med <= 0:
            continue
        # require amounts within 15% of median (rules out one-off purchases at variable merchants)
        consistent = [t for t in txs if med * 0.85 <= float(t.amount or 0) <= med * 1.15]
        if len(consistent) < 2:
            continue
        consistent.sort(key=lambda t: t.date)
        gaps = [
            (consistent[i].date - consistent[i - 1].date).days
            for i in range(1, len(consistent))
        ]
        avg_gap = sum(gaps) / len(gaps)
        cycle = _classify_cycle(avg_gap)
        if cycle is None:
            continue
        last = consistent[-1].date.date() if isinstance(consistent[-1].date, datetime) else consistent[-1].date
        next_days = {"WEEKLY": 7, "MONTHLY": 30, "QUARTERLY": 90, "YEARLY": 365}[cycle]
        next_charge = last + timedelta(days=next_days)
        if next_charge < today:
            next_charge = today + timedelta(days=1)
        sample = consistent[-1]
        total_period = round(sum(float(t.amount or 0) for t in consistent), 2)
        candidates.append({
            "name": sample.description or key.title(),
            "normalized_key": key,
            "amount": round(float(sample.amount or med), 2),
            "currency": "EUR",
            "billing_cycle": cycle,
            "avg_gap_days": round(avg_gap, 1),
            "occurrences": len(consistent),
            "total_period": total_period,
            "last_charge_date": last.isoformat(),
            "next_charge_date": next_charge.isoformat(),
            "category_id": sample.category_id,
            "account_id": sample.account_id,
            "entity_id": sample.entity_id,
            "transaction_ids": [t.id for t in consistent],
            "matched_subscription_id": matched_sub.id if matched_sub else None,
            "matched_subscription_name": matched_sub.name if matched_sub else None,
        })

    candidates.sort(
        key=lambda c: (c["amount"] * (12 if c["billing_cycle"] == "MONTHLY" else 1)),
        reverse=True,
    )

    # Subscriptions that exist but have NO matching detected pattern in the
    # period — useful so the user can see "you have Disney+ in your list
    # but no transaction matched in the last 6 months."
    matched_keys = {c["normalized_key"] for c in candidates if c["matched_subscription_id"]}
    unmatched_existing = [
        {
            "id": s.id,
            "name": s.name,
            "amount": float(s.amount or 0),
            "billing_cycle": s.billing_cycle,
        }
        for s in existing_subs
        if _normalize_merchant(s.name) not in matched_keys
    ]

    return {
        "count": len(candidates),
        "new_count": sum(1 for c in candidates if not c["matched_subscription_id"]),
        "matched_count": sum(1 for c in candidates if c["matched_subscription_id"]),
        "candidates": candidates,
        "unmatched_existing": unmatched_existing,
    }
