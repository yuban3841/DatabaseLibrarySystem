"""安全工具：bcrypt密码哈希、JWT令牌、限流"""
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import time
from functools import wraps
from flask import request
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_MINUTES


def hash_password(plain: str) -> str:
    """bcrypt哈希密码"""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """验证密码"""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(admin_id: int, role: str) -> str:
    """生成JWT令牌"""
    payload = {
        "admin_id": admin_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """解码JWT令牌"""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# 登录限流
_login_attempts: dict[str, list[float]] = defaultdict(list)


def check_login_rate(ip: str, max_attempts: int = 5, window: int = 60) -> bool:
    """检查登录频率，返回True表示未超限"""
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < window]
    return len(_login_attempts[ip]) < max_attempts


def record_login_attempt(ip: str):
    """记录登录尝试"""
    _login_attempts[ip].append(time.time())
