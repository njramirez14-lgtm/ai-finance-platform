from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from srv.database.database import Base


class InvestmentPlan(Base):
    __tablename__ = "investment_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    active = Column(Boolean, nullable=False, default=True)
    monthly_core_amount = Column(Numeric(12, 2), nullable=False, default=400)
    monthly_reserve_amount = Column(Numeric(12, 2), nullable=False, default=100)
    core_symbol = Column(String, nullable=False, default="VOO")
    core_symbol_label = Column(String, nullable=False, default="S&P 500 (Vanguard VOO)")
    reserve_balance = Column(Numeric(14, 2), nullable=False, default=0)
    last_monthly_executed_at = Column(DateTime(timezone=True), nullable=True)
    last_trigger_fired_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class MarketAlert(Base):
    __tablename__ = "market_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)  # monthly | trigger | info
    level = Column(String, nullable=False, default="info")  # info | warning | opportunity
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    suggested_action = Column(String, nullable=True)  # invest_core | invest_reserve | invest_both | noop
    suggested_amount = Column(Numeric(12, 2), nullable=True)
    signal_data = Column(JSONB, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | confirmed | dismissed | expired
    telegram_sent_at = Column(DateTime(timezone=True), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class MarketTriggerLog(Base):
    __tablename__ = "market_trigger_log"

    id = Column(Integer, primary_key=True, index=True)
    trigger_kind = Column(String, nullable=False, index=True)
    fired_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    signal_value = Column(Numeric(12, 4), nullable=True)
    notes = Column(Text, nullable=True)
