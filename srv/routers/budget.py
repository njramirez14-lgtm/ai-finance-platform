from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.budget import Budget
from srv.models.category import Category
from srv.models.transaction import Transaction, TransactionType
from srv.schemas.budget import (
    BudgetCreate,
    BudgetOut,
    BudgetProgressItem,
    BudgetProgressResponse,
    BudgetUpdate,
)

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _current_month() -> str:
    now = datetime.utcnow()
    return f"{now.year:04d}-{now.month:02d}"


def _month_bounds(month: str) -> tuple[datetime, datetime]:
    """Return [start_of_month, start_of_next_month) for the given YYYY-MM."""
    y, m = month.split("-")
    y, m = int(y), int(m)
    start = datetime(y, m, 1)
    if m == 12:
        end = datetime(y + 1, 1, 1)
    else:
        end = datetime(y, m + 1, 1)
    return start, end


@router.post("/", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
def create_budget(
    payload: BudgetCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if payload.category_id is not None:
        cat = (
            db.query(Category)
            .filter(Category.id == payload.category_id, Category.user_id == current_user.id)
            .first()
        )
        if not cat:
            raise HTTPException(status_code=400, detail="Category does not belong to user")

    existing = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.category_id == payload.category_id,
            Budget.month == payload.month,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Ya existe un presupuesto para esa categoría y mes. Edita el existente.",
        )

    budget = Budget(
        user_id=current_user.id,
        category_id=payload.category_id,
        month=payload.month,
        amount=payload.amount or Decimal("0"),
        currency=payload.currency or "EUR",
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.get("/", response_model=list[BudgetOut])
def list_budgets(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    q = db.query(Budget).filter(Budget.user_id == current_user.id)
    if month is not None:
        q = q.filter(Budget.month == month)
    return q.order_by(Budget.month.desc(), Budget.category_id.asc().nulls_first()).all()


@router.get("/progress", response_model=BudgetProgressResponse)
def budgets_progress(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    month: str = Query(default_factory=_current_month, pattern=r"^\d{4}-\d{2}$"),
):
    """Return per-budget progress for the requested month. Sums EXPENSE
    transactions in [start_of_month, start_of_next_month) and groups by
    category. Budgets with NULL category act as a global cap across all
    expenses for that month."""
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == current_user.id, Budget.month == month)
        .all()
    )
    start, end = _month_bounds(month)

    spent_by_cat: dict[int | None, Decimal] = {}
    rows = (
        db.query(
            Transaction.category_id,
            func.coalesce(func.sum(Transaction.amount), 0.0),
        )
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Transaction.category_id)
        .all()
    )
    grand_total = Decimal("0")
    for cat_id, total in rows:
        spent_by_cat[cat_id] = Decimal(str(total))
        grand_total += Decimal(str(total))

    cats = {
        c.id: c
        for c in db.query(Category).filter(Category.user_id == current_user.id).all()
    }

    items: list[BudgetProgressItem] = []
    total_budget = Decimal("0")
    total_spent = Decimal("0")
    for b in budgets:
        budget_amount = Decimal(str(b.amount or 0))
        if b.category_id is None:
            spent = grand_total
            cat_name = "Global"
        else:
            spent = spent_by_cat.get(b.category_id, Decimal("0"))
            cat_name = cats[b.category_id].name if b.category_id in cats else None

        remaining = budget_amount - spent
        pct = float(spent / budget_amount * 100) if budget_amount > 0 else 0.0
        items.append(BudgetProgressItem(
            budget_id=b.id,
            category_id=b.category_id,
            category_name=cat_name,
            month=b.month,
            amount=budget_amount,
            spent=spent.quantize(Decimal("0.01")),
            remaining=remaining.quantize(Decimal("0.01")),
            pct=round(pct, 1),
            over_budget=spent > budget_amount and budget_amount > 0,
        ))

    # Sort: over-budget first, then highest pct
    items.sort(key=lambda i: (not i.over_budget, -i.pct))
    for it in items:
        total_budget += it.amount
        total_spent += it.spent

    return BudgetProgressResponse(
        month=month,
        items=items,
        total_budget=total_budget.quantize(Decimal("0.01")),
        total_spent=total_spent.quantize(Decimal("0.01")),
        total_remaining=(total_budget - total_spent).quantize(Decimal("0.01")),
    )


@router.put("/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: int,
    payload: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    b = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    if payload.amount is not None:
        b.amount = payload.amount
    if payload.currency is not None:
        b.currency = payload.currency
    db.commit()
    db.refresh(b)
    return b


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    b = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(b)
    db.commit()
    return None
