from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.category import Category
from srv.models.transaction import Transaction, TransactionType
from srv.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


SUGGESTED_EXPENSE = [
    "Alimentación",
    "Restaurantes y cafeterías",
    "Transporte público",
    "Combustible",
    "Vehículo (mantenimiento, ITV, seguro)",
    "Vivienda (alquiler/hipoteca)",
    "Suministros (luz, agua, gas)",
    "Internet y telefonía",
    "Suscripciones (streaming, software)",
    "Salud y farmacia",
    "Seguros (vida, hogar, salud)",
    "Ropa y calzado",
    "Cuidado personal y peluquería",
    "Ocio y entretenimiento",
    "Viajes y vacaciones",
    "Educación y formación",
    "Hogar (limpieza, mobiliario)",
    "Mascotas",
    "Regalos y celebraciones",
    "Caridad y donaciones",
    "Comisiones bancarias",
    "Impuestos (IRPF, IVA, IBI)",
    "Inversiones (aportaciones)",
    "Ahorro / Fondo emergencia",
    "Imprevistos / Otros",
]

SUGGESTED_INCOME = [
    "Nómina",
    "Ingresos autónomo / facturación",
    "Ingresos por alquiler",
    "Dividendos",
    "Intereses bancarios",
    "Devolución de impuestos",
    "Venta de bienes",
    "Regalos recibidos",
    "Reembolsos y devoluciones",
    "Bonos / Incentivos",
    "Otros ingresos",
]


@router.post("/seed", response_model=list[CategoryOut])
def seed_categories(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = {
        c.name for c in db.query(Category)
        .filter(Category.user_id == current_user.id).all()
    }
    created: list[Category] = []
    for name in SUGGESTED_EXPENSE:
        if name in existing:
            continue
        cat = Category(name=name, type="EXPENSE", user_id=current_user.id)
        db.add(cat)
        created.append(cat)
    for name in SUGGESTED_INCOME:
        if name in existing:
            continue
        cat = Category(name=name, type="INCOME", user_id=current_user.id)
        db.add(cat)
        created.append(cat)
    db.commit()
    for c in created:
        db.refresh(c)
    return created


@router.post("/", response_model=CategoryOut)
def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Check if category name already exists for this user
    existing = (
        db.query(Category)
        .filter(Category.user_id == current_user.id, Category.name == category_in.name)
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400, detail="Category with this name already exists."
        )

    category = Category(
        name=category_in.name,
        type=category_in.type,
        user_id=current_user.id,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    categories = db.query(Category).filter(Category.user_id == current_user.id).all()
    return categories


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    category_in: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if category_in.name is not None:
        category.name = category_in.name
    if category_in.type is not None:
        category.type = category_in.type

    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    category = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == current_user.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    db.delete(category)
    db.commit()
    return None


@router.get("/{category_id}/drill")
def drill_category(
    category_id: int,
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Drill-down: every transaction in this category over the last N days,
    grouped by merchant/description with totals — so 'Restaurantes' becomes
    a list of actual restaurants with how much spent at each."""
    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.category_id == category_id,
            Transaction.date >= cutoff,
        )
        .order_by(Transaction.date.desc())
        .all()
    )

    by_merchant: dict[str, dict] = {}
    total = Decimal("0")
    for tx in rows:
        amount = Decimal(str(tx.amount or 0))
        if tx.type == TransactionType.EXPENSE:
            total += amount
        elif tx.type == TransactionType.INCOME:
            total -= amount
        key = (tx.description or "(sin descripción)").strip()
        if key not in by_merchant:
            by_merchant[key] = {
                "description": key,
                "count": 0,
                "total": Decimal("0"),
                "first_seen": tx.date,
                "last_seen": tx.date,
            }
        m = by_merchant[key]
        m["count"] += 1
        m["total"] += amount if tx.type == TransactionType.EXPENSE else -amount
        m["first_seen"] = min(m["first_seen"], tx.date)
        m["last_seen"] = max(m["last_seen"], tx.date)

    merchants = sorted(by_merchant.values(), key=lambda m: m["total"], reverse=True)

    return {
        "category": {"id": cat.id, "name": cat.name, "type": cat.type, "icon": cat.icon, "color": cat.color},
        "window_days": days,
        "total_transactions": len(rows),
        "total_amount": str(total.quantize(Decimal("0.01"))),
        "by_merchant": [
            {
                "description": m["description"],
                "count": m["count"],
                "total": str(m["total"].quantize(Decimal("0.01"))),
                "average": str((m["total"] / m["count"]).quantize(Decimal("0.01"))) if m["count"] > 0 else "0.00",
                "first_seen": m["first_seen"].isoformat() if m["first_seen"] else None,
                "last_seen": m["last_seen"].isoformat() if m["last_seen"] else None,
            }
            for m in merchants
        ],
        "transactions": [
            {
                "id": tx.id,
                "date": tx.date.isoformat() if tx.date else None,
                "amount": tx.amount,
                "type": tx.type.value if tx.type else None,
                "description": tx.description,
                "account_id": tx.account_id,
                "entity_id": tx.entity_id,
            }
            for tx in rows
        ],
    }
