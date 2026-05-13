from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Index, Integer, Numeric, String, UniqueConstraint

from srv.database.database import Base


class SmartMoneyTrade(Base):
    """Public disclosure trades from US politicians (STOCK Act) and
    institutional investors (SEC 13F / Form 4). One row per disclosed transaction
    or per quarterly holding line item."""

    __tablename__ = "smart_money_trades"

    id = Column(Integer, primary_key=True, index=True)

    source = Column(String, nullable=False, index=True)
    source_id = Column(String, nullable=True, index=True)

    actor_type = Column(String, nullable=False, index=True)
    actor_name = Column(String, nullable=False, index=True)
    actor_party = Column(String, nullable=True)
    actor_chamber = Column(String, nullable=True)
    actor_state = Column(String, nullable=True)

    ticker = Column(String, nullable=True, index=True)
    asset_name = Column(String, nullable=True)
    asset_type = Column(String, nullable=True)

    transaction_type = Column(String, nullable=True, index=True)
    transaction_date = Column(Date, nullable=True, index=True)
    disclosure_date = Column(Date, nullable=True)

    amount_min = Column(Numeric(20, 2), nullable=True)
    amount_max = Column(Numeric(20, 2), nullable=True)
    shares = Column(Numeric(20, 4), nullable=True)
    price = Column(Numeric(20, 4), nullable=True)
    value_usd = Column(Numeric(20, 2), nullable=True)

    raw_url = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "source", "source_id", "actor_name", "ticker", "transaction_date",
            "transaction_type", "amount_min",
            name="uq_smart_money_dedup",
        ),
        Index("ix_smart_money_actor_date", "actor_name", "transaction_date"),
        Index("ix_smart_money_ticker_date", "ticker", "transaction_date"),
    )
