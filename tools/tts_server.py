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
    POST /speak   {"text": "...", "voice": "可选", "rate": 0.88, "pitch": 1.05}
    POST /stop    停止当前播报
    GET  /health  {"ok": true, "voice": "...", "hasKey": true}

Key 来源（按优先级）：环境变量 DASHSCOPE_API_KEY > 项目根 config.local.json
（config.local.json 已 gitignore，格式：{"dashscope_api_key": "sk-..."}）
"""
import json
import os
import subprocess
import tempfile
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8799
DASHSCOPE_TTS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
MODEL = 'cosyvoice-v3-flash'
DEFAULT_VOICE = 'longyingling_v3'  # 龙应聆（温和共情女）
TIMEOUT = 8

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
_play_proc = None
_lock = threading.Lock()


def synthesize(text, voice, rate, pitch):
    """调 CosyVoice 合成，返回 mp3 文件路径，失败返回 None"""
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
        return None
    url = url.replace('http://', 'https://', 1)
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        audio = r.read()
    f = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
    f.write(audio)
    f.close()
    return f.name


def speak(text, voice=DEFAULT_VOICE, rate=0.88, pitch=1.05):
    """合成并播放，返回 (ok, message)。会打断上一句。"""
    global _play_proc
    if not API_KEY:
        return False, 'no api key'
    try:
        path = synthesize(text, voice, rate, pitch)
    except Exception as e:
        return False, f'synthesize failed: {e}'
    if not path:
        return False, 'no audio url'
    with _lock:
        if _play_proc and _play_proc.poll() is None:
            _play_proc.kill()
        _play_proc = subprocess.Popen(
            ['afplay', path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    return True, 'playing'


def stop():
    global _play_proc
    with _lock:
        if _play_proc and _play_proc.poll() is None:
            _play_proc.kill()
    return True


class Handler(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            self._json({'ok': True, 'voice': DEFAULT_VOICE, 'hasKey': bool(API_KEY)})
        else:
            self._json({'ok': False, 'error': 'not found'}, 404)

    def do_POST(self):
        if self.path == '/speak':
            try:
                n = int(self.headers.get('Content-Length', 0))
                payload = json.loads(self.rfile.read(n) or b'{}')
            except Exception:
                self._json({'ok': False, 'error': 'bad json'}, 400)
                return
            text = (payload.get('text') or '').strip()
            if not text:
                self._json({'ok': False, 'error': 'text required'}, 400)
                return
            ok, msg = speak(
                text[:500],  # 限长，防误用刷量
                payload.get('voice') or DEFAULT_VOICE,
                float(payload.get('rate', 0.88)),
                float(payload.get('pitch', 1.05)),
            )
            self._json({'ok': ok, 'message': msg}, 200 if ok else 500)
        elif self.path == '/stop':
            stop()
            self._json({'ok': True})
        else:
            self._json({'ok': False, 'error': 'not found'}, 404)

    def log_message(self, fmt, *args):
        print('[tts_server]', fmt % args)


if __name__ == '__main__':
    if not API_KEY:
        print('[tts_server] 警告：未找到 DASHSCOPE_API_KEY，/speak 将失败')
    print(f'[tts_server] 监听 http://localhost:{PORT}  音色 {DEFAULT_VOICE}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
