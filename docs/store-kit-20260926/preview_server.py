"""ストア撮影用のローカルプレビューサーバー。

実データへ接続せず、distを読み取り専用で配信しながらSupabase APIを架空fixtureで返す。
起動: python docs/store-kit-20260926/preview_server.py
"""
from __future__ import annotations

import copy
import json
import mimetypes
import os
import secrets
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "dist"
KIT = ROOT / "docs" / "store-kit-20260926"
IMAGES = ROOT.parent / "出力画像"
HOST, PORT = "127.0.0.1", 5188
LOCAL_URL = f"http://{HOST}:{PORT}"
UID = "00000000-0000-4000-8000-000000000001"
STAMP = "2026-09-01T00:00:00Z"
FAKE_KEY = "demo-anon-key-for-local-capture-only"


def local_env_value(name: str) -> str:
    """.env.localから配信時だけ読み取り、ログやレスポンスには出さない。"""
    env_file = ROOT / ".env.local"
    if not env_file.is_file():
        return ""
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.partition("=")[2].strip().strip('"').strip("'")
    return ""


SOURCE_SUPABASE_URL = local_env_value("VITE_SUPABASE_URL")
SOURCE_SUPABASE_ANON_KEY = local_env_value("VITE_SUPABASE_ANON_KEY")


def uid_for(prefix: str, number: int) -> str:
    return f"{prefix}-0000-4000-8000-{number:012d}"


CALENDARS = [
    {"id": uid_for("10000000", i), "user_id": UID, "name": name, "color": color,
     "source": "local", "is_shift": i == 2, "is_visible": True, "priority": i,
     "created_at": STAMP, "updated_at": STAMP}
    for i, (name, color) in enumerate(
        [("仕事", "#3B82F6"), ("暮らし", "#10B981"), ("シフト", "#F59E0B"), ("学び", "#8B5CF6")]
    )
]


def make_event(number: int, day: int, title: str, calendar: int, start: str, end: str,
               color: str | None = None, source: str = "local") -> dict:
    return {"id": uid_for("20000000", number), "user_id": UID,
            "calendar_id": CALENDARS[calendar]["id"], "title": title,
            "all_day": False, "starts_at": f"2026-09-{day:02d}T{start}:00+09:00",
            "ends_at": f"2026-09-{day:02d}T{end}:00+09:00", "event_date": None,
            "note": None, "location": None, "event_url": None,
            "label_color": color, "source": source, "break_minutes": 60 if calendar == 2 else None,
            "hourly_wage": 1300 if calendar == 2 else None,
            "workplace_label": "サンプル店舗" if calendar == 2 else None,
            "shift_template_id": None, "reminder_minutes": None, "is_secret": False,
            "created_at": STAMP, "updated_at": STAMP}


EVENTS = []
event_specs = [
    (2, "企画会議", 0, "10:00", "11:00"), (4, "買い物", 1, "16:00", "17:00"),
    (6, "早番", 2, "08:00", "16:00"), (8, "資料整理", 0, "14:00", "15:00"),
    (10, "散歩", 1, "07:00", "07:30"), (12, "遅番", 2, "13:00", "21:00"),
    (14, "英会話", 3, "19:00", "20:00"), (16, "定例会議", 0, "09:00", "10:00"),
    (18, "健康診断", 1, "11:00", "12:00"), (20, "勉強会", 3, "18:00", "19:00"),
    (24, "早番", 2, "08:00", "16:00"), (28, "早番", 2, "08:00", "16:00"),
    (29, "読書", 3, "18:00", "19:00"), (30, "買い物", 1, "16:00", "17:00"),
]
for i, (day, title, cal, start, end) in enumerate(event_specs):
    EVENTS.append(make_event(i, day, title, cal, start, end,
                             ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6"][cal]))
EVENTS.extend([
    make_event(80, 26, "朝会", 0, "09:00", "10:00", "#3B82F6"),
    make_event(81, 26, "ランチ", 1, "12:00", "13:00", "#10B981"),
    make_event(82, 26, "読書", 3, "18:00", "19:00", "#8B5CF6"),
    make_event(83, 9, "定例会議", 0, "15:00", "16:00", "#3B82F6", "google"),
    make_event(84, 18, "健康診断", 1, "09:00", "10:00", "#10B981", "device"),
])

EVENT_TAGS = [
    {"id": uid_for("30000000", i), "user_id": UID, "name": name, "color": color,
     "start_local": start, "end_local": end, "created_at": STAMP, "updated_at": STAMP,
     "deleted_at": None}
    for i, (name, color, start, end) in enumerate([
        ("朝会", "#3B82F6", "09:00", "10:00"), ("読書", "#8B5CF6", "18:00", "19:00"),
        ("散歩", "#10B981", "07:00", "07:30"), ("買い物", "#F59E0B", "16:00", "17:00")])
]
SHIFT_TEMPLATES = [
    {"id": uid_for("40000000", i), "user_id": UID, "name": name, "start_local": start,
     "end_local": end, "break_minutes": 60, "hourly_wage": 1300,
     "workplace_label": "サンプル店舗", "color": color, "created_at": STAMP,
     "updated_at": STAMP, "deleted_at": None}
    for i, (name, start, end, color) in enumerate([
        ("早番", "08:00", "16:00", "#F59E0B"), ("遅番", "13:00", "21:00", "#F59E0B")])
]
PROFILE = {"id": UID, "display_name": "サンプル", "avatar_data_url": None,
           "secret_passcode_hash": None, "created_at": STAMP, "updated_at": STAMP}
SESSION_USER = {"id": UID, "aud": "authenticated", "role": "authenticated",
               "email": "sample@example.invalid", "is_anonymous": False,
               "app_metadata": {}, "user_metadata": {}, "created_at": STAMP}
SESSION = {"access_token": "demo.header.signature", "refresh_token": "demo-only",
           "token_type": "bearer", "expires_in": 3600, "expires_at": 4102444800,
           "user": SESSION_USER}
TABLES = {"profiles": [PROFILE], "calendars": CALENDARS, "events": EVENTS,
          "event_tags": EVENT_TAGS, "shift_templates": SHIFT_TEMPLATES}


def json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def rows_for(table: str, query: dict[str, list[str]]) -> list[dict]:
    rows = [copy.deepcopy(row) for row in TABLES.get(table, [])]
    for key, values in query.items():
        if not values or key in {"select", "order", "limit", "offset"}:
            continue
        expression = values[-1]
        if expression.startswith("eq."):
            wanted = expression[3:]
            rows = [r for r in rows if (str(r.get(key)).lower() if isinstance(r.get(key), bool) else str(r.get(key))) == wanted.lower()]
        elif expression.startswith("neq."):
            rows = [r for r in rows if str(r.get(key)) != expression[4:]]
        elif expression.startswith("gte."):
            rows = [r for r in rows if str(r.get(key, "")) >= expression[4:]]
        elif expression.startswith("lte."):
            rows = [r for r in rows if str(r.get(key, "")) <= expression[4:]]
    if query.get("order"):
        spec = query["order"][0].split(",")[0]
        field, *direction = spec.split(".")
        rows.sort(key=lambda r: str(r.get(field, "")), reverse=direction[:1] == ["desc"])
    if query.get("limit"):
        rows = rows[:int(query["limit"][0])]
    return rows


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def send_data(self, status: int, data: bytes, content_type: str = "application/json",
                  csp: str | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", LOCAL_URL)
        self.send_header("Access-Control-Allow-Headers", "authorization, apikey, content-type, prefer")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        if csp:
            self.send_header("Content-Security-Policy", csp)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_data(204, b"")

    def do_GET(self):
        self.api_or_static("GET")

    def do_POST(self):
        self.api_or_static("POST")

    def do_PATCH(self):
        self.api_or_static("PATCH")

    def do_DELETE(self):
        self.api_or_static("DELETE")

    def body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def api_or_static(self, method: str):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            self.send_data(200, json_bytes({"ok": True, "mode": "local-fixture", "port": PORT,
                                            "tables": {k: len(v) for k, v in TABLES.items()}}))
            return
        if path == "/capture":
            target = parse_qs(parsed.query).get("path", ["/"])[0]
            if not target.startswith("/") or target.startswith("//") or "?" in target:
                target = "/"
            html = ("<!doctype html><meta charset='utf-8'><style>html,body{margin:0;width:824px;height:1640px;overflow:hidden;scrollbar-width:none}" 
                    "::-webkit-scrollbar{display:none}"
                    "iframe{width:412px;height:820px;transform:scale(2);transform-origin:0 0;border:0}</style>"
                    f"<iframe src='{target}'></iframe>")
            self.send_data(200, html.encode(), "text/html; charset=utf-8",
                           "default-src 'self'; frame-src 'self'; worker-src 'none'; style-src 'unsafe-inline' 'self';")
            return
        if path.startswith("/auth/v1/") or path.startswith("/rest/v1/"):
            self.handle_api(method, path, parsed)
            return
        self.serve_static(path)

    def handle_api(self, method: str, path: str, parsed) -> None:
        if path.endswith("/signup") or path.endswith("/token"):
            self.send_data(200, json_bytes(SESSION)); return
        if path.endswith("/user"):
            self.send_data(200, json_bytes(SESSION_USER)); return
        if not path.startswith("/rest/v1/"):
            self.send_data(200, json_bytes({"session": SESSION, "user": SESSION_USER})); return
        table = path.removeprefix("/rest/v1/").strip("/")
        if table not in TABLES:
            # 設定画面などの任意の補助RESTは、外部へ出ず空の成功結果を返す。
            self.send_data(200, b"[]"); return
        query = parse_qs(parsed.query)
        rows = rows_for(table, query)
        if method in {"POST", "PATCH", "DELETE"}:
            payload = self.body()
            incoming = payload if isinstance(payload, dict) else (payload[0] if payload else {})
            ids = [r.get("id") for r in rows]
            if method == "POST":
                row = {**incoming, "id": incoming.get("id", uid_for("90000000", secrets.randbelow(999999))),
                       "user_id": UID, "created_at": STAMP, "updated_at": STAMP}
                TABLES[table].append(row); rows = [copy.deepcopy(row)]
            elif method == "PATCH":
                for existing in TABLES[table]:
                    if existing.get("id") in ids or (not ids and existing.get("id") == incoming.get("id")):
                        existing.update(incoming); existing["updated_at"] = STAMP
                rows = rows_for(table, query)
            else:
                for existing in TABLES[table]:
                    if existing.get("id") in ids: existing["deleted_at"] = STAMP
                rows = []
        accept = self.headers.get("Accept", "")
        result: object = rows[0] if "vnd.pgrst.object" in accept and rows else rows
        self.send_data(200, json_bytes(result))

    def serve_static(self, path: str):
        if path == "/": path = "/index.html"
        if path.startswith("/kit/"):
            base, relative = KIT, path.removeprefix("/kit/")
        elif path.startswith("/images/"):
            base, relative = IMAGES, path.removeprefix("/images/")
        else:
            base, relative = DIST, path.lstrip("/")
        candidate = (base / relative).resolve()
        try: candidate.relative_to(base.resolve())
        except ValueError: self.send_data(404, b"not found", "text/plain"); return
        if not candidate.is_file():
            candidate = DIST / "index.html"
        data = candidate.read_bytes()
        if candidate.suffix == ".js":
            if SOURCE_SUPABASE_URL:
                data = data.replace(SOURCE_SUPABASE_URL.encode(), LOCAL_URL.encode())
            if SOURCE_SUPABASE_ANON_KEY:
                data = data.replace(SOURCE_SUPABASE_ANON_KEY.encode(), FAKE_KEY.encode())
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        csp = None
        if candidate.name == "index.html":
            text = data.decode("utf-8", errors="replace")
            text = text.replace("<head>", "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; connect-src 'self'; worker-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'\"><style>*{scrollbar-width:none}*::-webkit-scrollbar{display:none}</style><script>if(!localStorage.getItem('calendar-app.theme'))localStorage.setItem('calendar-app.theme','light')</script>", 1)
            data = text.encode("utf-8")
        self.send_data(200, data, content_type, csp)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"ローカルfixtureサーバー: {LOCAL_URL}")
    print(f"撮影ラッパー: {LOCAL_URL}/capture?path=/calendar")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
