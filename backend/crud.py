from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import models
import auth
from typing import Optional

# 用户相关操作
def create_user(db: Session, username: str, password: str):
    hashed_password = auth.get_password_hash(password)
    db_user = models.User(username=username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def update_user(db: Session, user_id: int, username: Optional[str] = None, password: Optional[str] = None):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    if username:
        db_user.username = username
    if password:
        db_user.hashed_password = auth.get_password_hash(password)
    
    db.commit()
    db.refresh(db_user)
    return db_user

# 文件相关操作
def create_file(db: Session, filename: str, original_size: int, compressed_size: int, 
                algorithm: str, owner_id: int):
    compression_ratio = ((original_size - compressed_size) / original_size) * 100
    db_file = models.File(
        filename=filename,
        original_size=original_size,
        compressed_size=compressed_size,
        compression_ratio=compression_ratio,
        algorithm=algorithm,
        owner_id=owner_id
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file

def get_user_files(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.File)\
        .filter(models.File.owner_id == user_id)\
        .offset(skip)\
        .limit(limit)\
        .all()

def get_file(db: Session, file_id: int):
    return db.query(models.File).filter(models.File.id == file_id).first()

# 文件分享相关操作
def create_file_share(
    db: Session,
    file_id: int,
    share_id: str,
    password: Optional[str],
    expiration_hours: int = 24,
    max_downloads: int = -1,
    is_password_protected: bool = True
):
    expires_at = datetime.utcnow() + timedelta(hours=expiration_hours)
    db_share = models.FileShare(
        share_id=share_id,
        file_id=file_id,
        password=password,
        expires_at=expires_at,
        max_downloads=max_downloads,
        is_password_protected=is_password_protected
    )
    db.add(db_share)
    db.commit()
    db.refresh(db_share)
    return db_share

def get_file_share(db: Session, share_id: str):
    return db.query(models.FileShare)\
        .filter(models.FileShare.share_id == share_id)\
        .first()

def update_share_download_count(db: Session, share_id: str):
    db_share = get_file_share(db, share_id)
    if db_share:
        db_share.current_downloads += 1
        db.commit()
        db.refresh(db_share)
    return db_share

def delete_expired_shares(db: Session):
    now = datetime.utcnow()
    expired_shares = db.query(models.FileShare)\
        .filter(models.FileShare.expires_at < now)\
        .all()
    
    for share in expired_shares:
        db.delete(share)
    
    db.commit()

def check_share_validity(db: Session, share: models.FileShare) -> bool:
    if not share:
        return False
    
    # 检查是否过期
    if share.expires_at and share.expires_at < datetime.utcnow():
        return False
    
    # 检查下载次数是否超限
    if share.max_downloads != -1 and share.current_downloads >= share.max_downloads:
        return False
    
    return True 