@echo off
chcp 65001 >nul
title 图书管理系统

cd /d "%~dp0"

echo ============================================
echo   图书管理系统 — 一键启动
echo ============================================
echo.

python start.py %*

if %errorlevel% neq 0 (
    echo.
    echo [错误] 启动失败，请检查是否已安装 Python 3.10+。
    echo 首次使用请按顺序执行:
    echo   1. start.bat install
    echo   2. start.bat setup
    echo   3. start.bat
    pause
)
