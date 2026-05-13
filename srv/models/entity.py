import enum
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from srv.database.database import Base


class EntityType(str, enum.Enum):
    PERSONAL = "PERSONAL"
    BUSINESS = "BUSINESS"


class Entity(Base):
    __tablename__ = "entities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # 'PERSONAL' | 'BUSINESS'
    tax_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    accounts = relationship("Account", back_populates="entity")
