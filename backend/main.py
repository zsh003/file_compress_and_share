from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
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
from compression import LZ77Compressor, HuffmanCompressor, ZipCompressor
import socket

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
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = str(id(websocket))
    active_connections[client_id] = websocket
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] WebSocket连接建立: {client_id}")

    try:
        while True:
            # 等待消息，但不处理心跳
            await websocket.receive_text()
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] WebSocket错误[{client_id}]: {str(e)}")
    finally:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 连接关闭: {client_id}")
        if client_id in active_connections:
            del active_connections[client_id]


@app.post("/upload")
async def upload_file(file: UploadFile = File(...), algorithm: str = Form("algorithm")):
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
        compression_tasks[task_id] = compression_task

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
            await asyncio.wait_for(compression_tasks[task_id], timeout=2.0)
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
        # 异步压缩
        if asyncio.iscoroutinefunction(compressor.compress):
            await compressor.compress(input_path, output_path)
        else:
            # 保持向后兼容
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, compressor.compress, input_path, output_path)
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
async def decompress_file(file: UploadFile = File(...), algorithm: str = Form("algorithm")):
    try:
        # 保存上传的压缩文件
        if file.filename is not None:
            file_path = os.path.join(DECOMPRESSED_DIR, file.filename)
        else:
            raise HTTPException(status_code=400, detail="文件名不能为空")
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
        else:
            raise HTTPException(status_code=400, detail="不支持的压缩算法")

        # 从压缩文件名中获取原始文件名
        original_filename = file.filename.replace(".compressed", "")
        decompressed_path = os.path.join(DECOMPRESSED_DIR, original_filename)

        # 在后台任务中执行解压
        asyncio.create_task(decompress_file_task(compressor, file_path, decompressed_path))

        return {
            "message": "文件上传成功，开始解压",
            "filename": original_filename,
            "algorithm": algorithm
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def decompress_file_task(compressor, input_path, output_path):
    try:
        # 在单独的线程中执行解压
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, compressor.decompress, input_path, output_path)
    except Exception as e:
        print(f"解压错误: {e}")


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


# 分享文件
@app.post("/share/{filename}")
async def share_file(filename: str):
    try:
        # 检查文件是否存在
        compressed_path = os.path.join(COMPRESSED_DIR, filename)
        if not os.path.exists(compressed_path):
            raise HTTPException(status_code=404, detail="文件不存在")

        # 生成分享ID和密码
        share_id = generate_share_id()
        password = generate_password()

        # 创建分享目录（如果不存在）
        share_dir = os.path.join(SHARED_DIR, share_id)
        if not os.path.exists(share_dir):
            os.makedirs(share_dir)

        # 复制文件到分享目录
        shared_file_path = os.path.join(share_dir, filename)
        with open(compressed_path, 'rb') as src, open(shared_file_path, 'wb') as dst:
            dst.write(src.read())

        # 存储分享信息
        shared_files[share_id] = {
            'filename': filename,
            'password': password,
            'path': shared_file_path,
            'created_at': time.time()
        }

        return {
            "share_id": share_id,
            "password": password,
            "download_url": f"/shared/{share_id}/{filename}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 获取分享信息
@app.get("/share/{share_id}")
async def get_share_info(share_id: str):
    if share_id not in shared_files:
        raise HTTPException(status_code=404, detail="分享不存在")

    share_info = shared_files[share_id]
    return {
        "filename": share_info['filename'],
        "created_at": share_info['created_at']
    }


# 验证密码并下载分享文件
@app.get("/shared/{share_id}/{filename}")
async def download_shared_file(share_id: str, filename: str, password: str = Query(...)):
    if share_id not in shared_files:
        raise HTTPException(status_code=404, detail="分享不存在")

    share_info = shared_files[share_id]
    if share_info['password'] != password:
        raise HTTPException(status_code=403, detail="密码错误")

    if not os.path.exists(share_info['path']):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(share_info['path'], filename=filename)


# 挂载静态文件目录
app.mount("/shared", StaticFiles(directory=SHARED_DIR), name="shared")


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


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
