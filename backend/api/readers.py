"""读者管理 API"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required
from utils.pagination import paginate
from utils.validators import WHITELIST_READER_STATUS

readers_bp = Blueprint("readers", __name__)


@readers_bp.route("", methods=["GET"])
@login_required
def list_readers():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    keyword = request.args.get("keyword", "").strip()
    reader_type_id = request.args.get("reader_type_id", type=int)
    status = request.args.get("status", "").strip()
    department = request.args.get("department", "").strip()

    conds, params = [], []
    if keyword:
        conds.append("(r.reader_id LIKE ? OR r.name LIKE ?)")
        params.extend([f"%{keyword}%", f"%{keyword}%"])
    if reader_type_id:
        conds.append("r.reader_type_id = ?")
        params.append(reader_type_id)
    if status:
        if status not in WHITELIST_READER_STATUS:
            return {"code": 400, "message": "非法的状态值"}, 400
        conds.append("r.status = ?")
        params.append(status)
    if department:
        conds.append("r.department LIKE ?")
        params.append(f"%{department}%")

    where = " AND ".join(conds) if conds else "1=1"
    base = f"""
        SELECT r.*, rt.type_name, rt.max_borrow_count, rt.borrow_days, rt.max_renew_count,
               (SELECT COUNT(*) FROM borrow_record WHERE reader_id=r.reader_id AND status='borrowed') AS current_borrow
        FROM reader r LEFT JOIN reader_type rt ON r.reader_type_id=rt.reader_type_id
        WHERE {where} ORDER BY r.reg_date DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"""
    count = f"SELECT COUNT(*) AS total FROM reader r WHERE {where}"
    return paginate(base, count, params, page, page_size)


@readers_bp.route("/<reader_id>", methods=["GET"])
@login_required
def get_reader(reader_id):
    r = db.execute_one("""
        SELECT r.*, rt.type_name, rt.max_borrow_count, rt.borrow_days, rt.max_renew_count
        FROM reader r LEFT JOIN reader_type rt ON r.reader_type_id=rt.reader_type_id
        WHERE r.reader_id=?""", (reader_id,))
    if not r:
        return {"code": 404, "message": "读者不存在"}, 404
    borrows = db.execute_query("""
        SELECT br.*, b.title FROM borrow_record br JOIN book b ON br.book_id=b.book_id
        WHERE br.reader_id=? AND br.status='borrowed'""", (reader_id,))
    r["current_borrows"] = borrows
    return {"code": 200, "data": r}


@readers_bp.route("", methods=["POST"])
@login_required
def create_reader():
    data = request.get_json(silent=True) or {}
    rid = (data.get("reader_id") or "").strip()
    name = (data.get("name") or "").strip()
    if not rid or not name:
        return {"code": 400, "message": "读者编号和姓名必填"}, 400
    if db.execute_one("SELECT 1 FROM reader WHERE reader_id=?", (rid,)):
        return {"code": 409, "message": "读者编号已存在"}, 409
    gender = data.get("gender")
    if gender and gender not in ("M", "F"):
        return {"code": 400, "message": "性别仅允许M/F"}, 400
    try:
        db.execute_update("""
            INSERT INTO reader(reader_id,name,gender,phone,department,reader_type_id,status,reg_date)
            VALUES(?,?,?,?,?,?,'normal',GETDATE())""",
            (rid, name, gender, data.get("phone"), data.get("department"), data.get("reader_type_id")))
    except Exception as e:
        return {"code": 400, "message": str(e)}, 400
    return {"code": 201, "message": "创建成功", "data": {"reader_id": rid}}


@readers_bp.route("/<reader_id>", methods=["PUT"])
@login_required
def update_reader(reader_id):
    data = request.get_json(silent=True) or {}
    allowed = {"name", "phone", "department", "reader_type_id"}
    sets, params = [], []
    for k in allowed:
        if k in data and data[k] is not None:
            sets.append(f"{k}=?")
            params.append(data[k])
    if not sets:
        return {"code": 400, "message": "无更新字段"}, 400
    params.append(reader_id)
    db.execute_update(f"UPDATE reader SET {','.join(sets)} WHERE reader_id=?", tuple(params))
    return {"code": 200, "message": "更新成功"}


@readers_bp.route("/<reader_id>/status", methods=["PATCH"])
@login_required
def update_status(reader_id):
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()
    if new_status not in WHITELIST_READER_STATUS:
        return {"code": 400, "message": "非法状态值"}, 400
    if new_status == "cancelled":
        ub = db.execute_one("SELECT COUNT(*) AS cnt FROM borrow_record WHERE reader_id=? AND status='borrowed'", (reader_id,))
        if ub and ub["cnt"] > 0:
            return {"code": 409, "message": "存在未归还图书，无法注销"}, 409
    db.execute_update("UPDATE reader SET status=? WHERE reader_id=?", (new_status, reader_id))
    return {"code": 200, "message": "状态更新成功"}


@readers_bp.route("/types", methods=["GET"])
@login_required
def list_types():
    rows = db.execute_query("SELECT * FROM reader_type ORDER BY reader_type_id")
    return {"code": 200, "data": rows}


@readers_bp.route("/types", methods=["POST"])
@login_required
def create_type():
    data = request.get_json(silent=True) or {}
    name = (data.get("type_name") or "").strip()
    if not name:
        return {"code": 400, "message": "类别名称必填"}, 400
    db.execute_update(
        "INSERT INTO reader_type(type_name,max_borrow_count,borrow_days,max_renew_count) VALUES(?,?,?,?)",
        (name, data.get("max_borrow_count", 10), data.get("borrow_days", 30), data.get("max_renew_count", 2)))
    return {"code": 201, "message": "创建成功"}
