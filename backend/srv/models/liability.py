from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from srv.database.database import Base


class Liability(Base):
    __tablename__ = "liabilities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # MORTGAGE | LOAN | CREDIT_CARD | LINE_OF_CREDIT | STUDENT | OTHER
    lender = Column(String, nullable=True)
    original_amount = Column(Numeric(14, 2), nullable=False, default=0)
    current_balance = Column(Numeric(14, 2), nullable=False, default=0)
    interest_rate = Column(Numeric(6, 3), nullable=True)
    monthly_payment = Column(Numeric(14, 2), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    currency = Column(String, nullable=False, default="EUR")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
