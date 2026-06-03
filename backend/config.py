"""应用配置"""
import os
from dotenv import load_dotenv

load_dotenv()

# 数据库
DB_CONFIG = {
    "server": os.getenv("DB_SERVER", r".\SQLEXPRESS"),
    "database": os.getenv("DB_NAME", "LibraryDB"),
    "user": os.getenv("DB_USER", ""),
    "password": os.getenv("DB_PASSWORD", ""),
    "charset": "UTF-8",
    "autocommit": False,
    "as_dict": True,
}

# Windows 集成认证模式（无 user/password 时使用）
DB_USE_WINDOWS_AUTH = not DB_CONFIG["user"]

# JWT
JWT_SECRET = os.getenv("JWT_SECRET", "library-system-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 120

# 服务
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "5000"))
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# HTTPS（生产环境配置SSL证书路径）
SSL_CERT = os.getenv("SSL_CERT", "")
SSL_KEY = os.getenv("SSL_KEY", "")
