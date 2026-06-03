"""输入校验函数"""
import re
from html import escape
from typing import Any


def validate_reader_id(value: str) -> bool:
    return bool(re.match(r"^[A-Za-z0-9]{1,20}$", value or ""))


def validate_phone(value: str) -> bool:
    return bool(re.match(r"^\d{11}$", value or ""))


def validate_isbn(value: str) -> bool:
    return bool(re.match(r"^[\d-]{10,17}$", value or ""))


def sanitize(value: str | None) -> str | None:
    if value is None:
        return None
    return escape(str(value).strip())


WHITELIST_SORT_BOOKS = {"book_id", "title", "author", "publish_date", "price"}
WHITELIST_SORT_DIR = {"ASC", "DESC"}
WHITELIST_READER_STATUS = {"normal", "lost", "cancelled"}
WHITELIST_BOOK_STATUS = {"in_library", "borrowed", "reserved", "damaged", "lost", "removed"}
WHITELIST_RESERVATION_STATUS = {"waiting", "available", "cancelled", "completed"}
WHITELIST_ACTIVITY_LEVEL = {"高频", "中频", "低频"}
WHITELIST_STAT_PERIOD = {"day", "month", "year"}
WHITELIST_GENDER = {"M", "F"}
WHITELIST_ROLE = {"system_admin", "normal_admin"}
WHITELIST_REPORT_FORMAT = {"screen", "print", "excel"}


def check_whitelist(value: str, allowed: set[str], name: str) -> None:
    if value not in allowed:
        raise ValueError(f"非法的{name}: {value}")
