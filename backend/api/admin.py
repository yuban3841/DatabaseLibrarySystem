"""系统管理 API — 仅 system_admin"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required, role_required
from utils.security import hash_password
from utils.pagination import paginate

admin_bp = Blueprint("admin_api", __name__)


@admin_bp.route("/users", methods=["GET"])
@login_required
@role_required("system_admin")
def list_users():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    base = "SELECT admin_id,username,name,role,status,last_login_time FROM admin ORDER BY admin_id OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"
    count = "SELECT COUNT(*) AS total FROM admin"
    return paginate(base, count, [], page, page_size)


@admin_bp.route("/users", methods=["POST"])
@login_required
@role_required("system_admin")
def create_user():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    role = (data.get("role") or "").strip()
    if not username or not password or not name:
        return {"code": 400, "message": "用户名、密码、姓名必填"}, 400
    if role not in ("system_admin", "normal_admin"):
        return {"code": 400, "message": "非法角色"}, 400
    if db.execute_one("SELECT 1 FROM admin WHERE username=?", (username,)):
        return {"code": 409, "message": "用户名已存在"}, 409
    pwd_hash = hash_password(password)
    db.execute_update(
        "INSERT INTO admin(username,password_hash,name,role,status) VALUES(?,?,?,?,'active')",
        (username, pwd_hash, name, role))
    return {"code": 201, "message": "创建成功"}


@admin_bp.route("/users/<int:admin_id>/status", methods=["PATCH"])
@login_required
@role_required("system_admin")
def toggle_user(admin_id):
    data = request.get_json(silent=True) or {}
    st = data.get("status", "active")
    if st not in ("active", "inactive"):
        return {"code": 400, "message": "非法状态"}, 400
    db.execute_update("UPDATE admin SET status=? WHERE admin_id=?", (st, admin_id))
    return {"code": 200, "message": "更新成功"}


@admin_bp.route("/users/<int:admin_id>/password", methods=["PUT"])
@login_required
@role_required("system_admin")
def change_password(admin_id):
    data = request.get_json(silent=True) or {}
    new_pwd = data.get("new_password") or ""
    if len(new_pwd) < 6:
        return {"code": 400, "message": "密码至少6位"}, 400
    db.execute_update("UPDATE admin SET password_hash=? WHERE admin_id=?", (hash_password(new_pwd), admin_id))
    return {"code": 200, "message": "密码已更新"}


@admin_bp.route("/borrow-rules", methods=["GET"])
@login_required
def list_rules():
    tid = request.args.get("reader_type_id", type=int)
    status = request.args.get("status", "active")
    sql = """SELECT br.*, rt.type_name FROM borrow_rule br JOIN reader_type rt ON br.reader_type_id=rt.reader_type_id WHERE 1=1"""
    params = []
    if tid:
        sql += " AND br.reader_type_id=?"; params.append(tid)
    if status:
        sql += " AND br.status=?"; params.append(status)
    rows = db.execute_query(sql + " ORDER BY br.effective_date DESC", tuple(params))
    return {"code": 200, "data": rows}


@admin_bp.route("/borrow-rules", methods=["POST"])
@login_required
@role_required("system_admin")
def create_rule():
    data = request.get_json(silent=True) or {}
    db.execute_update("""
        INSERT INTO borrow_rule(reader_type_id,max_borrow,default_days,max_renew,renew_days,overdue_fee_per_day,reserve_hold_hours,effective_date,status)
        VALUES(?,?,?,?,?,?,?,?,'active')""",
        (data["reader_type_id"], data["max_borrow"], data["default_days"], data["max_renew"],
         data.get("renew_days", 15), data.get("overdue_fee_per_day", 0.5),
         data.get("reserve_hold_hours", 48), data.get("effective_date", "")))
    return {"code": 201, "message": "创建成功"}


@admin_bp.route("/permissions", methods=["GET"])
@login_required
def list_permissions():
    role = request.args.get("role", "").strip()
    sql = "SELECT * FROM permission_config WHERE 1=1"
    params = []
    if role:
        sql += " AND role=?"; params.append(role)
    rows = db.execute_query(sql + " ORDER BY role, module_code", tuple(params))
    return {"code": 200, "data": rows}
