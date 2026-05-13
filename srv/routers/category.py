from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.category import Category
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
