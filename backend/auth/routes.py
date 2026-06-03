"""认证路由 /auth"""
from flask import Blueprint, request
from db import db
from utils.security import verify_password, create_token, check_login_rate, record_login_attempt
from auth.decorator import login_required

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    client_ip = request.remote_addr or "unknown"

    if not username or not password:
        return {"code": 400, "message": "用户名和密码不能为空"}, 400

    # 限流
    if not check_login_rate(client_ip):
        return {"code": 429, "message": "登录尝试过于频繁，请稍后再试"}, 429

    record_login_attempt(client_ip)

    # 参数化查询防注入
    admin = db.execute_one(
        "SELECT admin_id, username, password_hash, name, role, status FROM admin WHERE username = %s",
        (username,),
    )
    if not admin:
        db.execute_update(
            "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (NULL, '认证', %s, %s)",
            (f"登录失败:{username}", client_ip),
        )
        return {"code": 401, "message": "账号或密码错误"}, 401

    if admin["status"] != "active":
        return {"code": 401, "message": "账号已被停用"}, 401

    if not verify_password(password, admin["password_hash"]):
        db.execute_update(
            "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', %s, %s)",
            (admin["admin_id"], f"登录失败:{username}", client_ip),
        )
        return {"code": 401, "message": "账号或密码错误"}, 401

    # 登录成功
    token = create_token(admin["admin_id"], admin["role"])
    db.execute_update("UPDATE admin SET last_login_time = GETDATE() WHERE admin_id = %s", (admin["admin_id"],))
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', '登录成功', %s)",
        (admin["admin_id"], client_ip),
    )

    # 查询权限
    permissions = db.execute_query(
        "SELECT module_code, permission_level FROM permission_config WHERE role = %s AND status = 'active'",
        (admin["role"],),
    )

    return {
        "code": 200,
        "message": "登录成功",
        "data": {
            "token": token,
            "token_type": "Bearer",
            "expires_in": 7200,
            "admin": {
                "admin_id": admin["admin_id"],
                "username": admin["username"],
                "name": admin["name"],
                "role": admin["role"],
            },
            "permissions": permissions,
        },
    }


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    from flask import g
    admin = db.execute_one(
        "SELECT admin_id, username, name, role, status, last_login_time FROM admin WHERE admin_id = %s",
        (g.admin_id,),
    )
    permissions = db.execute_query(
        "SELECT module_code, permission_level FROM permission_config WHERE role = %s AND status = 'active'",
        (g.role,),
    )
    return {"code": 200, "data": {"admin": admin, "permissions": permissions}}


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    from flask import g
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', '登出', %s)",
        (g.admin_id, request.remote_addr or "unknown"),
    )
    return {"code": 200, "message": "已登出"}
