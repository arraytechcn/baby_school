#!/bin/bash
# say.sh — 一行命令播报（供 DeepSeek harness / Claude Code / 任意脚本调用）
# 用法: bash tools/say.sh "要播报的文字"
# 依赖: tts_server.py 已在运行（python3 tools/tts_server.py）
TEXT="${*}"
if [ -z "$TEXT" ]; then
  echo "usage: bash tools/say.sh <要播报的文字>" >&2
  exit 1
fi
curl -sS -m 15 -X POST http://localhost:8799/speak \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys; print(json.dumps({'text': sys.argv[1]}))" "$TEXT")"
echo
