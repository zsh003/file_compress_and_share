import sqlite3
from sqlalchemy import create_engine, text

def add_encryption_key_column():
    print("正在更新数据库结构...")
    
    # 方法1：使用SQLite直接连接
    try:
        conn = sqlite3.connect('sql_app.db')
        cursor = conn.cursor()
        
        # 检查列是否已存在
        cursor.execute("PRAGMA table_info(files)")
        columns = cursor.fetchall()
        column_names = [column[1] for column in columns]
        
        if 'encryption_key' not in column_names:
            print("添加 encryption_key 列到 files 表...")
            cursor.execute("ALTER TABLE files ADD COLUMN encryption_key TEXT")
            conn.commit()
            print("列添加成功！")
        else:
            print("encryption_key 列已存在，无需修改")
            
        conn.close()
        return True
    except Exception as e:
        print(f"使用SQLite更新失败: {str(e)}")
        
        # 尝试方法2
        try:
            # 使用SQLAlchemy引擎
            engine = create_engine('sqlite:///sql_app.db')
            with engine.connect() as connection:
                # 检查列是否存在
                result = connection.execute(text("PRAGMA table_info(files)"))
                columns = result.fetchall()
                column_names = [column[1] for column in columns]
                
                if 'encryption_key' not in column_names:
                    print("使用SQLAlchemy添加 encryption_key 列...")
                    connection.execute(text("ALTER TABLE files ADD COLUMN encryption_key TEXT"))
                    connection.commit()
                    print("列添加成功！")
                else:
                    print("encryption_key 列已存在，无需修改")
                    
            return True
        except Exception as e2:
            print(f"使用SQLAlchemy更新也失败: {str(e2)}")
            return False

if __name__ == "__main__":
    success = add_encryption_key_column()
    if success:
        print("数据库更新完成！")
    else:
        print("数据库更新失败！") 