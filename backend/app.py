"""图书管理系统 — Flask 入口"""
from flask import Flask, jsonify
from flask_cors import CORS

from auth.routes import auth_bp
from api.readers import readers_bp
from api.books import books_bp
from api.borrow import borrow_bp
from api.reservations import reservations_bp
from api.fines import fines_bp
from api.statistics import stats_bp
from api.admin import admin_bp
from api.logs import logs_bp

app = Flask(__name__)
CORS(app)

# 注册蓝图
app.register_blueprint(auth_bp, url_prefix="/auth")
app.register_blueprint(readers_bp, url_prefix="/api/readers")
app.register_blueprint(books_bp, url_prefix="/api/books")
app.register_blueprint(borrow_bp, url_prefix="/api/borrow")
app.register_blueprint(reservations_bp, url_prefix="/api/reservations")
app.register_blueprint(fines_bp, url_prefix="/api/fines")
app.register_blueprint(stats_bp, url_prefix="/api/statistics")
app.register_blueprint(admin_bp, url_prefix="/api/admin")
app.register_blueprint(logs_bp, url_prefix="/api/logs")


@app.route("/api/health", methods=["GET"])
def health():
    return {"code": 200, "message": "Library System API is running"}


@app.errorhandler(404)
def not_found(e):
    return jsonify({"code": 404, "message": "接口不存在"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"code": 500, "message": "服务器内部错误"}), 500


from config import HOST, PORT, DEBUG, SSL_CERT, SSL_KEY

if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  图书管理系统 API")
    if SSL_CERT and SSL_KEY:
        print(f"  https://localhost:{PORT}")
    else:
        print(f"  http://localhost:{PORT}")
    print("=" * 50)

    ssl_context = (SSL_CERT, SSL_KEY) if SSL_CERT and SSL_KEY else None
    app.run(host=HOST, port=PORT, debug=DEBUG, ssl_context=ssl_context)
