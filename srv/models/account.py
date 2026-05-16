import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from srv.database.database import Base


class AccountType(str, enum.Enum):
    CHECKING = "CHECKING"
    SAVINGS = "SAVINGS"
    CASH = "CASH"
    CARD = "CARD"
    CRYPTO = "CRYPTO"
    OTHER = "OTHER"


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # CHECKING | SAVINGS | CASH | CARD | CRYPTO | OTHER
    currency = Column(String, nullable=False, default="EUR")
    initial_balance = Column(Numeric(14, 2), nullable=False, default=0)
    account_number = Column(String, nullable=True)  # IBAN / numero de cuenta / wallet address
    notes = Column(String, nullable=True)
    # Comma- or newline-separated patterns. Any imported line whose description
    # matches one of these (case-insensitive substring) is flagged as TRANSFER
    # instead of EXPENSE. Example: "PAYPAL,BIZUM,AMZN PAYMENTS".
    transfer_patterns = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    entity = relationship("Entity", back_populates="accounts")
    cards = relationship("Card", primaryjoin="Card.account_id == Account.id", lazy="select")
