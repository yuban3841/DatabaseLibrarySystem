"""安全工具：bcrypt密码哈希、JWT令牌、RSA加密、限流"""
import base64
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import time
from functools import wraps
from flask import request
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_MINUTES


def hash_password(plain: str) -> str:
    """bcrypt哈希密码"""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """验证密码"""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id, role: str, login_type: str = "admin") -> str:
    """生成JWT令牌（admin或reader）"""
    payload = {
        "admin_id": user_id,
        "role": role,
        "login_type": login_type,
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


# ============================================================
# RSA 非对称加密 — 密码传输加密方案
# ============================================================

_rsa_private_key = None
_rsa_public_key_pem = None


def _ensure_rsa_keys():
    """生成 RSA-2048 密钥对（首次调用时懒加载，进程生命周期内复用）"""
    global _rsa_private_key, _rsa_public_key_pem
    if _rsa_private_key is None:
        _rsa_private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        _rsa_public_key_pem = (
            _rsa_private_key.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode("utf-8")
        )


def get_public_key() -> str:
    """获取 RSA 公钥 PEM 字符串，供前端加密密码使用"""
    _ensure_rsa_keys()
    return _rsa_public_key_pem


def rsa_decrypt(encrypted_base64: str) -> str:
    """使用 RSA 私钥解密 Base64 密文，返回明文密码

    Raises:
        ValueError: 解密失败（密文格式错误或密钥不匹配）
    """
    _ensure_rsa_keys()
    try:
        ciphertext = base64.b64decode(encrypted_base64)
        plaintext = _rsa_private_key.decrypt(
            ciphertext,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        return plaintext.decode("utf-8")
    except Exception as e:
        raise ValueError(f"RSA解密失败，请使用正确的公钥加密: {str(e)}")
