from fastapi import APIRouter, Form, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from starlette import status
from datetime import timedelta

import jwt
from jwt.exceptions import InvalidTokenError

from app.core.mysql import get_db
from app.service.user_service import SECRET_KEY, ALGORITHM, UserService
from app.schemas import user_schemas

router = APIRouter(prefix="/user")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/user/login")

ACCESS_TOKEN_EXPIRE_MINUTES = 30


async def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = user_schemas.TokenData(username=username)
    except InvalidTokenError:
        raise credentials_exception
    user = UserService.get_user(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user


class UserResource:
    @staticmethod
    @router.post("/login", tags=["user"])
    async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
        user = UserService.user_login(db, form_data.username, form_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="登录失败请检查用户名或密码",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = UserService.create_access_token(
            data={"sub": user.username}, expires_delta=access_token_expires
        )
        return user_schemas.Token(access_token=access_token, token_type="bearer")

    # 创建用户
    @staticmethod
    @router.post("/create_user", tags=["user"])
    async def create_user(username: str = Form(max_length=20), password: str = Form(max_length=100),
                          db: Session = Depends(get_db)):
        """

        :param username:
        :param password:
        :param db:
        :return:
        """
        db_user = UserService.get_user(db, username)
        if db_user is not None:
            raise HTTPException(status_code=400, detail="用户已存在")
        user_create = user_schemas.UserCreate(username=username, password=UserService.hash_password(password))
        db_user = UserService.user_create(db, user_create)
        return {
            "code": 0,
            "msg": "",
            "data": db_user
        }

    # 修改用户名，密码
    @staticmethod
    @router.put("/update_user", tags=["user"])
    async def update_user(new_name: str | None = None, new_password: str | None = None, db: Session = Depends(get_db),
                          current_user: user_schemas.UserBase = Depends(get_current_user)):
        """

        :param new_name:
        :param new_password:
        :param db:
        :param current_user:
        :return:
        """
        if new_name is not None:
            db_newname = UserService.get_user(db, new_name)
            if db_newname is not None:
                raise HTTPException(status_code=400, detail="该用户名已存在")
        db_user = UserService.update_user_info(db, current_user.username, new_name, new_password)
        if db_user is None:
            raise HTTPException(status_code=404, detail="找不到")
        else:
            return {
                "code": 0,
                "msg": "",
                "data": db_user
            }


