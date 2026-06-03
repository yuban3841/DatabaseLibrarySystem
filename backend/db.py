"""数据库连接管理 — 基于 pyodbc (支持 Windows Auth)"""
import re
import pyodbc
from contextlib import contextmanager

CONN_STR = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=.\SQLEXPRESS;"
    "DATABASE=LibraryDB;"
    "Trusted_Connection=yes;"
)


def _convert_placeholders(sql: str) -> str:
    """将 %s 占位符转换为 pyodbc 的 ? 占位符
    注意：不转换 LIKE 中的 %，只转换独立的 %s"""
    return re.sub(r"(?<!%%)%s(?![\w])", "?", sql)


class Database:
    """数据库操作封装"""

    @contextmanager
    def get_connection(self):
        conn = pyodbc.connect(CONN_STR)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def execute_query(self, sql: str, params: tuple = None) -> list[dict]:
        """执行查询，返回字典列表"""
        sql = _convert_placeholders(sql)
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            columns = [col[0] for col in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]

    def execute_one(self, sql: str, params: tuple = None) -> dict | None:
        """执行查询，返回单条记录"""
        rows = self.execute_query(sql, params)
        return rows[0] if rows else None

    def execute_update(self, sql: str, params: tuple = None) -> int:
        """执行增删改，返回影响行数"""
        sql = _convert_placeholders(sql)
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            return cursor.rowcount

    def execute_proc(self, proc_name: str, params: dict = None) -> list[dict]:
        """调用存储过程，返回结果"""
        placeholders = ",".join(["?"] * len(params or {}))
        sql = f"EXEC {proc_name} {placeholders}"
        vals = tuple((params or {}).values())
        return self.execute_query(sql, vals)

    def execute_proc_raw(self, proc_name: str, params: dict = None):
        """调用存储过程，不返回结果"""
        placeholders = ",".join(["?"] * len(params or {}))
        sql = f"EXEC {proc_name} {placeholders}"
        vals = tuple((params or {}).values())
        self.execute_update(sql, vals)

    def execute_raw(self, sql: str):
        """执行原始SQL（多条语句）"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql)
            conn.commit()


db = Database()
