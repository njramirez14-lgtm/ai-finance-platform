from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from srv.database.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String, nullable=False, default="EUR")
    billing_cycle = Column(String, nullable=False)  # WEEKLY, MONTHLY, QUARTERLY, YEARLY, CUSTOM
    next_charge_date = Column(Date, nullable=True)
    started_at = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE, PAUSED, CANCELLED
    # EXPENSE for recurring outflows (Netflix, gym, ...) or INCOME for recurring
    # inflows (nómina, alquiler que cobras, freelance fijo, ...). Drives which
    # page the row shows on and how it contributes to monthly aggregates.
    kind = Column(String, nullable=False, default="EXPENSE")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
