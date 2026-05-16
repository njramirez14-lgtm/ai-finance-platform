from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)

from srv.database.database import Base


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    # YYYY-MM. NULL category_id means "global" budget for the month.
    month = Column(String(7), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String, nullable=False, default="EUR")
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "month", name="uq_budget_user_cat_month"),
    )
