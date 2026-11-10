#!/usr/bin/env python3
"""公考错题本本地启动脚本（仅标准库）。

用法：
  python3 serve.py                 # http://<本机IP>:8080，iPad 同一 Wi-Fi 可访问
  python3 serve.py --port 9000
  python3 serve.py --https         # 自签名 HTTPS，用于启用 Service Worker 离线缓存
"""
from __future__ import annotations

import argparse
import http.server
import socket
import ssl
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT_DIR = Path(tempfile.gettempdir()) / "gongkao-cuoti-cert"


def detect_lan_ip() -> str:
    candidates = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.5)
        sock.connect(("8.8.8.8", 80))
        candidates.append(sock.getsockname()[0])
        sock.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            candidates.append(info[4][0])
    except OSError:
        pass
    for ip in candidates:
        if ip and not ip.startswith("127.") and ip != "0.0.0.0":
            return ip
    return "127.0.0.1"


class AppHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory or str(ROOT), **kwargs)

    def end_headers(self):
        suffix = Path(self.path.split("?", 1)[0]).suffix.lower()
        if suffix in {".html", ".js", ".css", ".webmanifest"} or self.path.split("?", 1)[0] in {"/", "/index.html"}:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


    def do_GET(self):
        # 不对外提供 .cert/.git 等隐藏文件
        parts = [p for p in self.path.split("?", 1)[0].split("/") if p]
        if any(p.startswith(".") for p in parts):
            self.send_error(404, "Not found")
            return
        super().do_GET()

    def do_HEAD(self):
        parts = [p for p in self.path.split("?", 1)[0].split("/") if p]
        if any(p.startswith(".") for p in parts):
            self.send_error(404, "Not found")
            return
        super().do_HEAD()

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s - %s\n" % (self.address_string(), fmt % args))


class AppServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def ensure_certificate(lan_ip: str) -> tuple[Path, Path]:
    CERT_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    cert = CERT_DIR / "cert.pem"
    key = CERT_DIR / "key.pem"
    if cert.exists() and key.exists():
        return cert, key

    print("第一次使用 HTTPS，正在生成本地自签名证书…")
    san = f"DNS:localhost,IP:127.0.0.1,IP:{lan_ip}"
    config = CERT_DIR / "openssl.cnf"
    config.write_text(
        "[req]\n"
        "distinguished_name = dn\n"
        "x509_extensions = v3\n"
        "prompt = no\n"
        "[dn]\n"
        "CN = gongkao-cuoti.local\n"
        "[v3]\n"
        f"subjectAltName = {san}\n"
        "basicConstraints = CA:FALSE\n"
        "keyUsage = digitalSignature, keyEncipherment\n"
        "extendedKeyUsage = serverAuth\n",
        encoding="utf-8",
    )
    command = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256",
        "-days", "825", "-nodes",
        "-keyout", str(key), "-out", str(cert),
        "-config", str(config),
    ]
    try:
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    except FileNotFoundError:
        raise SystemExit("未找到 openssl，无法生成 HTTPS 证书。可先使用 HTTP 启动。")
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode("utf-8", "ignore") if error.stderr else ""
        raise SystemExit(f"生成证书失败：{detail}")
    return cert, key


def main() -> None:
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, OSError):
        pass
    parser = argparse.ArgumentParser(description="公考错题本本地服务器")
    parser.add_argument("--port", type=int, default=8080, help="监听端口，默认 8080")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0")
    parser.add_argument("--https", action="store_true", help="使用自签名 HTTPS（启用离线缓存）")
    parser.add_argument("--cert", type=str, default="", help="自定义证书路径（PEM）")
    parser.add_argument("--key", type=str, default="", help="自定义私钥路径（PEM）")
    args = parser.parse_args()

    lan_ip = detect_lan_ip()
    try:
        server = AppServer((args.host, args.port), AppHandler)
    except OSError as error:
        raise SystemExit(f"端口 {args.port} 启动失败：{error}\n可换端口，例如 python3 serve.py --port 9000")
    scheme = "http"

    if args.https:
        if args.cert and args.key:
            cert, key = Path(args.cert), Path(args.key)
        else:
            cert, key = ensure_certificate(lan_ip)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(cert), keyfile=str(key))
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = "https"
        cert_hint = str(cert)

    port = args.port
    print("")
    print("  公考错题本 · 事业单位 D 类  (V1)")
    print("  ─────────────────────────────────")
    print(f"  本机访问：   {scheme}://127.0.0.1:{port}/")
    if lan_ip != "127.0.0.1":
        print(f"  iPad 访问：  {scheme}://{lan_ip}:{port}/")
        print("  （iPad 与电脑需连接同一个 Wi-Fi）")
    if scheme == "https":
        print("")
        print("  首次 HTTPS 访问会提示证书不受信任。")
        print("  在 iPad 上可点『显示详细信息 → 访问此网站』继续；")
        print("  如需完整离线缓存/主屏幕安装，请按 docs/V1-acceptance.md 信任证书。")
        print(f"  自签名证书：{cert_hint}")
    else:
        print("")
        print("  提示：普通 HTTP 下数据仍保存在本机，但 Service Worker 离线缓存")
        print("  需要 HTTPS。需要断网后重新打开也能用，请加 --https 启动。")
    print("")
    print("  按 Ctrl+C 停止服务。")
    print("")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。数据仍保存在 iPad/浏览器本机。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
