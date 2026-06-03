-- ============================================================
-- 图书管理系统 — LibraryDB 建表脚本
-- 基于操作说明.txt 中的物理结构设计
-- 运行环境：SQL Server (.\SQLEXPRESS)
-- ============================================================

USE LibraryDB;
GO

-- 先清理已有的测试表
IF OBJECT_ID('dbo.my_first_table', 'U') IS NOT NULL
    DROP TABLE dbo.my_first_table;
GO

-- ==================== 1. 读者类别表 ====================
IF OBJECT_ID('dbo.reader_type', 'U') IS NOT NULL DROP TABLE dbo.reader_type;
CREATE TABLE reader_type (
    reader_type_id INT IDENTITY(1,1) PRIMARY KEY,
    type_name NVARCHAR(50) NOT NULL UNIQUE,
    max_borrow_count INT NOT NULL CHECK (max_borrow_count > 0),
    borrow_days INT NOT NULL CHECK (borrow_days > 0),
    max_renew_count INT NOT NULL CHECK (max_renew_count >= 0)
);

-- ==================== 2. 读者表 ====================
IF OBJECT_ID('dbo.reader', 'U') IS NOT NULL DROP TABLE dbo.reader;
CREATE TABLE reader (
    reader_id NVARCHAR(20) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL,
    gender CHAR(1) CHECK (gender IN ('M', 'F')),
    phone NVARCHAR(20),
    department NVARCHAR(100),
    reader_type_id INT,
    status NVARCHAR(10) DEFAULT 'normal' CHECK (status IN ('normal', 'lost', 'cancelled')),
    reg_date DATE DEFAULT GETDATE(),
    FOREIGN KEY (reader_type_id) REFERENCES reader_type(reader_type_id) ON DELETE SET NULL
);

-- ==================== 3. 图书分类表 ====================
IF OBJECT_ID('dbo.book_category', 'U') IS NOT NULL DROP TABLE dbo.book_category;
CREATE TABLE book_category (
    category_id INT IDENTITY(1,1) PRIMARY KEY,
    category_name NVARCHAR(50) NOT NULL UNIQUE,
    description NVARCHAR(200)
);

-- ==================== 4. 图书表 ====================
IF OBJECT_ID('dbo.book', 'U') IS NOT NULL DROP TABLE dbo.book;
CREATE TABLE book (
    book_id NVARCHAR(20) PRIMARY KEY,
    title NVARCHAR(200) NOT NULL,
    author NVARCHAR(100),
    publisher NVARCHAR(100),
    publish_date DATE,
    category_id INT,
    isbn NVARCHAR(20) UNIQUE,
    price DECIMAL(10,2) CHECK (price >= 0),
    status NVARCHAR(20) DEFAULT 'in_library' CHECK (status IN ('in_library','borrowed','reserved','damaged','lost','removed')),
    FOREIGN KEY (category_id) REFERENCES book_category(category_id) ON DELETE SET NULL
);

-- ==================== 5. 图书库存表 ====================
IF OBJECT_ID('dbo.book_inventory', 'U') IS NOT NULL DROP TABLE dbo.book_inventory;
CREATE TABLE book_inventory (
    book_id NVARCHAR(20) PRIMARY KEY,
    total_count INT NOT NULL CHECK (total_count >= 0),
    in_library_count INT NOT NULL CHECK (in_library_count >= 0),
    borrowed_count INT NOT NULL CHECK (borrowed_count >= 0),
    update_time DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (book_id) REFERENCES book(book_id) ON DELETE CASCADE,
    CONSTRAINT chk_inv CHECK (total_count = in_library_count + borrowed_count)
);

-- ==================== 6. 借阅记录表 ====================
IF OBJECT_ID('dbo.borrow_record', 'U') IS NOT NULL DROP TABLE dbo.borrow_record;
CREATE TABLE borrow_record (
    record_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    reader_id NVARCHAR(20) NOT NULL,
    book_id NVARCHAR(20) NOT NULL,
    borrow_date DATE NOT NULL,
    due_date DATE NOT NULL,
    renew_count INT DEFAULT 0 CHECK (renew_count >= 0),
    actual_return_date DATE NULL,
    status NVARCHAR(10) DEFAULT 'borrowed' CHECK (status IN ('borrowed','returned')),
    FOREIGN KEY (reader_id) REFERENCES reader(reader_id),
    FOREIGN KEY (book_id) REFERENCES book(book_id)
);
CREATE INDEX idx_reader_status ON borrow_record(reader_id, status);
CREATE INDEX idx_book_status ON borrow_record(book_id, status);

-- ==================== 7. 罚款记录表 ====================
IF OBJECT_ID('dbo.fine_record', 'U') IS NOT NULL DROP TABLE dbo.fine_record;
CREATE TABLE fine_record (
    fine_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    reader_id NVARCHAR(20) NOT NULL,
    book_id NVARCHAR(20) NOT NULL,
    borrow_record_id BIGINT NOT NULL,
    overdue_days INT CHECK (overdue_days > 0),
    amount DECIMAL(10,2) CHECK (amount >= 0),
    paid_status BIT DEFAULT 0,
    generate_date DATE DEFAULT GETDATE(),
    FOREIGN KEY (reader_id) REFERENCES reader(reader_id),
    FOREIGN KEY (book_id) REFERENCES book(book_id),
    FOREIGN KEY (borrow_record_id) REFERENCES borrow_record(record_id)
);

-- ==================== 8. 预约记录表 ====================
IF OBJECT_ID('dbo.reservation', 'U') IS NOT NULL DROP TABLE dbo.reservation;
CREATE TABLE reservation (
    reservation_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    reader_id NVARCHAR(20) NOT NULL,
    book_id NVARCHAR(20) NOT NULL,
    reserve_time DATETIME DEFAULT GETDATE(),
    expire_time DATETIME NULL,
    status NVARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting','available','cancelled','completed')),
    FOREIGN KEY (reader_id) REFERENCES reader(reader_id),
    FOREIGN KEY (book_id) REFERENCES book(book_id)
);
CREATE INDEX idx_book_status_res ON reservation(book_id, status);

-- ==================== 9. 管理员表 ====================
IF OBJECT_ID('dbo.admin', 'U') IS NOT NULL DROP TABLE dbo.admin;
CREATE TABLE admin (
    admin_id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(30) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    name NVARCHAR(50) NOT NULL,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('system_admin','normal_admin')),
    status NVARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','inactive')),
    last_login_time DATETIME NULL
);

-- ==================== 10. 操作日志表 ====================
IF OBJECT_ID('dbo.operation_log', 'U') IS NOT NULL DROP TABLE dbo.operation_log;
CREATE TABLE operation_log (
    log_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    admin_id INT NULL,
    operation_time DATETIME DEFAULT GETDATE(),
    module NVARCHAR(50),
    action NVARCHAR(200),
    client_ip NVARCHAR(45),
    FOREIGN KEY (admin_id) REFERENCES admin(admin_id) ON DELETE SET NULL
);

-- ==================== 11. 系统参数表 ====================
IF OBJECT_ID('dbo.system_param', 'U') IS NOT NULL DROP TABLE dbo.system_param;
CREATE TABLE system_param (
    param_id INT IDENTITY(1,1) PRIMARY KEY,
    param_category NVARCHAR(50) NOT NULL,
    param_key NVARCHAR(50) NOT NULL,
    param_value NVARCHAR(200) NOT NULL,
    description NVARCHAR(200),
    editable BIT DEFAULT 1,
    update_time DATETIME DEFAULT GETDATE(),
    updater_id INT NULL,
    FOREIGN KEY (updater_id) REFERENCES admin(admin_id)
);

-- ==================== 12. 借阅规则表 ====================
IF OBJECT_ID('dbo.borrow_rule', 'U') IS NOT NULL DROP TABLE dbo.borrow_rule;
CREATE TABLE borrow_rule (
    rule_id INT IDENTITY(1,1) PRIMARY KEY,
    reader_type_id INT NOT NULL,
    max_borrow INT NOT NULL CHECK (max_borrow > 0),
    default_days INT NOT NULL CHECK (default_days > 0),
    max_renew INT NOT NULL CHECK (max_renew >= 0),
    renew_days INT NOT NULL CHECK (renew_days > 0),
    overdue_fee_per_day DECIMAL(10,2) NOT NULL CHECK (overdue_fee_per_day >= 0),
    reserve_hold_hours INT NOT NULL CHECK (reserve_hold_hours > 0),
    effective_date DATE NOT NULL,
    status NVARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','inactive')),
    FOREIGN KEY (reader_type_id) REFERENCES reader_type(reader_type_id) ON DELETE CASCADE,
    CONSTRAINT uk_rule_type_date UNIQUE (reader_type_id, effective_date)
);

-- ==================== 13. 备份记录表 ====================
IF OBJECT_ID('dbo.backup_record', 'U') IS NOT NULL DROP TABLE dbo.backup_record;
CREATE TABLE backup_record (
    backup_id INT IDENTITY(1,1) PRIMARY KEY,
    backup_type NVARCHAR(20) NOT NULL CHECK (backup_type IN ('full','incremental')),
    backup_time DATETIME DEFAULT GETDATE(),
    file_size BIGINT,
    storage_path NVARCHAR(255) NOT NULL,
    checksum NVARCHAR(64),
    backup_status NVARCHAR(10) CHECK (backup_status IN ('success','failed')),
    operator_id INT NULL,
    FOREIGN KEY (operator_id) REFERENCES admin(admin_id)
);

-- ==================== 14. 权限配置表 ====================
IF OBJECT_ID('dbo.permission_config', 'U') IS NOT NULL DROP TABLE dbo.permission_config;
CREATE TABLE permission_config (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    role NVARCHAR(20) NOT NULL CHECK (role IN ('system_admin','normal_admin')),
    module_code NVARCHAR(50) NOT NULL,
    permission_level NVARCHAR(10) NOT NULL CHECK (permission_level IN ('read','write','manage')),
    data_scope NVARCHAR(100),
    status NVARCHAR(10) DEFAULT 'active' CHECK (status IN ('active','inactive')),
    config_time DATETIME DEFAULT GETDATE()
);

-- ==================== 15. 报表模板表 ====================
IF OBJECT_ID('dbo.report_template', 'U') IS NOT NULL DROP TABLE dbo.report_template;
CREATE TABLE report_template (
    template_id INT IDENTITY(1,1) PRIMARY KEY,
    report_type NVARCHAR(50) NOT NULL,
    template_name NVARCHAR(100) NOT NULL,
    field_list NVARCHAR(MAX),
    group_dimensions NVARCHAR(200),
    sort_rule NVARCHAR(200),
    output_format NVARCHAR(20) DEFAULT 'screen' CHECK (output_format IN ('screen','print','excel')),
    header_footer_config NVARCHAR(MAX),
    create_time DATETIME DEFAULT GETDATE()
);

-- ==================== 16. 异常处理记录表 ====================
IF OBJECT_ID('dbo.exception_record', 'U') IS NOT NULL DROP TABLE dbo.exception_record;
CREATE TABLE exception_record (
    exception_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    borrow_record_id BIGINT NOT NULL,
    exception_type NVARCHAR(20) NOT NULL CHECK (exception_type IN ('damage', 'loss', 'other')),
    handling_method NVARCHAR(20) NOT NULL CHECK (handling_method IN ('repair', 'compensation', 'write_off')),
    compensation_amount DECIMAL(10,2) CHECK (compensation_amount >= 0),
    handling_date DATE NOT NULL DEFAULT GETDATE(),
    handler NVARCHAR(50),
    FOREIGN KEY (borrow_record_id) REFERENCES borrow_record(record_id)
);

-- ==================== 17. 报表生成日志表 ====================
IF OBJECT_ID('dbo.report_generation_log', 'U') IS NOT NULL DROP TABLE dbo.report_generation_log;
CREATE TABLE report_generation_log (
    log_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    template_id INT NOT NULL,
    report_type NVARCHAR(50) NOT NULL,
    time_period NVARCHAR(100),
    query_conditions NVARCHAR(MAX),
    output_format NVARCHAR(20) NOT NULL CHECK (output_format IN ('screen', 'print', 'excel')),
    target_device NVARCHAR(100),
    generation_time DATETIME NOT NULL DEFAULT GETDATE(),
    execution_result NVARCHAR(10) NOT NULL CHECK (execution_result IN ('success', 'failed')),
    operator_id INT NULL,
    FOREIGN KEY (template_id) REFERENCES report_template(template_id),
    FOREIGN KEY (operator_id) REFERENCES admin(admin_id) ON DELETE SET NULL
);
GO

PRINT '>>> 17张基础表创建完成 <<<';
GO
