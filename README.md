# 基于LZ77与哈夫曼编码的文件压缩分享系统

这是一个基于LZ77算法和哈夫曼编码的文件压缩分享系统，使用FastAPI作为后端，React和Ant Design作为前端。

## 功能特点

- 支持LZ77和哈夫曼编码两种压缩算法
- 文件上传和压缩
- 压缩文件下载
- 美观的用户界面

## 系统要求

- Python 3.7+
- Node.js 14+
- npm 6+

## 安装步骤

### 后端设置

1. 创建并激活虚拟环境：
```bash
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 运行后端服务器：
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 前端设置

1. 安装依赖：
```bash
cd frontend
npm install
```

2. 运行开发服务器：
```bash
npm start
```

## 使用说明

1. 打开浏览器访问 http://localhost:3000
2. 选择压缩算法（LZ77或哈夫曼编码）
3. 点击"选择文件"上传要压缩的文件
4. 等待压缩完成后，点击"下载压缩文件"获取压缩后的文件

## 技术栈

- 后端：FastAPI
- 前端：React + Ant Design
- 压缩算法：LZ77、哈夫曼编码
- 文件处理：Python标准库
- HTTP客户端：Axios

## 注意事项

- 确保后端服务器在8000端口运行
- 确保前端开发服务器在3000端口运行
- 大文件压缩可能需要较长时间，请耐心等待 