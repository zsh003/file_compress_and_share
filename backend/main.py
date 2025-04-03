from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import os
import time
import json
import asyncio
import uuid
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

# 存储WebSocket连接和压缩任务
active_connections: Dict[str, WebSocket] = {}
compression_tasks: Dict[str, asyncio.Task] = {}
stop_flags: Dict[str, bool] = {}

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
            # 心跳检测
            data = await asyncio.wait_for(
                websocket.receive_text(),
                timeout=30  # 30秒无操作则断开
            )
            if data == "ping":
                await websocket.send_text("pong")
                
    except asyncio.TimeoutError:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 连接超时: {client_id}")
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
                if stop_flags.get(task_id, False):
                    raise asyncio.CancelledError("压缩任务被用户取消")
                
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
        status_msg = "任务已完成或ID无效"
        if task_id in stop_flags:
            status_msg = "任务正在停止中"
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 停止请求失败:  {task_id} | 状态: {status_msg}")
        print(f"当前活动的任务列表: {list(compression_tasks.keys())}")
        return {"message": status_msg}
    
    # 设置停止标志
    stop_flags[task_id] = True
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 收到停止请求: 任务ID {task_id}")
    
    try:
        # 等待任务取消
        await compression_tasks[task_id]
    except asyncio.CancelledError:
        # 通知所有客户端压缩已停止
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务 {task_id} 已成功停止")
        for ws in active_connections.values():
            await send_compression_progress(ws, {
                'type': 'stopped',
                'message': '压缩任务已停止'
            })
    finally:
        # 清理任务相关资源
        if task_id in compression_tasks:
            del compression_tasks[task_id]
        if task_id in stop_flags:
            del stop_flags[task_id]
    
    return {"message": "压缩任务已停止"}

async def compress_file(compressor, input_path, output_path, task_id):
    try:
        # 日志
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务 {task_id} 开始压缩: {input_path} -> {output_path}")

        # 异步压缩
        if asyncio.iscoroutinefunction(compressor.compress):
            await compressor.compress(input_path, output_path)
        else:
            # 保持向后兼容
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, compressor.compress, input_path, output_path)
        
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务 {task_id} 压缩完成 | "
              f"原始大小: {os.path.getsize(input_path)} bytes | "
              f"压缩后大小: {os.path.getsize(output_path)} bytes | "
              f"耗时: {time.time() - compressor.start_time:.2f}s")
    except asyncio.CancelledError:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务 {task_id} 被取消")
        if os.path.exists(output_path):
            os.remove(output_path)
        raise
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 任务 {task_id} 压缩失败: {str(e)}")
        # 通知客户端压缩失败
        for ws in active_connections.values():
            await send_compression_progress(ws, {
                'type': 'error',
                'message': str(e)
            })
    finally:
        # 清理任务相关资源
        await asyncio.sleep(300)  # 保留5分钟历史记录
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
