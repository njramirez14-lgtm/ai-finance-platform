import json
import os
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.card import Card
from srv.models.category import Category
from srv.models.entity import Entity
from srv.models.transaction import Transaction, TransactionType
from srv.schemas.account import (
    AccountCreate,
    AccountOut,
    AccountUpdate,
    BalanceAdjustment,
    CardMini,
)

router = APIRouter(prefix="/accounts", tags=["accounts"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")


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


def _account_monthly_flow(db: Session, account_id: int) -> tuple[Decimal, Decimal]:
    cutoff = datetime.utcnow() - timedelta(days=30)
    rows = (
        db.query(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.account_id == account_id,
            Transaction.date >= cutoff,
        )
        .group_by(Transaction.type)
        .all()
    )
    by_type = {t: Decimal(str(amt)) for t, amt in rows}
    income = by_type.get(TransactionType.INCOME, Decimal("0"))
    expense = by_type.get(TransactionType.EXPENSE, Decimal("0"))
    return income, expense


def _to_out(db: Session, account: Account) -> dict:
    cards = (
        db.query(Card)
        .filter(Card.account_id == account.id, Card.user_id == account.user_id)
        .all()
    )
    monthly_income, monthly_expense = _account_monthly_flow(db, account.id)
    return {
        "id": account.id,
        "user_id": account.user_id,
        "name": account.name,
        "type": account.type,
        "currency": account.currency,
        "initial_balance": Decimal(str(account.initial_balance or 0)),
        "entity_id": account.entity_id,
        "account_number": account.account_number,
        "notes": account.notes,
        "created_at": account.created_at,
        "balance": _account_balance(db, account),
        "cards": [CardMini.model_validate(c) for c in cards],
        "monthly_income": monthly_income,
        "monthly_expense": monthly_expense,
    }


def _get_owned_account(db: Session, account_id: int, user_id: int) -> Account:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


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
        account_number=payload.account_number,
        notes=payload.notes,
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


@router.get("/{account_id}", response_model=AccountOut)
def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    account = _get_owned_account(db, account_id, current_user.id)
    return _to_out(db, account)


@router.put("/{account_id}", response_model=AccountOut)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    account = _get_owned_account(db, account_id, current_user.id)

    if payload.entity_id is not None:
        _verify_entity(db, payload.entity_id, current_user.id)
        account.entity_id = payload.entity_id
    for field in ("name", "type", "currency", "initial_balance", "account_number", "notes"):
        v = getattr(payload, field, None)
        if v is not None:
            setattr(account, field, v)

    db.commit()
    db.refresh(account)
    return _to_out(db, account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    account = _get_owned_account(db, account_id, current_user.id)
    db.delete(account)
    db.commit()
    return None


@router.post("/{account_id}/adjust-balance", response_model=AccountOut)
def adjust_balance(
    account_id: int,
    payload: BalanceAdjustment,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a correction transaction so the account balance matches the target."""
    account = _get_owned_account(db, account_id, current_user.id)
    current = _account_balance(db, account)
    delta = Decimal(str(payload.target_balance)) - current
    if delta == 0:
        return _to_out(db, account)

    tx_type = TransactionType.INCOME if delta > 0 else TransactionType.EXPENSE
    description = payload.description or "Ajuste de saldo"
    tx = Transaction(
        amount=float(abs(delta)),
        type=tx_type,
        description=description,
        date=datetime.utcnow(),
        user_id=current_user.id,
        account_id=account.id,
        entity_id=account.entity_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(account)
    return _to_out(db, account)


@router.post("/{account_id}/upload-statement")
async def upload_statement(
    account_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Parse a bank statement with Gemini and persist transactions linked to this account."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    account = _get_owned_account(db, account_id, current_user.id)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máx 5 MB)")

    text_content = content.decode("utf-8", errors="ignore")
    if len(text_content) > 12000:
        text_content = text_content[:12000]

    import google.generativeai as genai

    genai.configure(api_key=GEMINI_API_KEY)

    prompt = f"""
Eres un experto extractor y categorizador de transacciones bancarias en España.
Analiza el siguiente texto (CSV o extracto en texto) y devuelve UN JSON ARRAY (sin markdown) con esta estructura:
[
  {{
    "amount": 100.50,
    "type": "EXPENSE",
    "description": "Mercadona compra",
    "date": "2026-05-09",
    "merchant": "Mercadona",
    "category": "Alimentación"
  }}
]
Reglas:
- Valores negativos en el extracto → EXPENSE; positivos → INCOME.
- amount siempre en positivo absoluto.
- date YYYY-MM-DD. Si falta, usa fecha de hoy.
- description: concepto bruto del banco, limpio (sin códigos basura).
- merchant: nombre comercial del establecimiento si es identificable (Mercadona, Repsol, Netflix, Glovo, etc.).
- category: una sola categoría en español. Usa esta taxonomía (elige la más cercana, NO inventes nuevas):
  - Alimentación (supermercados, fruterías, panaderías)
  - Restauración (cafeterías, bares, restaurantes, Glovo/UberEats)
  - Transporte (gasolina, parking, taxi, Uber, Cabify, metro, bus, peaje)
  - Vivienda (alquiler, hipoteca, comunidad, IBI)
  - Suministros (luz, agua, gas, internet, móvil)
  - Suscripciones (Netflix, HBO, Spotify, Amazon Prime, Disney+, iCloud, software SaaS)
  - Salud (farmacia, médico, dentista, gimnasio, óptica)
  - Ocio (cine, conciertos, viajes, hoteles, vacaciones)
  - Compras (ropa, Amazon, electrónica, hogar)
  - Educación (cursos, libros, formación)
  - Seguros (auto, hogar, salud, vida)
  - Comisiones (bancarias, transferencias)
  - Impuestos (IRPF, IVA, Hacienda, multas)
  - Transferencia (Bizum, transferencia recibida/enviada sin destino claro)
  - Nómina (salario, paga extra)
  - Inversión (compra/venta acciones, ETFs, cripto, fondos)
  - Otros (sólo si nada encaja)
- Si no encuentras transacciones devuelve [].

Texto:
{text_content}
"""

    try:
        model = genai.GenerativeModel("gemini-flash-latest")
        response = model.generate_content(prompt)
        raw = (response.text or "").strip()
    except Exception as exc:
        msg = str(exc)
        if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
            raise HTTPException(
                status_code=429,
                detail="Has agotado la cuota gratuita de Gemini. Espera unos minutos o usa una API key de pago.",
            )
        raise HTTPException(status_code=502, detail=f"Error consultando el modelo: {exc}")

    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="No se pudo parsear la respuesta del extracto")

    if not isinstance(parsed, list):
        raise HTTPException(status_code=502, detail="Formato inesperado del extracto")

    # Preload categories for matching, keyed by lowercase name + type
    existing_categories = (
        db.query(Category).filter(Category.user_id == current_user.id).all()
    )
    cat_index: dict[tuple[str, TransactionType], Category] = {
        (c.name.lower(), c.type): c for c in existing_categories
    }

    def _resolve_category(name: str | None, tx_type: TransactionType) -> int | None:
        if not name:
            return None
        clean = name.strip()
        if not clean:
            return None
        key = (clean.lower(), tx_type)
        cat = cat_index.get(key)
        if cat:
            return cat.id
        # Use a savepoint so a unique-constraint violation here doesn't
        # roll back previously inserted transactions in this batch.
        sp = db.begin_nested()
        cat = Category(name=clean, type=tx_type, user_id=current_user.id)
        db.add(cat)
        try:
            db.flush()
            sp.commit()
        except Exception:
            sp.rollback()
            existing = (
                db.query(Category)
                .filter(
                    Category.user_id == current_user.id,
                    func.lower(Category.name) == clean.lower(),
                )
                .first()
            )
            if existing:
                cat_index[(existing.name.lower(), existing.type)] = existing
                return existing.id
            return None
        cat_index[key] = cat
        return cat.id

    created = 0
    by_category: dict[str, int] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        try:
            amount = float(item.get("amount", 0))
            tx_type_raw = str(item.get("type", "EXPENSE")).upper()
            tx_type = TransactionType.INCOME if tx_type_raw == "INCOME" else TransactionType.EXPENSE
            raw_desc = str(item.get("description") or "").strip()
            merchant = str(item.get("merchant") or "").strip()
            if merchant and raw_desc and merchant.lower() not in raw_desc.lower():
                desc = f"{merchant} — {raw_desc}"[:200]
            else:
                desc = (merchant or raw_desc)[:200] or None
            date_str = item.get("date")
            tx_date = datetime.utcnow()
            if date_str:
                try:
                    tx_date = datetime.fromisoformat(str(date_str))
                except ValueError:
                    pass
            cat_name = str(item.get("category") or "").strip() or None
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue
        category_id = _resolve_category(cat_name, tx_type)
        db.add(Transaction(
            amount=amount,
            type=tx_type,
            description=desc,
            date=tx_date,
            user_id=current_user.id,
            account_id=account.id,
            entity_id=account.entity_id,
            category_id=category_id,
        ))
        created += 1
        if cat_name:
            by_category[cat_name] = by_category.get(cat_name, 0) + 1
    db.commit()
    db.refresh(account)
    return {
        "success": True,
        "imported": created,
        "by_category": by_category,
        "account": _to_out(db, account),
    }
