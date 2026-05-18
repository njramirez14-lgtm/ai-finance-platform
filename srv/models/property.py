from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from srv.database.database import Base


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    liability_id = Column(Integer, ForeignKey("liabilities.id"), nullable=True, index=True)

    name = Column(String, nullable=False)
    property_type = Column(String, nullable=False, default="RESIDENCE")
    # RESIDENCE | RENTAL | VACATION | COMMERCIAL | LAND | OTHER

    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    country = Column(String, nullable=True)
    area_m2 = Column(Numeric(10, 2), nullable=True)

    purchase_date = Column(Date, nullable=True)
    purchase_price = Column(Numeric(14, 2), nullable=False, default=0)
    current_value = Column(Numeric(14, 2), nullable=True)

    monthly_rental_income = Column(Numeric(12, 2), nullable=False, default=0)
    monthly_expenses = Column(Numeric(12, 2), nullable=False, default=0)
    # community fees, IBI/property tax, insurance, repairs averaged

    currency = Column(String, nullable=False, default="EUR")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
