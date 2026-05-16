from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text

from srv.database.database import Base


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    symbol = Column(String, nullable=False, index=True)  # AAPL, VWCE.DE, BTC-USD
    isin = Column(String, nullable=True, index=True)
    name = Column(String, nullable=True)
    asset_type = Column(String, nullable=False, default="STOCK")  # STOCK, ETF, CRYPTO, BOND, OTHER
    quantity = Column(Numeric(20, 8), nullable=False, default=0)  # crypto needs decimals
    avg_buy_price = Column(Numeric(14, 4), nullable=False, default=0)
    currency = Column(String, nullable=False, default="EUR")
    broker = Column(String, nullable=True)  # Trade Republic, IBKR, Binance...
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
