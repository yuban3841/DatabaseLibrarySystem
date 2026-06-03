"""图书管理系统 Python 前端

运行：
    streamlit run app.py

说明：
    本前端通过已有 Flask API 操作数据库，不直接连接 SQL Server。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd
import requests
import streamlit as st


DEFAULT_API_BASE = "http://localhost:5000"
PAGE_SIZE_OPTIONS = [10, 20, 50, 100]


@dataclass
class ApiError(Exception):
    message: str
    status_code: Optional[int] = None

    def __str__(self) -> str:
        if self.status_code:
            return f"[{self.status_code}] {self.message}"
        return self.message


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        timeout: int = 15,
    ) -> Dict[str, Any]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        url = f"{self.base_url}{path}"
        try:
            resp = requests.request(
                method=method.upper(),
                url=url,
                params=clean_params(params or {}),
                json=clean_json(json or {}) if json is not None else None,
                headers=headers,
                timeout=timeout,
            )
        except requests.RequestException as exc:
            raise ApiError(f"无法连接后端：{exc}") from exc

        try:
            payload = resp.json()
        except ValueError as exc:
            raise ApiError(f"后端返回的不是 JSON：{resp.text[:200]}", resp.status_code) from exc

        if resp.status_code >= 400 or int(payload.get("code", resp.status_code)) >= 400:
            raise ApiError(payload.get("message", "请求失败"), resp.status_code)
        return payload

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("GET", path, params=params)

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("POST", path, json=json)

    def put(self, path: str, json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("PUT", path, json=json)

    def patch(self, path: str, json: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return self.request("PATCH", path, json=json)


# -----------------------------
# 通用工具
# -----------------------------

def init_state() -> None:
    defaults = {
        "api_base": DEFAULT_API_BASE,
        "token": None,
        "user_info": None,
        "login_type": "admin",
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def client() -> ApiClient:
    return ApiClient(st.session_state["api_base"], st.session_state.get("token"))


def clean_params(params: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for key, value in params.items():
        if value is None or value == "" or value == "全部":
            continue
        cleaned[key] = value
    return cleaned


def clean_json(data: Dict[str, Any]) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for key, value in data.items():
        if value == "":
            cleaned[key] = None
        else:
            cleaned[key] = value
    return cleaned


def to_df(rows: Any) -> pd.DataFrame:
    if rows is None:
        return pd.DataFrame()
    if isinstance(rows, list):
        return pd.DataFrame(rows)
    if isinstance(rows, dict):
        return pd.DataFrame([rows])
    return pd.DataFrame()


def show_table(rows: Any, *, key: str, use_container_width: bool = True) -> None:
    df = to_df(rows)
    if df.empty:
        st.info("暂无数据")
        return
    st.dataframe(df, use_container_width=use_container_width, hide_index=True, key=key)


def show_page_info(payload: Dict[str, Any]) -> None:
    page = payload.get("page") or {}
    if page:
        st.caption(
            f"第 {page.get('page', '-')} 页 / 共 {page.get('total_pages', '-')} 页，"
            f"共 {page.get('total', 0)} 条"
        )


def parse_ids(raw: str) -> List[int]:
    ids: List[int] = []
    for item in raw.replace("，", ",").split(","):
        item = item.strip()
        if item:
            ids.append(int(item))
    return ids


def run_action(success_text: str, func, *args, **kwargs) -> None:
    try:
        payload = func(*args, **kwargs)
        st.success(payload.get("message", success_text))
    except ApiError as exc:
        st.error(str(exc))
    except Exception as exc:
        st.error(f"操作失败：{exc}")


def safe_get(path: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    try:
        return client().get(path, params=params)
    except ApiError as exc:
        st.error(str(exc))
        return None


def login_page() -> None:
    st.set_page_config(page_title="图书管理系统", page_icon="📚", layout="wide")
    st.title("图书管理系统")
    st.caption("Python Streamlit 前端，调用 Flask REST API。")

    with st.sidebar:
        st.subheader("后端配置")
        st.session_state["api_base"] = st.text_input("API 地址", st.session_state["api_base"])
        if st.button("检测后端连接", use_container_width=True):
            try:
                payload = ApiClient(st.session_state["api_base"]).get("/api/health")
                st.success(payload.get("message", "连接正常"))
            except ApiError as exc:
                st.error(str(exc))

    col_left, col_mid, col_right = st.columns([1, 1.2, 1])
    with col_mid:
        with st.form("login_form"):
            st.subheader("登录")
            login_type_label = st.radio("登录类型", ["管理员", "读者"], horizontal=True)
            username = st.text_input("用户名 / 读者编号", value="admin" if login_type_label == "管理员" else "R001")
            password = st.text_input("密码", type="password", value="Admin@123" if login_type_label == "管理员" else "Reader@123")
            submitted = st.form_submit_button("登录", use_container_width=True)

        if submitted:
            login_type = "admin" if login_type_label == "管理员" else "reader"
            try:
                payload = ApiClient(st.session_state["api_base"]).post(
                    "/auth/login",
                    json={"username": username, "password": password, "loginType": login_type},
                )
                data = payload.get("data") or {}
                st.session_state["token"] = data.get("token")
                st.session_state["user_info"] = data.get("userInfo") or {}
                st.session_state["login_type"] = login_type
                st.success("登录成功")
                st.rerun()
            except ApiError as exc:
                st.error(str(exc))


# -----------------------------
# 页面：首页统计
# -----------------------------

def page_dashboard() -> None:
    st.header("首页统计")
    payload = safe_get("/api/statistics/dashboard")
    if not payload:
        return
    data = payload.get("data") or {}

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("读者总数", data.get("total_readers", 0))
    c2.metric("正常读者", data.get("active_readers", 0))
    c3.metric("馆藏图书", data.get("total_books", 0))
    c4.metric("在借图书", data.get("borrowed_books", 0))

    c5, c6, c7, c8 = st.columns(4)
    c5.metric("逾期图书", data.get("overdue_books", 0))
    c6.metric("未缴罚款", data.get("total_fines_unpaid", 0))
    c7.metric("今日借出", data.get("today_borrows", 0))
    c8.metric("等待预约", data.get("waiting_reservations", 0))

    st.divider()
    left, right = st.columns(2)
    with left:
        st.subheader("热门图书")
        hot = safe_get("/api/statistics/hot-books", {"top_n": 10})
        if hot:
            show_table(hot.get("data"), key="hot_books")
    with right:
        st.subheader("分类库存")
        inv = safe_get("/api/statistics/inventory-by-category")
        if inv:
            df = to_df(inv.get("data"))
            if not df.empty:
                st.dataframe(df, use_container_width=True, hide_index=True)
                chart_cols = [c for c in ["category_name", "total", "in_lib", "borrowed"] if c in df.columns]
                if {"category_name", "total"}.issubset(df.columns):
                    st.bar_chart(df.set_index("category_name")[[c for c in ["total", "in_lib", "borrowed"] if c in df.columns]])
            else:
                st.info("暂无数据")

    st.subheader("借阅趋势")
    col1, col2, col3 = st.columns(3)
    period = col1.selectbox("统计周期", ["day", "month", "year"], format_func={"day": "按日", "month": "按月", "year": "按年"}.get)
    start_date = col2.text_input("开始日期", "2026-01-01")
    end_date = col3.text_input("结束日期", "2026-12-31")
    stats = safe_get("/api/statistics/borrow-stats", {"period": period, "start_date": start_date, "end_date": end_date})
    if stats:
        df = to_df(stats.get("data"))
        if not df.empty and {"label", "cnt"}.issubset(df.columns):
            st.line_chart(df.set_index("label")[["cnt"]])
            show_table(df, key="borrow_stats")
        else:
            st.info("暂无数据")


# -----------------------------
# 页面：图书管理
# -----------------------------

def page_books() -> None:
    st.header("图书管理")

    with st.expander("新增图书 / 入库", expanded=False):
        with st.form("create_book"):
            c1, c2, c3 = st.columns(3)
            book_id = c1.text_input("图书编号 *")
            title = c2.text_input("书名 *")
            author = c3.text_input("作者")
            c4, c5, c6 = st.columns(3)
            publisher = c4.text_input("出版社")
            publish_date = c5.text_input("出版日期", placeholder="YYYY-MM-DD")
            category_id = c6.number_input("分类ID", min_value=0, step=1, value=0)
            c7, c8, c9 = st.columns(3)
            isbn = c7.text_input("ISBN")
            price = c8.number_input("价格", min_value=0.0, step=0.1, value=0.0)
            initial_count = c9.number_input("初始库存", min_value=1, step=1, value=1)
            if st.form_submit_button("提交入库"):
                run_action(
                    "入库成功",
                    client().post,
                    "/api/books",
                    json={
                        "book_id": book_id,
                        "title": title,
                        "author": author,
                        "publisher": publisher,
                        "publish_date": publish_date,
                        "category_id": category_id or None,
                        "isbn": isbn,
                        "price": price,
                        "initial_count": initial_count,
                    },
                )

    st.subheader("图书查询")
    f1, f2, f3, f4, f5 = st.columns([2, 1, 1, 1, 1])
    keyword = f1.text_input("关键词", placeholder="书名 / 作者 / ISBN")
    category_id_filter = f2.number_input("分类ID", min_value=0, step=1, value=0, key="book_cat_filter")
    status = f3.selectbox("状态", ["全部", "in_library", "borrowed", "lost", "damaged", "removed"])
    page = f4.number_input("页码", min_value=1, step=1, value=1, key="books_page")
    page_size = f5.selectbox("每页", PAGE_SIZE_OPTIONS, index=1, key="books_page_size")

    payload = safe_get(
        "/api/books",
        {
            "keyword": keyword,
            "category_id": category_id_filter or None,
            "status": status,
            "page": page,
            "page_size": page_size,
        },
    )
    if payload:
        show_page_info(payload)
        show_table(payload.get("data"), key="books_table")

    with st.expander("修改图书信息 / 更新状态", expanded=False):
        tab_update, tab_status, tab_detail = st.tabs(["修改信息", "更新状态", "查看详情"])
        with tab_update:
            with st.form("update_book"):
                target_id = st.text_input("要修改的图书编号", key="update_book_id")
                c1, c2, c3 = st.columns(3)
                new_title = c1.text_input("书名", key="update_title")
                new_author = c2.text_input("作者", key="update_author")
                new_publisher = c3.text_input("出版社", key="update_publisher")
                c4, c5, c6 = st.columns(3)
                new_publish_date = c4.text_input("出版日期", key="update_publish_date")
                new_category_id = c5.number_input("分类ID", min_value=0, step=1, value=0, key="update_category_id")
                new_isbn = c6.text_input("ISBN", key="update_isbn")
                new_price = st.number_input("价格", min_value=0.0, step=0.1, value=0.0, key="update_price")
                if st.form_submit_button("提交修改"):
                    run_action(
                        "更新成功",
                        client().put,
                        f"/api/books/{target_id}",
                        json={
                            "title": new_title,
                            "author": new_author,
                            "publisher": new_publisher,
                            "publish_date": new_publish_date,
                            "category_id": new_category_id or None,
                            "isbn": new_isbn,
                            "price": new_price,
                        },
                    )
        with tab_status:
            with st.form("book_status"):
                target_id = st.text_input("图书编号", key="status_book_id")
                new_status = st.selectbox("新状态", ["in_library", "borrowed", "lost", "damaged", "removed"])
                if st.form_submit_button("更新状态"):
                    run_action("状态更新成功", client().patch, f"/api/books/{target_id}/status", json={"status": new_status})
        with tab_detail:
            detail_id = st.text_input("图书编号", key="detail_book_id")
            if st.button("查看图书详情") and detail_id:
                detail = safe_get(f"/api/books/{detail_id}")
                if detail:
                    st.json(detail.get("data"), expanded=False)

    with st.expander("图书分类", expanded=False):
        categories = safe_get("/api/books/categories")
        if categories:
            show_table(categories.get("data"), key="book_categories")


# -----------------------------
# 页面：读者管理
# -----------------------------

def page_readers() -> None:
    st.header("读者管理")

    with st.expander("新增读者", expanded=False):
        with st.form("create_reader"):
            c1, c2, c3 = st.columns(3)
            reader_id = c1.text_input("读者编号 *")
            name = c2.text_input("姓名 *")
            gender = c3.selectbox("性别", ["", "M", "F"])
            c4, c5, c6 = st.columns(3)
            phone = c4.text_input("手机号")
            department = c5.text_input("院系 / 部门")
            reader_type_id = c6.number_input("读者类型ID", min_value=0, step=1, value=1)
            if st.form_submit_button("新增读者"):
                run_action(
                    "创建成功",
                    client().post,
                    "/api/readers",
                    json={
                        "reader_id": reader_id,
                        "name": name,
                        "gender": gender or None,
                        "phone": phone,
                        "department": department,
                        "reader_type_id": reader_type_id,
                    },
                )

    st.subheader("读者查询")
    f1, f2, f3, f4, f5 = st.columns([2, 1, 1, 1, 1])
    keyword = f1.text_input("关键词", placeholder="读者编号 / 姓名")
    department = f2.text_input("部门")
    status = f3.selectbox("状态", ["全部", "normal", "lost", "cancelled"])
    page = f4.number_input("页码", min_value=1, step=1, value=1, key="readers_page")
    page_size = f5.selectbox("每页", PAGE_SIZE_OPTIONS, index=1, key="readers_page_size")
    type_id = st.number_input("读者类型ID筛选，0表示不限", min_value=0, step=1, value=0, key="reader_type_filter")

    payload = safe_get(
        "/api/readers",
        {
            "keyword": keyword,
            "department": department,
            "status": status,
            "reader_type_id": type_id or None,
            "page": page,
            "page_size": page_size,
        },
    )
    if payload:
        show_page_info(payload)
        show_table(payload.get("data"), key="readers_table")

    with st.expander("修改读者信息 / 更新状态 / 查看详情", expanded=False):
        tab_update, tab_status, tab_detail, tab_types = st.tabs(["修改信息", "更新状态", "查看详情", "读者类型"])
        with tab_update:
            with st.form("update_reader"):
                target_id = st.text_input("要修改的读者编号", key="update_reader_id")
                c1, c2, c3, c4 = st.columns(4)
                new_name = c1.text_input("姓名", key="reader_new_name")
                new_phone = c2.text_input("手机号", key="reader_new_phone")
                new_dept = c3.text_input("部门", key="reader_new_dept")
                new_type = c4.number_input("读者类型ID", min_value=0, step=1, value=0, key="reader_new_type")
                if st.form_submit_button("提交修改"):
                    run_action(
                        "更新成功",
                        client().put,
                        f"/api/readers/{target_id}",
                        json={"name": new_name, "phone": new_phone, "department": new_dept, "reader_type_id": new_type or None},
                    )
        with tab_status:
            with st.form("reader_status"):
                target_id = st.text_input("读者编号", key="status_reader_id")
                new_status = st.selectbox("新状态", ["normal", "lost", "cancelled"])
                if st.form_submit_button("更新读者状态"):
                    run_action("状态更新成功", client().patch, f"/api/readers/{target_id}/status", json={"status": new_status})
        with tab_detail:
            detail_id = st.text_input("读者编号", key="detail_reader_id")
            if st.button("查看读者详情") and detail_id:
                detail = safe_get(f"/api/readers/{detail_id}")
                if detail:
                    st.json(detail.get("data"), expanded=False)
        with tab_types:
            types_payload = safe_get("/api/readers/types")
            if types_payload:
                show_table(types_payload.get("data"), key="reader_types")
            with st.form("create_reader_type"):
                st.caption("新增读者类型")
                c1, c2, c3, c4 = st.columns(4)
                type_name = c1.text_input("类型名称")
                max_borrow_count = c2.number_input("最大借阅数", min_value=1, step=1, value=10)
                borrow_days = c3.number_input("借阅天数", min_value=1, step=1, value=30)
                max_renew_count = c4.number_input("最大续借次数", min_value=0, step=1, value=2)
                if st.form_submit_button("新增类型"):
                    run_action(
                        "创建成功",
                        client().post,
                        "/api/readers/types",
                        json={
                            "type_name": type_name,
                            "max_borrow_count": max_borrow_count,
                            "borrow_days": borrow_days,
                            "max_renew_count": max_renew_count,
                        },
                    )


# -----------------------------
# 页面：借还书
# -----------------------------

def page_borrow_actions() -> None:
    st.header("借还书办理")
    tab_borrow, tab_return, tab_renew = st.tabs(["借书", "还书", "续借"])

    with tab_borrow:
        with st.form("borrow_book"):
            c1, c2 = st.columns(2)
            reader_id = c1.text_input("读者编号", key="borrow_reader_id")
            book_id = c2.text_input("图书编号", key="borrow_book_id")
            if st.form_submit_button("确认借书"):
                run_action("借书成功", client().post, "/api/borrow/borrow", json={"reader_id": reader_id, "book_id": book_id})

    with tab_return:
        with st.form("return_book"):
            book_id = st.text_input("图书编号", key="return_book_id")
            if st.form_submit_button("确认还书"):
                run_action("还书成功", client().post, "/api/borrow/return", json={"book_id": book_id})

    with tab_renew:
        with st.form("renew_book"):
            c1, c2 = st.columns(2)
            reader_id = c1.text_input("读者编号", key="renew_reader_id")
            book_id = c2.text_input("图书编号", key="renew_book_id")
            if st.form_submit_button("确认续借"):
                run_action("续借成功", client().post, "/api/borrow/renew", json={"reader_id": reader_id, "book_id": book_id})


def page_borrow_records() -> None:
    st.header("借阅记录")
    c1, c2, c3, c4, c5 = st.columns(5)
    reader_id = c1.text_input("读者编号")
    book_id = c2.text_input("图书编号")
    status = c3.selectbox("状态", ["全部", "borrowed", "returned"])
    page = c4.number_input("页码", min_value=1, step=1, value=1, key="records_page")
    page_size = c5.selectbox("每页", PAGE_SIZE_OPTIONS, index=1, key="records_page_size")
    c6, c7 = st.columns(2)
    start_date = c6.text_input("开始日期", placeholder="YYYY-MM-DD")
    end_date = c7.text_input("结束日期", placeholder="YYYY-MM-DD")

    payload = safe_get(
        "/api/borrow/records",
        {
            "reader_id": reader_id,
            "book_id": book_id,
            "status": status,
            "start_date": start_date,
            "end_date": end_date,
            "page": page,
            "page_size": page_size,
        },
    )
    if payload:
        show_page_info(payload)
        show_table(payload.get("data"), key="borrow_records_table")


# -----------------------------
# 页面：预约与罚款
# -----------------------------

def page_reservations() -> None:
    st.header("预约管理")
    with st.expander("创建预约", expanded=False):
        with st.form("create_reservation"):
            c1, c2 = st.columns(2)
            reader_id = c1.text_input("读者编号", key="reserve_reader_id")
            book_id = c2.text_input("图书编号", key="reserve_book_id")
            if st.form_submit_button("提交预约"):
                run_action("预约成功", client().post, "/api/reservations", json={"reader_id": reader_id, "book_id": book_id})

    c1, c2, c3, c4, c5 = st.columns(5)
    reader_id = c1.text_input("读者编号筛选", key="reservation_reader_filter")
    book_id = c2.text_input("图书编号筛选", key="reservation_book_filter")
    status = c3.selectbox("状态", ["全部", "waiting", "available", "cancelled", "completed"])
    page = c4.number_input("页码", min_value=1, step=1, value=1, key="reservation_page")
    page_size = c5.selectbox("每页", PAGE_SIZE_OPTIONS, index=1, key="reservation_page_size")

    payload = safe_get(
        "/api/reservations",
        {"reader_id": reader_id, "book_id": book_id, "status": status, "page": page, "page_size": page_size},
    )
    if payload:
        show_page_info(payload)
        show_table(payload.get("data"), key="reservation_table")

    with st.expander("预约操作", expanded=False):
        c1, c2 = st.columns(2)
        with c1:
            reservation_id = st.number_input("要取消的预约ID", min_value=0, step=1, value=0)
            if st.button("取消预约") and reservation_id:
                run_action("已取消", client().patch, f"/api/reservations/{reservation_id}/cancel")
        with c2:
            st.write("清理过期可取预约")
            if st.button("清理过期预约"):
                run_action("已清理", client().post, "/api/reservations/expire")


def page_fines() -> None:
    st.header("罚款管理")
    c1, c2, c3, c4 = st.columns(4)
    reader_id = c1.text_input("读者编号")
    paid_status = c2.selectbox("缴费状态", ["全部", "未缴", "已缴"])
    page = c3.number_input("页码", min_value=1, step=1, value=1, key="fines_page")
    page_size = c4.selectbox("每页", PAGE_SIZE_OPTIONS, index=1, key="fines_page_size")
    c5, c6 = st.columns(2)
    start_date = c5.text_input("开始日期", placeholder="YYYY-MM-DD", key="fine_start")
    end_date = c6.text_input("结束日期", placeholder="YYYY-MM-DD", key="fine_end")

    paid_map = {"全部": None, "未缴": 0, "已缴": 1}
    payload = safe_get(
        "/api/fines",
        {
            "reader_id": reader_id,
            "paid_status": paid_map[paid_status],
            "start_date": start_date,
            "end_date": end_date,
            "page": page,
            "page_size": page_size,
        },
    )
    if payload:
        show_page_info(payload)
        show_table(payload.get("data"), key="fines_table")

    with st.expander("罚款操作", expanded=False):
        tab_pay, tab_summary = st.tabs(["缴纳罚款", "读者罚款汇总"])
        with tab_pay:
            fine_ids = st.text_input("罚款ID，多个用逗号分隔")
            if st.button("确认缴纳") and fine_ids:
                try:
                    ids = parse_ids(fine_ids)
                    run_action("缴纳成功", client().post, "/api/fines/pay", json={"fine_ids": ids})
                except ValueError:
                    st.error("罚款ID必须是数字，多个ID用逗号分隔")
        with tab_summary:
            rid = st.text_input("读者编号", key="fine_summary_reader")
            if st.button("查询汇总") and rid:
                summary = safe_get(f"/api/fines/summary/{rid}")
                if summary:
                    st.json(summary.get("data"), expanded=False)


# -----------------------------
# 页面：系统管理、日志
# -----------------------------

def page_admin() -> None:
    st.header("系统管理")
    tab_users, tab_rules, tab_permissions = st.tabs(["管理员用户", "借阅规则", "权限配置"])

    with tab_users:
        c1, c2 = st.columns([1, 1])
        page = c1.number_input("页码", min_value=1, step=1, value=1, key="admin_users_page")
        page_size = c2.selectbox("每页", PAGE_SIZE_OPTIONS, index=1, key="admin_users_page_size")
        users = safe_get("/api/admin/users", {"page": page, "page_size": page_size})
        if users:
            show_page_info(users)
            show_table(users.get("data"), key="admin_users")

        with st.expander("新增管理员", expanded=False):
            with st.form("create_admin"):
                c1, c2, c3, c4 = st.columns(4)
                username = c1.text_input("用户名")
                name = c2.text_input("姓名")
                password = c3.text_input("密码", type="password")
                role = c4.selectbox("角色", ["system_admin", "normal_admin"])
                if st.form_submit_button("新增管理员"):
                    run_action(
                        "创建成功",
                        client().post,
                        "/api/admin/users",
                        json={"username": username, "name": name, "password": password, "role": role},
                    )

        with st.expander("修改管理员状态 / 密码", expanded=False):
            c1, c2, c3 = st.columns(3)
            admin_id = c1.number_input("管理员ID", min_value=0, step=1, value=0)
            status = c2.selectbox("状态", ["active", "inactive"])
            if c3.button("更新状态") and admin_id:
                run_action("更新成功", client().patch, f"/api/admin/users/{admin_id}/status", json={"status": status})

            c4, c5 = st.columns(2)
            pwd_admin_id = c4.number_input("重置密码的管理员ID", min_value=0, step=1, value=0)
            new_pwd = c5.text_input("新密码", type="password")
            if st.button("重置密码") and pwd_admin_id and new_pwd:
                run_action("密码已更新", client().put, f"/api/admin/users/{pwd_admin_id}/password", json={"new_password": new_pwd})

    with tab_rules:
        c1, c2 = st.columns(2)
        tid = c1.number_input("读者类型ID，0表示不限", min_value=0, step=1, value=0, key="rule_tid")
        status = c2.selectbox("规则状态", ["active", "inactive", "全部"])
        rules = safe_get("/api/admin/borrow-rules", {"reader_type_id": tid or None, "status": status})
        if rules:
            show_table(rules.get("data"), key="borrow_rules")

        with st.expander("新增借阅规则", expanded=False):
            with st.form("create_rule"):
                c1, c2, c3, c4 = st.columns(4)
                reader_type_id = c1.number_input("读者类型ID", min_value=1, step=1, value=1)
                max_borrow = c2.number_input("最大借阅数", min_value=1, step=1, value=10)
                default_days = c3.number_input("默认借阅天数", min_value=1, step=1, value=30)
                max_renew = c4.number_input("最大续借次数", min_value=0, step=1, value=2)
                c5, c6, c7, c8 = st.columns(4)
                renew_days = c5.number_input("续借天数", min_value=1, step=1, value=15)
                overdue_fee = c6.number_input("每日逾期罚款", min_value=0.0, step=0.1, value=0.5)
                hold_hours = c7.number_input("预约保留小时", min_value=1, step=1, value=48)
                effective_date = c8.text_input("生效日期", "2026-01-01")
                if st.form_submit_button("新增规则"):
                    run_action(
                        "创建成功",
                        client().post,
                        "/api/admin/borrow-rules",
                        json={
                            "reader_type_id": reader_type_id,
                            "max_borrow": max_borrow,
                            "default_days": default_days,
                            "max_renew": max_renew,
                            "renew_days": renew_days,
                            "overdue_fee_per_day": overdue_fee,
                            "reserve_hold_hours": hold_hours,
                            "effective_date": effective_date,
                        },
                    )

    with tab_permissions:
        role = st.selectbox("角色筛选", ["全部", "system_admin", "normal_admin", "reader"])
        perms = safe_get("/api/admin/permissions", {"role": role})
        if perms:
            show_table(perms.get("data"), key="permissions")


def page_logs() -> None:
    st.header("操作日志")
    tab_logs, tab_alerts = st.tabs(["日志查询", "安全告警"])
    with tab_logs:
        c1, c2, c3, c4 = st.columns(4)
        admin_id = c1.number_input("管理员ID，0表示不限", min_value=0, step=1, value=0)
        module = c2.text_input("模块")
        keyword = c3.text_input("操作关键词")
        page = c4.number_input("页码", min_value=1, step=1, value=1, key="logs_page")
        c5, c6, c7 = st.columns(3)
        page_size = c5.selectbox("每页", PAGE_SIZE_OPTIONS, index=2, key="logs_page_size")
        start_time = c6.text_input("开始时间", placeholder="YYYY-MM-DD HH:MM:SS")
        end_time = c7.text_input("结束时间", placeholder="YYYY-MM-DD HH:MM:SS")
        logs = safe_get(
            "/api/logs",
            {
                "admin_id": admin_id or None,
                "module": module,
                "keyword": keyword,
                "start_time": start_time,
                "end_time": end_time,
                "page": page,
                "page_size": page_size,
            },
        )
        if logs:
            show_page_info(logs)
            show_table(logs.get("data"), key="logs_table")
    with tab_alerts:
        alerts = safe_get("/api/logs/alerts")
        if alerts:
            show_table(alerts.get("data"), key="alerts_table")


# -----------------------------
# 主框架
# -----------------------------

def current_role() -> str:
    info = st.session_state.get("user_info") or {}
    return str(info.get("role", ""))


def main_layout() -> None:
    st.set_page_config(page_title="图书管理系统", page_icon="📚", layout="wide")

    user_info = st.session_state.get("user_info") or {}
    with st.sidebar:
        st.title("图书管理系统")
        st.caption(f"后端：{st.session_state['api_base']}")
        st.write(f"当前用户：{user_info.get('name') or user_info.get('username') or user_info.get('id')}")
        st.write(f"角色：{user_info.get('role')}")
        if st.button("退出登录", use_container_width=True):
            try:
                client().post("/auth/logout")
            except ApiError:
                pass
            st.session_state["token"] = None
            st.session_state["user_info"] = None
            st.rerun()

        role = current_role()
        pages = ["首页统计", "图书管理", "借还书办理", "借阅记录", "预约管理", "罚款管理"]
        if st.session_state.get("login_type") == "admin":
            pages.insert(2, "读者管理")
            pages.append("系统管理")
        if role == "system_admin":
            pages.append("操作日志")

        page = st.radio("功能菜单", pages)

    if page == "首页统计":
        page_dashboard()
    elif page == "图书管理":
        page_books()
    elif page == "读者管理":
        page_readers()
    elif page == "借还书办理":
        page_borrow_actions()
    elif page == "借阅记录":
        page_borrow_records()
    elif page == "预约管理":
        page_reservations()
    elif page == "罚款管理":
        page_fines()
    elif page == "系统管理":
        page_admin()
    elif page == "操作日志":
        page_logs()


def main() -> None:
    init_state()
    if not st.session_state.get("token"):
        login_page()
    else:
        main_layout()


if __name__ == "__main__":
    main()
