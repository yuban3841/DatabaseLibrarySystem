"""图书管理 API"""
from flask import Blueprint, request, g
from db import db
from auth.decorator import login_required
from utils.pagination import paginate
from utils.validators import WHITELIST_BOOK_STATUS, WHITELIST_SORT_BOOKS, WHITELIST_SORT_DIR

books_bp = Blueprint("books", __name__)


@books_bp.route("", methods=["GET"])
@login_required
def list_books():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    keyword = request.args.get("keyword", "").strip()
    category_id = request.args.get("category_id", type=int)
    status = request.args.get("status", "").strip()
    sort_by = request.args.get("sort_by", "book_id")
    order = request.args.get("order", "ASC").upper()

    if sort_by not in WHITELIST_SORT_BOOKS:
        sort_by = "book_id"
    if order not in WHITELIST_SORT_DIR:
        order = "ASC"

    conds, params = [], []
    if keyword:
        conds.append("(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)")
        params.extend([f"%{keyword}%"] * 3)
    if category_id:
        conds.append("b.category_id=?")
        params.append(category_id)
    if status:
        if status not in WHITELIST_BOOK_STATUS:
            return {"code": 400, "message": "非法的状态值"}, 400
        conds.append("b.status=?")
        params.append(status)

    where = " AND ".join(conds) if conds else "1=1"
    base = f"""
        SELECT b.*, bc.category_name, bi.total_count, bi.in_library_count, bi.borrowed_count,
               (SELECT COUNT(*) FROM reservation WHERE book_id=b.book_id AND status IN('waiting','available')) AS reserved_count
        FROM book b LEFT JOIN book_category bc ON b.category_id=bc.category_id
        LEFT JOIN book_inventory bi ON b.book_id=bi.book_id
        WHERE {where} ORDER BY b.{sort_by} {order}
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY"""
    count = f"SELECT COUNT(*) AS total FROM book b WHERE {where}"
    return paginate(base, count, params, page, page_size)


@books_bp.route("/<book_id>", methods=["GET"])
@login_required
def get_book(book_id):
    b = db.execute_one("""
        SELECT b.*, bc.category_name, bi.total_count, bi.in_library_count, bi.borrowed_count,
               (SELECT COUNT(*) FROM reservation WHERE book_id=b.book_id AND status IN('waiting','available')) AS reserved_count
        FROM book b LEFT JOIN book_category bc ON b.category_id=bc.category_id
        LEFT JOIN book_inventory bi ON b.book_id=bi.book_id WHERE b.book_id=?""", (book_id,))
    if not b:
        return {"code": 404, "message": "图书不存在"}, 404
    if b["status"] == "borrowed":
        br = db.execute_query("""
            SELECT br.reader_id, r.name AS reader_name, br.borrow_date, br.due_date
            FROM borrow_record br JOIN reader r ON br.reader_id=r.reader_id
            WHERE br.book_id=? AND br.status='borrowed'""", (book_id,))
        b["current_borrowers"] = br
    return {"code": 200, "data": b}


@books_bp.route("", methods=["POST"])
@login_required
def create_book():
    data = request.get_json(silent=True) or {}
    bid = (data.get("book_id") or "").strip()
    title = (data.get("title") or "").strip()
    if not bid or not title:
        return {"code": 400, "message": "图书编号和书名必填"}, 400
    init_count = max(int(data.get("initial_count", 1)), 1)
    try:
        db.execute_update("""
            INSERT INTO book(book_id,title,author,publisher,publish_date,category_id,isbn,price,status)
            VALUES(?,?,?,?,?,?,?,?,'in_library')""",
            (bid, title, data.get("author"), data.get("publisher"), data.get("publish_date"),
             data.get("category_id"), data.get("isbn"), data.get("price")))
        db.execute_update(
            "INSERT INTO book_inventory(book_id,total_count,in_library_count,borrowed_count) VALUES(?,?,?,0)",
            (bid, init_count, init_count))
    except Exception as e:
        return {"code": 400, "message": str(e)}, 400
    return {"code": 201, "message": "入库成功", "data": {"book_id": bid}}


@books_bp.route("/<book_id>", methods=["PUT"])
@login_required
def update_book(book_id):
    data = request.get_json(silent=True) or {}
    allowed = {"title", "author", "publisher", "publish_date", "category_id", "isbn", "price"}
    sets, params = [], []
    for k in allowed:
        if k in data and data[k] is not None:
            sets.append(f"{k}=?")
            params.append(data[k])
    if not sets:
        return {"code": 400, "message": "无更新字段"}, 400
    params.append(book_id)
    db.execute_update(f"UPDATE book SET {','.join(sets)} WHERE book_id=?", tuple(params))
    return {"code": 200, "message": "更新成功"}


@books_bp.route("/<book_id>/status", methods=["PATCH"])
@login_required
def update_book_status(book_id):
    data = request.get_json(silent=True) or {}
    st = (data.get("status") or "").strip()
    if st not in WHITELIST_BOOK_STATUS:
        return {"code": 400, "message": "非法状态值"}, 400
    db.execute_update("UPDATE book SET status=? WHERE book_id=?", (st, book_id))
    return {"code": 200, "message": "状态更新成功"}


@books_bp.route("/categories", methods=["GET"])
@login_required
def list_categories():
    rows = db.execute_query("SELECT * FROM book_category ORDER BY category_id")
    return {"code": 200, "data": rows}
