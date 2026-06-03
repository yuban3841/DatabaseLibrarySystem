"""
数据库初始化脚本 — 创建存储过程 + 设置管理员bcrypt密码
运行: python setup_db.py
"""
import sys
sys.path.insert(0, ".")

from db import db
from utils.security import hash_password

PROCS_SQL = """
-- ==================== 2. 还书 ====================
IF OBJECT_ID('usp_ReturnBook', 'P') IS NOT NULL DROP PROCEDURE usp_ReturnBook;
GO
CREATE PROCEDURE usp_ReturnBook
    @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RecordID BIGINT, @ReaderID NVARCHAR(20), @DueDate DATE, @ReaderTypeID INT,
            @OverdueDays INT = 0, @FeePerDay DECIMAL(10,2) = 0.50, @Fine DECIMAL(10,2) = 0,
            @RsvID BIGINT, @HoldH INT;
    SELECT TOP 1 @RecordID=record_id, @ReaderID=reader_id, @DueDate=due_date
    FROM borrow_record WHERE book_id=@BookID AND status='borrowed' ORDER BY borrow_date DESC;
    IF @RecordID IS NULL BEGIN RAISERROR('No active borrow record.',16,1); RETURN; END
    IF CAST(GETDATE() AS DATE) > @DueDate
    BEGIN
        SET @OverdueDays = DATEDIFF(day, @DueDate, CAST(GETDATE() AS DATE));
        SELECT @ReaderTypeID = reader_type_id FROM reader WHERE reader_id=@ReaderID;
        SELECT TOP 1 @FeePerDay = ISNULL(overdue_fee_per_day,0.50) FROM borrow_rule
        WHERE reader_type_id=@ReaderTypeID AND status='active' ORDER BY effective_date DESC;
        SET @Fine = @OverdueDays * @FeePerDay;
    END
    BEGIN TRANSACTION;
    BEGIN TRY
        UPDATE borrow_record SET actual_return_date=CAST(GETDATE() AS DATE), status='returned'
        WHERE record_id=@RecordID;
        UPDATE book SET status='in_library' WHERE book_id=@BookID;
        UPDATE book_inventory SET in_library_count=in_library_count+1, borrowed_count=borrowed_count-1,
            update_time=GETDATE() WHERE book_id=@BookID;
        IF @OverdueDays > 0
            INSERT INTO fine_record(reader_id,book_id,borrow_record_id,overdue_days,amount,paid_status,generate_date)
            VALUES(@ReaderID,@BookID,@RecordID,@OverdueDays,@Fine,0,CAST(GETDATE() AS DATE));
        SELECT TOP 1 @RsvID=reservation_id FROM reservation
        WHERE book_id=@BookID AND status='waiting' ORDER BY reserve_time;
        IF @RsvID IS NOT NULL
        BEGIN
            SELECT TOP 1 @HoldH=ISNULL(reserve_hold_hours,48) FROM borrow_rule
            WHERE reader_type_id=(SELECT reader_type_id FROM reader WHERE reader_id=@ReaderID)
              AND status='active' ORDER BY effective_date DESC;
            UPDATE reservation SET status='available', expire_time=DATEADD(HOUR,@HoldH,GETDATE())
            WHERE reservation_id=@RsvID;
        END
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @E NVARCHAR(4000)=ERROR_MESSAGE(); RAISERROR(@E,16,1);
    END CATCH
END;
GO

-- ==================== 3. 续借 ====================
IF OBJECT_ID('usp_RenewBook', 'P') IS NOT NULL DROP PROCEDURE usp_RenewBook;
GO
CREATE PROCEDURE usp_RenewBook
    @ReaderID NVARCHAR(20), @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RecordID BIGINT, @CurRenew INT, @DueDate DATE, @ReaderTypeID INT,
            @MaxRenew INT, @RenewDays INT, @HasRsv INT;
    SELECT TOP 1 @RecordID=record_id, @CurRenew=renew_count, @DueDate=due_date
    FROM borrow_record WHERE reader_id=@ReaderID AND book_id=@BookID AND status='borrowed'
    ORDER BY borrow_date DESC;
    IF @RecordID IS NULL BEGIN RAISERROR('No active borrow record.',16,1); RETURN; END
    SELECT @HasRsv=COUNT(*) FROM reservation WHERE book_id=@BookID AND status IN ('waiting','available');
    IF @HasRsv > 0 BEGIN RAISERROR('Book reserved by others.',16,1); RETURN; END
    SELECT @ReaderTypeID=reader_type_id FROM reader WHERE reader_id=@ReaderID;
    SELECT TOP 1 @MaxRenew=ISNULL(max_renew,0), @RenewDays=ISNULL(renew_days,15)
    FROM borrow_rule WHERE reader_type_id=@ReaderTypeID AND status='active' ORDER BY effective_date DESC;
    IF @MaxRenew IS NULL SELECT @MaxRenew=max_renew_count FROM reader_type WHERE reader_type_id=@ReaderTypeID;
    IF @RenewDays IS NULL SELECT @RenewDays=borrow_days FROM reader_type WHERE reader_type_id=@ReaderTypeID;
    IF @CurRenew >= @MaxRenew BEGIN RAISERROR('Max renew reached.',16,1); RETURN; END
    UPDATE borrow_record SET renew_count=renew_count+1, due_date=DATEADD(day,@RenewDays,@DueDate)
    WHERE record_id=@RecordID;
END;
GO

-- ==================== 4. 图书遗失 ====================
IF OBJECT_ID('usp_HandleBookLoss', 'P') IS NOT NULL DROP PROCEDURE usp_HandleBookLoss;
GO
CREATE PROCEDURE usp_HandleBookLoss
    @BookID NVARCHAR(20), @Compensation DECIMAL(10,2), @Handler NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RecordID BIGINT;
    SELECT TOP 1 @RecordID=record_id FROM borrow_record
    WHERE book_id=@BookID AND status='borrowed' ORDER BY borrow_date DESC;
    IF @RecordID IS NULL BEGIN RAISERROR('No active borrow record.',16,1); RETURN; END
    BEGIN TRANSACTION;
    BEGIN TRY
        INSERT INTO exception_record(borrow_record_id,exception_type,handling_method,compensation_amount,handling_date,handler)
        VALUES(@RecordID,'loss','compensation',@Compensation,CAST(GETDATE() AS DATE),@Handler);
        UPDATE borrow_record SET actual_return_date=CAST(GETDATE() AS DATE),status='returned' WHERE record_id=@RecordID;
        UPDATE book SET status='lost' WHERE book_id=@BookID;
        UPDATE book_inventory SET total_count=total_count-1,borrowed_count=borrowed_count-1,update_time=GETDATE() WHERE book_id=@BookID;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        DECLARE @E NVARCHAR(4000)=ERROR_MESSAGE(); RAISERROR(@E,16,1);
    END CATCH
END;
GO

-- ==================== 5. 预约 ====================
IF OBJECT_ID('usp_CreateReservation', 'P') IS NOT NULL DROP PROCEDURE usp_CreateReservation;
GO
CREATE PROCEDURE usp_CreateReservation
    @ReaderID NVARCHAR(20), @BookID NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ReaderStatus NVARCHAR(10), @InLib INT, @Exist INT, @Pos INT;
    SELECT @ReaderStatus=status FROM reader WHERE reader_id=@ReaderID;
    IF @ReaderStatus IS NULL OR @ReaderStatus<>'normal' BEGIN RAISERROR('Reader status invalid.',16,1); RETURN; END
    SELECT @Exist=COUNT(*) FROM reservation WHERE reader_id=@ReaderID AND book_id=@BookID AND status='waiting';
    IF @Exist>0 BEGIN RAISERROR('Already reserved.',16,1); RETURN; END
    SELECT @InLib=in_library_count FROM book_inventory WHERE book_id=@BookID;
    IF @InLib>0 BEGIN RAISERROR('Book available, borrow directly.',16,1); RETURN; END
    INSERT INTO reservation(reader_id,book_id,reserve_time,status) VALUES(@ReaderID,@BookID,GETDATE(),'waiting');
    UPDATE book SET status='reserved' WHERE book_id=@BookID AND status='borrowed';
    SELECT @Pos=COUNT(*) FROM reservation WHERE book_id=@BookID AND status='waiting'
      AND reserve_time<=(SELECT reserve_time FROM reservation WHERE reader_id=@ReaderID AND book_id=@BookID AND status='waiting');
END;
GO
"""


def main():
    print("=" * 50)
    print("图书管理系统 — 数据库初始化")
    print("=" * 50)

    # Step 1: 创建存储过程（逐条执行，忽略 GO 错误但继续）
    print("\n[1/2] Creating stored procedures...")
    # Split by GO and execute each batch
    batches = PROCS_SQL.split("\nGO\n")
    for i, batch in enumerate(batches):
        batch = batch.strip()
        if not batch:
            continue
        try:
            with db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(batch)
                conn.commit()
            print(f"  Batch {i+1}/{len(batches)-1} OK")
        except Exception as e:
            # Some batches may have "IF EXISTS DROP" that fail if proc doesn't exist
            if "Cannot drop" in str(e) or "does not exist" in str(e):
                print(f"  Batch {i+1}/{len(batches)-1} SKIP (already clean)")
            else:
                print(f"  Batch {i+1}/{len(batches)-1} ERROR: {e}")

    # Step 2: 设置管理员bcrypt密码
    print("\n[2/2] Setting admin passwords with bcrypt...")
    admin_pwd = hash_password("Admin@123")
    lib_pwd = hash_password("Lib@123")

    db.execute_update(
        "UPDATE admin SET password_hash=%s WHERE username='admin'",
        (admin_pwd,)
    )
    db.execute_update(
        "UPDATE admin SET password_hash=%s WHERE username='librarian'",
        (lib_pwd,)
    )
    print("  admin    -> Admin@123")
    print("  librarian -> Lib@123")

    # Verify
    procs = db.execute_query("SELECT name FROM sys.procedures ORDER BY name")
    print(f"\nStored procedures ({len(procs)}): {[p['name'] for p in procs]}")
    print("\nDone!")


if __name__ == "__main__":
    main()
