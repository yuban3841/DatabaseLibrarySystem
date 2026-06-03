"""借阅管理 API"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required
from utils.pagination import paginate

borrow_bp = Blueprint("borrow", __name__)


@borrow_bp.route("/borrow", methods=["POST"])
@login_required
def borrow():
    data = request.get_json(silent=True) or {}
    reader_id = (data.get("reader_id") or "").strip()
    book_id = (data.get("book_id") or "").strip()
    if not reader_id or not book_id:
        return {"code": 400, "message": "读者编号和图书编号必填"}, 400

    # 读者检查
    reader = db.execute_one("SELECT reader_id, status, reader_type_id FROM reader WHERE reader_id=?", (reader_id,))
    if not reader:
        return {"code": 404, "message": "读者不存在"}, 404
    if reader["status"] != "normal":
        return {"code": 400, "message": "读者状态异常，无法借书"}, 400

    # 逾期
    od = db.execute_one("SELECT COUNT(*) AS cnt FROM borrow_record WHERE reader_id=? AND status='borrowed' AND due_date<GETDATE()", (reader_id,))
    if od and od["cnt"] > 0:
        return {"code": 400, "message": "存在逾期未还图书，无法借书"}, 400

    # 欠费
    uf = db.execute_one("SELECT ISNULL(SUM(amount),0) AS total FROM fine_record WHERE reader_id=? AND paid_status=0", (reader_id,))
    if uf and uf["total"] > 0:
        return {"code": 400, "message": f"存在未缴罚款{uf['total']}元"}, 400

    # 上限
    max_b = _get_max_borrow(reader["reader_type_id"])
    cur = db.execute_one("SELECT COUNT(*) AS cnt FROM borrow_record WHERE reader_id=? AND status='borrowed'", (reader_id,))
    if cur and cur["cnt"] >= max_b:
        return {"code": 400, "message": f"已达借阅上限({max_b}册)"}, 400

    # 库存
    inv = db.execute_one("SELECT in_library_count FROM book_inventory WHERE book_id=?", (book_id,))
    if not inv or inv["in_library_count"] <= 0:
        return {"code": 400, "message": "库存不足"}, 400

    # 借阅天数
    days = _get_borrow_days(reader["reader_type_id"])

    try:
        db.execute_proc_raw("usp_BorrowBook", {"ReaderID": reader_id, "BookID": book_id})
    except Exception as e:
        return {"code": 500, "message": f"借书失败: {e}"}, 500

    # 日志
    db.execute_update(
        "INSERT INTO operation_log(admin_id,module,action,client_ip) VALUES(?,'借阅管理',?,?)",
        (g.admin_id, f"借书:{reader_id}->{book_id}", request.remote_addr or ""))

    return {
        "code": 200, "message": "借书成功",
        "data": {"reader_id": reader_id, "book_id": book_id, "borrow_date": _today(), "due_date": _today_plus(days)}
    }


@borrow_bp.route("/return", methods=["POST"])
@login_required
def return_book():
    data = request.get_json(silent=True) or {}
    book_id = (data.get("book_id") or "").strip()
    if not book_id:
        return {"code": 400, "message": "图书编号必填"}, 400

    rec = db.execute_one(
        "SELECT TOP 1 record_id, reader_id, due_date FROM borrow_record WHERE book_id=? AND status='borrowed' ORDER BY borrow_date DESC",
        (book_id,))
    if not rec:
        return {"code": 404, "message": "未找到在借记录"}, 404

    try:
        db.execute_proc_raw("usp_ReturnBook", {"BookID": book_id})
    except Exception as e:
        return {"code": 500, "message": f"还书失败: {e}"}, 500

    return {"code": 200, "message": "还书成功"}


@borrow_bp.route("/renew", methods=["POST"])
@login_required
def renew():
    data = request.get_json(silent=True) or {}
    reader_id = (data.get("reader_id") or "").strip()
    book_id = (data.get("book_id") or "").strip()
    if not reader_id or not book_id:
        return {"code": 400, "message": "参数必填"}, 400

    try:
        db.execute_proc_raw("usp_RenewBook", {"ReaderID": reader_id, "BookID": book_id})
    except Exception as e:
        return {"code": 400, "message": f"续借失败: {e}"}, 400

    return {"code": 200, "message": "续借成功"}


@borrow_bp.route("/records", methods=["GET"])
@login_required
def list_records():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    reader_id = request.args.get("reader_id", "").strip()
    book_id = request.args.get("book_id", "").strip()
    status = request.args.get("status", "").strip()
    sd = request.args.get("start_date", "").strip()
    ed = request.args.get("end_date", "").strip()

    conds, params = [], []
    if reader_id:
        conds.append("br.reader_id=?"); params.append(reader_id)
    if book_id:
        conds.append("br.book_id=?"); params.append(book_id)
    if status and status in ("borrowed", "returned"):
        conds.append("br.status=?"); params.append(status)
    if sd:
        conds.append("br.borrow_date>=?"); params.append(sd)
    if ed:
        conds.append("br.borrow_date<=?"); params.append(ed)

    where = " AND ".join(conds) if conds else "1=1"
    base = f"""
        SELECT br.*, r.name AS reader_name, b.title AS book_title
        FROM borrow_record br JOIN reader r ON br.reader_id=r.reader_id JOIN book b ON br.book_id=b.book_id
        WHERE {where} ORDER BY br.borrow_date DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"""
    count = f"SELECT COUNT(*) AS total FROM borrow_record br WHERE {where}"
    return paginate(base, count, params, page, page_size)


def _get_max_borrow(reader_type_id):
    r = db.execute_one(
        "SELECT TOP 1 max_borrow FROM borrow_rule WHERE reader_type_id=? AND status='active' ORDER BY effective_date DESC",
        (reader_type_id,))
    if not r:
        r = db.execute_one("SELECT max_borrow_count AS max_borrow FROM reader_type WHERE reader_type_id=?", (reader_type_id,))
    return r["max_borrow"] if r else 10


def _get_borrow_days(reader_type_id):
    r = db.execute_one(
        "SELECT TOP 1 default_days FROM borrow_rule WHERE reader_type_id=? AND status='active' ORDER BY effective_date DESC",
        (reader_type_id,))
    if not r:
        r = db.execute_one("SELECT borrow_days AS default_days FROM reader_type WHERE reader_type_id=?", (reader_type_id,))
    return r["default_days"] if r else 30


def _today():
    from datetime import date
    return str(date.today())


def _today_plus(days):
    from datetime import date, timedelta
    return str(date.today() + timedelta(days=days))
