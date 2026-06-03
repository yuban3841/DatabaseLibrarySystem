"""图书管理系统 — 一键启动入口

用法:
    python start.py              # 同时启动后端 + 前端
    python start.py backend      # 仅启动后端 API
    python start.py frontend     # 仅启动前端界面
    python start.py install      # 安装所有依赖
    python start.py setup        # 初始化数据库（首次运行）

说明:
    后端 Flask API 默认运行在 http://localhost:5000
    前端 Streamlit 默认运行在 http://localhost:8502

    首次使用请按顺序执行：
    1. python start.py install   — 安装依赖
    2. python start.py setup     — 初始化数据库
    3. python start.py            — 启动系统
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontier"

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 5000
FRONTEND_PORT = 8502

_processes: list[subprocess.Popen] = []


def fmt_path(p: Path) -> str:
    return str(p.resolve())


def run_subprocess(name: str, cwd: Path, args: list[str]) -> subprocess.Popen:
    print(f"[启动] {name}: {' '.join(args)}  (cwd={cwd.name})")
    proc = subprocess.Popen(args, cwd=str(cwd))
    _processes.append(proc)
    return proc


def check_python() -> None:
    v = sys.version_info
    if v < (3, 10):
        sys.exit(f"需要 Python 3.10+，当前版本: {v.major}.{v.minor}")
    print(f"[检查] Python {v.major}.{v.minor}.{v.micro} OK")


def pip_install(cwd: Path) -> None:
    req = cwd / "requirements.txt"
    if not req.exists():
        print(f"[跳过] {req} 不存在")
        return
    print(f"[安装] {cwd.name}/requirements.txt ...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", str(req)],
        cwd=str(cwd),
    )
    if result.returncode != 0:
        print(f"[警告] {cwd.name} 依赖安装失败，请手动执行: pip install -r {fmt_path(req)}")
    else:
        print(f"[完成] {cwd.name} 依赖已安装")


def cmd_install() -> None:
    """安装后端和前端所有依赖"""
    print("=" * 56)
    print("  图书管理系统 — 依赖安装")
    print("=" * 56)
    pip_install(BACKEND_DIR)
    pip_install(FRONTEND_DIR)
    print("\n所有依赖安装完成。")


def cmd_setup() -> None:
    """初始化数据库"""
    print("=" * 56)
    print("  图书管理系统 — 数据库初始化")
    print("=" * 56)
    setup_script = BACKEND_DIR / "setup_db.py"
    if not setup_script.exists():
        sys.exit(f"找不到 {fmt_path(setup_script)}")
    result = subprocess.run([sys.executable, str(setup_script)], cwd=str(BACKEND_DIR))
    if result.returncode != 0:
        sys.exit("数据库初始化失败，请检查 SQL Server 连接配置。")
    print("\n数据库初始化完成。")


def wait_for_backend(timeout: int = 30) -> bool:
    import urllib.request
    import urllib.error

    url = f"http://{BACKEND_HOST}:{BACKEND_PORT}/api/health"
    print(f"[等待] 后端启动中（{url}）...", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    print(" OK")
                    return True
        except Exception:
            pass
        time.sleep(0.5)
        print(".", end="", flush=True)
    print(f" 超时（{timeout}秒）")
    return False


def start_backend() -> subprocess.Popen:
    """启动 Flask 后端"""
    return run_subprocess(
        "后端 API",
        BACKEND_DIR,
        [sys.executable, "-m", "flask", "run", "--host", BACKEND_HOST, "--port", str(BACKEND_PORT), "--no-debug"],
    )


def start_frontend() -> subprocess.Popen:
    """启动 Streamlit 前端"""
    return run_subprocess(
        "前端界面",
        FRONTEND_DIR,
        [
            sys.executable, "-m", "streamlit", "run", "app.py",
            "--server.port", str(FRONTEND_PORT),
            "--server.headless", "true",
            "--browser.serverAddress", BACKEND_HOST,
        ],
    )


def start_all() -> None:
    """同时启动后端和前端"""
    print("=" * 56)
    print("  图书管理系统")
    print(f"  后端 API : http://{BACKEND_HOST}:{BACKEND_PORT}")
    print(f"  前端界面 : http://{BACKEND_HOST}:{FRONTEND_PORT}")
    print("=" * 56)
    print("  按 Ctrl+C 停止所有服务")
    print()

    # 1. 启动后端
    start_backend()

    # 2. 等待后端就绪
    if not wait_for_backend(timeout=30):
        print("[警告] 后端启动超时，前端可能无法正常连接。")

    # 3. 启动前端
    start_frontend()

    # 4. 打开浏览器
    time.sleep(2)
    webbrowser.open(f"http://{BACKEND_HOST}:{FRONTEND_PORT}")

    # 5. 监控进程
    try:
        while True:
            time.sleep(1)
            for proc in _processes:
                if proc.poll() is not None:
                    print(f"[退出] 一个子进程已退出 (code={proc.returncode})")
                    shutdown()
                    return
    except KeyboardInterrupt:
        print("\n正在停止所有服务...")
        shutdown()


def shutdown() -> None:
    for proc in _processes:
        if proc.poll() is None:
            proc.terminate()
    for proc in _processes:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    _processes.clear()
    print("所有服务已停止。")
    sys.exit(0)


def main() -> None:
    check_python()

    parser = argparse.ArgumentParser(
        description="图书管理系统 — 一键启动",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python start.py             同时启动后端 + 前端
  python start.py backend     仅启动后端
  python start.py frontend    仅启动前端
  python start.py install     安装依赖
  python start.py setup       初始化数据库
        """,
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["all", "backend", "frontend", "install", "setup"],
        help="启动模式 (默认: all)",
    )
    args = parser.parse_args()

    if args.command == "install":
        cmd_install()
    elif args.command == "setup":
        cmd_setup()
    elif args.command == "backend":
        print("=" * 56)
        print(f"  后端 API -> http://{BACKEND_HOST}:{BACKEND_PORT}")
        print("=" * 56)
        proc = start_backend()
        try:
            proc.wait()
        except KeyboardInterrupt:
            shutdown()
    elif args.command == "frontend":
        print("=" * 56)
        print(f"  前端界面 -> http://{BACKEND_HOST}:{FRONTEND_PORT}")
        print("=" * 56)
        # 尝试检测后端
        import urllib.request
        try:
            urllib.request.urlopen(f"http://{BACKEND_HOST}:{BACKEND_PORT}/api/health", timeout=2)
        except Exception:
            print(f"[提示] 后端 ({BACKEND_HOST}:{BACKEND_PORT}) 未检测到，部分功能可能不可用。")
        proc = start_frontend()
        try:
            proc.wait()
        except KeyboardInterrupt:
            shutdown()
    else:
        start_all()


if __name__ == "__main__":
    main()
