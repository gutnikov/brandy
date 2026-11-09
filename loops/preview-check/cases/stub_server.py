"""A stand-in for a deployed brandy app, for the preview-check cases.

Serves <case-dir>/index.html at /, answers /api/hello like the API, and /healthz with the status in
<case-dir>/healthz-status (default 200). Usage: stub_server.py <case-dir> <port>
"""
import http.server
import sys
from pathlib import Path

CASE, PORT = Path(sys.argv[1]), int(sys.argv[2])
STATUS = int((CASE / "healthz-status").read_text().strip()) if (CASE / "healthz-status").exists() else 200


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body.encode())

    def do_GET(self):
        if self.path == "/healthz":
            return self.send(STATUS, "application/json", '{"status":"%s"}' % ("ok" if STATUS == 200 else "down"))
        if self.path == "/api/hello":
            return self.send(200, "application/json", '{"message":"hello"}')
        if self.path == "/":
            return self.send(200, "text/html", (CASE / "index.html").read_text())
        return self.send(404, "text/plain", "not found")


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
