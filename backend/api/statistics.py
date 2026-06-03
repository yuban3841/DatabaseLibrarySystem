"""查询统计 API"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required

stats_bp = Blueprint("statistics", __name__)


@stats_bp.route("/dashboard", methods=["GET"])
@login_required
def dashboard():
    sql = """
        SELECT
            (SELECT COUNT(*) FROM reader) AS total_readers,
            (SELECT COUNT(*) FROM reader WHERE status='normal') AS active_readers,
            (SELECT COUNT(*) FROM book WHERE status!='removed') AS total_books,
            (SELECT COUNT(*) FROM borrow_record WHERE status='borrowed') AS borrowed_books,
            (SELECT COUNT(*) FROM borrow_record WHERE status='borrowed' AND due_date<GETDATE()) AS overdue_books,
            (SELECT ISNULL(SUM(amount),0) FROM fine_record WHERE paid_status=0) AS total_fines_unpaid,
            (SELECT COUNT(*) FROM borrow_record WHERE borrow_date=CAST(GETDATE() AS DATE)) AS today_borrows,
            (SELECT COUNT(*) FROM borrow_record WHERE actual_return_date=CAST(GETDATE() AS DATE)) AS today_returns,
            (SELECT COUNT(*) FROM reservation WHERE status='waiting') AS waiting_reservations
    """
    row = db.execute_one(sql)
    return {"code": 200, "data": row}


@stats_bp.route("/hot-books", methods=["GET"])
@login_required
def hot_books():
    top_n = min(max(request.args.get("top_n", 10, type=int), 1), 100)
    rows = db.execute_query(
        f"SELECT TOP {top_n} * FROM v_hot_books ORDER BY rank"
    )
    return {"code": 200, "data": rows}


@stats_bp.route("/overdue-list", methods=["GET"])
@login_required
def overdue_list():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    offset = (page - 1) * page_size
    rows = db.execute_query(
        "SELECT * FROM v_overdue_list ORDER BY overdue_days DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
        (offset, page_size)
    )
    total = db.execute_one("SELECT COUNT(*) AS total FROM v_overdue_list")
    return {
        "code": 200, "data": rows,
        "page": {"page": page, "page_size": page_size, "total": total["total"] if total else 0}
    }


@stats_bp.route("/inventory-by-category", methods=["GET"])
@login_required
def inventory():
    rows = db.execute_query("""
        SELECT bc.category_id, bc.category_name, COUNT(b.book_id) AS book_types,
               SUM(bi.total_count) AS total, SUM(bi.in_library_count) AS in_lib, SUM(bi.borrowed_count) AS borrowed
        FROM book_category bc LEFT JOIN book b ON bc.category_id=b.category_id
        LEFT JOIN book_inventory bi ON b.book_id=bi.book_id
        WHERE b.status!='removed' OR b.book_id IS NULL
        GROUP BY bc.category_id, bc.category_name ORDER BY total DESC
    """)
    return {"code": 200, "data": rows}


@stats_bp.route("/reader-activity", methods=["GET"])
@login_required
def reader_activity():
    tid = request.args.get("reader_type_id", type=int)
    level = request.args.get("activity_level", "").strip()
    sql = "SELECT * FROM v_reader_activity WHERE 1=1"
    params = []
    if tid:
        sql += " AND reader_type_id=?"; params.append(tid)
    if level and level in ("高频", "中频", "低频"):
        sql += " AND activity_level=?"; params.append(level)
    rows = db.execute_query(sql, tuple(params))
    return {"code": 200, "data": rows}


@stats_bp.route("/borrow-stats", methods=["GET"])
@login_required
def borrow_stats():
    period = request.args.get("period", "month")
    if period not in ("day", "month", "year"):
        return {"code": 400, "message": "非法统计周期"}, 400
    fmt_map = {
        "day": "CAST(borrow_date AS DATE)",
        "month": "FORMAT(borrow_date, 'yyyy-MM')",
        "year": "CAST(YEAR(borrow_date) AS NVARCHAR)"
    }
    sd = request.args.get("start_date", "2026-01-01")
    ed = request.args.get("end_date", "2026-12-31")
    rows = db.execute_query(
        f"SELECT {fmt_map[period]} AS label, COUNT(*) AS cnt, COUNT(DISTINCT reader_id) AS readers FROM borrow_record WHERE borrow_date BETWEEN ? AND ? GROUP BY {fmt_map[period]} ORDER BY label",
        (sd, ed)
    )
    return {"code": 200, "data": rows}
