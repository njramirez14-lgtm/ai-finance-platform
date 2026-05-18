from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text

from srv.database.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    liability_id = Column(Integer, ForeignKey("liabilities.id"), nullable=True, index=True)

    name = Column(String, nullable=False)
    vehicle_type = Column(String, nullable=False, default="CAR")
    # CAR | MOTORCYCLE | BICYCLE | BOAT | TRUCK | OTHER

    make = Column(String, nullable=True)
    model = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    license_plate = Column(String, nullable=True)

    purchase_date = Column(Date, nullable=True)
    purchase_price = Column(Numeric(14, 2), nullable=False, default=0)
    current_value = Column(Numeric(14, 2), nullable=True)

    monthly_income = Column(Numeric(12, 2), nullable=False, default=0)
    # rental, ride-share, fleet, etc.
    monthly_expenses = Column(Numeric(12, 2), nullable=False, default=0)
    # insurance, fuel, maintenance, parking, road tax

    currency = Column(String, nullable=False, default="EUR")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
