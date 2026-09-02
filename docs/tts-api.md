# 小星姐姐语音播报接口（TTS Server）接入文档

> 把阿里云百炼 CosyVoice 语音合成 + 本地播放封装成本机 HTTP 服务，
> 任何能发 HTTP 请求的工具（DeepSeek harness / Claude Code / 脚本 / 网页）都能调用，让 AI 的回答"说出来"。
> 代码：`tools/tts_server.py`（纯 Python 3 标准库，零依赖）。

## 1. 快速开始

```bash
# 启动服务（Key 从环境变量传入；也可以放 config.local.json，见第 5 节）
DASHSCOPE_API_KEY=sk-xxx python3 tools/tts_server.py

# 验证
curl http://localhost:8799/health
# -> {"ok": true, "voice": "longyingling_v3", "hasKey": true}

# 播报一句话
curl -X POST http://localhost:8799/speak \
  -H 'Content-Type: application/json' \
  -d '{"text": "你好，我是小星姐姐"}'

# 或用包装脚本
bash tools/say.sh "要播报的文字"
```

服务只监听 `127.0.0.1:8799`，不对外网暴露。

## 2. 接口定义

### POST /speak

播报一段文字。新请求会**自动打断**正在播放的上一句。

请求体（JSON）：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| text | string | 是 | - | 要播报的文字，超过 500 字自动截断 |
| voice | string | 否 | longyingling_v3 | 音色 id，见第 4 节 |
| rate | float | 否 | 0.88 | 语速 0.5-2.0 |
| pitch | float | 否 | 1.05 | 音调 0.5-2.0 |

响应：

```json
{"ok": true, "message": "playing"}
```

失败（无 Key / 超时 / 合成失败）返回 HTTP 500 + `{"ok": false, "message": "原因"}`。

### POST /stop

停止当前播报。响应 `{"ok": true}`。

### GET /health

健康检查。响应 `{"ok": true, "voice": "...", "hasKey": true}`。

## 3. 接入示例

Shell（harness 回答完成的钩子里调用）：

```bash
bash tools/say.sh "这里是回答内容"
```

Python：

```python
import json, urllib.request
urllib.request.urlopen(urllib.request.Request(
    'http://localhost:8799/speak',
    data=json.dumps({'text': '回答内容'}).encode(),
    headers={'Content-Type': 'application/json'},
), timeout=15)
```

浏览器/网页（服务已带 `Access-Control-Allow-Origin: *`，跨域直接可调）：

```js
fetch('http://localhost:8799/speak', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: '回答内容' }),
});
```

## 4. 可用音色（cosyvoice-v3-flash 实测可用，共 35 个）

姐姐人设推荐：`longyingling_v3`（龙应聆·温和共情，默认）、`longanrou_v3`（温柔闺蜜）、`longwanjun_v3`（细腻柔声）、`longyingtao_v3`（温柔淡定）、`longanwen_v3`（优雅知性）、`longxiaochun_v3`（知性积极）。

童声：`longhuhu_v3`、`longpaopao_v3`、`longshanshan_v3`、`longniuniu_v3`、`longwangwang_v3`。

完整 35 个列表见 `js/tts.js` 的 `COSYVOICE_VOICES` 常量，试听样本在 `samples/`。

## 5. 配置与注意事项

- **API Key**：优先级 环境变量 `DASHSCOPE_API_KEY` > 项目根 `config.local.json`（格式 `{"dashscope_api_key": "sk-..."}`，已 gitignore，Key 不进仓库）。
- **播放方式**：macOS 用 `afplay`，合成后落临时 mp3 再播；其他平台需替换 `speak()` 里的播放命令（Linux 用 `mpg123`/`ffplay`）。
- **成本**：cosyvoice-v3-flash 约 $0.13/万字符，日常播报成本可忽略。
- **限制**：单次最长 500 字（防误用刷量）；长回答请自行摘要后播报。
- **无 Key 时**：服务正常启动，但 /speak 返回 500 `no api key`，调用方应静默跳过。
