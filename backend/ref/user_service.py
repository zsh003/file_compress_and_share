import hashlib
from datetime import timedelta, datetime

import jwt
from passlib.context import CryptContext
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.user_models import User
from app.schemas import user_schemas


pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
SECRET_KEY = "226790535ebee0623ce62dc8bfe3ce27eafef15040011414f3dd3aa1e7ad15de"
ALGORITHM = "HS256"


class UserService(object):
    @staticmethod
    # 获取用户
    def get_user(db: Session, username: str):
        return db.query(User).filter(User.username == username).first()

    @staticmethod
    # 加密密码
    def hash_password(password: str):
        return pwd_context.hash(password)

    @staticmethod
    # 验证密码
    def verify_password(plain_password: str, hashed_password: str):
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    # 用户登录
    def user_login(db: Session, username: str, password: str):
        db_user = UserService.get_user(db, username)
        if not db_user:
            return False
        if not UserService.verify_password(password, db_user.password):
            return False
        return db_user

    @staticmethod
    # 创建用户
    def user_create(db: Session, users: user_schemas.UserCreate):
        db_user = User(**users.dict())
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    # 更新用户信息
    def update_user_info(db: Session, username: str, new_name: str | None = None, new_password: str | None = None):
        db_user = UserService.get_user(db, username)
        if db_user is None:
            return None
        if new_name is not None:
            setattr(db_user, 'username', new_name)
        if new_password is not None:
            setattr(db_user, 'password', UserService.hash_password(new_password))
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    # 创建token
    def create_access_token(data: dict, expires_delta: timedelta | None = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.now() + expires_delta
        else:
            expire = datetime.now() + timedelta(minutes=15)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt


