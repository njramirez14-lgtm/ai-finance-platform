from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB

from srv.database.database import Base


class TelegramLink(Base):
    __tablename__ = "telegram_links"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    chat_id = Column(BigInteger, nullable=False, unique=True)
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    linked_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class TelegramLinkCode(Base):
    __tablename__ = "telegram_link_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)


class TelegramPendingTicket(Base):
    __tablename__ = "telegram_pending_tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    chat_id = Column(BigInteger, nullable=False, index=True)
    message_id = Column(BigInteger, nullable=True)
    state = Column(String, nullable=False, default="awaiting_account")
    extracted = Column(JSONB, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
