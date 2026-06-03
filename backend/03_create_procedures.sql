-- ============================================================
-- 图书管理系统 — 存储过程
-- ============================================================

USE LibraryDB;
GO

-- ==================== 1. 借书存储过程 ====================
IF OBJECT_ID('dbo.usp_BorrowBook', 'P') IS NOT NULL DROP PROCEDURE usp_BorrowBook;
GO
CREATE PROCEDURE usp_BorrowBook
    @ReaderID NVARCHAR(20),
    @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ReaderStatus NVARCHAR(10);
    DECLARE @ReaderTypeID INT;
    DECLARE @BookStatus NVARCHAR(20);
    DECLARE @MaxBorrow INT;
    DECLARE @DefaultDays INT;
    DECLARE @CurrentBorrowedCount INT;
    DECLARE @InLibraryCount INT;
    DECLARE @OverdueCount INT;
    DECLARE @UnpaidFine DECIMAL(10,2);
    DECLARE @ErrMsg NVARCHAR(400);

    -- 1. 验证读者状态
    SELECT @ReaderStatus = [status], @ReaderTypeID = reader_type_id
    FROM reader WHERE reader_id = @ReaderID;

    IF @ReaderStatus IS NULL
    BEGIN
        RAISERROR('借阅失败：读者不存在。', 16, 1);
        RETURN;
    END

    IF @ReaderStatus <> 'normal'
    BEGIN
        RAISERROR('借阅失败：读者状态异常（已挂失/注销）。', 16, 1);
        RETURN;
    END

    -- 2. 验证图书状态
    SELECT @BookStatus = [status] FROM book WHERE book_id = @BookID;
    IF @BookStatus IS NULL
    BEGIN
        RAISERROR('借阅失败：图书不存在。', 16, 1);
        RETURN;
    END
    IF @BookStatus <> 'in_library'
    BEGIN
        RAISERROR('借阅失败：图书当前不可借（已被借出/预约/遗失/下架）。', 16, 1);
        RETURN;
    END

    -- 3. 检查逾期
    SELECT @OverdueCount = COUNT(*)
    FROM borrow_record
    WHERE reader_id = @ReaderID AND [status] = 'borrowed' AND due_date < GETDATE();
    IF @OverdueCount > 0
    BEGIN
        RAISERROR('借阅失败：存在逾期未还图书。', 16, 1);
        RETURN;
    END

    -- 4. 检查未缴罚款
    SELECT @UnpaidFine = ISNULL(SUM(amount), 0)
    FROM fine_record
    WHERE reader_id = @ReaderID AND paid_status = 0;
    IF @UnpaidFine > 0
    BEGIN
        SET @ErrMsg = '借阅失败：存在未缴罚款 ' + CAST(@UnpaidFine AS NVARCHAR) + ' 元。';
        RAISERROR(@ErrMsg, 16, 1);
        RETURN;
    END

    -- 5. 获取借阅规则
    SELECT TOP 1 @MaxBorrow = max_borrow, @DefaultDays = default_days
    FROM borrow_rule
    WHERE reader_type_id = @ReaderTypeID AND [status] = 'active'
    ORDER BY effective_date DESC;

    -- 回退到 reader_type 默认值
    IF @MaxBorrow IS NULL
    BEGIN
        SELECT @MaxBorrow = max_borrow_count, @DefaultDays = borrow_days
        FROM reader_type WHERE reader_type_id = @ReaderTypeID;
    END

    -- 6. 检查借阅上限
    SELECT @CurrentBorrowedCount = COUNT(*)
    FROM borrow_record
    WHERE reader_id = @ReaderID AND [status] = 'borrowed';

    IF @CurrentBorrowedCount >= @MaxBorrow
    BEGIN
        SET @ErrMsg = '借阅失败：已达到最大借阅册数限制(' + CAST(@MaxBorrow AS NVARCHAR) + '册)。';
        RAISERROR(@ErrMsg, 16, 1);
        RETURN;
    END

    -- 7. 检查库存
    SELECT @InLibraryCount = in_library_count
    FROM book_inventory WHERE book_id = @BookID;
    IF @InLibraryCount <= 0
    BEGIN
        RAISERROR('借阅失败：该图书库存不足。', 16, 1);
        RETURN;
    END

    -- 8. 执行借书事务
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 插入借阅记录
        INSERT INTO borrow_record (reader_id, book_id, borrow_date, due_date, renew_count, [status])
        VALUES (@ReaderID, @BookID, CAST(GETDATE() AS DATE),
                CAST(DATEADD(day, @DefaultDays, GETDATE()) AS DATE), 0, 'borrowed');

        -- 更新图书状态
        UPDATE book SET [status] = 'borrowed' WHERE book_id = @BookID;

        -- 更新库存
        UPDATE book_inventory
        SET in_library_count = in_library_count - 1,
            borrowed_count = borrowed_count + 1,
            update_time = GETDATE()
        WHERE book_id = @BookID;

        COMMIT TRANSACTION;
        PRINT '借书成功！';
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @ErrMsg2 NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrMsg2, 16, 1);
    END CATCH
END;
GO

-- ==================== 2. 还书存储过程 ====================
IF OBJECT_ID('dbo.usp_ReturnBook', 'P') IS NOT NULL DROP PROCEDURE usp_ReturnBook;
GO
CREATE PROCEDURE usp_ReturnBook
    @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RecordID BIGINT;
    DECLARE @ReaderID NVARCHAR(20);
    DECLARE @DueDate DATE;
    DECLARE @ReaderTypeID INT;
    DECLARE @OverdueDays INT = 0;
    DECLARE @OverdueFeePerDay DECIMAL(10,2) = 0.50;
    DECLARE @FineAmount DECIMAL(10,2) = 0.00;
    DECLARE @ReservationID BIGINT;
    DECLARE @HoldHours INT;

    -- 1. 查找未还借阅记录
    SELECT TOP 1 @RecordID = record_id, @ReaderID = reader_id, @DueDate = due_date
    FROM borrow_record
    WHERE book_id = @BookID AND [status] = 'borrowed'
    ORDER BY borrow_date DESC;

    IF @RecordID IS NULL
    BEGIN
        RAISERROR('还书失败：未找到该图书的在借记录。', 16, 1);
        RETURN;
    END

    -- 2. 计算超期天数和罚款
    IF CAST(GETDATE() AS DATE) > @DueDate
    BEGIN
        SET @OverdueDays = DATEDIFF(day, @DueDate, CAST(GETDATE() AS DATE));

        SELECT @ReaderTypeID = reader_type_id FROM reader WHERE reader_id = @ReaderID;
        SELECT TOP 1 @OverdueFeePerDay = ISNULL(overdue_fee_per_day, 0.50)
        FROM borrow_rule
        WHERE reader_type_id = @ReaderTypeID AND [status] = 'active'
        ORDER BY effective_date DESC;

        SET @FineAmount = @OverdueDays * @OverdueFeePerDay;
    END

    -- 3. 执行还书事务
    BEGIN TRANSACTION;
    BEGIN TRY
        -- 更新借阅记录
        UPDATE borrow_record
        SET actual_return_date = CAST(GETDATE() AS DATE),
            [status] = 'returned'
        WHERE record_id = @RecordID;

        -- 更新图书状态
        UPDATE book SET [status] = 'in_library' WHERE book_id = @BookID;

        -- 更新库存
        UPDATE book_inventory
        SET in_library_count = in_library_count + 1,
            borrowed_count = borrowed_count - 1,
            update_time = GETDATE()
        WHERE book_id = @BookID;

        -- 生成罚款记录
        IF @OverdueDays > 0
        BEGIN
            INSERT INTO fine_record (reader_id, book_id, borrow_record_id, overdue_days, amount, paid_status, generate_date)
            VALUES (@ReaderID, @BookID, @RecordID, @OverdueDays, @FineAmount, 0, CAST(GETDATE() AS DATE));
            PRINT '还书成功（已超期' + CAST(@OverdueDays AS NVARCHAR) + '天，罚款' + CAST(@FineAmount AS NVARCHAR) + '元）。';
        END
        ELSE
        BEGIN
            PRINT '还书成功！';
        END

        -- 4. 处理预约：将等待队列第一个标记为可取
        SELECT TOP 1 @ReservationID = reservation_id
        FROM reservation
        WHERE book_id = @BookID AND [status] = 'waiting'
        ORDER BY reserve_time;

        IF @ReservationID IS NOT NULL
        BEGIN
            SELECT TOP 1 @HoldHours = ISNULL(reserve_hold_hours, 48)
            FROM borrow_rule
            WHERE reader_type_id = (SELECT reader_type_id FROM reader WHERE reader_id = @ReaderID)
              AND [status] = 'active'
            ORDER BY effective_date DESC;

            UPDATE reservation
            SET [status] = 'available',
                expire_time = DATEADD(HOUR, @HoldHours, GETDATE())
            WHERE reservation_id = @ReservationID;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END;
GO

-- ==================== 3. 续借存储过程 ====================
IF OBJECT_ID('dbo.usp_RenewBook', 'P') IS NOT NULL DROP PROCEDURE usp_RenewBook;
GO
CREATE PROCEDURE usp_RenewBook
    @ReaderID NVARCHAR(20),
    @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RecordID BIGINT;
    DECLARE @CurrentRenew INT;
    DECLARE @DueDate DATE;
    DECLARE @ReaderTypeID INT;
    DECLARE @MaxRenew INT;
    DECLARE @RenewDays INT;
    DECLARE @HasReservation INT;

    -- 1. 查找借阅记录
    SELECT TOP 1 @RecordID = record_id, @CurrentRenew = renew_count, @DueDate = due_date
    FROM borrow_record
    WHERE reader_id = @ReaderID AND book_id = @BookID AND [status] = 'borrowed'
    ORDER BY borrow_date DESC;

    IF @RecordID IS NULL
    BEGIN
        RAISERROR('续借失败：未找到该借阅记录。', 16, 1);
        RETURN;
    END

    -- 2. 检查预约
    SELECT @HasReservation = COUNT(*)
    FROM reservation
    WHERE book_id = @BookID AND [status] IN ('waiting', 'available');

    IF @HasReservation > 0
    BEGIN
        RAISERROR('续借失败：该书已被其他读者预约。', 16, 1);
        RETURN;
    END

    -- 3. 获取续借上限
    SELECT @ReaderTypeID = reader_type_id FROM reader WHERE reader_id = @ReaderID;

    SELECT TOP 1 @MaxRenew = ISNULL(max_renew, 0), @RenewDays = ISNULL(renew_days, 15)
    FROM borrow_rule
    WHERE reader_type_id = @ReaderTypeID AND [status] = 'active'
    ORDER BY effective_date DESC;

    -- 回退
    IF @MaxRenew IS NULL
        SELECT @MaxRenew = max_renew_count FROM reader_type WHERE reader_type_id = @ReaderTypeID;
    IF @RenewDays IS NULL
        SELECT @RenewDays = borrow_days FROM reader_type WHERE reader_type_id = @ReaderTypeID;

    IF @CurrentRenew >= @MaxRenew
    BEGIN
        RAISERROR('续借失败：已达最大续借次数。', 16, 1);
        RETURN;
    END

    -- 4. 执行续借
    UPDATE borrow_record
    SET renew_count = renew_count + 1,
        due_date = DATEADD(day, @RenewDays, @DueDate)
    WHERE record_id = @RecordID;

    PRINT '续借成功！新应还日期：' + CAST(DATEADD(day, @RenewDays, @DueDate) AS NVARCHAR);
END;
GO

-- ==================== 4. 异常处理/图书遗失存储过程 ====================
IF OBJECT_ID('dbo.usp_HandleBookLoss', 'P') IS NOT NULL DROP PROCEDURE usp_HandleBookLoss;
GO
CREATE PROCEDURE usp_HandleBookLoss
    @BookID NVARCHAR(20),
    @CompensationAmount DECIMAL(10,2),
    @Handler NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RecordID BIGINT;

    -- 查找未还借阅记录
    SELECT TOP 1 @RecordID = record_id
    FROM borrow_record
    WHERE book_id = @BookID AND [status] = 'borrowed'
    ORDER BY borrow_date DESC;

    IF @RecordID IS NULL
    BEGIN
        RAISERROR('处理失败：未找到该图书的在借记录。', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;
    BEGIN TRY
        INSERT INTO exception_record (borrow_record_id, exception_type, handling_method, compensation_amount, handling_date, handler)
        VALUES (@RecordID, 'loss', 'compensation', @CompensationAmount, CAST(GETDATE() AS DATE), @Handler);

        UPDATE borrow_record
        SET actual_return_date = CAST(GETDATE() AS DATE), [status] = 'returned'
        WHERE record_id = @RecordID;

        UPDATE book SET [status] = 'lost' WHERE book_id = @BookID;

        UPDATE book_inventory
        SET total_count = total_count - 1,
            borrowed_count = borrowed_count - 1,
            update_time = GETDATE()
        WHERE book_id = @BookID;

        COMMIT TRANSACTION;
        PRINT '图书遗失赔偿处理成功。';
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END;
GO

-- ==================== 5. 创建预约存储过程 ====================
IF OBJECT_ID('dbo.usp_CreateReservation', 'P') IS NOT NULL DROP PROCEDURE usp_CreateReservation;
GO
CREATE PROCEDURE usp_CreateReservation
    @ReaderID NVARCHAR(20),
    @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ReaderStatus NVARCHAR(10);
    DECLARE @InLibraryCount INT;
    DECLARE @ExistingCount INT;
    DECLARE @QueuePosition INT;

    -- 检查读者
    SELECT @ReaderStatus = [status] FROM reader WHERE reader_id = @ReaderID;
    IF @ReaderStatus IS NULL OR @ReaderStatus <> 'normal'
    BEGIN
        RAISERROR('预约失败：读者状态异常。', 16, 1);
        RETURN;
    END

    -- 检查重复
    SELECT @ExistingCount = COUNT(*) FROM reservation
    WHERE reader_id = @ReaderID AND book_id = @BookID AND [status] = 'waiting';
    IF @ExistingCount > 0
    BEGIN
        RAISERROR('预约失败：您已预约过该书。', 16, 1);
        RETURN;
    END

    -- 检查库存
    SELECT @InLibraryCount = in_library_count FROM book_inventory WHERE book_id = @BookID;
    IF @InLibraryCount > 0
    BEGIN
        RAISERROR('该书尚有在馆副本，可直接借阅。', 16, 1);
        RETURN;
    END

    -- 插入预约
    INSERT INTO reservation (reader_id, book_id, reserve_time, [status])
    VALUES (@ReaderID, @BookID, GETDATE(), 'waiting');

    -- 更新图书状态
    UPDATE book SET [status] = 'reserved' WHERE book_id = @BookID AND [status] = 'borrowed';

    -- 计算排队位置
    SELECT @QueuePosition = COUNT(*) FROM reservation
    WHERE book_id = @BookID AND [status] = 'waiting'
      AND reserve_time <= (SELECT reserve_time FROM reservation WHERE reader_id = @ReaderID AND book_id = @BookID AND [status] = 'waiting');

    PRINT '预约成功！排队位置：' + CAST(@QueuePosition AS NVARCHAR);
END;
GO

PRINT '>>> 5个存储过程创建完成 <<<';
GO
