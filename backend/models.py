from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    files = relationship("File", back_populates="owner")

class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    original_size = Column(Integer)
    compressed_size = Column(Integer)
    compression_ratio = Column(Float)
    algorithm = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="files")
    shares = relationship("FileShare", back_populates="file")

class FileShare(Base):
    __tablename__ = "file_shares"

    id = Column(Integer, primary_key=True, index=True)
    share_id = Column(String, unique=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id"))
    password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    max_downloads = Column(Integer, default=-1)
    current_downloads = Column(Integer, default=0)
    is_password_protected = Column(Boolean, default=True)
    file = relationship("File", back_populates="shares") 