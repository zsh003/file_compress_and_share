from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import os
import shutil
import uuid
import random
import string
from compression import LZ77Compressor, HuffmanCompressor, ZipCompressor, CombinedCompressor
from database import SessionLocal, engine
import models
import auth

def generate_test_file(filename, size):
    """生成测试文件"""
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    
    # 生成指定大小的随机文本文件
    with open(filepath, 'w') as f:
        chars = string.ascii_letters + string.digits
        for _ in range(size // 100):
            f.write(''.join(random.choice(chars) for _ in range(100)))
            f.write('\n')
    
    return filepath

async def compress_file(input_path, algorithm):
    """使用指定算法压缩文件"""
    compressed_dir = "compressed"
    os.makedirs(compressed_dir, exist_ok=True)
    filename = os.path.basename(input_path)
    output_path = os.path.join(compressed_dir, f"{filename}.compressed")
    
    if algorithm == "lz77":
        compressor = LZ77Compressor()
    elif algorithm == "huffman":
        compressor = HuffmanCompressor()
    elif algorithm == "zip":
        compressor = ZipCompressor()
    elif algorithm == "combined":
        compressor = CombinedCompressor()
    else:
        raise ValueError(f"不支持的算法: {algorithm}")
    
    print(f"正在使用 {algorithm} 算法压缩文件 {filename}...")
    await compressor.compress(input_path, output_path)
    print(f"压缩完成: {output_path}")
    
    return output_path

async def init_test_data():
    db = SessionLocal()
    try:
        # 清空现有数据
        db.query(models.FileShare).delete()
        db.query(models.File).delete()
        db.query(models.User).delete()
        db.commit()

        # 清空文件目录
        for directory in ["uploads", "compressed", "decompressed", "shared"]:
            if os.path.exists(directory):
                shutil.rmtree(directory)
                os.makedirs(directory)

        # 创建测试用户
        test_users = [
            {"username": "admin", "password": "123456"},
            {"username": "test", "password": "123456"},
            {"username": "demo", "password": "123456"}
        ]

        created_users = {}
        for user_data in test_users:
            user = models.User(
                username=user_data["username"],
                hashed_password=auth.get_password_hash(user_data["password"])
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            created_users[user.username] = user
            print(f"创建用户: {user.username}")

        # 创建测试文件
        test_files = [
            {
                "filename": "test1.txt",
                "size": 1024,
                "algorithm": "zip",
                "owner": created_users["admin"],
                "encrypted": True,
                "encryption_key": "XYZ123abc456def789"
            },
            {
                "filename": "test2.txt",
                "size": 2048,
                "algorithm": "lz77",
                "owner": created_users["admin"],
                "encrypted": False,
                "encryption_key": None
            },
            {
                "filename": "test3.txt",
                "size": 3072,
                "algorithm": "combined",
                "owner": created_users["admin"],
                "encrypted": True,
                "encryption_key": "SecureKey123456789"
            },
            {
                "filename": "test4.txt",
                "size": 4096,
                "algorithm": "huffman",
                "owner": created_users["admin"],
                "encrypted": False,
                "encryption_key": None
            },
            {
                "filename": "test5.txt",
                "size": 5120,
                "algorithm": "huffman",
                "owner": created_users["test"],
                "encrypted": True,
                "encryption_key": "TestEncryptKey9876"
            },
            {
                "filename": "test6.txt",
                "size": 6144,
                "algorithm": "combined",
                "owner": created_users["test"],
                "encrypted": False,
                "encryption_key": None
            },
            {
                "filename": "test7.txt",
                "size": 7168,
                "algorithm": "zip",
                "owner": created_users["demo"],
                "encrypted": True,
                "encryption_key": "DemoSecretKey54321"
            },
        ]

        created_files = []
        for file_data in test_files:
            # 生成测试文件
            file_path = generate_test_file(file_data["filename"], file_data["size"])
            original_size = os.path.getsize(file_path)
            
            # 压缩文件
            compressed_path = await compress_file(file_path, file_data["algorithm"])
            compressed_size = os.path.getsize(compressed_path)
            
            # 计算压缩比
            compression_ratio = ((original_size - compressed_size) / original_size) * 100
            
            # 创建文件记录
            file = models.File(
                filename=file_data["filename"],
                original_size=original_size,
                compressed_size=compressed_size,
                compression_ratio=compression_ratio,
                algorithm=file_data["algorithm"],
                owner_id=file_data["owner"].id,
                encryption_key=file_data["encryption_key"]
            )
            db.add(file)
            db.commit()
            db.refresh(file)
            created_files.append(file)
            print(f"创建文件记录: {file.filename}, 加密: {'是' if file_data['encrypted'] else '否'}")

        # 创建测试分享记录
        test_shares = [
            {
                "file": created_files[0],
                "is_password_protected": True,
                "password": "share123",
                "max_downloads": 5,
                "expiration_hours": 24
            },
            {
                "file": created_files[1],
                "is_password_protected": False,
                "password": None,
                "max_downloads": -1,
                "expiration_hours": 48
            },
            {
                "file": created_files[2],
                "is_password_protected": True,
                "password": "test456",
                "max_downloads": 10,
                "expiration_hours": 72
            }
        ]

        for share_data in test_shares:
            share_id = str(uuid.uuid4())
            
            # 创建分享记录
            share = models.FileShare(
                share_id=share_id,
                file_id=share_data["file"].id,
                password=share_data["password"],
                expires_at=datetime.utcnow() + timedelta(hours=share_data["expiration_hours"]),
                max_downloads=share_data["max_downloads"],
                current_downloads=0,
                is_password_protected=share_data["is_password_protected"]
            )
            db.add(share)
            db.commit()
            db.refresh(share)
            
            # 创建分享目录和复制文件
            share_dir = os.path.join("shared", share_id)
            os.makedirs(share_dir, exist_ok=True)
            
            # 复制压缩后的文件到分享目录
            source_path = os.path.join("compressed", f"{share_data['file'].filename}.compressed")
            target_path = os.path.join(share_dir, f"{share_data['file'].filename}.compressed")
            shutil.copy2(source_path, target_path)
            
            print(f"创建分享记录: {share_id} (文件: {share_data['file'].filename}), 密码: {share_data['password']}")

        print("\n初始数据创建完成！")
        print("\n测试账户信息：")
        for user in test_users:
            print(f"用户名: {user['username']}, 密码: {user['password']}")

    except Exception as e:
        print(f"初始化数据时出错: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    import asyncio
    # 确保数据库表存在
    models.Base.metadata.create_all(bind=engine)
    # 初始化测试数据
    asyncio.run(init_test_data()) 