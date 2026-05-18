from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.employee import Employee
from srv.models.employee_leave import EmployeeLeave
from srv.schemas.employee_leave import (
    EmployeeLeaveCreate,
    EmployeeLeaveOut,
    EmployeeLeaveUpdate,
    LeaveSummary,
)

router = APIRouter(prefix="/employee-leaves", tags=["employee-leaves"])


def _verify_employee(db: Session, employee_id: int, user_id: int) -> None:
    e = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.user_id == user_id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=400, detail="Employee not found or not yours")


def _get_owned(db: Session, leave_id: int, user_id: int) -> EmployeeLeave:
    l = (
        db.query(EmployeeLeave)
        .filter(EmployeeLeave.id == leave_id, EmployeeLeave.user_id == user_id)
        .first()
    )
    if not l:
        raise HTTPException(status_code=404, detail="Leave not found")
    return l


def _to_out(l: EmployeeLeave) -> dict:
    days = None
    if l.start_date and l.end_date:
        days = (l.end_date - l.start_date).days + 1
    elif l.start_date:
        days = 1
    return {
        "id": l.id,
        "user_id": l.user_id,
        "employee_id": l.employee_id,
        "leave_type": l.leave_type,
        "start_date": l.start_date,
        "end_date": l.end_date,
        "status": l.status,
        "document_id": l.document_id,
        "reason": l.reason,
        "days": days,
        "created_at": l.created_at,
    }


@router.post("/", response_model=EmployeeLeaveOut, status_code=status.HTTP_201_CREATED)
def create_leave(
    payload: EmployeeLeaveCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_employee(db, payload.employee_id, current_user.id)
    l = EmployeeLeave(
        user_id=current_user.id,
        employee_id=payload.employee_id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        document_id=payload.document_id,
        reason=payload.reason,
    )
    db.add(l)
    db.commit()
    db.refresh(l)
    return _to_out(l)


@router.get("/", response_model=list[EmployeeLeaveOut])
def list_leaves(
    employee_id: int | None = Query(default=None),
    leave_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(EmployeeLeave).filter(EmployeeLeave.user_id == current_user.id)
    if employee_id is not None:
        q = q.filter(EmployeeLeave.employee_id == employee_id)
    if leave_type:
        q = q.filter(EmployeeLeave.leave_type == leave_type.upper())
    return [_to_out(l) for l in q.order_by(EmployeeLeave.start_date.desc()).all()]


@router.get("/summary", response_model=LeaveSummary)
def leave_summary(
    employee_id: int,
    year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_employee(db, employee_id, current_user.id)
    y = year or date.today().year
    start = date(y, 1, 1)
    end = date(y, 12, 31)
    leaves = (
        db.query(EmployeeLeave)
        .filter(
            EmployeeLeave.user_id == current_user.id,
            EmployeeLeave.employee_id == employee_id,
            EmployeeLeave.start_date <= end,
        )
        .all()
    )
    vacation_taken = 0
    vacation_planned = 0
    sick = 0
    by_type: dict[str, int] = {}
    today = date.today()
    for l in leaves:
        if not l.start_date:
            continue
        eff_end = l.end_date or l.start_date
        if eff_end < start:
            continue
        days = (min(eff_end, end) - max(l.start_date, start)).days + 1
        if days < 0:
            continue
        by_type[l.leave_type] = by_type.get(l.leave_type, 0) + days
        if l.leave_type == "VACATION":
            if eff_end <= today:
                vacation_taken += days
            else:
                vacation_planned += days
        elif l.leave_type == "SICK":
            sick += days
    return LeaveSummary(
        employee_id=employee_id,
        year=y,
        vacation_taken_days=vacation_taken,
        vacation_planned_days=vacation_planned,
        sick_days=sick,
        by_type=by_type,
    )


@router.put("/{leave_id}", response_model=EmployeeLeaveOut)
def update_leave(
    leave_id: int,
    payload: EmployeeLeaveUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    l = _get_owned(db, leave_id, current_user.id)
    for field in ("leave_type", "start_date", "end_date", "status", "document_id", "reason"):
        v = getattr(payload, field, None)
        if v is not None:
            setattr(l, field, v)
    db.commit()
    db.refresh(l)
    return _to_out(l)


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    l = _get_owned(db, leave_id, current_user.id)
    db.delete(l)
    db.commit()
    return None
