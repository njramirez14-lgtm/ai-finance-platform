from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text

from srv.database.database import Base


class EmployeeLeave(Base):
    __tablename__ = "employee_leaves"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)

    leave_type = Column(String, nullable=False, default="SICK")
    # SICK | VACATION | UNPAID | MATERNITY | PATERNITY | FAMILY | OTHER

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="APPROVED")
    # REQUESTED | APPROVED | REJECTED | TAKEN | CANCELLED

    document_id = Column(Integer, ForeignKey("employee_documents.id"), nullable=True)
    # e.g. doctor's note for sick leave

    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
