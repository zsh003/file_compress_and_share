import os
from sqlalchemy import create_engine
from models import Base
from database import SQLALCHEMY_DATABASE_URL

def init_db():
    # 如果数据库文件已存在，先删除它
    db_path = os.path.join(os.path.dirname(__file__), "sql_app.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    
    # 创建数据库引擎
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    
    # 创建所有表
    Base.metadata.create_all(bind=engine)
    print("数据库初始化完成！")

if __name__ == "__main__":
    init_db() 