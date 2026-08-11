import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_PACKAGES = Path(__file__).resolve().parents[1] / ".python_packages"
if PROJECT_PACKAGES.is_dir():
    sys.path.insert(0, str(PROJECT_PACKAGES))

from poe_image import generate
from poe_script import generate_script
from deepseek_packaging import generate_packaging


HOST = "127.0.0.1"
PORT = 4318


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "http://localhost:4317")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "service": "local-ai-gateway", "writing": "deepseek", "images": "poe"})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path not in ("/generate", "/generate-script", "/generate-packaging"):
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request_data = json.loads(self.rfile.read(length).decode("utf-8"))
            if self.path == "/generate-script":
                result = generate_script(request_data)
            elif self.path == "/generate-packaging":
                result = generate_packaging(request_data)
            else:
                result = generate(request_data)
            status = 200 if result.get("ok") else int(result.get("status", 502))
            self.send_json(status if status == 200 or 400 <= status < 600 else 502, result)
        except Exception as error:
            self.send_json(500, {"ok": False, "error": f"Python 服务异常：{error}"})

    def log_message(self, *_):
        return


if __name__ == "__main__":
    print(f"Poe Python media and writing service: http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
