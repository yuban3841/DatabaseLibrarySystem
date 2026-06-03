"""认证装饰器"""
from functools import wraps
from flask import request, g
from utils.security import decode_token
import jwt as pyjwt


def login_required(f):
    """JWT认证：将admin_id和role注入flask.g"""
    @wraps(f)
    def decorated(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header.replace("Bearer ", "")
        if not token:
            return {"code": 401, "message": "请先登录"}, 401
        try:
            payload = decode_token(token)
            g.admin_id = payload["admin_id"]
            g.role = payload["role"]
        except pyjwt.ExpiredSignatureError:
            return {"code": 401, "message": "Token已过期，请重新登录"}, 401
        except pyjwt.InvalidTokenError:
            return {"code": 401, "message": "Token无效"}, 401
        return f(*args, **kwargs)
    return decorated


def role_required(*allowed_roles: str):
    """角色权限校验"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(g, "role") or g.role not in allowed_roles:
                return {"code": 403, "message": "权限不足"}, 403
            return f(*args, **kwargs)
        return decorated
    return decorator
