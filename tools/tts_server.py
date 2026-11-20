#!/usr/bin/env python3
"""
tts_server.py — 小星姐姐语音播报本地服务

把 CosyVoice 语音合成 + 本地播放封装成 HTTP 接口，供外部工具
（DeepSeek harness / Claude Code / 任意脚本）调用，回答时播报出来。

用法：
    DASHSCOPE_API_KEY=sk-xxx python3 tools/tts_server.py
    curl -X POST http://localhost:8799/speak -H 'Content-Type: application/json' \
         -d '{"text": "你好，我是小星姐姐"}'

接口：
    POST /speak    {"text": "...", "voice": "可选", "rate": 0.88, "pitch": 1.05}
                   长文本自动按句切分，边合成边播；返回后立即开始，可用 /status 查进度
    POST /stop     停止当前播报
    POST /config   {"rate": 1.2, "voice": "..."}  播放中也能改，下一句生效
    GET  /status   播放进度（state/index/total/percent/chunkElapsed/chunkDuration）
    GET  /health   {"ok": true, "voice": "...", "hasKey": true}

Key 来源（按优先级）：环境变量 DASHSCOPE_API_KEY > 项目根 config.local.json
（config.local.json 已 gitignore，格式：{"dashscope_api_key": "sk-..."}）
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8799
DASHSCOPE_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
MODEL = 'cosyvoice-v3-flash'
DEFAULT_VOICE = 'longyingling_v3'  # 龙应聆（温和共情女）
DEFAULT_RATE = 0.88
DEFAULT_PITCH = 1.05
TIMEOUT = 20

# 单句上限：偏小是为了让进度条足够跟手、且首句出声快
CHUNK_MAX_CHARS = 160
# 整段上限：防误用刷量（约 25 分钟语音）
MAX_TEXT_CHARS = 4000

ROOT = Path(__file__).resolve().parent.parent


def load_key():
    key = os.environ.get('DASHSCOPE_API_KEY')
    if key:
        return key
    cfg = ROOT / 'config.local.json'
    if cfg.exists():
        try:
            return json.loads(cfg.read_text(encoding='utf-8')).get('dashscope_api_key')
        except Exception:
            return None
    return None


API_KEY = load_key()

# ---------------------------------------------------------------- 播放状态

_lock = threading.Lock()
_stop_flag = threading.Event()
_state = {
    'state': 'idle',        # idle | synthesizing | playing
    'index': 0,             # 当前句序号（1 起）
    'total': 0,             # 总句数
    'percent': 0.0,         # 0-100，按字数加权 + 当前句内进度
    'charsDone': 0,         # 已完成句子的字数
    'charsTotal': 0,
    'text': '',             # 正在播报的原文（截断存档用）
    'chunkText': '',        # 当前句
    'chunkElapsed': 0.0,
    'chunkDuration': 0.0,
    'rate': DEFAULT_RATE,
    'voice': DEFAULT_VOICE,
    'pitch': DEFAULT_PITCH,
    'error': None,
}
_worker = None
_play_proc = None
_chunk_start = 0.0
_tmp_files = []


def _snapshot():
    """取一份带实时进度的状态副本。"""
    with _lock:
        snap = dict(_state)
        snap['hasKey'] = bool(API_KEY)
        if snap['state'] == 'playing' and snap['chunkDuration'] > 0:
            elapsed = time.time() - _chunk_start
            snap['chunkElapsed'] = round(elapsed, 2)
            frac = min(1.0, elapsed / snap['chunkDuration'])
        elif snap['state'] == 'playing':
            snap['chunkElapsed'] = round(time.time() - _chunk_start, 2)
            frac = 0.0
        else:
            frac = 0.0
        if snap['charsTotal'] > 0:
            done = snap['charsDone'] + len(snap['chunkText']) * frac
            snap['percent'] = round(min(100.0, done / snap['charsTotal'] * 100), 1)
        return snap


def _set(**kw):
    with _lock:
        _state.update(kw)


# ---------------------------------------------------------------- 分句


def split_chunks(text, limit=CHUNK_MAX_CHARS):
    """按中文句末标点切句，超长句再按逗号/硬切，保证每块不超过 limit。"""
    text = re.sub(r'[ \t]+', ' ', text.strip())
    if not text:
        return []
    # 先按句末标点（含换行）切开，标点留在前一句
    raw = re.split(r'(?<=[。！？!?；;…\n])', text)
    parts = []
    for seg in raw:
        seg = seg.strip()
        if not seg:
            continue
        if len(seg) <= limit:
            parts.append(seg)
            continue
        # 超长句：按逗号等次级标点继续切
        subs = re.split(r'(?<=[，,、：:）)])', seg)
        buf = ''
        for sub in subs:
            sub = sub.strip()
            if not sub:
                continue
            if len(buf) + len(sub) <= limit:
                buf += sub
            else:
                if buf:
                    parts.append(buf)
                if len(sub) <= limit:
                    buf = sub
                else:
                    # 仍然超长：硬切
                    for i in range(0, len(sub), limit):
                        piece = sub[i:i + limit]
                        if i + limit < len(sub):
                            parts.append(piece)
                        else:
                            buf = piece
        if buf:
            parts.append(buf)
    # 合并过短的碎片（<12 字），减少 API 调用次数
    merged = []
    for p in parts:
        if merged and len(merged[-1]) < 12 and len(merged[-1]) + len(p) <= limit:
            merged[-1] += p
        else:
            merged.append(p)
    return merged


# ---------------------------------------------------------------- 合成与播放


def synthesize(text, voice, rate, pitch):
    """调 CosyVoice 合成，返回 mp3 文件路径，失败抛异常。"""
    body = json.dumps({
        'model': MODEL,
        'input': {'text': text, 'voice': voice, 'format': 'mp3', 'rate': rate, 'pitch': pitch},
    }).encode()
    req = urllib.request.Request(DASHSCOPE_TTS_URL, data=body, headers={
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = json.load(r)
    url = data.get('output', {}).get('audio', {}).get('url')
    if not url:
        msg = data.get('message') or data.get('code') or 'no audio url'
        raise RuntimeError(str(msg))
    url = url.replace('http://', 'https://', 1)
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        audio = r.read()
    f = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    f.write(audio)
    f.close()
    _tmp_files.append(f.name)
    return f.name


def probe_duration(path):
    """用 afinfo 读 mp3 时长（秒）；失败时按 128kbps 估算。"""
    try:
        out = subprocess.run(['afinfo', path], capture_output=True, text=True, timeout=5).stdout
        m = re.search(r'estimated duration:\s*([\d.]+)', out)
        if m:
            return float(m.group(1))
    except Exception:
        pass
    try:
        return os.path.getsize(path) * 8 / 128000
    except Exception:
        return 0.0


def _cleanup_tmp(keep=3):
    """只保留最近几个临时 mp3，避免堆积。"""
    while len(_tmp_files) > keep:
        old = _tmp_files.pop(0)
        try:
            os.unlink(old)
        except Exception:
            pass


def _play(path):
    """起 afplay，返回 Popen；无 afplay 时返回 None。"""
    global _play_proc
    exe = shutil.which('afplay')
    if exe is None:
        raise RuntimeError('afplay not found (macOS only)')
    with _lock:
        _play_proc = subprocess.Popen(
            [exe, path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return _play_proc


def _kill_play():
    global _play_proc
    proc = None
    with _lock:
        proc = _play_proc
        _play_proc = None
    if proc and proc.poll() is None:
        try:
            proc.kill()
            proc.wait(timeout=2)
        except Exception:
            pass


def _run_job(chunks, voice, pitch):
    """后台线程：逐句合成 → 播放 → 推进进度。"""
    global _chunk_start
    chars_total = sum(len(c) for c in chunks)
    done = 0
    try:
        for i, chunk in enumerate(chunks, start=1):
            if _stop_flag.is_set():
                return
            with _lock:
                rate = _state['rate']
                voice_now = _state['voice']
            _set(state='synthesizing', index=i, total=len(chunks),
                 charsDone=done, charsTotal=chars_total, chunkText=chunk,
                 chunkElapsed=0.0, chunkDuration=0.0, percent=round(done / chars_total * 100, 1))
            path = synthesize(chunk, voice_now, rate, pitch)
            if _stop_flag.is_set():
                return
            duration = probe_duration(path)
            with _lock:
                _chunk_start = time.time()
            _set(state='playing', chunkDuration=round(duration, 2))
            proc = _play(path)
            while proc.poll() is None:
                if _stop_flag.is_set():
                    _kill_play()
                    return
                time.sleep(0.08)
            done += len(chunk)
            _set(charsDone=done, percent=round(done / chars_total * 100, 1))
            _cleanup_tmp()
        _set(state='idle', index=len(chunks), percent=100.0, chunkText='',
             chunkElapsed=0.0, chunkDuration=0.0)
    except Exception as e:
        _kill_play()
        _set(state='idle', error=str(e))
    finally:
        _cleanup_tmp(keep=1)


def speak(text, voice=DEFAULT_VOICE, rate=DEFAULT_RATE, pitch=DEFAULT_PITCH):
    """排队播报一段文字（长文本自动分句）。返回 (ok, message)。会打断上一句。"""
    global _worker
    if not API_KEY:
        return False, 'no api key'
    text = (text or '').strip()
    if not text:
        return False, 'text required'
    truncated = False
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
        truncated = True
    chunks = split_chunks(text)
    if not chunks:
        return False, 'text required'
    stop()
    _stop_flag.clear()
    _set(state='synthesizing', index=0, total=len(chunks), percent=0.0,
         charsDone=0, charsTotal=sum(len(c) for c in chunks),
         text=text, chunkText='', chunkElapsed=0.0, chunkDuration=0.0,
         rate=rate, voice=voice, pitch=pitch, error=None)
    _worker = threading.Thread(target=_run_job, args=(chunks, voice, pitch), daemon=True)
    _worker.start()
    return True, 'playing' + (' (truncated)' if truncated else '')


def stop():
    """停止当前播报，等待工作线程收尾。"""
    _stop_flag.set()
    _kill_play()
    w = _worker
    if w and w.is_alive():
        w.join(timeout=2)
    _set(state='idle', index=0, percent=0.0, charsDone=0, chunkText='',
         chunkElapsed=0.0, chunkDuration=0.0)
    return True


def configure(rate=None, voice=None, pitch=None):
    """改参数；播放中改 rate/voice 会在下一句生效。"""
    with _lock:
        if rate is not None:
            _state['rate'] = max(0.5, min(2.0, float(rate)))
        if voice:
            _state['voice'] = str(voice)
        if pitch is not None:
            _state['pitch'] = max(0.5, min(2.0, float(pitch)))
        return dict(_state)


# ---------------------------------------------------------------- HTTP


class Handler(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n) or b'{}')

    def do_OPTIONS(self):
        """浏览器跨域预检（DSH 页面在 3080 端口，调用 8799 会先发 OPTIONS）。"""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path == '/health':
            self._json({'ok': True, 'voice': _state['voice'] or DEFAULT_VOICE,
                        'hasKey': bool(API_KEY)})
        elif path == '/status':
            self._json({'ok': True, **_snapshot()})
        else:
            self._json({'ok': False, 'error': 'not found'}, 404)

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        try:
            payload = self._body()
        except Exception:
            self._json({'ok': False, 'error': 'bad json'}, 400)
            return
        if path == '/speak':
            text = (payload.get('text') or '').strip()
            if not text:
                self._json({'ok': False, 'error': 'text required'}, 400)
                return
            ok, msg = speak(
                text,
                payload.get('voice') or _state['voice'] or DEFAULT_VOICE,
                float(payload.get('rate', _state['rate'])),
                float(payload.get('pitch', _state['pitch'])),
            )
            self._json({'ok': ok, 'message': msg, 'total': _state['total']},
                       200 if ok else 500)
        elif path == '/stop':
            stop()
            self._json({'ok': True})
        elif path == '/config':
            cfg = configure(
                rate=payload.get('rate'),
                voice=payload.get('voice'),
                pitch=payload.get('pitch'),
            )
            self._json({'ok': True, 'rate': cfg['rate'], 'voice': cfg['voice']})
        else:
            self._json({'ok': False, 'error': 'not found'}, 404)

    def log_message(self, fmt, *args):
        print('[tts_server]', fmt % args)


if __name__ == '__main__':
    if not API_KEY:
        print('[tts_server] 警告：未找到 DASHSCOPE_API_KEY，/speak 将失败')
    print(f'[tts_server] 监听 http://localhost:{PORT}  音色 {DEFAULT_VOICE}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
