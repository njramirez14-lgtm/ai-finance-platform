from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from srv.database.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=False, index=True)

    name = Column(String, nullable=False)
    role = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    contract_type = Column(String, nullable=True)  # FULL_TIME | PART_TIME | FREELANCE | INTERN
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE | INACTIVE | TERMINATED

    monthly_salary = Column(Numeric(14, 2), nullable=False, default=0)
    payment_day = Column(Integer, nullable=True)  # day of month (1-31)
    currency = Column(String, nullable=False, default="EUR")

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
