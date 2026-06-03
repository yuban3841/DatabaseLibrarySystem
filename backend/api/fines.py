"""罚款管理 API"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required
from utils.pagination import paginate

fines_bp = Blueprint("fines", __name__)


@fines_bp.route("", methods=["GET"])
@login_required
def list_all():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    reader_id = request.args.get("reader_id", "").strip()
    paid = request.args.get("paid_status", type=int)
    sd = request.args.get("start_date", "").strip()
    ed = request.args.get("end_date", "").strip()

    conds, params = [], []
    if reader_id:
        conds.append("f.reader_id=?"); params.append(reader_id)
    if paid is not None:
        conds.append("f.paid_status=?"); params.append(paid)
    if sd:
        conds.append("f.generate_date>=?"); params.append(sd)
    if ed:
        conds.append("f.generate_date<=?"); params.append(ed)

    where = " AND ".join(conds) if conds else "1=1"
    base = f"""
        SELECT f.*, r.name AS reader_name, b.title AS book_title
        FROM fine_record f JOIN reader r ON f.reader_id=r.reader_id JOIN book b ON f.book_id=b.book_id
        WHERE {where} ORDER BY f.generate_date DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"""
    count = f"SELECT COUNT(*) AS total FROM fine_record f WHERE {where}"
    return paginate(base, count, params, page, page_size)


@fines_bp.route("/pay", methods=["POST"])
@login_required
def pay():
    data = request.get_json(silent=True) or {}
    ids = data.get("fine_ids", [])
    if not ids or not isinstance(ids, list):
        return {"code": 400, "message": "请提供罚款ID列表"}, 400
    ph = ",".join(["?"] * len(ids))
    n = db.execute_update(f"UPDATE fine_record SET paid_status=1 WHERE fine_id IN({ph}) AND paid_status=0", tuple(ids))
    return {"code": 200, "message": f"已缴纳{n}笔罚款"}


@fines_bp.route("/summary/<reader_id>", methods=["GET"])
@login_required
def summary(reader_id):
    row = db.execute_one(
        "SELECT COUNT(*) AS count, ISNULL(SUM(amount),0) AS total, SUM(CASE WHEN paid_status=0 THEN amount ELSE 0 END) AS unpaid FROM fine_record WHERE reader_id=?",
        (reader_id,))
    return {"code": 200, "data": row}
