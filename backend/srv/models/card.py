from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from srv.database.database import Base


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    alias = Column(String, nullable=False)
    last4 = Column(String, nullable=True)
    brand = Column(String, nullable=True)  # VISA, MASTERCARD, AMEX, OTHER
    type = Column(String, nullable=False)  # DEBIT, CREDIT, PREPAID, VIRTUAL
    bank_name = Column(String, nullable=True, index=True)
    expiry_month = Column(Integer, nullable=True)
    expiry_year = Column(Integer, nullable=True)
    color = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
