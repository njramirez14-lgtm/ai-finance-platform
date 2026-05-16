import asyncio
import json
import os
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.account import Account
from srv.models.entity import Entity
from srv.models.liability import Liability
from srv.models.transaction import Transaction, TransactionType
from srv.routers.account import (
    GEMINI_API_KEY,
    MAX_UPLOAD_BYTES,
    _read_file_as_text,
    _split_pdf_into_chunks,
)
from srv.schemas.liability import (
    LiabilityCreate,
    LiabilityOut,
    LiabilitySummary,
    LiabilityUpdate,
)

router = APIRouter(prefix="/liabilities", tags=["liabilities"])


class LiabilityPayment(BaseModel):
    amount: Decimal = Field(gt=0)
    account_id: int | None = None
    description: str | None = Field(default=None, max_length=200)
    date: datetime | None = None


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


@router.post("/{liability_id}/pay", response_model=LiabilityOut)
def register_payment(
    liability_id: int,
    payload: LiabilityPayment,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Register a payment: decreases current_balance and (if account provided)
    creates an EXPENSE transaction so the cash flow is recorded."""
    liability = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == current_user.id)
        .first()
    )
    if not liability:
        raise HTTPException(status_code=404, detail="Liability not found")

    amount = Decimal(str(payload.amount))
    new_balance = Decimal(str(liability.current_balance or 0)) - amount
    if new_balance < 0:
        new_balance = Decimal("0")
    liability.current_balance = new_balance

    if payload.account_id is not None:
        acc = (
            db.query(Account)
            .filter(Account.id == payload.account_id, Account.user_id == current_user.id)
            .first()
        )
        if not acc:
            raise HTTPException(status_code=400, detail="Account does not belong to user")
        desc = payload.description or f"Pago {liability.name}"
        tx = Transaction(
            amount=float(amount),
            type=TransactionType.EXPENSE,
            description=desc[:200],
            date=payload.date or datetime.utcnow(),
            user_id=current_user.id,
            account_id=payload.account_id,
            entity_id=liability.entity_id,
        )
        db.add(tx)

    db.commit()
    db.refresh(liability)
    return liability


LOAN_ANALYSIS_PROMPT = """Eres un experto analizando documentos de préstamos e hipotecas en España (cuadros de amortización,
extractos del banco con cuotas, escrituras, certificados de deuda).

Analiza el documento adjunto y devuelve UN JSON OBJECT (sin markdown) con esta estructura exacta:
{
  "monthly_payment": 1234.56 | null,
  "interest_rate_annual": 3.45 | null,
  "interest_rate_kind": "TIN" | "TAE" | null,
  "current_balance": 123456.78 | null,
  "original_amount": 200000 | null,
  "start_date": "YYYY-MM-DD" | null,
  "end_date": "YYYY-MM-DD" | null,
  "term_months": 240 | null,
  "remaining_months": 180 | null,
  "lender": "BBVA" | null,
  "loan_type": "MORTGAGE" | "LOAN" | "CREDIT_CARD" | "LINE_OF_CREDIT" | "STUDENT" | "OTHER" | null,
  "payments_paid": 60 | null,
  "total_interest_paid": 12345.67 | null,
  "total_interest_remaining": 23456.78 | null,
  "confidence": "high" | "medium" | "low",
  "summary": "Texto breve (1-3 frases) en español explicando qué has detectado y observaciones útiles."
}

Reglas:
- Si un campo no aparece o no puedes calcularlo con certeza razonable, ponlo a null. NO inventes.
- monthly_payment: cuota que más se repita (moda), no la media.
- interest_rate_annual: porcentaje anual, no decimal (3.45 no 0.0345).
- current_balance: "Capital pendiente" o "Saldo pendiente" del período más reciente.
- term_months y remaining_months pueden deducirse contando filas del cuadro de amortización.
- summary debe servir al usuario, ej.: "Cuadro de amortización a 240 cuotas, pagadas 60, quedan 180. Cuota fija 845€, TIN 2.95%, capital pendiente 152.300€."
"""


class LiabilityAnalysisResponse(BaseModel):
    monthly_payment: Decimal | None = None
    interest_rate_annual: Decimal | None = None
    interest_rate_kind: str | None = None
    current_balance: Decimal | None = None
    original_amount: Decimal | None = None
    start_date: str | None = None
    end_date: str | None = None
    term_months: int | None = None
    remaining_months: int | None = None
    lender: str | None = None
    loan_type: str | None = None
    payments_paid: int | None = None
    total_interest_paid: Decimal | None = None
    total_interest_remaining: Decimal | None = None
    confidence: str | None = None
    summary: str | None = None
    used_vision: bool = False


@router.post("/{liability_id}/analyze-statement", response_model=LiabilityAnalysisResponse)
async def analyze_liability_statement(
    liability_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Analyze a loan/mortgage document and return suggested values. This
    endpoint DOES NOT mutate the liability — the frontend reviews the
    suggestions and PUTs them via the normal update endpoint."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key no configurada")

    liability = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == current_user.id)
        .first()
    )
    if not liability:
        raise HTTPException(status_code=404, detail="Liability not found")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande")

    name_l = (file.filename or "").lower()
    mime_l = (file.content_type or "").lower()
    is_pdf = name_l.endswith(".pdf") or "pdf" in mime_l

    text_content = _read_file_as_text(content, file.filename or "", file.content_type or "")

    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 8192,
            "response_mime_type": "application/json",
        },
    )

    used_vision = False
    try:
        if is_pdf and len(text_content.strip()) < 100:
            # Vision path: the schedule usually repeats, so the first 8 pages
            # are enough for header info + early/late installments.
            pdf_chunks = _split_pdf_into_chunks(content, pages_per_chunk=8)
            primary = pdf_chunks[0] if pdf_chunks else content
            resp = await asyncio.to_thread(
                model.generate_content,
                [
                    {"mime_type": "application/pdf", "data": primary},
                    LOAN_ANALYSIS_PROMPT,
                ],
            )
            used_vision = True
        else:
            if not text_content.strip():
                raise HTTPException(
                    status_code=400,
                    detail="No se ha podido extraer texto del archivo. Si es un PDF escaneado, vuelve a exportarlo del banco.",
                )
            trimmed = text_content[:120_000]
            resp = await asyncio.to_thread(
                model.generate_content,
                LOAN_ANALYSIS_PROMPT + "\n\nDocumento:\n" + trimmed,
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini falló analizando el documento: {exc}")

    raw = (resp.text or "").strip().replace("```json", "").replace("```", "").strip()
    if not raw:
        raise HTTPException(status_code=502, detail="Gemini no devolvió respuesta")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini devolvió JSON inválido: {exc}")
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Respuesta inesperada de Gemini (no es objeto)")

    data["used_vision"] = used_vision
    return data
