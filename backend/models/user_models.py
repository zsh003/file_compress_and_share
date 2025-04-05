from sqlalchemy import Boolean, Column, DATETIME, String
from sqlalchemy.orm import relationship
from core.database import Base

class User(Base):
    __tablename__ = "user"
    username = Column(String(50), primary_key=True, index=True)
    password = Column(String(128))
