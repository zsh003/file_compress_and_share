from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# 用户相关模型
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# 文件相关模型
class FileBase(BaseModel):
    filename: str
    algorithm: str

class FileCreate(FileBase):
    original_size: int
    compressed_size: int

class File(FileBase):
    id: int
    original_size: int
    compressed_size: int
    compression_ratio: float
    created_at: datetime
    owner_id: int

    class Config:
        from_attributes = True

# 文件分享相关模型
class FileShareBase(BaseModel):
    is_password_protected: bool = True
    expiration_hours: int = Field(default=24, gt=0)
    max_downloads: int = Field(default=-1, ge=-1)

class FileShareCreate(FileShareBase):
    pass

class FileShare(FileShareBase):
    id: int
    share_id: str
    file_id: int
    password: Optional[str]
    created_at: datetime
    expires_at: datetime
    current_downloads: int

    class Config:
        from_attributes = True

# 认证相关模型
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# 压缩任务相关模型
class CompressionProgress(BaseModel):
    task_id: str
    progress: float
    status: str
    details: Optional[dict]

# 分享下载相关模型
class ShareDownload(BaseModel):
    password: Optional[str] = None 