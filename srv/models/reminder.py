from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from srv.database.database import Base


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True, index=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)  # TAX | INVOICE | PAYMENT | LEGAL | OTHER
    due_at = Column(DateTime(timezone=True), nullable=False, index=True)
    repeat_rule = Column(String, nullable=True)  # NONE | DAILY | WEEKLY | MONTHLY | YEARLY
    status = Column(String, nullable=False, default="PENDING")  # PENDING | DONE | SNOOZED

    notify_at = Column(DateTime(timezone=True), nullable=True)  # when to push reminder
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
