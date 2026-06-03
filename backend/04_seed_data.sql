USE LibraryDB;
GO

-- ============================================================
-- 先清空所有数据
-- ============================================================
DELETE FROM fine_record;       DELETE FROM borrow_record;
DELETE FROM reservation;       DELETE FROM exception_record;
DELETE FROM operation_log;     DELETE FROM book_inventory;
DELETE FROM borrow_rule;       DELETE FROM permission_config;
DELETE FROM report_generation_log;  DELETE FROM system_param;
DELETE FROM backup_record;
DELETE FROM reader;            DELETE FROM book;
DELETE FROM admin;             DELETE FROM reader_type;
DELETE FROM book_category;     DELETE FROM report_template;
GO

-- ============================================================
-- 重置所有自增字段
-- ============================================================
DBCC CHECKIDENT ('reader_type', RESEED, 0);
DBCC CHECKIDENT ('book_category', RESEED, 0);
DBCC CHECKIDENT ('admin', RESEED, 0);
GO

-- ============================================================
-- 1. 读者类别
-- ============================================================
INSERT INTO reader_type (type_name, max_borrow_count, borrow_days, max_renew_count) VALUES
(N'本科生', 10, 30, 2), (N'研究生', 15, 60, 3), (N'教师', 20, 90, 5), (N'校外读者', 3, 15, 0);
GO

-- ============================================================
-- 2. 读者
-- ============================================================
INSERT INTO reader (reader_id, name, gender, phone, department, reader_type_id, status) VALUES
('R001', N'张三', 'M', '13800138001', N'计算机学院', 1, 'normal'),
('R002', N'李四', 'F', '13800138002', N'数学学院', 2, 'normal'),
('R003', N'王五', 'M', '13800138003', N'物理学院', 3, 'normal'),
('R004', N'赵六', 'F', '13800138004', N'化学学院', 1, 'normal'),
('R005', N'孙七', 'M', '13800138005', N'计算机学院', 2, 'lost');
GO

-- ============================================================
-- 3. 图书分类
-- ============================================================
INSERT INTO book_category (category_name, description) VALUES
(N'文学', N'小说、散文、诗歌'),
(N'历史', N'历史、考古、传记'),
(N'计算机科学', N'编程、算法、人工智能'),
(N'数学', N'高等数学、概率统计'),
(N'物理', N'力学、电磁学、量子力学'),
(N'经济管理', N'经济学、管理学');
GO

-- ============================================================
-- 4. 图书
-- ============================================================
INSERT INTO book (book_id, title, author, publisher, publish_date, category_id, isbn, price, status) VALUES
('B001', N'三体', N'刘慈欣', N'重庆出版社', '2008-01-01', 1, '9787536692930', 23.00, 'in_library'),
('B002', N'数据结构与算法分析', N'Mark Allen Weiss', N'机械工业出版社', '2019-06-01', 3, '9787111539156', 69.00, 'in_library'),
('B003', N'百年孤独', N'加西亚·马尔克斯', N'南海出版公司', '2011-06-01', 1, '9787544253994', 39.50, 'in_library'),
('B004', N'高等数学（第七版）', N'同济大学数学系', N'高等教育出版社', '2014-07-01', 4, '9787040396638', 46.60, 'in_library'),
('B005', N'深入理解计算机系统', N'Randal E. Bryant', N'机械工业出版社', '2016-11-01', 3, '9787111544937', 139.00, 'in_library'),
('B006', N'万历十五年', N'黄仁宇', N'中华书局', '2006-08-01', 2, '9787101052026', 18.00, 'in_library'),
('B007', N'人工智能：一种现代方法', N'Stuart Russell', N'清华大学出版社', '2011-08-01', 3, '9787302331094', 128.00, 'borrowed'),
('B008', N'时间简史', N'史蒂芬·霍金', N'湖南科学技术出版社', '2010-04-01', 5, '9787535732309', 45.00, 'in_library'),
('B009', N'经济学原理', N'曼昆', N'北京大学出版社', '2015-05-01', 6, '9787301256909', 88.00, 'in_library'),
('B010', N'活着', N'余华', N'作家出版社', '2012-08-01', 1, '9787506365437', 20.00, 'in_library');
GO

-- ============================================================
-- 5. 图书库存
-- ============================================================
INSERT INTO book_inventory (book_id, total_count, in_library_count, borrowed_count) VALUES
('B001', 5, 5, 0), ('B002', 3, 3, 0), ('B003', 4, 4, 0),
('B004', 10, 10, 0), ('B005', 2, 2, 0), ('B006', 3, 3, 0),
('B007', 2, 0, 2), ('B008', 4, 4, 0), ('B009', 3, 3, 0), ('B010', 5, 5, 0);
GO

-- ============================================================
-- 6. 借阅规则
-- ============================================================
INSERT INTO borrow_rule (reader_type_id, max_borrow, default_days, max_renew, renew_days, overdue_fee_per_day, reserve_hold_hours, effective_date, status) VALUES
(1, 10, 30, 2, 15, 0.10, 48, '2025-01-01', 'active'),
(2, 15, 60, 3, 30, 0.10, 48, '2025-01-01', 'active'),
(3, 20, 90, 5, 45, 0.10, 72, '2025-01-01', 'active'),
(4, 3,  15, 0, 0,  0.50, 24, '2025-01-01', 'active');
GO

-- ============================================================
-- 7. 借阅记录（示例）
-- ============================================================
INSERT INTO borrow_record (reader_id, book_id, borrow_date, due_date, renew_count, actual_return_date, status) VALUES
('R001', 'B007', '2026-05-01', '2026-05-31', 0, NULL, 'borrowed'),
('R002', 'B007', '2026-05-10', '2026-06-09', 0, NULL, 'borrowed');
GO

-- ============================================================
-- 8. 管理员（密码由Python后端bcrypt设置）
-- ============================================================
INSERT INTO admin (username, password_hash, name, role, status) VALUES
('admin', 'PLACEHOLDER', N'系统管理员', 'system_admin', 'active'),
('librarian', 'PLACEHOLDER', N'图书管理员', 'normal_admin', 'active');
GO

-- ============================================================
-- 9. 权限配置
-- ============================================================
INSERT INTO permission_config (role, module_code, permission_level, status) VALUES
('system_admin', N'读者管理', 'manage', 'active'),
('system_admin', N'图书管理', 'manage', 'active'),
('system_admin', N'借阅管理', 'manage', 'active'),
('system_admin', N'系统管理', 'manage', 'active'),
('system_admin', N'报表', 'manage', 'active'),
('normal_admin', N'读者管理', 'write', 'active'),
('normal_admin', N'图书管理', 'write', 'active'),
('normal_admin', N'借阅管理', 'write', 'active'),
('normal_admin', N'报表', 'read', 'active');
GO

PRINT '===== 种子数据插入完成 =====';
GO
