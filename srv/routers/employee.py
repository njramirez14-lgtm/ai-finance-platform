from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from srv.api.deps import get_db
from srv.api.deps_auth import get_current_user
from srv.models.employee import Employee
from srv.models.entity import Entity
from srv.schemas.employee import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    PayrollSummary,
)

router = APIRouter(prefix="/employees", tags=["employees"])


def _verify_entity(db: Session, entity_id: int, user_id: int) -> None:
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.user_id == user_id).first()
    if not e:
        raise HTTPException(status_code=400, detail="Entity not found or not yours")


def _get_owned(db: Session, employee_id: int, user_id: int) -> Employee:
    e = (
        db.query(Employee)
        .filter(Employee.id == employee_id, Employee.user_id == user_id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    return e


@router.post("/", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _verify_entity(db, payload.entity_id, current_user.id)
    e = Employee(
        user_id=current_user.id,
        entity_id=payload.entity_id,
        name=payload.name,
        role=payload.role,
        email=payload.email,
        phone=payload.phone,
        contract_type=payload.contract_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        monthly_salary=payload.monthly_salary or Decimal("0"),
        payment_day=payload.payment_day,
        currency=(payload.currency or "EUR").upper(),
        notes=payload.notes,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.get("/", response_model=list[EmployeeOut])
def list_employees(
    entity_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Employee).filter(Employee.user_id == current_user.id)
    if entity_id is not None:
        q = q.filter(Employee.entity_id == entity_id)
    if status_filter:
        q = q.filter(Employee.status == status_filter.upper())
    return q.order_by(Employee.status.asc(), Employee.name.asc()).all()


@router.get("/payroll", response_model=PayrollSummary)
def payroll(
    entity_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = db.query(Employee).filter(
        Employee.user_id == current_user.id,
        Employee.status == "ACTIVE",
    )
    if entity_id is not None:
        q = q.filter(Employee.entity_id == entity_id)
    emps = q.all()

    total = sum((Decimal(str(e.monthly_salary or 0)) for e in emps), Decimal("0"))
    today = date.today()
    paydays = []
    for e in emps:
        if not e.payment_day:
            continue
        try:
            # next payday: this month if upcoming, else next month
            year, month = today.year, today.month
            if e.payment_day < today.day:
                month += 1
                if month > 12:
                    month = 1
                    year += 1
            day = min(e.payment_day, 28)  # safe for all months
            next_pay = date(year, month, day)
        except ValueError:
            continue
        paydays.append({
            "employee_id": e.id,
            "name": e.name,
            "salary": float(e.monthly_salary or 0),
            "next_payday": next_pay.isoformat(),
            "days_until": (next_pay - today).days,
        })
    paydays.sort(key=lambda x: x["days_until"])

    return PayrollSummary(
        entity_id=entity_id,
        active_employees=len(emps),
        total_monthly=total.quantize(Decimal("0.01")),
        total_annual=(total * 14).quantize(Decimal("0.01")),  # 14 pagas Spain typical
        next_paydays=paydays[:10],
    )


@router.put("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = _get_owned(db, employee_id, current_user.id)
    for field in (
        "name", "role", "email", "phone", "contract_type", "start_date", "end_date",
        "status", "monthly_salary", "payment_day", "currency", "notes",
    ):
        v = getattr(payload, field, None)
        if v is not None:
            if field == "currency" and isinstance(v, str):
                v = v.upper()
            setattr(emp, field, v)
    db.commit()
    db.refresh(emp)
    return emp


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    emp = _get_owned(db, employee_id, current_user.id)
    db.delete(emp)
    db.commit()
    return None
