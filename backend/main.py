from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, Form, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import os
import time
import json
import asyncio
import uuid
import random
import string
import heapq
from collections import defaultdict
import struct
import zipfile
from typing import Optional, Dict, List
import uvicorn
from compression import LZ77Compressor, HuffmanCompressor, ZipCompressor, CombinedCompressor
import socket
import secrets
from datetime import datetime, timedelta
from jose import jwt, JWTError
import shutil

import models
import schemas
import crud
import auth
import database

# 创建数据库表
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 创建上传文件存储目录
UPLOAD_DIR = "uploads"
COMPRESSED_DIR = "compressed"
DECOMPRESSED_DIR = "decompressed"
SHARED_DIR = "shared"
for directory in [UPLOAD_DIR, COMPRESSED_DIR, DECOMPRESSED_DIR, SHARED_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)

# 存储WebSocket连接和压缩任务
active_connections: Dict[str, WebSocket] = {}
compression_tasks: Dict[str, asyncio.Task] = {}
stop_flags: Dict[str, bool] = {}

# 存储分享信息
shared_files: Dict[str, Dict] = {}

# 生成随机密码
def generate_password(length=6):
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

# 生成分享ID
def generate_share_id():
    return str(uuid.uuid4())

async def send_compression_progress(websocket: WebSocket, data: dict):
    try:
        await websocket.send_text(json.dumps(data))
    except Exception as e:
        print(f"发送进度更新失败: {e}")

@app.websocket("/ws/compression")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    task_id: str = Query(...),
    db: Session = Depends(database.get_db)
):
    try:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 收到WebSocket连接请求: {task_id}")
        # 验证token
        if not token:
            await websocket.close(code=4001, reason="未提供认证token")
            return

        try:
            # 从token中提取实际的token值（去掉Bearer前缀）
            if not token.startswith('Bearer '):
                await websocket.close(code=4001, reason="无效的认证方式")
                return
            
            token_value = token.split(' ')[1]

            # 验证token并获取用户信息
            payload = jwt.decode(token_value, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
            username = payload.get("sub")
            if not username:
                await websocket.close(code=4001, reason="无效的token")
                return

            user = db.query(models.User).filter(models.User.username == username).first()
            if not user:
                await websocket.close(code=4001, reason="用户不存在")
                return

        except (JWTError, ValueError) as e:
            print(f"Token验证错误: {str(e)}")
            await websocket.close(code=4001, reason="无效的token")
            return

        await websocket.accept()
        client_id = f"{task_id}_{str(id(websocket))}"
        active_connections[client_id] = websocket
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] WebSocket连接建立: {client_id}")

        try:
            while True:
                # 等待消息，但不处理
                await websocket.receive_text()
        except Exception as e:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] WebSocket错误[{client_id}]: {str(e)}")
        finally:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 连接关闭: {client_id}")
            if client_id in active_connections:
                del active_connections[client_id]
    except Exception as e:
        print(f"WebSocket处理错误: {str(e)}")
        if not websocket.client_state.disconnected:
            await websocket.close(code=1011, reason=str(e))

@app.post("/user/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db)
):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    # 生成refresh token
    refresh_token = auth.create_refresh_token(data={"sub": user.username})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "username": user.username,
        "user_id": user.id
    }

@app.post("/user/refresh_token")
async def refresh_token(
    refresh_token: str = Form(...),
    db: Session = Depends(database.get_db)
):
    username = auth.verify_refresh_token(refresh_token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的refresh token"
        )

    # 验证用户是否存在
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在"
        )

    # 生成新的access token
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": username}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@app.post("/user/register", response_model=schemas.User)
async def register(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    # 检查用户名是否已存在
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 创建新用户
    return crud.create_user(db=db, username=user.username, password=user.password)

@app.get("/user/me", response_model=schemas.User)
async def get_current_user_info(
    current_user: models.User = Depends(auth.get_current_user)
):
    return current_user

@app.put("/user/update", response_model=schemas.User)
async def update_user_info(
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # 如果要更新用户名，先检查新用户名是否已存在
    if user_update.username:
        db_user = crud.get_user_by_username(db, username=user_update.username)
        if db_user and db_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名已被使用"
            )
    
    updated_user = crud.update_user(
        db=db,
        user_id=current_user.id,
        username=user_update.username,
        password=user_update.password
    )
    
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    return updated_user

@app.post("/user/logout")
async def logout():
    # 由于使用的是JWT，后端不需要特殊处理
    # 前端会清除localStorage中的token
    return {"message": "退出登录成功"}

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    algorithm: str = Form("algorithm"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    try:
        # 生成任务ID
        task_id = str(uuid.uuid4())
        stop_flags[task_id] = False

        # 保存上传的文件
        if file.filename is not None:
            file_path = os.path.join(UPLOAD_DIR, file.filename)
        else:
            raise HTTPException(status_code=400, detail="文件名不能为空")

        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # 获取文件大小
        file_size = os.path.getsize(file_path)

        print(f"接收到文件: {file.filename}")

        # 根据选择的算法进行压缩
        if algorithm == "lz77":
            compressor = LZ77Compressor()
        elif algorithm == "huffman":
            compressor = HuffmanCompressor()
        elif algorithm == "zip":
            compressor = ZipCompressor()
        elif algorithm == "combined":
            compressor = CombinedCompressor()
        else:
            raise HTTPException(status_code=400, detail="不支持的压缩算法")

        # 设置进度回调
        if hasattr(compressor, 'set_progress_callback'):
            async def progress_callback(data):
                # 检查是否应该停止
                if stop_flags.get(task_id, True):
                    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务 {task_id} 被用户停止")
                    raise asyncio.CancelledError()

                # 向所有连接的客户端发送进度更新
                for ws in active_connections.values():
                    await send_compression_progress(ws, data)

            compressor.set_progress_callback(progress_callback)

        compressed_path = os.path.join(COMPRESSED_DIR, f"{file.filename}.compressed")

        # 在后台任务中执行压缩
        compression_task = asyncio.create_task(compress_file(compressor, file_path, compressed_path, task_id))
        compression_tasks[task_id] = {
            "task": compression_task,
            "user_id": current_user.id,
            "original_size": file_size,
            "algorithm": algorithm
        }

        return {
            "message": "文件上传成功，开始压缩",
            "filename": f"{file.filename}.compressed",
            "algorithm": algorithm,
            "originalSize": file_size,
            "taskId": task_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stop_compression/{task_id}")
async def stop_compression(task_id: str):
    if task_id not in compression_tasks:
        raise HTTPException(status_code=404, detail="找不到指定的压缩任务")

    # 设置停止标志
    stop_flags[task_id] = True
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 收到停止请求: 任务ID {task_id}")

    try:
        # 等待任务取消，设置超时
        try:
            await asyncio.wait_for(compression_tasks[task_id]["task"], timeout=1.0)
        except asyncio.TimeoutError:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 停止任务超时: {task_id}")
            # 即使超时也继续执行清理操作
    except asyncio.CancelledError:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务被取消: {task_id}")
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 停止任务时出错: {str(e)}")
    finally:
        # 通知所有客户端压缩已停止
        for ws in active_connections.values():
            try:
                await send_compression_progress(ws, {
                    'type': 'stopped',
                    'message': '压缩任务已停止'
                })
            except Exception as e:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 发送停止通知失败: {str(e)}")

        # 清理任务相关资源
        if task_id in compression_tasks:
            del compression_tasks[task_id]
        if task_id in stop_flags:
            del stop_flags[task_id]

    return {"message": "压缩任务已停止"}

async def compress_file(compressor, input_path, output_path, task_id):
    try:
        # 获取任务信息
        task_info = compression_tasks[task_id]
        user_id = task_info["user_id"]
        original_size = task_info["original_size"]
        algorithm = task_info["algorithm"]

        # 异步压缩
        if asyncio.iscoroutinefunction(compressor.compress):
            await compressor.compress(input_path, output_path)
        else:
            # 保持向后兼容
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, compressor.compress, input_path, output_path)

        # 获取压缩后的大小
        compressed_size = os.path.getsize(output_path)
        compression_ratio = (original_size - compressed_size) / original_size

        # 保存文件信息到数据库
        db = next(database.get_db())
        try:
            file_record = models.File(
                filename=os.path.basename(input_path),
                original_size=original_size,
                compressed_size=compressed_size,
                compression_ratio=compression_ratio,
                algorithm=algorithm,
                owner_id=user_id
            )
            db.add(file_record)
            db.commit()
            db.refresh(file_record)

            # 发送完成消息
            await send_compression_progress(active_connections[task_id], {
                "type": "completed",
                "progress": 100,
                "details": {
                    "original_size": original_size,
                    "current_size": compressed_size,
                    "compression_ratio": compression_ratio,
                    "file_id": file_record.id
                }
            })

        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    except asyncio.CancelledError:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 压缩任务被取消: {task_id}")
        # 清理未完成的压缩文件
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 已删除未完成的压缩文件: {output_path}")
            except Exception as e:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 删除未完成的压缩文件失败: {str(e)}")
        raise
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 压缩错误: {str(e)}")
        # 通知客户端压缩失败
        for ws in active_connections.values():
            try:
                await send_compression_progress(ws, {
                    'type': 'error',
                    'message': str(e)
                })
            except Exception as ws_error:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 发送错误通知失败: {str(ws_error)}")
    finally:
        # 清理任务相关资源
        if task_id in compression_tasks:
            del compression_tasks[task_id]
        if task_id in stop_flags:
            del stop_flags[task_id]


@app.post("/decompress")
async def decompress_file(
    file: UploadFile = File(...),
    algorithm: str = Form("algorithm"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    try:
        # 生成任务ID
        task_id = str(uuid.uuid4())
        stop_flags[task_id] = False

        # 保存上传的压缩文件
        if file.filename is not None:
            # 确保文件名不包含路径
            filename = os.path.basename(file.filename)
            file_path = os.path.join(UPLOAD_DIR, filename)
        else:
            raise HTTPException(status_code=400, detail="文件名不能为空")

        # 确保上传目录存在
        os.makedirs(UPLOAD_DIR, exist_ok=True)

        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # 根据选择的算法进行解压
        if algorithm == "lz77":
            compressor = LZ77Compressor()
        elif algorithm == "huffman":
            compressor = HuffmanCompressor()
        elif algorithm == "zip":
            compressor = ZipCompressor()
        elif algorithm == "combined":
            compressor = CombinedCompressor()
        else:
            raise HTTPException(status_code=400, detail="不支持的压缩算法")

        # 从压缩文件名中获取原始文件名
        original_filename = filename.replace(".compressed", "")
        decompressed_path = os.path.join(DECOMPRESSED_DIR, original_filename)

        # 确保解压目录存在
        os.makedirs(DECOMPRESSED_DIR, exist_ok=True)

        # 在后台任务中执行解压
        decompression_task = asyncio.create_task(decompress_file_task(compressor, file_path, decompressed_path, task_id))
        compression_tasks[task_id] = {
            "task": decompression_task,
            "user_id": current_user.id
        }

        return {
            "message": "文件上传成功，开始解压",
            "filename": original_filename,
            "algorithm": algorithm,
            "taskId": task_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def decompress_file_task(compressor, input_path, output_path, task_id):
    try:
        # 异步解压
        if asyncio.iscoroutinefunction(compressor.decompress):
            await compressor.decompress(input_path, output_path)
        else:
            # 保持向后兼容
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, compressor.decompress, input_path, output_path)

        # 发送完成消息
        await send_compression_progress(active_connections[task_id], {
            "type": "completed",
            "progress": 100,
            "details": {
                "filename": os.path.basename(output_path)
            }
        })

    except asyncio.CancelledError:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 解压任务被取消: {task_id}")
        # 清理未完成的解压文件
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 已删除未完成的解压文件: {output_path}")
            except Exception as e:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 删除未完成的解压文件失败: {str(e)}")
        raise
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 解压错误: {str(e)}")
        # 通知客户端解压失败
        for ws in active_connections.values():
            try:
                await send_compression_progress(ws, {
                    'type': 'error',
                    'message': str(e)
                })
            except Exception as ws_error:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 发送错误通知失败: {str(ws_error)}")
    finally:
        # 清理任务相关资源
        if task_id in compression_tasks:
            del compression_tasks[task_id]
        if task_id in stop_flags:
            del stop_flags[task_id]


@app.get("/download/{filename}")
async def download_file(filename: str):
    try:
        # 检查文件是否存在于压缩或解压目录中
        compressed_path = os.path.join(COMPRESSED_DIR, filename)
        decompressed_path = os.path.join(DECOMPRESSED_DIR, filename)

        if os.path.exists(compressed_path):
            return FileResponse(compressed_path, filename=filename)
        elif os.path.exists(decompressed_path):
            return FileResponse(decompressed_path, filename=filename)
        else:
            raise HTTPException(status_code=404, detail="文件不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 获取服务器IP地址
@app.get("/ip")
async def get_server_ip():
    try:
        # 获取本机IP地址
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": ip}
    except Exception as e:
        # 如果获取失败，返回本地回环地址
        return {"ip": "127.0.0.1"}

# 文件分享相关路由
@app.post("/share/{file_id}", response_model=schemas.FileShare)
async def share_file(
    file_id: int,
    share_info: schemas.FileShareCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    try:
        # 检查文件是否存在且属于当前用户
        db_file = crud.get_file(db, file_id)
        if not db_file or db_file.owner_id != current_user.id:
            raise HTTPException(status_code=404, detail="文件不存在")

        # 检查源文件是否存在
        print(db_file.filename)
        source_file_path = os.path.join(COMPRESSED_DIR, f"{db_file.filename}.compressed")
        if not os.path.exists(source_file_path):
            print(f"压缩文件不存在: {source_file_path}")
            raise HTTPException(status_code=404, detail="压缩文件不存在")

        # 生成分享ID和密码
        share_id = str(uuid.uuid4())
        password = None
        if share_info.is_password_protected:
            password = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(6))

        # 创建分享目录
        share_dir = os.path.join(SHARED_DIR, share_id)
        if not os.path.exists(share_dir):
            os.makedirs(share_dir)

        # 复制文件到分享目录，使用原始文件名加算法后缀
        shared_file_path = os.path.join(share_dir, f"{db_file.filename}.compressed")
        with open(source_file_path, 'rb') as src, open(shared_file_path, 'wb') as dst:
            dst.write(src.read())

        # 创建分享记录
        db_share = crud.create_file_share(
            db=db,
            file_id=file_id,
            share_id=share_id,
            password=password,
            expiration_hours=share_info.expiration_hours,
            max_downloads=share_info.max_downloads,
            is_password_protected=share_info.is_password_protected
        )

        # 构建完整的分享链接
        server_ip = await get_server_ip()
        share_url = f"http://{server_ip['ip']}:8000/shared/{share_id}/download"
        
        response_data = {
            "id": db_share.id,
            "share_id": share_id,
            "file_id": file_id,
            "file_name": db_file.filename,
            "password": password,
            "share_url": share_url,
            "created_at": db_share.created_at,
            "expires_at": db_share.expires_at,
            "max_downloads": db_share.max_downloads,
            "current_downloads": db_share.current_downloads,
            "is_password_protected": db_share.is_password_protected
        }
        
        
        return response_data
    except Exception as e:
        print(f"分享错误: {str(e)}")
        # 如果出错，清理已创建的分享目录
        share_dir = os.path.join(SHARED_DIR, share_id) if 'share_id' in locals() else None
        if share_dir and os.path.exists(share_dir):
            shutil.rmtree(share_dir)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/shared/{share_id}/download")
async def download_shared_file(
    share_id: str,
    password: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    try:
        # 获取分享记录
        share = crud.get_file_share(db, share_id)
        if not share:
            raise HTTPException(status_code=404, detail="分享链接不存在")

        # 验证分享是否有效
        if not crud.check_share_validity(db, share):
            raise HTTPException(status_code=400, detail="分享链接已过期或达到下载次数限制")

        # 验证密码
        if share.is_password_protected:
            if not password:
                raise HTTPException(status_code=401, detail="请提供密码")
            if share.password != password:
                raise HTTPException(status_code=401, detail="密码错误")

        # 获取文件
        db_file = crud.get_file(db, share.file_id)
        if not db_file:
            raise HTTPException(status_code=404, detail="文件不存在")

        # 构建文件路径
        file_path = os.path.join(COMPRESSED_DIR, f"{db_file.filename}.compressed")
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="文件不存在")

        # 更新下载次数
        crud.update_share_download_count(db, share_id)

        # 返回文件
        return FileResponse(
            file_path,
            filename=f"{db_file.filename}.compressed",
            media_type='application/octet-stream'
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"下载错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")

# 用户文件列表
@app.get("/files", response_model=List[schemas.File])
async def get_user_files(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    files = crud.get_user_files(db, current_user.id, skip=skip, limit=limit)
    return files

# 用户分享列表
@app.get("/shares", response_model=List[schemas.FileShare])
async def get_user_shares(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    shares = crud.get_user_shares(db, current_user.id, skip=skip, limit=limit)
    
    # 为每个分享添加文件名和分享链接
    result = []
    for share in shares:
        file = crud.get_file(db, share.file_id)
        server_ip = await get_server_ip()
        share_url = f"http://{server_ip['ip']}:8000/shared/{share.share_id}/download"
        
        share_dict = {
            "id": share.id,
            "share_id": share.share_id,
            "file_id": share.file_id,
            "password": share.password,
            "created_at": share.created_at,
            "expires_at": share.expires_at,
            "max_downloads": share.max_downloads,
            "current_downloads": share.current_downloads,
            "is_password_protected": share.is_password_protected,
            "share_url": share_url,
            "file_name": file.filename if file else "未知文件",
            "expiration_hours": 24,  # 默认值
        }
        result.append(share_dict)
    
    return result

# 删除分享
@app.delete("/shares/{share_id}")
async def delete_user_share(
    share_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    success = crud.delete_share(db, share_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="分享不存在或无权删除")
    return {"message": "分享已删除"}

# 用户压缩历史记录
@app.get("/compression-history", response_model=List[schemas.File])
async def get_compression_history(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    history = crud.get_user_compression_history(db, current_user.id, skip=skip, limit=limit)
    return history

if __name__ == '__main__':
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)