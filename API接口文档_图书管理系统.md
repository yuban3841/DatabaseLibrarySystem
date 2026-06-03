# 图书管理系统 — 前后端接口说明文件

> **文档类型：** Python前后端接口说明文件（交接用）  
> **版本：** v1.0  
> **编制日期：** 2026-06-03  
> **数据库：** SQL Server — library_system（17张表 + 5个视图 + 3个存储过程 + 3个触发器）  
> **后端框架：** Flask / FastAPI（Python 3.10+）  
> **前端框架：** Vue 3 / React

---

## 目录

1. [技术栈与架构](#1-技术栈与架构)
2. [安全规范（必读）](#2-安全规范必读)
3. [数据库连接配置](#3-数据库连接配置)
4. [通用约定](#4-通用约定)
5. [接口清单总览](#5-接口清单总览)
6. [1. 认证模块 /auth](#6-1-认证模块-auth)
7. [2. 读者管理模块 /api/readers](#7-2-读者管理模块-apireaders)
8. [3. 图书管理模块 /api/books](#8-3-图书管理模块-apibooks)
9. [4. 借阅管理模块 /api/borrow](#9-4-借阅管理模块-apiborrow)
10. [5. 预约管理模块 /api/reservations](#10-5-预约管理模块-apireservations)
11. [6. 罚款管理模块 /api/fines](#11-6-罚款管理模块-apifines)
12. [7. 查询统计模块 /api/statistics](#12-7-查询统计模块-apistatistics)
13. [8. 系统管理模块 /api/admin](#13-8-系统管理模块-apiadmin)
14. [9. 报表模块 /api/reports](#14-9-报表模块-apireports)
15. [10. 操作日志模块 /api/logs](#15-10-操作日志模块-apilogs)
16. [附录A：后端核心代码骨架](#附录a后端核心代码骨架)
17. [附录B：前端调用示例](#附录b前端调用示例)

---

## 1. 技术栈与架构

```
┌──────────────┐     HTTPS/JSON      ┌──────────────────┐     pymssql/ODBC      ┌──────────────┐
│  前端 (Web)   │ ◄──────────────────► │  后端 (Python)    │ ◄───────────────────► │  SQL Server   │
│  Vue/React    │    axios / fetch    │  Flask / FastAPI  │  参数化查询 + 事务    │  library_sys  │
└──────────────┘                     └──────────────────┘                      └──────────────┘
```

| 层 | 技术选型 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Element Plus / React + Ant Design | SPA 单页应用 |
| 后端 | Python 3.10+ / Flask 或 FastAPI | RESTful API |
| 数据库 | SQL Server (已建库 `library_system`) | 17张表，含触发器/存储过程 |
| 认证 | JWT (PyJWT) + bcrypt 密码哈希 | Token 有效期 2h，支持 refresh |
| 传输 | HTTPS + TLS 1.2+ | 全站加密传输 |
| 防注入 | 参数化查询（100% 禁用字符串拼接） | pymssql 占位符 `%s` / `%(name)s` |

---

## 2. 安全规范（必读）

### 2.1 SQL 注入防护 — 铁律

> **绝对禁止使用字符串拼接、f-string、`format()`、`%` 运算符拼接 SQL。**

正确做法（参数化查询）：

```python
# ✅ 正确：使用参数化查询（pymssql）
cursor.execute(
    "SELECT reader_id, name, phone FROM reader WHERE reader_id = %s AND status = %s",
    (reader_id, status)
)

# ✅ 正确：使用命名参数（pymssql）
cursor.execute(
    "SELECT * FROM book WHERE title LIKE %(title)s AND category_id = %(cat_id)s",
    {"title": f"%{keyword}%", "cat_id": category_id}
)

# ❌ 错误：字符串拼接（绝对禁止！）
cursor.execute(f"SELECT * FROM reader WHERE reader_id = '{reader_id}'")  # SQL注入风险！

# ❌ 错误：format 拼接（绝对禁止！）
cursor.execute("SELECT * FROM book WHERE title = '{}'".format(title))    # SQL注入风险！
```

**动态排序/分组字段白名单校验**（排序字段无法参数化时）：

```python
# ✅ 正确：白名单校验后再拼接
ALLOWED_SORT_COLUMNS = {"book_id", "title", "author", "publish_date", "price"}
ALLOWED_SORT_DIRECTIONS = {"ASC", "DESC"}

def get_books_sorted(sort_by: str, order: str = "ASC"):
    if sort_by not in ALLOWED_SORT_COLUMNS:
        raise ValueError(f"非法的排序字段: {sort_by}")
    if order.upper() not in ALLOWED_SORT_DIRECTIONS:
        raise ValueError(f"非法的排序方向: {order}")
    # 白名单通过后才拼接（安全，因为值已被限定）
    sql = f"SELECT * FROM book ORDER BY {sort_by} {order.upper()}"
    cursor.execute(sql)  # 此时 sort_by 和 order 已通过白名单校验
```

### 2.2 密码安全

```python
import bcrypt

# 注册/修改密码：生成哈希
def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)  # 至少12轮
    return bcrypt.hashpw(plain_password.encode('utf-8'), salt).decode('utf-8')

# 登录验证：比对哈希
def verify_password(plain_password: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed.encode('utf-8'))
```

### 2.3 JWT Token 认证

```python
import jwt
from datetime import datetime, timedelta

SECRET_KEY = "your-secret-key-change-in-production"  # 生产环境从环境变量读取
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120  # 2小时

def create_access_token(admin_id: int, role: str) -> str:
    payload = {
        "admin_id": admin_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
```

### 2.4 请求频率限制（防暴力破解）

```python
# 登录接口：同一IP每分钟最多5次尝试
# 使用 Flask-Limiter 或手写内存计数
from functools import wraps
from collections import defaultdict
import time

login_attempts = defaultdict(list)  # {ip: [timestamp1, timestamp2, ...]}

def rate_limit_login(max_attempts=5, window_seconds=60):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr
            now = time.time()
            # 清理过期记录
            login_attempts[ip] = [t for t in login_attempts[ip] if now - t < window_seconds]
            if len(login_attempts[ip]) >= max_attempts:
                return {"code": 429, "message": "登录尝试过于频繁，请稍后再试"}, 429
            login_attempts[ip].append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator
```

### 2.5 输入校验

所有用户输入必须在后端进行二次校验（前端校验仅提升体验，不可依赖）：

```python
import re

def validate_reader_id(reader_id: str) -> bool:
    """读者编号：字母数字，1-20位"""
    return bool(re.match(r'^[A-Za-z0-9]{1,20}$', reader_id))

def validate_phone(phone: str) -> bool:
    """手机号：11位数字"""
    return bool(re.match(r'^\d{11}$', phone))

def validate_isbn(isbn: str) -> bool:
    """ISBN：10或13位"""
    return bool(re.match(r'^[\d-]{10,17}$', isbn))

def validate_price(price: float) -> bool:
    """价格：>= 0，最多2位小数"""
    return price >= 0 and round(price, 2) == price

# XSS 防护：转义 HTML 特殊字符
from html import escape

def sanitize_input(value: str) -> str:
    """对用户输入的字符串进行基本清理"""
    if value is None:
        return None
    return escape(value.strip())
```

---

## 3. 数据库连接配置

```python
# config.py
import os

DB_CONFIG = {
    "server": os.getenv("DB_SERVER", "localhost"),
    "port": os.getenv("DB_PORT", "1433"),
    "database": os.getenv("DB_NAME", "library_system"),
    "user": os.getenv("DB_USER", "librarian_user"),
    "password": os.getenv("DB_PASSWORD", ""),  # 生产环境从环境变量读取
    "charset": "UTF-8",
    "autocommit": False,  # 手动事务控制
    "as_dict": True,      # 返回字典格式
}

# 后端对不同角色使用不同的数据库连接账号（最小权限原则）
DB_CONFIG_BY_ROLE = {
    "system_admin": {**DB_CONFIG, "user": "sys_admin_user"},
    "librarian":    {**DB_CONFIG, "user": "librarian_user"},
    "reader_app":   {**DB_CONFIG, "user": "reader_app_user"},
}
```

```python
# db.py — 数据库连接池
import pymssql
from contextlib import contextmanager

class DatabasePool:
    """简易连接池（生产环境推荐使用 SQLAlchemy + pymssql 或 aiomysql）"""
    
    def __init__(self, config: dict):
        self.config = config
    
    @contextmanager
    def get_connection(self):
        """获取数据库连接，自动管理事务和关闭"""
        conn = pymssql.connect(**self.config)
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
        with self.get_connection() as conn:
            cursor = conn.cursor(as_dict=True)
            cursor.execute(sql, params or ())
            return cursor.fetchall()
    
    def execute_update(self, sql: str, params: tuple = None) -> int:
        """执行增删改，返回影响行数"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params or ())
            return cursor.rowcount
    
    def execute_proc(self, proc_name: str, params: dict = None) -> list[dict]:
        """调用存储过程"""
        with self.get_connection() as conn:
            cursor = conn.cursor(as_dict=True)
            cursor.callproc(proc_name, params or ())
            return cursor.fetchall()

# 全局实例
db = DatabasePool(DB_CONFIG)
```

---

## 4. 通用约定

### 4.1 请求格式

| 项目 | 约定 |
|---|---|
| Content-Type | `application/json; charset=utf-8` |
| 认证方式 | Header: `Authorization: Bearer <jwt_token>` |
| 日期格式 | `YYYY-MM-DD` (date), `YYYY-MM-DD HH:MM:SS` (datetime) |

### 4.2 响应格式

所有接口统一返回 JSON：

```json
{
    "code": 200,
    "message": "success",
    "data": { ... },
    "page": { "page": 1, "page_size": 20, "total": 156 }
}
```

**HTTP 状态码约定：**

| 状态码 | 含义 |
|---|---|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 过期 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 业务冲突（如重复预约） |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

### 4.3 分页约定

分页请求参数：`?page=1&page_size=20`

分页响应格式：

```json
{
    "code": 200,
    "message": "success",
    "data": [ ... ],
    "page": {
        "page": 1,
        "page_size": 20,
        "total": 156,
        "total_pages": 8
    }
}
```

---

## 5. 接口清单总览

| 模块 | 前缀 | 接口数量 | 权限要求 |
|---|---|---|---|
| 认证 | `/auth` | 4 | 无（登录）/ 已登录（登出/刷新） |
| 读者管理 | `/api/readers` | 8 | 图书管理员及以上 |
| 图书管理 | `/api/books` | 8 | 图书管理员及以上 |
| 借阅管理 | `/api/borrow` | 5 | 图书管理员及以上 |
| 预约管理 | `/api/reservations` | 5 | 图书管理员及以上 |
| 罚款管理 | `/api/fines` | 4 | 图书管理员及以上 |
| 查询统计 | `/api/statistics` | 7 | 图书管理员及以上 |
| 系统管理 | `/api/admin` | 10 | 系统管理员 |
| 报表 | `/api/reports` | 6 | 图书管理员及以上 |
| 操作日志 | `/api/logs` | 2 | 系统管理员 |

---

## 6. 1. 认证模块 /auth

### 6.1 管理员登录

```
POST /auth/login
```

**描述：** 管理员使用账号密码登录，成功返回 JWT Token。

**安全说明：**
- 密码使用 bcrypt 哈希比对，不存储明文
- 传输必须走 HTTPS，密码在请求体中加密传输
- 登录失败记录到操作日志表，同一IP 5次/分钟限流
- 成功登录后更新 `admin.last_login_time`

**请求体：**

```json
{
    "username": "admin01",
    "password": "MySecureP@ss123"
}
```

**请求校验规则：**
| 字段 | 类型 | 必填 | 校验规则 |
|---|---|---|---|
| username | string | 是 | 1-30字符，字母数字下划线 |
| password | string | 是 | 6-100字符 |

**后端处理逻辑：**

```
1. 接收 username, password, client_ip（从 request.remote_addr 获取）
2. 限流检查：同一IP在60秒内最多5次尝试
3. 参数化查询：SELECT admin_id, username, password_hash, name, role, status FROM admin WHERE username = %s
4. 校验管理员状态 status == 'active'
5. bcrypt.verify(password, password_hash)
6. 验证通过：
   a. 生成 JWT Token (payload: admin_id, role, exp=2h)
   b. 更新 last_login_time: UPDATE admin SET last_login_time = GETDATE() WHERE admin_id = %s
   c. 写入操作日志: INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', '登录成功', %s)
7. 验证失败：
   a. 写入操作日志: INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (NULL, '认证', '登录失败:'+username, %s)
   b. 返回 401
```

**成功响应 (200)：**

```json
{
    "code": 200,
    "message": "登录成功",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "token_type": "Bearer",
        "expires_in": 7200,
        "admin": {
            "admin_id": 1,
            "username": "admin01",
            "name": "张三",
            "role": "system_admin"
        },
        "permissions": [
            {"module_code": "读者管理", "permission_level": "manage"},
            {"module_code": "图书管理", "permission_level": "manage"},
            {"module_code": "借阅管理", "permission_level": "manage"},
            {"module_code": "系统管理", "permission_level": "manage"},
            {"module_code": "报表", "permission_level": "manage"}
        ]
    }
}
```

**失败响应 (401)：**

```json
{
    "code": 401,
    "message": "账号或密码错误，剩余尝试次数: 3",
    "data": null
}
```

---

### 6.2 获取当前用户信息

```
GET /auth/me
```

**请求头：** `Authorization: Bearer <token>`

**后端逻辑：**
```
1. 从 JWT 解析 admin_id
2. 参数化查询：SELECT * FROM admin WHERE admin_id = %s
3. 关联查询权限：SELECT * FROM permission_config WHERE role = %s AND status = 'active'
```

**成功响应 (200)：** 同 6.1 中 `admin` + `permissions` 字段。

---

### 6.3 Token 刷新

```
POST /auth/refresh
```

**请求头：** `Authorization: Bearer <token>`（允许使用即将过期的 token）

**响应：** 返回新的 token。

---

### 6.4 登出

```
POST /auth/logout
```

**请求头：** `Authorization: Bearer <token>`

**后端逻辑：**
```
1. 解析 JWT 获取 admin_id
2. 写入操作日志：INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', '登出', %s)
3. 前端清除本地 token
```

---

## 7. 2. 读者管理模块 /api/readers

> 所有接口需要 `Authorization: Bearer <token>`（下同，不再重复说明）

### 7.1 查询读者列表

```
GET /api/readers?page=1&page_size=20&keyword=张三&reader_type_id=1&status=normal&department=计算机学院
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| page | int | 否 | 页码，默认1 |
| page_size | int | 否 | 每页条数，默认20，最大100 |
| keyword | string | 否 | 按读者编号或姓名模糊搜索 |
| reader_type_id | int | 否 | 按读者类别筛选 |
| status | string | 否 | 按状态筛选：normal/lost/cancelled |
| department | string | 否 | 按院系模糊搜索 |

**后端逻辑（防注入要点）：**

```python
# ✅ 正确的参数化查询构建方式
def query_readers(page, page_size, keyword, reader_type_id, status, department):
    conditions = []
    params = []

    if keyword:
        conditions.append("(r.reader_id LIKE %s OR r.name LIKE %s)")
        kw = f"%{keyword}%"
        params.extend([kw, kw])

    if reader_type_id is not None:
        conditions.append("r.reader_type_id = %s")
        params.append(reader_type_id)

    if status:
        # 白名单校验
        if status not in ("normal", "lost", "cancelled"):
            raise ValueError("非法的状态值")
        conditions.append("r.status = %s")
        params.append(status)

    if department:
        conditions.append("r.department LIKE %s")
        params.append(f"%{department}%")

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    count_sql = f"SELECT COUNT(*) AS total FROM reader r WHERE {where_clause}"
    data_sql = f"""
        SELECT r.*, rt.type_name, rt.max_borrow_count, rt.borrow_days, rt.max_renew_count
        FROM reader r
        LEFT JOIN reader_type rt ON r.reader_type_id = rt.reader_type_id
        WHERE {where_clause}
        ORDER BY r.reg_date DESC
        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
    """
    # NOTE: where_clause 仅由参数化条件拼接，不含任何用户直接输入的值
    params_count = params.copy()
    params_data = params + [page_size, (page - 1) * page_size]
    # ... 执行查询
```

> **关键点：** `where_clause` 中所有用户输入的值都通过 `%s` 占位符传递，条件本身是硬编码的。排序字段如需用户指定，必须使用白名单校验。

**成功响应 (200)：**

```json
{
    "code": 200,
    "data": [
        {
            "reader_id": "R001",
            "name": "张三",
            "gender": "M",
            "phone": "13800138000",
            "department": "计算机学院",
            "reader_type_id": 1,
            "type_name": "本科生",
            "status": "normal",
            "reg_date": "2025-09-01",
            "max_borrow_count": 10,
            "borrow_days": 30,
            "max_renew_count": 2,
            "current_borrow_count": 3
        }
    ],
    "page": {"page": 1, "page_size": 20, "total": 156, "total_pages": 8}
}
```

---

### 7.2 查询单个读者详情

```
GET /api/readers/{reader_id}
```

**后端逻辑：**

```python
# 参数化查询，reader_id 来自 URL 路径
sql = """
    SELECT r.*, rt.type_name, rt.max_borrow_count, rt.borrow_days, rt.max_renew_count
    FROM reader r
    LEFT JOIN reader_type rt ON r.reader_type_id = rt.reader_type_id
    WHERE r.reader_id = %s
"""
result = db.execute_query(sql, (reader_id,))

# 附加查询：当前借阅情况
borrow_sql = """
    SELECT br.record_id, b.book_id, b.title, br.borrow_date, br.due_date, br.renew_count
    FROM borrow_record br
    JOIN book b ON br.book_id = b.book_id
    WHERE br.reader_id = %s AND br.status = 'borrowed'
"""
current_borrows = db.execute_query(borrow_sql, (reader_id,))
```

---

### 7.3 新增读者

```
POST /api/readers
```

**请求体：**

```json
{
    "reader_id": "R100",
    "name": "李四",
    "gender": "M",
    "phone": "13900139000",
    "department": "数学学院",
    "reader_type_id": 2
}
```

**后端校验：**

```python
def validate_create_reader(data: dict):
    errors = []
    if not validate_reader_id(data.get("reader_id", "")):
        errors.append("读者编号格式错误（仅允许字母数字，1-20位）")
    if not data.get("name") or len(data["name"]) > 50:
        errors.append("姓名必填且不超过50字符")
    if data.get("gender") and data["gender"] not in ("M", "F"):
        errors.append("性别仅允许 M 或 F")
    if data.get("phone") and not validate_phone(data["phone"]):
        errors.append("手机号格式错误")
    if data.get("reader_type_id"):
        # 验证类别存在
        exists = db.execute_query(
            "SELECT 1 FROM reader_type WHERE reader_type_id = %s",
            (data["reader_type_id"],)
        )
        if not exists:
            errors.append("读者类别不存在")
    return errors
```

**后端SQL（参数化）：**

```python
sql = """
    INSERT INTO reader (reader_id, name, gender, phone, department, reader_type_id, status, reg_date)
    VALUES (%s, %s, %s, %s, %s, %s, 'normal', GETDATE())
"""
db.execute_update(sql, (data["reader_id"], data["name"], data.get("gender"),
                         data.get("phone"), data.get("department"), data.get("reader_type_id")))
```

**成功响应 (201)：** 返回新创建的读者完整信息。

---

### 7.4 修改读者信息

```
PUT /api/readers/{reader_id}
```

**请求体（部分字段可选）：**

```json
{
    "name": "李四改",
    "phone": "13900139001",
    "department": "物理学院",
    "reader_type_id": 3
}
```

**后端逻辑（只更新传入的字段）：**

```python
def update_reader(reader_id: str, data: dict):
    ALLOWED_FIELDS = {"name", "phone", "department", "reader_type_id"}
    set_clauses = []
    params = []

    for field in ALLOWED_FIELDS:
        if field in data and data[field] is not None:
            set_clauses.append(f"{field} = %s")  # field 是白名单中的硬编码值，安全
            params.append(data[field])

    if not set_clauses:
        return {"code": 400, "message": "无可更新字段"}

    params.append(reader_id)
    sql = f"UPDATE reader SET {', '.join(set_clauses)} WHERE reader_id = %s"
    db.execute_update(sql, tuple(params))

    # 记录操作日志
    log_sql = "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '读者管理', %s, %s)"
    db.execute_update(log_sql, (current_admin_id, f"修改读者:{reader_id}", client_ip))
```

---

### 7.5 更新读者状态（挂失/注销/恢复）

```
PATCH /api/readers/{reader_id}/status
```

**请求体：**

```json
{
    "status": "lost"
}
```

**后端逻辑：**

```python
def update_reader_status(reader_id, new_status, admin_id, client_ip):
    # 白名单校验状态值
    if new_status not in ("normal", "lost", "cancelled"):
        return {"code": 400, "message": "非法的状态值"}

    # 检查约束：若改为 cancelled，需确认无未还图书和未缴罚款
    if new_status == "cancelled":
        has_unreturned = db.execute_query(
            "SELECT COUNT(*) AS cnt FROM borrow_record WHERE reader_id = %s AND status = 'borrowed'",
            (reader_id,)
        )[0]["cnt"]
        if has_unreturned > 0:
            return {"code": 409, "message": "该读者存在未归还图书，无法注销"}

        has_unpaid = db.execute_query(
            "SELECT COUNT(*) AS cnt FROM fine_record WHERE reader_id = %s AND paid_status = 0",
            (reader_id,)
        )[0]["cnt"]
        if has_unpaid > 0:
            return {"code": 409, "message": "该读者存在未缴罚款，无法注销"}

    sql = "UPDATE reader SET status = %s WHERE reader_id = %s"
    db.execute_update(sql, (new_status, reader_id))

    # 记录操作日志
    log_action = f"{'挂失' if new_status == 'lost' else '注销' if new_status == 'cancelled' else '恢复'}读者:{reader_id}"
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '读者管理', %s, %s)",
        (admin_id, log_action, client_ip)
    )
```

---

### 7.6 查询读者类别列表

```
GET /api/readers/types
```

**后端SQL：**

```python
sql = "SELECT * FROM reader_type ORDER BY reader_type_id"
```

---

### 7.7 新增/修改读者类别

```
POST /api/readers/types          # 新增
PUT  /api/readers/types/{type_id} # 修改
```

**请求体：**

```json
{
    "type_name": "研究生",
    "max_borrow_count": 15,
    "borrow_days": 60,
    "max_renew_count": 3
}
```

**后端校验：**
- `type_name` 唯一，1-50字符
- `max_borrow_count` > 0
- `borrow_days` > 0
- `max_renew_count` >= 0

---

### 7.8 删除读者类别

```
DELETE /api/readers/types/{type_id}
```

**后端逻辑：**
- 检查是否有读者引用该类别
- 若有关联读者：`reader_type_id` 设置了 `ON DELETE SET NULL`，删除后自动置空
- 同时级联删除 `borrow_rule` 中对应规则

---

## 8. 3. 图书管理模块 /api/books

### 8.1 查询图书列表

```
GET /api/books?page=1&page_size=20&keyword=三体&category_id=1&status=in_library&author=刘慈欣&sort_by=title&order=ASC
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| keyword | string | 否 | 按书名/作者/ISBN模糊搜索 |
| category_id | int | 否 | 按分类筛选 |
| status | string | 否 | 状态：in_library/borrowed/reserved/damaged/lost/removed |
| author | string | 否 | 按作者模糊搜索 |
| publisher | string | 否 | 按出版社模糊搜索 |
| sort_by | string | 否 | 排序字段（白名单校验） |
| order | string | 否 | ASC/DESC |

**后端SQL（关键防注入部分）：**

```python
ALLOWED_SORT_BOOKS = {"book_id", "title", "author", "publish_date", "price"}
ALLOWED_STATUS_BOOKS = {"in_library", "borrowed", "reserved", "damaged", "lost", "removed"}

def query_books(params):
    conditions = []
    query_params = []

    if params.get("keyword"):
        conditions.append("(b.title LIKE %s OR b.author LIKE %s OR b.isbn LIKE %s)")
        kw = f"%{params['keyword']}%"
        query_params.extend([kw, kw, kw])

    if params.get("category_id"):
        conditions.append("b.category_id = %s")
        query_params.append(params["category_id"])

    if params.get("status"):
        if params["status"] not in ALLOWED_STATUS_BOOKS:
            raise ValueError("非法的状态值")
        conditions.append("b.status = %s")
        query_params.append(params["status"])

    # 排序字段白名单校验
    sort_by = params.get("sort_by", "book_id")
    if sort_by not in ALLOWED_SORT_BOOKS:
        raise ValueError(f"非法的排序字段: {sort_by}")
    order = params.get("order", "ASC").upper()
    if order not in ("ASC", "DESC"):
        raise ValueError(f"非法的排序方向: {order}")

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    sql = f"""
        SELECT b.*, bc.category_name,
               bi.total_count, bi.in_library_count, bi.borrowed_count,
               (SELECT COUNT(*) FROM reservation WHERE book_id = b.book_id AND status IN ('waiting','available')) AS reserved_count
        FROM book b
        LEFT JOIN book_category bc ON b.category_id = bc.category_id
        LEFT JOIN book_inventory bi ON b.book_id = bi.book_id
        WHERE {where_clause}
        ORDER BY b.{sort_by} {order}
        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
    """
    # NOTE: where_clause 不包含用户值，sort_by 和 order 已通过白名单校验
    query_params.extend([(params["page"]-1)*params["page_size"], params["page_size"]])
```

---

### 8.2 查询单个图书详情

```
GET /api/books/{book_id}
```

**返回：** 图书基本信息 + 库存信息 + 分类名称 + 当前借阅人（如已借出）+ 预约队列长度。

---

### 8.3 新增图书（入库）

```
POST /api/books
```

**请求体：**

```json
{
    "book_id": "B50001",
    "title": "三体",
    "author": "刘慈欣",
    "publisher": "重庆出版社",
    "publish_date": "2008-01-01",
    "category_id": 5,
    "isbn": "978-7-5366-9293-0",
    "price": 23.00,
    "initial_count": 5
}
```

**后端逻辑：**

```python
def create_book(data: dict, admin_id: int, client_ip: str):
    # 参数校验
    if not data.get("book_id") or not data.get("title"):
        return {"code": 400, "message": "图书编号和书名必填"}
    if data.get("price") is not None and data["price"] < 0:
        return {"code": 400, "message": "价格不能为负数"}

    initial_count = data.get("initial_count", 1)
    if initial_count <= 0:
        return {"code": 400, "message": "入库数量必须大于0"}

    # 事务：同时插入图书表和库存表
    with db.get_connection() as conn:
        cursor = conn.cursor()
        try:
            # 1. 插入图书
            cursor.execute("""
                INSERT INTO book (book_id, title, author, publisher, publish_date, category_id, isbn, price, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'in_library')
            """, (data["book_id"], data["title"], data.get("author"),
                  data.get("publisher"), data.get("publish_date"),
                  data.get("category_id"), data.get("isbn"), data.get("price")))

            # 2. 初始化库存
            cursor.execute("""
                INSERT INTO book_inventory (book_id, total_count, in_library_count, borrowed_count)
                VALUES (%s, %s, %s, 0)
            """, (data["book_id"], initial_count, initial_count))

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    # 记录操作日志
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '图书管理', %s, %s)",
        (admin_id, f"新增图书:{data['book_id']}", client_ip)
    )
```

---

### 8.4 修改图书信息

```
PUT /api/books/{book_id}
```

修改书名、作者、出版社、出版日期、分类、ISBN、价格等字段。

---

### 8.5 图书下架/状态变更

```
PATCH /api/books/{book_id}/status
```

**请求体：**

```json
{
    "status": "removed",
    "reason": "图书损坏严重，无法修复"
}
```

---

### 8.6 图书分类查询

```
GET /api/books/categories
```

---

### 8.7 新增/修改分类

```
POST /api/books/categories
PUT  /api/books/categories/{category_id}
```

---

### 8.8 图书库存调整

```
PUT /api/books/{book_id}/inventory
```

**请求体：**

```json
{
    "total_count": 10,
    "in_library_count": 7,
    "borrowed_count": 3,
    "reason": "年度盘点调整"
}
```

**后端校验：**
```python
# 必须满足 total_count = in_library_count + borrowed_count
if data["total_count"] != data["in_library_count"] + data["borrowed_count"]:
    return {"code": 400, "message": "库存数量不匹配：总量 = 在馆 + 借出"}
```

---

## 9. 4. 借阅管理模块 /api/borrow

### 9.1 借书

```
POST /api/borrow/borrow
```

**请求体：**

```json
{
    "reader_id": "R001",
    "book_id": "B50001"
}
```

**后端处理逻辑（调用存储过程）：**

```python
def borrow_book(reader_id: str, book_id: str, admin_id: int, client_ip: str):
    # 1. 参数化输入校验
    if not validate_reader_id(reader_id):
        return {"code": 400, "message": "读者编号格式错误"}
    if not validate_reader_id(book_id):  # 图书编号格式相同
        return {"code": 400, "message": "图书编号格式错误"}

    # 2. 业务校验（参数化查询）
    reader = db.execute_query(
        "SELECT reader_id, status, reader_type_id FROM reader WHERE reader_id = %s",
        (reader_id,)
    )
    if not reader:
        return {"code": 404, "message": "读者不存在"}
    if reader[0]["status"] != "normal":
        return {"code": 400, "message": "读者状态异常，无法借书"}

    # 3. 检查逾期
    overdue = db.execute_query("""
        SELECT COUNT(*) AS cnt FROM borrow_record
        WHERE reader_id = %s AND status = 'borrowed' AND due_date < GETDATE()
    """, (reader_id,))
    if overdue[0]["cnt"] > 0:
        return {"code": 400, "message": "存在逾期未还图书，无法借书"}

    # 4. 检查未缴罚款
    unpaid = db.execute_query(
        "SELECT ISNULL(SUM(amount), 0) AS total FROM fine_record WHERE reader_id = %s AND paid_status = 0",
        (reader_id,)
    )
    if unpaid[0]["total"] > 0:
        return {"code": 400, "message": f"存在未缴罚款 {unpaid[0]['total']} 元，无法借书"}

    # 5. 检查借阅上限
    reader_type = reader[0]["reader_type_id"]
    max_borrow = _get_max_borrow(reader_type)  # 从 borrow_rule 或 reader_type 获取
    current = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM borrow_record WHERE reader_id = %s AND status = 'borrowed'",
        (reader_id,)
    )
    if current[0]["cnt"] >= max_borrow:
        return {"code": 400, "message": f"已达到最大借阅数量上限({max_borrow}册)"}

    # 6. 检查库存
    inventory = db.execute_query(
        "SELECT in_library_count FROM book_inventory WHERE book_id = %s",
        (book_id,)
    )
    if not inventory or inventory[0]["in_library_count"] <= 0:
        return {"code": 400, "message": "该图书库存不足，无法借出"}

    # 7. 获取借阅规则计算应还日期
    rule = _get_borrow_rule(reader_type)
    borrow_days = rule["default_days"]

    # 8. 执行借书（调用存储过程或手动事务）
    try:
        db.execute_proc("usp_BorrowBook", {"ReaderID": reader_id, "BookID": book_id})
    except Exception as e:
        return {"code": 500, "message": f"借书失败: {str(e)}"}

    # 9. 记录操作日志
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '借阅管理', %s, %s)",
        (admin_id, f"借书:读者{reader_id}借{book_id}", client_ip)
    )

    return {
        "code": 200,
        "message": "借书成功",
        "data": {
            "reader_id": reader_id,
            "book_id": book_id,
            "borrow_date": datetime.now().strftime("%Y-%m-%d"),
            "due_date": (datetime.now() + timedelta(days=borrow_days)).strftime("%Y-%m-%d")
        }
    }
```

**成功响应 (200)：**

```json
{
    "code": 200,
    "message": "借书成功",
    "data": {
        "reader_id": "R001",
        "book_id": "B50001",
        "borrow_date": "2026-06-03",
        "due_date": "2026-07-03"
    }
}
```

---

### 9.2 还书

```
POST /api/borrow/return
```

**请求体：**

```json
{
    "book_id": "B50001"
}
```

**后端处理逻辑：**

```python
def return_book(book_id: str, admin_id: int, client_ip: str):
    # 1. 查找未还借阅记录
    record = db.execute_query("""
        SELECT TOP 1 record_id, reader_id, due_date
        FROM borrow_record
        WHERE book_id = %s AND status = 'borrowed'
        ORDER BY borrow_date DESC
    """, (book_id,))

    if not record:
        return {"code": 404, "message": "未找到该图书的借阅记录"}

    record = record[0]
    actual_date = datetime.now().date()
    due_date = record["due_date"]

    # 2. 计算逾期
    overdue_days = 0
    fine_amount = 0
    if actual_date > due_date:
        overdue_days = (actual_date - due_date).days
        fee_per_day = _get_overdue_fee(record["reader_id"])
        fine_amount = overdue_days * fee_per_day

    # 3. 事务处理
    with db.get_connection() as conn:
        cursor = conn.cursor()
        try:
            # 更新借阅记录
            cursor.execute("""
                UPDATE borrow_record
                SET actual_return_date = %s, status = 'returned'
                WHERE record_id = %s
            """, (actual_date, record["record_id"]))

            # 更新图书状态
            cursor.execute(
                "UPDATE book SET status = 'in_library' WHERE book_id = %s",
                (book_id,)
            )

            # 更新库存
            cursor.execute("""
                UPDATE book_inventory
                SET in_library_count = in_library_count + 1,
                    borrowed_count = borrowed_count - 1,
                    update_time = GETDATE()
                WHERE book_id = %s
            """, (book_id,))

            # 生成罚款记录
            if overdue_days > 0:
                cursor.execute("""
                    INSERT INTO fine_record (reader_id, book_id, borrow_record_id, overdue_days, amount, paid_status, generate_date)
                    VALUES (%s, %s, %s, %s, %s, 0, GETDATE())
                """, (record["reader_id"], book_id, record["record_id"], overdue_days, fine_amount))

            # 处理预约：检查是否有等待中的预约
            reservation = cursor.execute("""
                SELECT TOP 1 reservation_id, reader_id
                FROM reservation
                WHERE book_id = %s AND status = 'waiting'
                ORDER BY reserve_time
            """, (book_id,)).fetchone()

            if reservation:
                hold_hours = _get_reserve_hold_hours()
                cursor.execute("""
                    UPDATE reservation
                    SET status = 'available', expire_time = DATEADD(HOUR, %s, GETDATE())
                    WHERE reservation_id = %s
                """, (hold_hours, reservation[0]))

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "code": 200,
        "message": "还书成功",
        "data": {
            "book_id": book_id,
            "reader_id": record["reader_id"],
            "actual_return_date": str(actual_date),
            "overdue_days": overdue_days,
            "fine_amount": fine_amount
        }
    }
```

---

### 9.3 续借

```
POST /api/borrow/renew
```

**请求体：**

```json
{
    "reader_id": "R001",
    "book_id": "B50001"
}
```

**后端校验规则：**

1. 读者账号正常，无逾期、无欠费
2. 该图书未被其他读者预约（检查 `reservation` 表 `status IN ('waiting','available')`）
3. 续借次数未达上限（从 `borrow_rule.max_renew` 获取）
4. 续借成功：`due_date = 原due_date + borrow_rule.renew_days`，`renew_count += 1`

```python
# 关键校验SQL（参数化）
# 检查预约
reserved = db.execute_query(
    "SELECT COUNT(*) AS cnt FROM reservation WHERE book_id = %s AND status IN ('waiting','available')",
    (book_id,)
)
if reserved[0]["cnt"] > 0:
    return {"code": 400, "message": "该书已被预约，无法续借"}
```

---

### 9.4 查询借阅记录

```
GET /api/borrow/records?page=1&page_size=20&reader_id=R001&book_id=B50001&status=borrowed&start_date=2026-01-01&end_date=2026-06-03
```

---

### 9.5 查询单个借阅记录

```
GET /api/borrow/records/{record_id}
```

---

## 10. 5. 预约管理模块 /api/reservations

### 10.1 查询预约列表

```
GET /api/reservations?page=1&page_size=20&reader_id=R001&book_id=B50001&status=waiting
```

---

### 10.2 创建预约

```
POST /api/reservations
```

**请求体：**

```json
{
    "reader_id": "R002",
    "book_id": "B50001"
}
```

**后端校验（参数化）：**

```python
def create_reservation(reader_id, book_id):
    # 1. 检查读者状态
    reader = db.execute_query(
        "SELECT status FROM reader WHERE reader_id = %s", (reader_id,)
    )
    if not reader or reader[0]["status"] != "normal":
        return {"code": 400, "message": "读者状态异常，无法预约"}

    # 2. 检查是否已有重复预约
    existing = db.execute_query(
        "SELECT COUNT(*) AS cnt FROM reservation WHERE reader_id = %s AND book_id = %s AND status = 'waiting'",
        (reader_id, book_id)
    )
    if existing[0]["cnt"] > 0:
        return {"code": 409, "message": "您已预约过该书，请勿重复预约"}

    # 3. 检查图书是否存在且已全部借出
    inventory = db.execute_query(
        "SELECT in_library_count, total_count FROM book_inventory WHERE book_id = %s",
        (book_id,)
    )
    if not inventory:
        return {"code": 404, "message": "图书不存在"}
    if inventory[0]["in_library_count"] > 0:
        return {"code": 400, "message": "该书尚有在馆副本，可直接借阅，无需预约"}

    # 4. 写入预约记录
    db.execute_update("""
        INSERT INTO reservation (reader_id, book_id, reserve_time, status)
        VALUES (%s, %s, GETDATE(), 'waiting')
    """, (reader_id, book_id))

    # 5. 计算排队位置
    queue_position = db.execute_query(
        "SELECT COUNT(*) AS pos FROM reservation WHERE book_id = %s AND status = 'waiting' AND reserve_time <= (SELECT reserve_time FROM reservation WHERE reader_id = %s AND book_id = %s AND status = 'waiting')",
        (book_id, reader_id, book_id)
    )[0]["pos"]
```

---

### 10.3 取消预约

```
PATCH /api/reservations/{reservation_id}/cancel
```

```python
sql = "UPDATE reservation SET status = 'cancelled' WHERE reservation_id = %s AND status = 'waiting'"
db.execute_update(sql, (reservation_id,))
```

---

### 10.4 完成预约（读者取书后）

```
PATCH /api/reservations/{reservation_id}/complete
```

**后端校验：** 仅 `status = 'available'` 的预约可完成。

---

### 10.5 批量取消过期预约

```
POST /api/reservations/expire
```

**后端逻辑：** 定时任务或手动触发，将 `status = 'available'` 且 `expire_time < GETDATE()` 的预约取消。

```python
sql = """
    UPDATE reservation
    SET status = 'cancelled'
    WHERE status = 'available' AND expire_time < GETDATE()
"""
```

---

## 11. 6. 罚款管理模块 /api/fines

### 11.1 查询罚款记录

```
GET /api/fines?page=1&page_size=20&reader_id=R001&paid_status=0&start_date=2026-01-01&end_date=2026-06-03
```

---

### 11.2 缴纳罚款

```
POST /api/fines/pay
```

**请求体：**

```json
{
    "fine_ids": [1, 2, 3]
}
```

```python
def pay_fines(fine_ids: list, admin_id: int, client_ip: str):
    if not fine_ids or not isinstance(fine_ids, list):
        return {"code": 400, "message": "请提供有效的罚款记录ID列表"}

    # 参数化批量更新
    placeholders = ",".join(["%s"] * len(fine_ids))
    sql = f"UPDATE fine_record SET paid_status = 1 WHERE fine_id IN ({placeholders}) AND paid_status = 0"
    # NOTE: placeholders 仅由 %s 组成，不含用户值，安全
    affected = db.execute_update(sql, tuple(fine_ids))

    # 记录操作日志
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '罚款管理', %s, %s)",
        (admin_id, f"缴纳罚款:{fine_ids}", client_ip)
    )

    return {"code": 200, "message": f"成功缴纳 {affected} 笔罚款"}
```

---

### 11.3 查询读者欠费汇总

```
GET /api/fines/summary/{reader_id}
```

---

### 11.4 查询欠费排行

```
GET /api/fines/top?limit=10&start_date=2026-01-01&end_date=2026-06-03
```

---

## 12. 7. 查询统计模块 /api/statistics

### 12.1 图书热门排行

```
GET /api/statistics/hot-books?top_n=10&start_date=2026-01-01&end_date=2026-06-03&category_id=1
```

**后端SQL（使用视图）：**

```python
# top_n 必须是整数且在合理范围内
top_n = min(max(int(params.get("top_n", 10)), 1), 100)

sql = """
    SELECT TOP (%s) book_id, title, author, category_name, borrow_times, rank
    FROM v_hot_books
    ORDER BY rank
"""
# NOTE: TOP N 无法参数化，但 top_n 已通过 int() 转换和范围校验
```

---

### 12.2 逾期未还清单

```
GET /api/statistics/overdue-list?page=1&page_size=20&department=计算机学院&reader_type_id=1
```

**后端SQL（使用视图，参数化查询）：**

```python
conditions = []
params = []

if department:
    conditions.append("r.department LIKE %s")
    params.append(f"%{department}%")

if reader_type_id:
    conditions.append("r.reader_type_id = %s")
    params.append(reader_type_id)

where_clause = " AND ".join(conditions) if conditions else "1=1"

# v_overdue_list 视图中已 JOIN reader 表
# 但需要额外 JOIN reader 表来支持 department 筛选
sql = f"""
    SELECT vol.*, r.department, r.reader_type_id
    FROM v_overdue_list vol
    JOIN reader r ON vol.reader_id = r.reader_id
    WHERE {where_clause}
    ORDER BY vol.overdue_days DESC
"""
```

---

### 12.3 借阅统计（按日/月/年）

```
GET /api/statistics/borrow-stats?period=month&start_date=2026-01-01&end_date=2026-06-03
```

**后端SQL：**

```python
# period 白名单校验
if period not in ("day", "month", "year"):
    return {"code": 400, "message": "非法统计周期"}

# period 通过白名单后用于 GROUP BY 表达式（安全）
date_format = {"day": "CAST(borrow_date AS DATE)", "month": "FORMAT(borrow_date, 'yyyy-MM')", "year": "YEAR(borrow_date)"}
sql = f"""
    SELECT {date_format[period]} AS period_label, COUNT(*) AS borrow_count, COUNT(DISTINCT reader_id) AS reader_count
    FROM borrow_record
    WHERE borrow_date BETWEEN %s AND %s
    GROUP BY {date_format[period]}
    ORDER BY period_label
"""
```

---

### 12.4 图书库存统计（按分类）

```
GET /api/statistics/inventory-by-category
```

**后端SQL（参数化）：**

```python
sql = """
    SELECT
        bc.category_id,
        bc.category_name,
        COUNT(b.book_id) AS book_types,
        SUM(bi.total_count) AS total_volumes,
        SUM(bi.in_library_count) AS in_library_volumes,
        SUM(bi.borrowed_count) AS borrowed_volumes,
        CASE WHEN SUM(bi.total_count) > 0
             THEN CAST(SUM(bi.borrowed_count) AS FLOAT) / SUM(bi.total_count)
             ELSE 0 END AS circulation_rate
    FROM book_category bc
    LEFT JOIN book b ON bc.category_id = b.category_id
    LEFT JOIN book_inventory bi ON b.book_id = bi.book_id
    WHERE b.status != 'removed'
    GROUP BY bc.category_id, bc.category_name
    ORDER BY total_volumes DESC
"""
# 无用户参数，直接执行
```

---

### 12.5 读者借阅活跃度统计

```
GET /api/statistics/reader-activity?reader_type_id=1&activity_level=高频
```

**后端SQL（使用视图 `v_reader_activity`）：**

```python
# activity_level 白名单校验
if activity_level and activity_level not in ("高频", "中频", "低频"):
    return {"code": 400, "message": "非法活跃等级"}

sql = "SELECT * FROM v_reader_activity WHERE 1=1"
params = []

if reader_type_id:
    sql += " AND reader_type_id = %s"
    params.append(reader_type_id)
if activity_level:
    sql += " AND activity_level = %s"
    params.append(activity_level)
```

---

### 12.6 逾期读者统计

```
GET /api/statistics/overdue-readers?start_date=2026-01-01&end_date=2026-06-03
```

---

### 12.7 综合仪表盘数据

```
GET /api/statistics/dashboard
```

**返回：**

```json
{
    "code": 200,
    "data": {
        "total_readers": 10000,
        "active_readers": 9560,
        "total_books": 50000,
        "borrowed_books": 3200,
        "overdue_books": 45,
        "total_fines_unpaid": 1250.50,
        "today_borrows": 120,
        "today_returns": 98,
        "waiting_reservations": 67
    }
}
```

```python
# 所有数字均为 COUNT/SUM 聚合，无用户参数
sql = """
    SELECT
        (SELECT COUNT(*) FROM reader) AS total_readers,
        (SELECT COUNT(*) FROM reader WHERE status = 'normal') AS active_readers,
        (SELECT COUNT(*) FROM book WHERE status != 'removed') AS total_books,
        (SELECT COUNT(*) FROM borrow_record WHERE status = 'borrowed') AS borrowed_books,
        (SELECT COUNT(*) FROM borrow_record WHERE status = 'borrowed' AND due_date < GETDATE()) AS overdue_books,
        (SELECT ISNULL(SUM(amount), 0) FROM fine_record WHERE paid_status = 0) AS total_fines_unpaid,
        (SELECT COUNT(*) FROM borrow_record WHERE borrow_date = CAST(GETDATE() AS DATE)) AS today_borrows,
        (SELECT COUNT(*) FROM borrow_record WHERE actual_return_date = CAST(GETDATE() AS DATE)) AS today_returns,
        (SELECT COUNT(*) FROM reservation WHERE status = 'waiting') AS waiting_reservations
"""
```

---

## 13. 8. 系统管理模块 /api/admin

> 需要 `system_admin` 角色权限

### 13.1 管理员列表

```
GET /api/admin/users?page=1&page_size=20
```

---

### 13.2 创建管理员

```
POST /api/admin/users
```

**请求体：**

```json
{
    "username": "admin02",
    "password": "SecureP@ss456",
    "name": "王五",
    "role": "normal_admin"
}
```

**后端密码处理：**

```python
def create_admin(data: dict):
    # 校验
    if not data.get("username") or len(data["username"]) > 30:
        return {"code": 400, "message": "用户名必填且不超过30字符"}
    if not data.get("password") or len(data["password"]) < 6:
        return {"code": 400, "message": "密码至少6个字符"}

    # bcrypt 哈希密码
    password_hash = hash_password(data["password"])

    # 参数化插入（密码哈希是 bcrypt 结果，不存在注入风险）
    sql = """
        INSERT INTO admin (username, password_hash, name, role, status)
        VALUES (%s, %s, %s, %s, 'active')
    """
    db.execute_update(sql, (data["username"], password_hash, data["name"], data["role"]))
```

---

### 13.3 修改管理员信息/角色

```
PUT /api/admin/users/{admin_id}
```

---

### 13.4 禁用/启用管理员

```
PATCH /api/admin/users/{admin_id}/status
```

```json
{"status": "inactive"}
```

---

### 13.5 修改管理员密码

```
PUT /api/admin/users/{admin_id}/password
```

```json
{
    "old_password": "OldP@ss123",
    "new_password": "NewP@ss456"
}
```

**后端逻辑：**
1. 验证旧密码正确
2. bcrypt 哈希新密码
3. 更新 `password_hash`

---

### 13.6 查询借阅规则列表

```
GET /api/admin/borrow-rules?reader_type_id=1&status=active
```

---

### 13.7 新增/修改借阅规则

```
POST /api/admin/borrow-rules
PUT  /api/admin/borrow-rules/{rule_id}
```

**请求体：**

```json
{
    "reader_type_id": 1,
    "max_borrow": 10,
    "default_days": 30,
    "max_renew": 2,
    "renew_days": 15,
    "overdue_fee_per_day": 0.50,
    "reserve_hold_hours": 48,
    "effective_date": "2026-06-01"
}
```

---

### 13.8 系统参数管理

```
GET    /api/admin/system-params?category=借阅配置
PUT    /api/admin/system-params/{param_id}
```

---

### 13.9 权限配置管理

```
GET    /api/admin/permissions?role=normal_admin
PUT    /api/admin/permissions/{config_id}
```

---

### 13.10 数据备份

```
POST /api/admin/backup
```

**请求体：**

```json
{
    "backup_type": "full"
}
```

**后端逻辑：** 调用数据库备份命令，记录到 `backup_record` 表。

---

## 14. 9. 报表模块 /api/reports

### 14.1 生成报表

```
POST /api/reports/generate
```

**请求体：**

```json
{
    "report_type": "borrow_stats",
    "time_period": "2026-01-01 至 2026-06-03",
    "query_conditions": {"category_id": 1},
    "output_format": "excel"
}
```

---

### 14.2 查询报表模板列表

```
GET /api/reports/templates
```

---

### 14.3 查询报表生成日志

```
GET /api/reports/logs?page=1&page_size=20&report_type=borrow_stats
```

---

### 14.4 导出未还清单

```
POST /api/reports/export/overdue-list
```

**请求体：**

```json
{
    "output_format": "excel",
    "department": "计算机学院"
}
```

---

### 14.5 导出热门图书排行

```
POST /api/reports/export/hot-books
```

---

### 14.6 导出财务费用汇总

```
POST /api/reports/export/finance
```

```json
{
    "start_date": "2026-01-01",
    "end_date": "2026-06-03",
    "output_format": "excel"
}
```

---

## 15. 10. 操作日志模块 /api/logs

> 需要 `system_admin` 角色权限

### 15.1 查询操作日志

```
GET /api/logs?page=1&page_size=50&admin_id=1&module=借阅管理&start_time=2026-06-01&end_time=2026-06-03&keyword=借书
```

**后端SQL（参数化）：**

```python
def query_logs(params):
    conditions = []
    query_params = []

    if params.get("admin_id"):
        conditions.append("ol.admin_id = %s")
        query_params.append(params["admin_id"])

    if params.get("module"):
        conditions.append("ol.module = %s")
        query_params.append(params["module"])

    if params.get("keyword"):
        conditions.append("ol.action LIKE %s")
        query_params.append(f"%{params['keyword']}%")

    if params.get("start_time"):
        conditions.append("ol.operation_time >= %s")
        query_params.append(params["start_time"])

    if params.get("end_time"):
        conditions.append("ol.operation_time <= %s")
        query_params.append(params["end_time"])

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    sql = f"""
        SELECT ol.*, a.username, a.name AS admin_name
        FROM operation_log ol
        LEFT JOIN admin a ON ol.admin_id = a.admin_id
        WHERE {where_clause}
        ORDER BY ol.operation_time DESC
        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
    """
    query_params.extend([(params["page"]-1)*params["page_size"], params["page_size"]])
```

---

### 15.2 异常行为告警查询

```
GET /api/logs/alerts
```

**返回：** 高频失败登录、敏感参数修改等异常记录。

```sql
-- 示例：查询最近24小时内登录失败超过5次的IP
SELECT client_ip, COUNT(*) AS fail_count
FROM operation_log
WHERE module = '认证'
  AND action LIKE '登录失败%'
  AND operation_time >= DATEADD(HOUR, -24, GETDATE())
GROUP BY client_ip
HAVING COUNT(*) > 5
```

---

## 附录A：后端核心代码骨架

### A.1 项目目录结构

```
library_backend/
├── app.py                  # Flask/FastAPI 入口
├── config.py               # 配置（数据库、JWT密钥等）
├── db.py                   # 数据库连接池
├── auth/
│   ├── __init__.py
│   ├── decorator.py        # JWT 认证装饰器 + 角色权限
│   └── routes.py           # /auth/* 路由
├── api/
│   ├── readers.py          # /api/readers/*
│   ├── books.py            # /api/books/*
│   ├── borrow.py           # /api/borrow/*
│   ├── reservations.py     # /api/reservations/*
│   ├── fines.py            # /api/fines/*
│   ├── statistics.py       # /api/statistics/*
│   ├── admin.py            # /api/admin/*
│   ├── reports.py          # /api/reports/*
│   └── logs.py             # /api/logs/*
├── utils/
│   ├── security.py         # bcrypt 密码、JWT、限流
│   ├── validators.py       # 输入校验函数
│   └── pagination.py       # 分页工具
└── requirements.txt
```

### A.2 Flask 入口示例 (app.py)

```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from auth.routes import auth_bp
from auth.decorator import login_required, role_required
from api.readers import readers_bp
from api.books import books_bp
# ... 其他 blueprint

app = Flask(__name__)
CORS(app)  # 生产环境限制允许的源

# 注册蓝图
app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(readers_bp, url_prefix='/api/readers')
app.register_blueprint(books_bp, url_prefix='/api/books')
# ... 其他

# 全局异常处理
@app.errorhandler(400)
def bad_request(e):
    return jsonify({"code": 400, "message": str(e)}), 400

@app.errorhandler(500)
def server_error(e):
    # 生产环境不暴露详细错误信息
    return jsonify({"code": 500, "message": "服务器内部错误"}), 500

if __name__ == '__main__':
    # 开发环境，生产环境使用 gunicorn/uwsgi
    app.run(host='0.0.0.0', port=5000, ssl_context=('cert.pem', 'key.pem'))
    # NOTE: ssl_context 启用 HTTPS
```

### A.3 认证装饰器 (auth/decorator.py)

```python
from functools import wraps
from flask import request, g, jsonify
from utils.security import decode_token

def login_required(f):
    """验证 JWT Token，将 admin_id 和 role 注入 g 对象"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({"code": 401, "message": "请先登录"}), 401
        try:
            payload = decode_token(token)
            g.admin_id = payload["admin_id"]
            g.role = payload["role"]
        except jwt.ExpiredSignatureError:
            return jsonify({"code": 401, "message": "Token已过期，请重新登录"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"code": 401, "message": "Token无效"}), 401
        return f(*args, **kwargs)
    return decorated

def role_required(allowed_roles: list):
    """验证角色权限"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not hasattr(g, 'role') or g.role not in allowed_roles:
            return jsonify({"code": 403, "message": "权限不足"}), 403
        return f(*args, **kwargs)
    return decorated
```

### A.4 分页工具 (utils/pagination.py)

```python
def paginate_query(sql: str, count_sql: str, params: list,
                   page: int = 1, page_size: int = 20):
    """统一分页查询"""
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 100)  # 最大100条/页

    # 查询总数
    total = db.execute_query(count_sql, params)[0]["total"]

    # 分页查询数据
    offset = (page - 1) * page_size
    data = db.execute_query(sql, params + [page_size, offset])

    return {
        "data": data,
        "page": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }
```

### A.5 依赖 (requirements.txt)

```
flask==3.0.*
flask-cors
pymssql==2.2.*
bcrypt==4.1.*
PyJWT==2.8.*
python-dotenv==1.0.*
openpyxl==3.1.*        # Excel 导出
reportlab==4.0.*       # PDF 导出
gunicorn==21.*          # 生产 WSGI 服务器
```

---

## 附录B：前端调用示例

### B.1 axios 封装 (Vue/React 通用)

```javascript
// api/client.js
import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'https://your-server.com',
    timeout: 10000,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
});

// 请求拦截器：自动附加 Token
apiClient.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 响应拦截器：统一错误处理
apiClient.interceptors.response.use(
    response => response.data,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';  // 跳转登录页
        }
        return Promise.reject(error.response?.data || error);
    }
);

export default apiClient;
```

### B.2 登录调用示例

```javascript
// api/auth.js
import apiClient from './client';

export function login(username, password) {
    return apiClient.post('/auth/login', { username, password });
}

// 组件中使用
async function handleLogin() {
    try {
        const res = await login(this.username, this.password);
        if (res.code === 200) {
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.admin));
            this.$router.push('/dashboard');
        }
    } catch (err) {
        this.errorMessage = err.message || '登录失败';
    }
}
```

### B.3 读者查询调用示例

```javascript
// api/readers.js
import apiClient from './client';

export function getReaders(params = {}) {
    return apiClient.get('/api/readers', { params });
}

export function createReader(data) {
    return apiClient.post('/api/readers', data);
}

export function updateReaderStatus(readerId, status) {
    return apiClient.patch(`/api/readers/${readerId}/status`, { status });
}

// 组件中使用
async function loadReaders() {
    const res = await getReaders({
        page: this.currentPage,
        page_size: this.pageSize,
        keyword: this.searchKeyword,
        status: this.filterStatus
    });
    this.readerList = res.data;
    this.total = res.page.total;
}
```

### B.4 借书调用示例

```javascript
import { borrowBook } from '@/api/borrow';

async function handleBorrow() {
    const res = await borrowBook({
        reader_id: this.selectedReader.reader_id,
        book_id: this.selectedBook.book_id
    });
    if (res.code === 200) {
        this.$message.success(`借书成功！应还日期：${res.data.due_date}`);
    } else {
        this.$message.error(res.message);
    }
}
```

---

## 附录C：安全检查清单

| # | 检查项 | 状态 |
|---|---|---|
| 1 | 所有 SQL 查询使用参数化（%s 占位符），禁止字符串拼接 | ✅ 必须 |
| 2 | 动态排序/分组字段使用白名单校验 | ✅ 必须 |
| 3 | 密码使用 bcrypt(rounds≥12) 哈希存储，不存明文 | ✅ 必须 |
| 4 | 全站 HTTPS 传输 | ✅ 必须 |
| 5 | JWT Token 设置合理过期时间（≤2h） | ✅ 必须 |
| 6 | 登录接口限流（同一IP ≤5次/分钟） | ✅ 必须 |
| 7 | 所有用户输入后端二次校验 | ✅ 必须 |
| 8 | 数据库使用最小权限账户（按角色分账号） | ✅ 必须 |
| 9 | 敏感操作记录操作日志 | ✅ 必须 |
| 10 | 响应中不暴露数据库错误细节 | ✅ 必须 |
| 11 | CORS 限制允许的源 | ✅ 建议 |
| 12 | 使用环境变量管理密钥和密码 | ✅ 建议 |
| 13 | XSS 防护：输出 HTML 转义 | ✅ 建议 |
| 14 | CSRF Token（如使用 Cookie 认证） | ✅ 建议 |

---

> **文件性质：** 前后端接口说明文件  
> **文档版本：** v1.0  
> **编制日期：** 2026-06-03  
> **适用范围：** 图书管理系统 Python 前后端接口开发交接  
> **数据库：** SQL Server — library_system（17张表 + 5个视图 + 3个存储过程 + 3个触发器）  
> **后端框架：** Flask / FastAPI（Python 3.10+） | **前端框架：** Vue 3 / React
