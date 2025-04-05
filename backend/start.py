import os
import sys
import uvicorn
from init_db import init_db
from init_data import init_test_data

# 添加项目根目录到 Python 路径
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

if __name__ == "__main__":
    # 初始化数据库
    init_db()
    
    # 初始化测试数据
    init_test_data()
    
    # 启动服务器
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[current_dir]
    ) 