# 图书管理系统 — 后端启动说明

## 环境要求

| 组件 | 版本 |
|---|---|
| Python | 3.10+ |
| SQL Server | 2019 Express 或更高 |
| ODBC Driver | 17 for SQL Server |

## 快速启动

```bash
cd backend

# 1. 安装依赖
pip install -r requirements.txt

# 2. 初始化数据库（首次运行：创建存储过程 + 设置密码）
python setup_db.py

# 3. 启动服务
python app.py
```

服务默认运行在 `http://localhost:5000`。

## 配置（环境变量）

在 `backend/` 目录下创建 `.env` 文件：

```env
# 数据库（留空使用 Windows 集成认证）
DB_SERVER=.\SQLEXPRESS
DB_NAME=LibraryDB
DB_USER=
DB_PASSWORD=

# JWT
JWT_SECRET=your-secret-key-change-in-production

# HTTPS（生产环境）
SSL_CERT=cert.pem
SSL_KEY=key.pem
```

## 测试账号

| 角色 | 用户名 | 密码 | loginType |
|---|---|---|---|
| 系统管理员 | `admin` | `Admin@123` | admin |
| 图书管理员 | `librarian` | `Lib@123` | admin |
| 读者 | `R001`~`R005` | `Reader@123` | reader |

## 加密通讯说明

登录采用 **RSA + bcrypt + JWT** 三重防护：

```
1. GET /auth/public-key    → 前端获取 RSA 公钥
2. 前端用公钥加密密码        → JSEncrypt.encrypt(password)
3. POST /auth/login         → 后端 RSA 私钥解密 → bcrypt 验证 → 返回 JWT
4. 后续请求                  → Authorization: Bearer <token>
```

生产环境需额外配置 **HTTPS**（SSL_CERT + SSL_KEY 环境变量）。

## 项目结构

```
backend/
├── app.py                 # Flask 入口
├── config.py              # 数据库/JWT/SSL 配置
├── db.py                  # pyodbc 数据库层
├── setup_db.py            # 初始化脚本（存储过程 + 密码）
├── requirements.txt       # Python 依赖
├── *.sql                  # DDL/DML 脚本
├── auth/
│   ├── routes.py           # /auth/* 认证路由
│   └── decorator.py        # JWT + 角色装饰器
├── api/
│   ├── readers.py          # 读者管理
│   ├── books.py            # 图书管理
│   ├── borrow.py           # 借阅管理
│   ├── reservations.py     # 预约管理
│   ├── fines.py            # 罚款管理
│   ├── statistics.py       # 查询统计
│   ├── admin.py            # 系统管理
│   └── logs.py             # 操作日志
└── utils/
    ├── security.py         # bcrypt / JWT / RSA / 限流
    ├── validators.py       # 输入校验
    └── pagination.py       # 分页工具
```

## 接口总览

| 模块 | 前缀 | 接口数 |
|---|---|---|
| 认证 | `/auth` | 5（含 public-key / refresh） |
| 读者管理 | `/api/readers` | 8 |
| 图书管理 | `/api/books` | 7 |
| 借阅管理 | `/api/borrow` | 4 |
| 预约管理 | `/api/reservations` | 4 |
| 罚款管理 | `/api/fines` | 3 |
| 查询统计 | `/api/statistics` | 7 |
| 系统管理 | `/api/admin` | 6 |
| 操作日志 | `/api/logs` | 2 |
