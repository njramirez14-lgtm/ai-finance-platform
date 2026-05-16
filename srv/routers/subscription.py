from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.subscription import Subscription
from srv.schemas.subscription import (
    SubscriptionCreate,
    SubscriptionOut,
    SubscriptionSummary,
    SubscriptionUpdate,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


CYCLE_TO_MONTHS = {
    "WEEKLY": Decimal("0.230769"),  # ~1/52*12
    "MONTHLY": Decimal("1"),
    "QUARTERLY": Decimal("3"),
    "YEARLY": Decimal("12"),
    "CUSTOM": Decimal("1"),
}


@router.post("/", response_model=SubscriptionOut, status_code=status.HTTP_201_CREATED)
def create_subscription(
    payload: SubscriptionCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sub = Subscription(
        user_id=current_user.id,
        entity_id=payload.entity_id,
        card_id=payload.card_id,
        account_id=payload.account_id,
        category_id=payload.category_id,
        name=payload.name,
        description=payload.description,
        amount=payload.amount or Decimal("0"),
        currency=payload.currency or "EUR",
        billing_cycle=payload.billing_cycle,
        next_charge_date=payload.next_charge_date,
        started_at=payload.started_at,
        status=payload.status or "ACTIVE",
        kind=payload.kind or "EXPENSE",
        notes=payload.notes,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.get("/", response_model=list[SubscriptionOut])
def list_subscriptions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    kind: Literal["EXPENSE", "INCOME"] | None = Query(default=None),
):
    q = db.query(Subscription).filter(Subscription.user_id == current_user.id)
    if kind is not None:
        q = q.filter(Subscription.kind == kind)
    return (
        q.order_by(Subscription.next_charge_date.asc().nulls_last(), Subscription.name.asc())
        .all()
    )


@router.get("/summary", response_model=SubscriptionSummary)
def subscriptions_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    kind: Literal["EXPENSE", "INCOME"] | None = Query(default=None),
):
    q = db.query(Subscription).filter(Subscription.user_id == current_user.id)
    if kind is not None:
        q = q.filter(Subscription.kind == kind)
    rows = q.all()
    monthly = Decimal("0")
    active = paused = cancelled = 0
    for r in rows:
        if r.status == "ACTIVE":
            active += 1
            cycle_months = CYCLE_TO_MONTHS.get(r.billing_cycle, Decimal("1"))
            if cycle_months > 0:
                monthly += Decimal(str(r.amount or 0)) / cycle_months
        elif r.status == "PAUSED":
            paused += 1
        elif r.status == "CANCELLED":
            cancelled += 1
    return SubscriptionSummary(
        monthly_total=monthly.quantize(Decimal("0.01")),
        yearly_total=(monthly * 12).quantize(Decimal("0.01")),
        active_count=active,
        paused_count=paused,
        cancelled_count=cancelled,
    )


@router.put("/{subscription_id}", response_model=SubscriptionOut)
def update_subscription(
    subscription_id: int,
    payload: SubscriptionUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sub = (
        db.query(Subscription)
        .filter(Subscription.id == subscription_id, Subscription.user_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    for field in (
        "entity_id", "card_id", "account_id", "category_id",
        "name", "description", "amount", "currency", "billing_cycle",
        "next_charge_date", "started_at", "status", "kind", "notes",
    ):
        v = getattr(payload, field)
        if v is not None:
            setattr(sub, field, v)

    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subscription(
    subscription_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    sub = (
        db.query(Subscription)
        .filter(Subscription.id == subscription_id, Subscription.user_id == current_user.id)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(sub)
    db.commit()
    return None
