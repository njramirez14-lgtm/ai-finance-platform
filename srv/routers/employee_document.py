from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.employee import Employee
from srv.models.employee_document import EmployeeDocument
from srv.schemas.employee_document import (
    EmployeeDocumentCreate,
    EmployeeDocumentOut,
    EmployeeDocumentUpdate,
)

router = APIRouter(prefix="/employee-documents", tags=["employee-documents"])


def _verify_employee(db: Session, employee_id: int, user_id: int) -> None:
    e = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.user_id == user_id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=400, detail="Employee not found or not yours")


def _detect_provider(url: str | None) -> str | None:
    if not url:
        return None
    u = url.lower()
    if "drive.google" in u or "docs.google" in u:
        return "GOOGLE_DRIVE"
    if "dropbox" in u:
        return "DROPBOX"
    if "onedrive" in u or "sharepoint" in u:
        return "ONEDRIVE"
    return "LINK"


def _extract_drive_id(url: str | None) -> str | None:
    if not url:
        return None
    import re
    # Patterns: /d/{id}/, ?id={id}, /file/d/{id}
    for pat in (r"/d/([a-zA-Z0-9_-]{20,})", r"[?&]id=([a-zA-Z0-9_-]{20,})", r"/file/d/([a-zA-Z0-9_-]{20,})"):
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def _get_owned(db: Session, doc_id: int, user_id: int) -> EmployeeDocument:
    d = (
        db.query(EmployeeDocument)
        .filter(EmployeeDocument.id == doc_id, EmployeeDocument.user_id == user_id)
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return d


@router.post("/", response_model=EmployeeDocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(
    payload: EmployeeDocumentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_employee(db, payload.employee_id, current_user.id)
    provider = payload.provider or _detect_provider(payload.file_url)
    drive_id = payload.drive_file_id or (_extract_drive_id(payload.file_url) if provider == "GOOGLE_DRIVE" else None)
    d = EmployeeDocument(
        user_id=current_user.id,
        employee_id=payload.employee_id,
        title=payload.title,
        doc_type=payload.doc_type,
        file_url=payload.file_url,
        drive_file_id=drive_id,
        provider=provider,
        issued_date=payload.issued_date,
        expires_at=payload.expires_at,
        status=payload.status,
        notes=payload.notes,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.get("/", response_model=list[EmployeeDocumentOut])
def list_documents(
    employee_id: int | None = Query(default=None),
    doc_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(EmployeeDocument).filter(EmployeeDocument.user_id == current_user.id)
    if employee_id is not None:
        q = q.filter(EmployeeDocument.employee_id == employee_id)
    if doc_type:
        q = q.filter(EmployeeDocument.doc_type == doc_type.upper())
    return q.order_by(EmployeeDocument.created_at.desc()).all()


@router.put("/{document_id}", response_model=EmployeeDocumentOut)
def update_document(
    document_id: int,
    payload: EmployeeDocumentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    d = _get_owned(db, document_id, current_user.id)
    for field in ("title", "doc_type", "file_url", "drive_file_id", "provider",
                  "issued_date", "expires_at", "status", "notes"):
        v = getattr(payload, field, None)
        if v is not None:
            setattr(d, field, v)
    if payload.file_url and not payload.provider:
        d.provider = _detect_provider(payload.file_url)
        if d.provider == "GOOGLE_DRIVE" and not d.drive_file_id:
            d.drive_file_id = _extract_drive_id(payload.file_url)
    db.commit()
    db.refresh(d)
    return d


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    d = _get_owned(db, document_id, current_user.id)
    db.delete(d)
    db.commit()
    return None
