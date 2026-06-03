"""
数据库初始化 — 创建剩余存储过程 + bcrypt密码
运行: python setup_db.py
"""
from db import db
from utils.security import hash_password


def main():
    print("=" * 50)
    print("Library System - DB Setup")
    print("=" * 50)

    # Step 1: 创建4个存储过程
    print("\n[1/2] Creating stored procedures...")

    procedures = [
        # 还书
        """
IF OBJECT_ID('usp_ReturnBook', 'P') IS NOT NULL DROP PROCEDURE usp_ReturnBook;
EXEC('
CREATE PROCEDURE usp_ReturnBook @BookID NVARCHAR(20) AS BEGIN SET NOCOUNT ON;
DECLARE @Rid BIGINT, @Uid NVARCHAR(20), @Due DATE, @Tid INT, @Od INT=0, @Fee DEC(10,2)=0.5, @Fine DEC(10,2)=0, @Rsv BIGINT, @Hh INT;
SELECT TOP 1 @Rid=record_id, @Uid=reader_id, @Due=due_date FROM borrow_record WHERE book_id=@BookID AND status=''borrowed'' ORDER BY borrow_date DESC;
IF @Rid IS NULL BEGIN RAISERROR(''No active borrow record.'',16,1); RETURN; END
IF CAST(GETDATE() AS DATE)>@Due BEGIN SET @Od=DATEDIFF(day,@Due,CAST(GETDATE() AS DATE)); SELECT @Tid=reader_type_id FROM reader WHERE reader_id=@Uid;
SELECT TOP 1 @Fee=ISNULL(overdue_fee_per_day,0.5) FROM borrow_rule WHERE reader_type_id=@Tid AND status=''active'' ORDER BY effective_date DESC; SET @Fine=@Od*@Fee; END
BEGIN TRANSACTION; BEGIN TRY
UPDATE borrow_record SET actual_return_date=CAST(GETDATE() AS DATE),status=''returned'' WHERE record_id=@Rid;
UPDATE book SET status=''in_library'' WHERE book_id=@BookID;
UPDATE book_inventory SET in_library_count=in_library_count+1,borrowed_count=borrowed_count-1,update_time=GETDATE() WHERE book_id=@BookID;
IF @Od>0 INSERT INTO fine_record(reader_id,book_id,borrow_record_id,overdue_days,amount,paid_status,generate_date) VALUES(@Uid,@BookID,@Rid,@Od,@Fine,0,CAST(GETDATE() AS DATE));
SELECT TOP 1 @Rsv=reservation_id FROM reservation WHERE book_id=@BookID AND status=''waiting'' ORDER BY reserve_time;
IF @Rsv IS NOT NULL BEGIN SELECT TOP 1 @Hh=ISNULL(reserve_hold_hours,48) FROM borrow_rule WHERE reader_type_id=(SELECT reader_type_id FROM reader WHERE reader_id=@Uid) AND status=''active'' ORDER BY effective_date DESC;
UPDATE reservation SET status=''available'',expire_time=DATEADD(HOUR,@Hh,GETDATE()) WHERE reservation_id=@Rsv; END
COMMIT TRANSACTION; END TRY BEGIN CATCH ROLLBACK TRANSACTION; DECLARE @E NVARCHAR(4000)=ERROR_MESSAGE(); RAISERROR(@E,16,1); END CATCH END');
""",

        # 续借
        """
IF OBJECT_ID('usp_RenewBook', 'P') IS NOT NULL DROP PROCEDURE usp_RenewBook;
EXEC('
CREATE PROCEDURE usp_RenewBook @ReaderID NVARCHAR(20), @BookID NVARCHAR(20) AS BEGIN SET NOCOUNT ON;
DECLARE @Rid BIGINT, @CRenew INT, @Due DATE, @Tid INT, @MaxR INT, @RDays INT, @HasR INT;
SELECT TOP 1 @Rid=record_id, @CRenew=renew_count, @Due=due_date FROM borrow_record WHERE reader_id=@ReaderID AND book_id=@BookID AND status=''borrowed'' ORDER BY borrow_date DESC;
IF @Rid IS NULL BEGIN RAISERROR(''No active record.'',16,1); RETURN; END
SELECT @HasR=COUNT(*) FROM reservation WHERE book_id=@BookID AND status IN (''waiting'',''available'');
IF @HasR>0 BEGIN RAISERROR(''Book reserved by others.'',16,1); RETURN; END
SELECT @Tid=reader_type_id FROM reader WHERE reader_id=@ReaderID;
SELECT TOP 1 @MaxR=ISNULL(max_renew,0), @RDays=ISNULL(renew_days,15) FROM borrow_rule WHERE reader_type_id=@Tid AND status=''active'' ORDER BY effective_date DESC;
IF @MaxR IS NULL SELECT @MaxR=max_renew_count FROM reader_type WHERE reader_type_id=@Tid;
IF @RDays IS NULL SELECT @RDays=borrow_days FROM reader_type WHERE reader_type_id=@Tid;
IF @CRenew>=@MaxR BEGIN RAISERROR(''Max renew reached.'',16,1); RETURN; END
UPDATE borrow_record SET renew_count=renew_count+1, due_date=DATEADD(day,@RDays,@Due) WHERE record_id=@Rid; END');
""",

        # 遗失
        """
IF OBJECT_ID('usp_HandleBookLoss', 'P') IS NOT NULL DROP PROCEDURE usp_HandleBookLoss;
EXEC('
CREATE PROCEDURE usp_HandleBookLoss @BookID NVARCHAR(20), @Compensation DECIMAL(10,2), @Handler NVARCHAR(50) AS BEGIN SET NOCOUNT ON;
DECLARE @Rid BIGINT;
SELECT TOP 1 @Rid=record_id FROM borrow_record WHERE book_id=@BookID AND status=''borrowed'' ORDER BY borrow_date DESC;
IF @Rid IS NULL BEGIN RAISERROR(''No active record.'',16,1); RETURN; END
BEGIN TRANSACTION; BEGIN TRY
INSERT INTO exception_record(borrow_record_id,exception_type,handling_method,compensation_amount,handling_date,handler) VALUES(@Rid,''loss'',''compensation'',@Compensation,CAST(GETDATE() AS DATE),@Handler);
UPDATE borrow_record SET actual_return_date=CAST(GETDATE() AS DATE),status=''returned'' WHERE record_id=@Rid;
UPDATE book SET status=''lost'' WHERE book_id=@BookID;
UPDATE book_inventory SET total_count=total_count-1,borrowed_count=borrowed_count-1,update_time=GETDATE() WHERE book_id=@BookID;
COMMIT TRANSACTION; END TRY BEGIN CATCH ROLLBACK TRANSACTION; DECLARE @E NVARCHAR(4000)=ERROR_MESSAGE(); RAISERROR(@E,16,1); END CATCH END');
""",

        # 预约
        """
IF OBJECT_ID('usp_CreateReservation', 'P') IS NOT NULL DROP PROCEDURE usp_CreateReservation;
EXEC('
CREATE PROCEDURE usp_CreateReservation @ReaderID NVARCHAR(20), @BookID NVARCHAR(20) AS BEGIN SET NOCOUNT ON;
DECLARE @RS NVARCHAR(10), @ILib INT, @Exist INT, @Pos INT;
SELECT @RS=status FROM reader WHERE reader_id=@ReaderID;
IF @RS IS NULL OR @RS<>''normal'' BEGIN RAISERROR(''Reader status invalid.'',16,1); RETURN; END
SELECT @Exist=COUNT(*) FROM reservation WHERE reader_id=@ReaderID AND book_id=@BookID AND status=''waiting'';
IF @Exist>0 BEGIN RAISERROR(''Already reserved.'',16,1); RETURN; END
SELECT @ILib=in_library_count FROM book_inventory WHERE book_id=@BookID;
IF @ILib>0 BEGIN RAISERROR(''Book available, borrow directly.'',16,1); RETURN; END
INSERT INTO reservation(reader_id,book_id,reserve_time,status) VALUES(@ReaderID,@BookID,GETDATE(),''waiting'');
UPDATE book SET status=''reserved'' WHERE book_id=@BookID AND status=''borrowed'';
END');
""",
    ]

    for i, proc_sql in enumerate(procedures):
        try:
            db.execute_raw(proc_sql)
            print(f"  [{i+1}/4] OK")
        except Exception as e:
            print(f"  [{i+1}/4] ERROR: {e}")

    # Step 2: bcrypt密码
    print("\n[2/2] Setting admin passwords...")
    pwd1 = hash_password("Admin@123")
    pwd2 = hash_password("Lib@123")

    db.execute_update("UPDATE admin SET password_hash=? WHERE username='admin'", (pwd1,))
    db.execute_update("UPDATE admin SET password_hash=? WHERE username='librarian'", (pwd2,))
    print("  admin     -> Admin@123")
    print("  librarian -> Lib@123")

    # 验证
    procs = db.execute_query("SELECT name FROM sys.procedures ORDER BY name")
    print(f"\nProcedures ({len(procs)}): {[p['name'] for p in procs]}")
    print("Done!")


if __name__ == "__main__":
    main()
