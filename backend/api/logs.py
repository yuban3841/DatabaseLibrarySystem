"""操作日志 API — system_admin only"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required, role_required
from utils.pagination import paginate

logs_bp = Blueprint("logs", __name__)


@logs_bp.route("", methods=["GET"])
@login_required
@role_required("system_admin")
def list_logs():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 50, type=int)
    admin_id = request.args.get("admin_id", type=int)
    module = request.args.get("module", "").strip()
    keyword = request.args.get("keyword", "").strip()
    st = request.args.get("start_time", "").strip()
    et = request.args.get("end_time", "").strip()

    conds, params = [], []
    if admin_id:
        conds.append("ol.admin_id=?"); params.append(admin_id)
    if module:
        conds.append("ol.module=?"); params.append(module)
    if keyword:
        conds.append("ol.action LIKE ?"); params.append(f"%{keyword}%")
    if st:
        conds.append("ol.operation_time>=?"); params.append(st)
    if et:
        conds.append("ol.operation_time<=?"); params.append(et)

    where = " AND ".join(conds) if conds else "1=1"
    base = f"""
        SELECT ol.*, a.username, a.name AS admin_name
        FROM operation_log ol LEFT JOIN admin a ON ol.admin_id=a.admin_id
        WHERE {where} ORDER BY ol.operation_time DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"""
    count = f"SELECT COUNT(*) AS total FROM operation_log ol WHERE {where}"
    return paginate(base, count, params, page, page_size)


@logs_bp.route("/alerts", methods=["GET"])
@login_required
@role_required("system_admin")
def alerts():
    rows = db.execute_query("""
        SELECT client_ip, COUNT(*) AS fail_count
        FROM operation_log
        WHERE module='认证' AND action LIKE '登录失败%' AND operation_time>=DATEADD(HOUR,-24,GETDATE())
        GROUP BY client_ip HAVING COUNT(*)>5
    """)
    return {"code": 200, "data": rows}
