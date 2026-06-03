"""统一分页工具"""
from db import db


def paginate(base_sql: str, count_sql: str, params: list,
             page: int = 1, page_size: int = 20) -> dict:
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 100)

    total = db.execute_one(count_sql, tuple(params))["total"]
    offset = (page - 1) * page_size

    # SQL: OFFSET {offset} ROWS FETCH NEXT {page_size} ROWS ONLY
    data = db.execute_query(base_sql, tuple(params + [offset, page_size]))

    return {
        "code": 200,
        "message": "success",
        "data": data,
        "page": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total > 0 else 0,
        },
    }
