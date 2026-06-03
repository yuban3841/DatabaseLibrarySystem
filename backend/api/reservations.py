"""预约管理 API"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required
from utils.pagination import paginate

reservations_bp = Blueprint("reservations", __name__)


@reservations_bp.route("", methods=["GET"])
@login_required
def list_all():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    reader_id = request.args.get("reader_id", "").strip()
    book_id = request.args.get("book_id", "").strip()
    status = request.args.get("status", "").strip()

    conds, params = [], []
    if reader_id:
        conds.append("rs.reader_id=?"); params.append(reader_id)
    if book_id:
        conds.append("rs.book_id=?"); params.append(book_id)
    if status and status in ("waiting", "available", "cancelled", "completed"):
        conds.append("rs.status=?"); params.append(status)

    where = " AND ".join(conds) if conds else "1=1"
    base = f"""
        SELECT rs.*, r.name AS reader_name, b.title AS book_title
        FROM reservation rs JOIN reader r ON rs.reader_id=r.reader_id JOIN book b ON rs.book_id=b.book_id
        WHERE {where} ORDER BY rs.reserve_time DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"""
    count = f"SELECT COUNT(*) AS total FROM reservation rs WHERE {where}"
    return paginate(base, count, params, page, page_size)


@reservations_bp.route("", methods=["POST"])
@login_required
def create():
    data = request.get_json(silent=True) or {}
    reader_id = (data.get("reader_id") or "").strip()
    book_id = (data.get("book_id") or "").strip()
    if not reader_id or not book_id:
        return {"code": 400, "message": "参数必填"}, 400
    try:
        db.execute_proc_raw("usp_CreateReservation", {"ReaderID": reader_id, "BookID": book_id})
    except Exception as e:
        return {"code": 400, "message": f"预约失败: {e}"}, 400
    return {"code": 201, "message": "预约成功"}


@reservations_bp.route("/<int:reservation_id>/cancel", methods=["PATCH"])
@login_required
def cancel(reservation_id):
    affected = db.execute_update(
        "UPDATE reservation SET status='cancelled' WHERE reservation_id=? AND status='waiting'",
        (reservation_id,))
    if affected == 0:
        return {"code": 404, "message": "预约不存在或已处理"}, 404
    return {"code": 200, "message": "已取消"}


@reservations_bp.route("/expire", methods=["POST"])
@login_required
def expire():
    n = db.execute_update("UPDATE reservation SET status='cancelled' WHERE status='available' AND expire_time<GETDATE()")
    return {"code": 200, "message": f"已取消{n}条过期预约"}
