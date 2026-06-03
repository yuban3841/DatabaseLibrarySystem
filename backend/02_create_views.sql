-- ============================================================
-- 图书管理系统 — 视图创建脚本
-- ============================================================

USE LibraryDB;
GO

-- 视图1：热门图书排行（近一年借阅次数降序）
IF OBJECT_ID('dbo.v_hot_books', 'V') IS NOT NULL DROP VIEW v_hot_books;
GO
CREATE VIEW v_hot_books AS
SELECT
    b.book_id,
    b.title,
    b.author,
    bc.category_name,
    COUNT(br.record_id) AS borrow_times,
    RANK() OVER (ORDER BY COUNT(br.record_id) DESC) AS rank
FROM book b
LEFT JOIN borrow_record br ON b.book_id = br.book_id
    AND br.borrow_date >= DATEADD(YEAR, -1, GETDATE())
LEFT JOIN book_category bc ON b.category_id = bc.category_id
GROUP BY b.book_id, b.title, b.author, bc.category_name;
GO

-- 视图2：逾期未还清单
IF OBJECT_ID('dbo.v_overdue_list', 'V') IS NOT NULL DROP VIEW v_overdue_list;
GO
CREATE VIEW v_overdue_list AS
SELECT
    r.reader_id,
    r.name AS reader_name,
    r.phone,
    b.book_id,
    b.title,
    br.borrow_date,
    br.due_date,
    DATEDIFF(DAY, br.due_date, GETDATE()) AS overdue_days,
    (DATEDIFF(DAY, br.due_date, GETDATE()) * ISNULL(br_rule.overdue_fee_per_day, 0)) AS estimated_fine,
    br.record_id
FROM borrow_record br
JOIN reader r ON br.reader_id = r.reader_id
JOIN book b ON br.book_id = b.book_id
LEFT JOIN reader_type rt ON r.reader_type_id = rt.reader_type_id
LEFT JOIN borrow_rule br_rule ON rt.reader_type_id = br_rule.reader_type_id
    AND br_rule.effective_date <= br.borrow_date
    AND br_rule.status = 'active'
WHERE br.status = 'borrowed' AND br.due_date < GETDATE();
GO

-- 视图3：读者借阅历史（含罚款信息）
IF OBJECT_ID('dbo.v_reader_borrow_history', 'V') IS NOT NULL DROP VIEW v_reader_borrow_history;
GO
CREATE VIEW v_reader_borrow_history AS
SELECT
    r.reader_id,
    r.name,
    b.title,
    br.borrow_date,
    br.due_date,
    br.actual_return_date,
    br.status AS borrow_status,
    CASE
        WHEN br.actual_return_date > br.due_date THEN DATEDIFF(DAY, br.due_date, br.actual_return_date)
        ELSE 0
    END AS overdue_days,
    f.amount AS fine_amount,
    f.paid_status
FROM borrow_record br
JOIN reader r ON br.reader_id = r.reader_id
JOIN book b ON br.book_id = b.book_id
LEFT JOIN fine_record f ON br.record_id = f.borrow_record_id;
GO

-- 视图4：图书库存状态（在馆/借出/预约中统计）
IF OBJECT_ID('dbo.v_book_inventory_status', 'V') IS NOT NULL DROP VIEW v_book_inventory_status;
GO
CREATE VIEW v_book_inventory_status AS
SELECT
    b.book_id,
    b.title,
    b.author,
    bi.total_count,
    bi.in_library_count,
    bi.borrowed_count,
    (SELECT COUNT(*) FROM reservation WHERE book_id = b.book_id AND status IN ('waiting','available')) AS reserved_count,
    b.status
FROM book b
JOIN book_inventory bi ON b.book_id = bi.book_id;
GO

-- 视图5：读者借阅活跃度统计（按读者类型）
IF OBJECT_ID('dbo.v_reader_activity', 'V') IS NOT NULL DROP VIEW v_reader_activity;
GO
CREATE VIEW v_reader_activity AS
SELECT
    r.reader_type_id,
    rt.type_name AS category_name,
    r.reader_id,
    r.name,
    COUNT(br.record_id) AS total_borrows,
    SUM(CASE WHEN br.status = 'borrowed' THEN 1 ELSE 0 END) AS current_borrows,
    COUNT(DISTINCT CASE WHEN br.actual_return_date > br.due_date THEN br.record_id END) AS overdue_times,
    CASE
        WHEN COUNT(br.record_id) >= 50 THEN N'高频'
        WHEN COUNT(br.record_id) >= 20 THEN N'中频'
        ELSE N'低频'
    END AS activity_level
FROM reader r
LEFT JOIN borrow_record br ON r.reader_id = br.reader_id
LEFT JOIN reader_type rt ON r.reader_type_id = rt.reader_type_id
GROUP BY r.reader_id, r.name, r.reader_type_id, rt.type_name;
GO

PRINT '>>> 5个视图创建完成 <<<';
GO
