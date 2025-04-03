from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import time
import json
import asyncio
from typing import Optional, Dict, List
import uvicorn
from compression import LZ77Compressor, HuffmanCompressor, ZipCompressor

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
for directory in [UPLOAD_DIR, COMPRESSED_DIR, DECOMPRESSED_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)

# 存储WebSocket连接
active_connections: Dict[str, WebSocket] = {}

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
    
    try:
        while True:
            data = await websocket.receive_text()
            # 处理客户端消息（如果需要）
    except Exception as e:
        print(f"WebSocket错误: {e}")
    finally:
        if client_id in active_connections:
            del active_connections[client_id]

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), algorithm: str = "zip"):
    try:
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
                # 向所有连接的客户端发送进度更新
                for ws in active_connections.values():
                    await send_compression_progress(ws, data)
            
            compressor.set_progress_callback(progress_callback)
            
        compressed_path = os.path.join(COMPRESSED_DIR, f"{file.filename}.compressed")
        
        # 在后台任务中执行压缩
        asyncio.create_task(compress_file(compressor, file_path, compressed_path))
        
        return {
            "message": "文件上传成功，开始压缩",
            "filename": f"{file.filename}.compressed",
            "algorithm": algorithm,
            "originalSize": file_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def compress_file(compressor, input_path, output_path):
    try:
        # 异步压缩
        if asyncio.iscoroutinefunction(compressor.compress):
            await compressor.compress(input_path, output_path)
        else:
            # 保持向后兼容
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, compressor.compress, input_path, output_path)
    except Exception as e:
        print(f"压缩错误: {e}")
        # 通知客户端压缩失败
        for ws in active_connections.values():
            await send_compression_progress(ws, {
                'type': 'error',
                'message': str(e)
            })

@app.post("/decompress")
async def decompress_file(file: UploadFile = File(...), algorithm: str = "lz77"):
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
