from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text

from srv.database.database import Base


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String, nullable=False)
    doc_type = Column(String, nullable=False, default="OTHER")
    # CONTRACT | ID | PAYSLIP | SICK_NOTE | VACATION_REQUEST | NDA | TAX_FORM | OTHER

    file_url = Column(String, nullable=True)  # any URL: Drive, Dropbox, raw
    drive_file_id = Column(String, nullable=True)  # if synced via Google Drive picker
    provider = Column(String, nullable=True)  # GOOGLE_DRIVE | DROPBOX | LOCAL | LINK

    issued_date = Column(Date, nullable=True)
    expires_at = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE | EXPIRED | ARCHIVED

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
