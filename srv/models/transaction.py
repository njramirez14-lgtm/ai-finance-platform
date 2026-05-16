import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from srv.database.database import Base


class TransactionType(str, enum.Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    TRANSFER = "TRANSFER"  # internal movement between accounts (e.g. PayPal → CaixaBank)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    type = Column(Enum(TransactionType), nullable=False)
    description = Column(String, nullable=True)
    date = Column(DateTime, default=datetime.utcnow)

    user_id = Column(Integer, ForeignKey("users.id"))
    user = relationship("User", back_populates="transactions")

    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    category = relationship("Category", back_populates="transactions")

    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    entity_id = Column(Integer, ForeignKey("entities.id"), nullable=True)

    # When this is the bank-side leg of a payment processor (e.g. CaixaBank charge
    # for a PayPal purchase), points to the merchant-side transaction in the
    # processor account. Allows showing both rows without double counting.
    linked_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
