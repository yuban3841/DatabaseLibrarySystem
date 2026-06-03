"""认证路由 /auth — 含RSA密码加密传输方案"""
from flask import Blueprint, request, g
from db import db
from utils.security import (
    verify_password,
    create_token,
    check_login_rate,
    record_login_attempt,
    get_public_key,
    rsa_decrypt,
)
from auth.decorator import login_required

auth_bp = Blueprint("auth", __name__)


# ============================================================
# 1. 获取 RSA 公钥
# ============================================================

@auth_bp.route("/public-key", methods=["GET"])
def public_key():
    """返回 RSA 公钥 PEM，前端使用此公钥加密登录密码"""
    return {
        "code": 200,
        "message": "success",
        "data": {"publicKey": get_public_key()},
    }


# ============================================================
# 2. 用户登录（管理员 / 读者）
# ============================================================

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    login_type = data.get("loginType", "admin")
    client_ip = request.remote_addr or "unknown"

    # ---- 密码提取：优先 RSA 加密密文，兼容明文（调试用） ----
    encrypted_password = data.get("encryptedPassword") or ""
    plain_password = data.get("password") or ""

    if not username:
        return {"code": 400, "message": "用户名不能为空"}, 400

    if encrypted_password:
        try:
            password = rsa_decrypt(encrypted_password)
        except ValueError as e:
            return {"code": 400, "message": str(e)}, 400
    elif plain_password:
        password = plain_password
    else:
        return {"code": 400, "message": "密码不能为空"}, 400

    # ---- 限流 ----
    if not check_login_rate(client_ip):
        return {"code": 429, "message": "登录尝试过于频繁，请稍后再试"}, 429

    record_login_attempt(client_ip)

    # ---- 校验 loginType ----
    if login_type not in ("admin", "reader"):
        return {"code": 400, "message": "loginType 仅支持 admin 或 reader"}, 400

    # ---- 分派登录 ----
    if login_type == "reader":
        return _reader_login(username, password, client_ip)
    else:
        return _admin_login(username, password, client_ip)


def _admin_login(username: str, password: str, client_ip: str):
    """管理员登录逻辑"""
    admin = db.execute_one(
        "SELECT admin_id, username, password_hash, name, role, status FROM admin WHERE username = %s",
        (username,),
    )
    if not admin:
        db.execute_update(
            "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (NULL, '认证', %s, %s)",
            (f"登录失败(admin):{username}", client_ip),
        )
        return {"code": 401, "message": "账号或密码错误"}, 401

    if admin["status"] != "active":
        return {"code": 401, "message": "账号已被停用"}, 401

    if not verify_password(password, admin["password_hash"]):
        db.execute_update(
            "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', %s, %s)",
            (admin["admin_id"], f"登录失败(admin):{username}", client_ip),
        )
        return {"code": 401, "message": "账号或密码错误"}, 401

    # 登录成功
    token = create_token(admin["admin_id"], admin["role"], "admin")
    db.execute_update(
        "UPDATE admin SET last_login_time = GETDATE() WHERE admin_id = %s",
        (admin["admin_id"],),
    )
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', '登录成功', %s)",
        (admin["admin_id"], client_ip),
    )

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
            "userInfo": {
                "id": str(admin["admin_id"]),
                "username": admin["username"],
                "name": admin["name"],
                "role": admin["role"],
                "loginType": "admin",
            },
            "permissions": permissions,
        },
    }


def _reader_login(reader_id: str, password: str, client_ip: str):
    """读者登录逻辑（需 reader 表存在 password_hash 列）"""
    # 检查 reader 表是否有 password_hash 列
    try:
        reader = db.execute_one(
            "SELECT reader_id, name, status, password_hash FROM reader WHERE reader_id = %s",
            (reader_id,),
        )
    except Exception:
        return {
            "code": 500,
            "message": "读者表尚未配置密码字段，请运行 python setup_db.py 初始化",
        }, 500

    if not reader:
        db.execute_update(
            "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (NULL, '认证', %s, %s)",
            (f"登录失败(reader):{reader_id}", client_ip),
        )
        return {"code": 401, "message": "读者编号或密码错误"}, 401

    if reader["status"] != "normal":
        return {"code": 401, "message": "读者账号状态异常（已挂失/注销）"}, 401

    if not verify_password(password, reader["password_hash"]):
        db.execute_update(
            "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (NULL, '认证', %s, %s)",
            (f"登录失败(reader):{reader_id}", client_ip),
        )
        return {"code": 401, "message": "读者编号或密码错误"}, 401

    # 登录成功
    token = create_token(reader["reader_id"], "reader", "reader")
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (NULL, '认证', %s, %s)",
        (f"读者登录成功:{reader_id}", client_ip),
    )

    # 查询读者当前借阅/预约统计
    stats = db.execute_one(
        """
        SELECT
            (SELECT COUNT(*) FROM borrow_record WHERE reader_id = %s AND status = 'borrowed') AS borrowed_count,
            (SELECT COUNT(*) FROM reservation WHERE reader_id = %s AND status IN ('waiting','available')) AS reserved_count
        """,
        (reader_id, reader_id),
    )

    return {
        "code": 200,
        "message": "登录成功",
        "data": {
            "token": token,
            "token_type": "Bearer",
            "expires_in": 7200,
            "userInfo": {
                "id": reader["reader_id"],
                "name": reader["name"],
                "role": "reader",
                "loginType": "reader",
                "borrowedCount": stats.get("borrowed_count", 0) if stats else 0,
                "reservedCount": stats.get("reserved_count", 0) if stats else 0,
            },
        },
    }


# ============================================================
# 3. 获取当前用户信息
# ============================================================

@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    login_type = getattr(g, "login_type", "admin")

    if login_type == "reader":
        reader = db.execute_one(
            "SELECT reader_id, name, gender, phone, department, reader_type_id, status, reg_date FROM reader WHERE reader_id = %s",
            (g.admin_id,),
        )
        stats = db.execute_one(
            """
            SELECT
                (SELECT COUNT(*) FROM borrow_record WHERE reader_id = %s AND status = 'borrowed') AS borrowed_count,
                (SELECT COUNT(*) FROM reservation WHERE reader_id = %s AND status IN ('waiting','available')) AS reserved_count
            """,
            (g.admin_id, g.admin_id),
        )
        return {
            "code": 200,
            "data": {
                "userInfo": {
                    "id": reader["reader_id"],
                    "name": reader["name"],
                    "role": "reader",
                    "loginType": "reader",
                    "reader": reader,
                    "borrowedCount": stats.get("borrowed_count", 0) if stats else 0,
                    "reservedCount": stats.get("reserved_count", 0) if stats else 0,
                }
            },
        }

    # admin
    admin = db.execute_one(
        "SELECT admin_id, username, name, role, status, last_login_time FROM admin WHERE admin_id = %s",
        (g.admin_id,),
    )
    permissions = db.execute_query(
        "SELECT module_code, permission_level FROM permission_config WHERE role = %s AND status = 'active'",
        (g.role,),
    )
    return {
        "code": 200,
        "data": {
            "userInfo": {
                "id": str(admin["admin_id"]),
                "username": admin["username"],
                "name": admin["name"],
                "role": admin["role"],
                "loginType": "admin",
            },
            "admin": admin,
            "permissions": permissions,
        },
    }


# ============================================================
# 4. Token 刷新
# ============================================================

@auth_bp.route("/refresh", methods=["POST"])
@login_required
def refresh():
    """刷新 JWT Token（需在旧Token过期前调用）"""
    login_type = getattr(g, "login_type", "admin")
    new_token = create_token(g.admin_id, g.role, login_type)

    return {
        "code": 200,
        "message": "Token刷新成功",
        "data": {
            "token": new_token,
            "token_type": "Bearer",
            "expires_in": 7200,
        },
    }


# ============================================================
# 5. 登出
# ============================================================

@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    login_type = getattr(g, "login_type", "admin")
    db.execute_update(
        "INSERT INTO operation_log (admin_id, module, action, client_ip) VALUES (%s, '认证', %s, %s)",
        (
            g.admin_id if login_type == "admin" else None,
            f"{'读者' if login_type == 'reader' else '管理员'}登出",
            request.remote_addr or "unknown",
        ),
    )
    return {"code": 200, "message": "已登出"}
