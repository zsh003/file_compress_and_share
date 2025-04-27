from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
import auth
import uuid

def init_test_data():
    db = SessionLocal()
    try:
        # 清空现有数据
        db.query(models.FileShare).delete()
        db.query(models.File).delete()
        db.query(models.User).delete()
        db.commit()

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

        # 创建测试文件记录
        test_files = [
            {
                "filename": "test1.txt",
                "original_size": 1024,
                "compressed_size": 1022,
                "algorithm": "zip",
                "owner": created_users["admin"]
            },
            {
                "filename": "test2.txt",
                "original_size": 2048,
                "compressed_size": 2044,
                "algorithm": "lz77",
                "owner": created_users["admin"]
            },
            {
                "filename": "test3.txt",
                "original_size": 2048,
                "compressed_size": 2000,
                "algorithm": "combined",
                "owner": created_users["admin"]
            },
            {
                "filename": "test4.txt",
                "original_size": 4096,
                "compressed_size": 4092,
                "algorithm": "huffman",
                "owner": created_users["test"]
            }
        ]

        created_files = []
        for file_data in test_files:
            compression_ratio = ((file_data["original_size"] - file_data["compressed_size"]) 
                               / file_data["original_size"]) * 100
            file = models.File(
                filename=file_data["filename"],
                original_size=file_data["original_size"],
                compressed_size=file_data["compressed_size"],
                compression_ratio=compression_ratio,
                algorithm=file_data["algorithm"],
                owner_id=file_data["owner"].id
            )
            db.add(file)
            db.commit()
            db.refresh(file)
            created_files.append(file)
            print(f"创建文件记录: {file.filename}")

        # 创建测试分享记录
        test_shares = [
            {
                "file": created_files[0],
                "is_password_protected": True,
                "max_downloads": 5,
                "expiration_hours": 24
            },
            {
                "file": created_files[1],
                "is_password_protected": False,
                "max_downloads": -1,
                "expiration_hours": 48
            }
        ]

        for share_data in test_shares:
            share = models.FileShare(
                share_id=str(uuid.uuid4()),
                file_id=share_data["file"].id,
                password=auth.get_password_hash("share123") if share_data["is_password_protected"] else None,
                expires_at=datetime.utcnow() + timedelta(hours=share_data["expiration_hours"]),
                max_downloads=share_data["max_downloads"],
                current_downloads=0,
                is_password_protected=share_data["is_password_protected"]
            )
            db.add(share)
            db.commit()
            db.refresh(share)
            print(f"创建分享记录: {share.share_id} (文件: {share_data['file'].filename})")

        print("\n初始数据创建完成！")
        print("\n测试账户信息：")
        for user in test_users:
            print(f"用户名: {user['username']}, 密码: {user['password']}")

    except Exception as e:
        print(f"初始化数据时出错: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    # 确保数据库表存在
    models.Base.metadata.create_all(bind=engine)
    # 初始化测试数据
    init_test_data() 