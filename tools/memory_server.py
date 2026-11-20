#!/usr/bin/env python3
"""
memory_server.py — 小星姐姐本地服务：静态页面 + 记忆库 API（SQLite）

用法:
    python3 tools/memory_server.py [--host 0.0.0.0] [--port 8899]
    python3 tools/memory_server.py --host 0.0.0.0 --port 9443 \
        --https-cert data/certs/server.pem --https-key data/certs/server-key.pem

默认只监听 127.0.0.1；用 --host 0.0.0.0 可开放给局域网。
页面与接口同源，不需要 CORS。
数据库文件: data/memory.db（已 gitignore，不进仓库）

接口:
    GET    /api/health              {ok, db, messages, facts}
    GET    /api/history?limit=50    {messages:[{id, role, content, created_at}]}
    POST   /api/history             {role, content}
    POST   /api/history/bulk        {messages:[{role, content}]}
    DELETE /api/history
    GET    /api/facts               {facts:{name, likes, pets, friends, misc}}
    PUT    /api/facts               {facts:{...}}

静态文件从仓库根目录提供，"/" 映射到 /chat.html；
data/、tools/、.git/ 和 config.local.json 一律不对外。
"""
import argparse
import json
import os
import sqlite3
import ssl
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')
DB_PATH = os.path.join(DATA_DIR, 'memory.db')

MAX_CONTENT = 4000
MAX_BULK = 500
MAX_LIMIT = 500
FACT_KINDS = ('name', 'likes', 'pets', 'friends', 'misc')

BLOCKED_DIRS = ('data', 'tools', '.git', '.dsh', '_private')
BLOCKED_FILES = ('config.local.json',)

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8',
}


# ----------------------------- 数据库 -----------------------------
def connect():
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS facts (
                kind TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                PRIMARY KEY (kind, value)
            );
            CREATE TABLE IF NOT EXISTS profiles (
                name TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def count_all():
    conn = connect()
    try:
        messages = conn.execute('SELECT COUNT(*) FROM messages').fetchone()[0]
        facts = conn.execute('SELECT COUNT(*) FROM facts').fetchone()[0]
    finally:
        conn.close()
    return messages, facts


def read_facts(conn):
    facts = {kind: [] for kind in FACT_KINDS}
    facts['name'] = ''
    for row in conn.execute('SELECT kind, value FROM facts ORDER BY rowid'):
        kind, value = row['kind'], row['value']
        if kind == 'name':
            facts['name'] = value
        elif kind in facts:
            facts[kind].append(value)
    return facts


def write_facts(conn, facts):
    conn.execute('DELETE FROM facts')
    name = str(facts.get('name') or '').strip()[:32]
    if name:
        conn.execute("INSERT INTO facts (kind, value) VALUES ('name', ?)", (name,))
    for kind in ('likes', 'pets', 'friends', 'misc'):
        values = facts.get(kind) or []
        if not isinstance(values, list):
            values = []
        for value in values[:20]:
            value = str(value).strip()[:32]
            if value:
                conn.execute(
                    'INSERT OR IGNORE INTO facts (kind, value) VALUES (?, ?)',
                    (kind, value),
                )


def clean_message(item):
    """校验一条消息，返回 (role, content) 或 None。"""
    if not isinstance(item, dict):
        return None
    role = item.get('role')
    content = str(item.get('content') or '').strip()
    if role not in ('user', 'assistant') or not content:
        return None
    return role, content[:MAX_CONTENT]


# ----------------------------- HTTP -----------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = 'Xiaoxing/1.0'
    protocol_version = 'HTTP/1.1'

    # ---- 输出 ----
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        self._json(status, {'ok': False, 'error': message})

    def _body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return None
        if length <= 0 or length > 2_000_000:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def log_message(self, fmt, *args):
        sys.stderr.write('[memory] ' + (fmt % args) + '\n')

    # ---- 路由 ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == '/api/health':
            messages, facts = count_all()
            return self._json(200, {
                'ok': True,
                'db': 'sqlite',
                'messages': messages,
                'facts': facts,
            })
        if path == '/api/history':
            return self._history_get(parsed)
        if path == '/api/facts':
            return self._facts_get()
        if path == '/api/profile':
            return self._profile_get(parsed)
        if path in ('/ca.pem', '/ca.crt'):
            ca_path = os.path.join(DATA_DIR, 'certs', 'ca.pem')
            if os.path.isfile(ca_path):
                with open(ca_path, 'rb') as fh:
                    body = fh.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/x-x509-ca-cert')
                self.send_header('Content-Disposition', 'attachment; filename="xiaoxing-ca.crt"')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return self._error(404, 'no ca')
        if path == '/favicon.ico':
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        return self._static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/history':
            return self._history_add()
        if path == '/api/history/bulk':
            return self._history_bulk()
        return self._error(404, 'not found')

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == '/api/facts':
            return self._facts_put()
        if path == '/api/profile':
            return self._profile_put()
        return self._error(404, 'not found')

    def do_DELETE(self):
        if urlparse(self.path).path == '/api/history':
            return self._history_clear()
        return self._error(404, 'not found')

    # ---- 历史 ----
    def _history_get(self, parsed):
        try:
            limit = int((parse_qs(parsed.query).get('limit') or ['50'])[0])
        except ValueError:
            limit = 50
        limit = max(1, min(MAX_LIMIT, limit))
        conn = connect()
        try:
            rows = conn.execute(
                'SELECT * FROM (SELECT id, role, content, created_at FROM messages '
                'ORDER BY id DESC LIMIT ?) ORDER BY id ASC',
                (limit,),
            ).fetchall()
        finally:
            conn.close()
        return self._json(200, {'messages': [dict(r) for r in rows]})

    def _history_add(self):
        data = self._body()
        if isinstance(data, dict) and 'messages' in data:
            items = data.get('messages')
            data = items[0] if isinstance(items, list) and items else None
        msg = clean_message(data)
        if not msg:
            return self._error(400, 'bad message')
        role, content = msg
        conn = connect()
        try:
            cur = conn.execute(
                'INSERT INTO messages (role, content) VALUES (?, ?)', (role, content)
            )
            conn.commit()
            msg_id = cur.lastrowid
        finally:
            conn.close()
        return self._json(200, {'ok': True, 'id': msg_id})

    def _history_bulk(self):
        data = self._body()
        items = data.get('messages') if isinstance(data, dict) else None
        if not isinstance(items, list):
            return self._error(400, 'bad messages')
        cleaned = [m for m in (clean_message(x) for x in items[:MAX_BULK]) if m]
        if not cleaned:
            return self._json(200, {'ok': True, 'inserted': 0})
        conn = connect()
        try:
            conn.executemany(
                'INSERT INTO messages (role, content) VALUES (?, ?)', cleaned
            )
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {'ok': True, 'inserted': len(cleaned)})

    def _history_clear(self):
        conn = connect()
        try:
            conn.execute('DELETE FROM messages')
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {'ok': True})

    # ---- 事实 ----
    def _facts_get(self):
        conn = connect()
        try:
            facts = read_facts(conn)
        finally:
            conn.close()
        return self._json(200, {'facts': facts})

    def _facts_put(self):
        data = self._body()
        facts = data.get('facts') if isinstance(data, dict) else None
        if not isinstance(facts, dict):
            return self._error(400, 'bad facts')
        conn = connect()
        try:
            write_facts(conn, facts)
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {'ok': True})

    # ---- 孩子档案（按名字同步配置/成长数据） ----
    def _profile_get(self, parsed):
        name = (parse_qs(parsed.query).get('name') or [''])[0].strip()[:32]
        if not name:
            return self._error(400, 'missing name')
        conn = connect()
        try:
            row = conn.execute(
                'SELECT data, updated_at FROM profiles WHERE name = ?', (name,)
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return self._json(200, {'profile': None})
        try:
            data = json.loads(row['data'])
        except json.JSONDecodeError:
            data = None
        return self._json(200, {'profile': data, 'updated_at': row['updated_at']})

    def _profile_put(self):
        body = self._body()
        if not isinstance(body, dict):
            return self._error(400, 'bad body')
        name = str(body.get('name') or '').strip()[:32]
        data = body.get('data')
        if not name or not isinstance(data, dict):
            return self._error(400, 'bad profile')
        raw = json.dumps(data, ensure_ascii=False)
        if len(raw) > 200_000:
            return self._error(413, 'profile too large')
        conn = connect()
        try:
            conn.execute(
                'INSERT INTO profiles (name, data, updated_at) VALUES (?, ?, datetime(\'now\', \'localtime\')) '
                'ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = datetime(\'now\', \'localtime\')',
                (name, raw),
            )
            conn.commit()
        finally:
            conn.close()
        return self._json(200, {'ok': True})

    # ---- 静态文件 ----
    def _static(self, url_path):
        rel = url_path
        if rel in ('/', ''):
            rel = '/chat.html'
        rel = os.path.normpath(rel).lstrip('/')

        parts = rel.split(os.sep)
        if rel.startswith('..') or any(p in BLOCKED_DIRS or p.startswith('.') for p in parts):
            return self._error(404, 'not found')
        if rel in BLOCKED_FILES:
            return self._error(404, 'not found')

        full = os.path.join(ROOT, rel)
        if not os.path.isfile(full):
            return self._error(404, 'not found')

        ext = os.path.splitext(full)[1].lower()
        try:
            with open(full, 'rb') as fh:
                body = fh.read()
        except OSError:
            return self._error(500, 'read error')

        self.send_response(200)
        self.send_header('Content-Type', MIME.get(ext, 'application/octet-stream'))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description='小星姐姐本地记忆库 + 静态服务')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8899)
    parser.add_argument('--https-cert')
    parser.add_argument('--https-key')
    args = parser.parse_args()

    init_db()
    messages, facts = count_all()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    scheme = 'http'
    if args.https_cert and args.https_key:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.https_cert, args.https_key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        scheme = 'https'
    server.daemon_threads = True
    rel_db = os.path.relpath(DB_PATH, ROOT)
    print(f'[memory] {scheme}://{args.host}:{args.port}/  |  db={rel_db}  |  '
          f'messages={messages} facts={facts}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
