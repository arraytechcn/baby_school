# 小星姐姐 — 成长陪伴室（Web 端）项目笔记

> 创建日期：2026-09-02 ｜ 技术栈：单页 HTML/CSS/JS（原生 ES Modules）+ 通义千问 API + Web Speech API + localStorage
> 这份文档写给项目所有者和后续维护的 AI（Claude Code / Kimi）。项目定位与验收标准见 `CLAUDE.md`，不重复。

> **维护规则**：本文件**只能增补、带日期备注，不得整段刷掉旧记录**。任何章节有新增/修改，在该章节内标注日期和改了什么；汇总记录在「变更记录」。

---

## 变更记录

| 日期 | 位置 | 改了什么 |
|------|------|----------|
| 2026-09-02 | 首次提交 | 推送 GitHub `arraytechcn/baby_school`（commit a8d3c63）：MVP 语音陪伴闭环全部代码 |
| 2026-09-02 | tools/ | **新增语音播报本地服务 `tools/tts_server.py`**（127.0.0.1:8799）：`POST /speak {text,voice?,rate?,pitch?}` 合成+afplay 播放（自动打断上一句）、`POST /stop`、`GET /health`；Key 取环境变量 `DASHSCOPE_API_KEY` 或根目录 `config.local.json`（已 gitignore，**Key 不进仓库**）。配套 `tools/say.sh "文字"` 一行命令包装，供 DeepSeek harness / Claude Code 等外部工具在回答时调用播报。实测：health/speak/stop/打断全通。**接入文档：`docs/tts-api.md`**（用户决定 Kimi Web 接入交给其他人做，本文档即交接物） |

### DeepSeek harness 播报接入方法

```bash
# 1. 启动播报服务（Key 走环境变量）
DASHSCOPE_API_KEY=sk-xxx python3 tools/tts_server.py

# 2. harness 回答完成时调用
bash tools/say.sh "这里是回答内容"
```
| 2026-09-02 | 项目初始化 | 新建项目，绑定远程仓库 `github.com/arraytechcn/baby_school`；从 xiang 项目复制 CLAUDE.md / PROJECT_NOTES.md 模板并清空改写为本项目内容；确立规范：全项目禁 emoji（奖励图标用 SVG/CSS）、调试 Chrome(:9222) 验证、改动后主动汇报 |
| 2026-09-02 | 语音模块（第一步） | 新增 `js/tts.js`（Web Speech API 封装：rate 0.88/pitch 0.9...见文件默认值，中文温柔女声挑选含中文名 婷婷/美嘉；`speak(text, {onStart,onMouth,onEnd,onFallback})` 引擎无关接口）、`js/sfx.js`（Web Audio 合成答对/答错/星星音效，无外部音频文件，默认音量 30%）、`index.html` 语音测试页。注意：demo 页与 tts.js 都必须用 `addEventListener('voiceschanged')`，赋值 onvoiceschanged 会互相覆盖。同日晚些时候已升级为 CosyVoice 双引擎（见下方另一条） |
| 2026-09-02 | 技术选型 | TTS 定为「CosyVoice（百炼，与千问同 DashScope Key）为主，Web Speech API 降级兜底」。**正确接口**：`POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`（model=cosyvoice-v3-flash，text/voice/format/rate/pitch 都在 `input` 里），返回 JSON 的 `output.audio.url`（OSS 链接 24h，默认 http 需换 https），需二次 fetch 下载 mp3。注意：① OpenAI 兼容模式不支持 audio/speech；② 网上流传的 `/services/aigc/text2audio/text-to-audio` 路径是错的（报 url error）；③ **cosyvoice-v2 在当前账号报错 418 不可用**，且 v2/v3 音色不通用，v3 音色带 `_v3` 后缀 |
| 2026-09-02 | 语音模块 | `js/tts.js` 升级双引擎：有 Key 时优先 CosyVoice（龙小淳_v3 温柔知性/龙小夏_v3/龙呼呼_v3 女童声/龙泡泡_v3 故事声，口型 220ms 定时器驱动），失败（超时/断网/Key 无效/欠费）自动静默降级 Web Speech，再不行静默文字；Key 存 localStorage base64 混淆（`xjx_dashscope_key`）。demo 页新增 Key 输入/清除、引擎指示、音色下拉（随引擎切换内容）。踩坑：① Google 音色名 "Google 普通话" 空格是 NBSP(U+00A0)，匹配前需 `\u00a0` 归一化；② **调试 Chrome 渲染进程曾被卡死（/json/list 返回空），用 `curl -X PUT http://localhost:9222/json/new?<url>` 开新页签恢复**。CDP 实测通过（2026-09-02）：浏览器直调公共域名 CORS 放行，engine=cosyvoice 实测合成+播放闭环（start@1342ms，口型随动，end@5451ms）。**坑：① 业务空间专属域名 `*.maas.aliyuncs.com` 不放行 CORS（Failed to fetch），必须用公共域名 `dashscope.aliyuncs.com`；② CosyVoice 失败降级是静默的，会造成“听着还是机器人声”的假象——已加 `onDegrade` 回调让降级可见** |
| 2026-09-02 | 语音模块 | 用户试听 samples/ 10 款样本后选定默认音色 **龙应聆 longyingling_v3（温和共情女）**，写入 `DEFAULT_COSY_VOICE`；samples/ 保留 10 个 mp3 供复听。注：samples/ 是调试用产物，正式版不打包 |
| 2026-09-02 | 配置页 | **index.html 从测试页改造为配置页**：① 全量音色扫描（42 候选实测，cosyvoice-v3-flash 下 **35 个可用**，列表写入 `COSYVOICE_VOICES`，名称/特质均来自官方音色列表）；② 音色卡片网格分三组（温柔女声 18 / 童声 5 / 男声长辈特色 12），点卡片"试听并选中"即保存并播示例句；③ API Key 管理、语速/音量/音效音量、引擎状态、降级日志（onDegrade）。CDP 实测：35 卡片渲染、分组正确、选中态正常。**开发计划已定**（用户确认 MVP 路线）：聊天页 chat.html Siri 式长按说话 → 本地话术引擎 → 记忆系统 → 接千问 → 题库/奖励 → 父母面板。ASR 方案后改为百炼 qwen3-asr-flash（用户要求不走谷歌服务器） |
| 2026-09-02 | 聊天页（MVP 第 2-3 阶段） | 新增 `chat.html` + `js/asr.js` + `js/brain.js` + `js/memory.js`。① asr：MediaRecorder 本地录音 + 百炼 **qwen3-asr-flash**（与 TTS 同 Key 同域名，返回带 emotion/language 标注），8s 超时，最长录音 20s 自动停；② brain：本地话术引擎——敏感词硬拦截（连续 3 次试探转移话题）、记忆提取（"我叫X/我喜欢X/我家有X/好朋友X"）、情绪规则（难过→安抚、开心→共情）、10 条兜底话术池；③ memory：localStorage 实体存储（name/likes/pets/friends）；④ chat.html：SVG 姐姐（长发暖色无首饰，idle 呼吸+随机眨眼/happy 弯月眼/thinking 歪头/encouraging 点头/talking 三帧口型）、Siri 式长按大圆钮说话、打字兜底切换、孩子气泡点击可朗读、开场白按时段+引用记忆。CDP 实测：ASR 浏览器路径识别正确；brain 拦截/记忆/情绪规则全过；iPad 横屏 1024x768 布局正常；重开页面开场白已会叫"朵朵"。**待用户真机验收：麦克风授权、真实儿童语音的识别率** |
| 2026-09-02 | 聊天页改版（用户反馈） | ① **千问对话历史持久化**到 `xjx_history`（此前刷新即丢，导致"没有记忆没有逻辑"的体感；实体记忆本来就在 localStorage）；② chat.html 改**竖版**：姐姐从半屏大 SVG 改为顶部 72px 圆形头像（小宠物式，仍带动嘴/眨眼/开心表情），主区域让给微信式气泡流（左右 mini 头像、新消息弹入动画、可滚动刷走）；③ 按住说话高亮：按钮放大变橙+脉冲光环、对话区和头部压暗、悬浮"正在听你说"横幅；④ **按下麦克风立即 `tts.stop()` 打断姐姐说话**并重置 busy；⑤ 去掉 Aa 切换键，底栏固定"打字框+麦克风"并排。CDP 截图验证：竖版布局、录音高亮态、开场白记忆引用均正常 |
| 2026-09-02 | ASR 架构重做 + 实时气泡（用户反馈识别成乱码、无实时显示） | **根因：分段硬切（每 2.2s 切断句子）导致每段缺上下文，识别成乱码**（"你不要叫我朵朵"→"你不要到。我操操"）。asr.js 重写为「**整段录音 + 前缀识别上屏**」：录音不中断，每 3s 把到目前为止的完整录音识别一次仅用于实时显示（onPartial 每次给全文覆盖），松手后以完整音频的最终识别为准。实时气泡改为**悬浮在麦克风上方**（#live-bubble，蓝色，呼吸动画），录音横幅移到顶部避免遮挡。**安全补丁：识别文本上屏前经 `brain.sanitize()` 打码**（误识别出的脏话如"我操"会被 ** 替换；注意不能单加"操"字，"做操"是正常词）。CDP 截图验证布局 |
| 2026-09-02 | 录音交互修复（用户反馈"录音中误播没听清"） | **根因：麦克风按钮绑了 `pointerleave`，手指轻微滑出按钮边缘就误判为松手 → 录音中断 → 内容太短 → 播"没听清"**。修复：① `setPointerCapture` 锁定手指，滑出边缘也算按着，只有真正抬手（pointerup/pointercancel）才结束，移除 pointerleave 处理器；② 短按 <1.5s 视为误触，只 toast 不播语音；③ 松手等待按待发段数计数（注：当晚 ASR 已整体重写为前缀识别方案，见"ASR 架构重做"行） |
| 2026-09-02 | ASR 专有名词纠偏（用户反馈"朵朵"被听成"宝宝"） | qwen3-asr-flash 支持 `parameters.context` 上下文偏置：`asr.recognize()` 现在自动组装 context（场景说明"小朋友和小星姐姐的对话" + memory 里的孩子名字/喜好/宠物/朋友），每段识别都带上。验证方式：CosyVoice 合成"我叫朵朵，我今年七岁啦"（samples/duoduo.mp3）→ 浏览器带 context 识别 → 正确输出"朵朵"。**待真机验证真实儿童发音下的纠偏效果**；若还不够，下步可加同音词后处理（识别文本里的"宝宝"在 name=朵朵 时替换） |
| 2026-09-02 | ASR 修复（用户反馈识别差） | **根因：浏览器 MediaRecorder 的 webm/opus 直接送 qwen3-asr-flash 识别率极差（空结果/错字），样本 mp3 则准确**。修复：识别前本地转码为 **16kHz 单声道 WAV**（AudioContext.decodeAudioData + OfflineAudioContext 重采样 + 手写 PCM16 WAV 编码，asr.js 末尾 toWav16k），转换失败退回原格式。浏览器实测：mp3→16k WAV→识别，1 秒返回且文字正确。同轮加强录音反馈：整屏暖橙内描边（box-shadow inset）、横幅加录音秒数、识别中气泡呼吸动画。**待用户真机复验识别率** |
| 2026-09-02 | 纯语音化 + 边说边出字（用户反馈） | ① **去掉打字输入框，聊天页纯语音**（小孩不会打字）；② **边说边出字**：按下即出现孩子气泡（呼吸动画"..."占位），识别结果每 ~2.2s 增量上屏。官方流式 ASR 是 WebSocket+Authorization 头，浏览器带不了自定义头（实测 query/subprotocol 鉴权均不通）——改用**分段伪流式**：每 2.2s 停一次 MediaRecorder 生成完整音频送 qwen3-asr-flash、立刻重开下段（asr.startLive/stopLive），切换间隙几十毫秒；③ 太短/没听清时自动撤掉气泡并语音提示 |
| 2026-09-02 | 千问接入（MVP 第 4 阶段） | brain 增加 `replySmart()`：硬拦截 → 记忆提取 → 情绪类固定本地安抚 → 千问 → 本地规则兜底。**坑：千问不能走 OpenAI 兼容模式 `/compatible-mode/`（不放行 CORS），必须用原生接口 `/api/v1/services/aigc/text-generation/generation`（messages 放 input 里、parameters.result_format='message'）**。四层干预落地：System Prompt 注入人设+核心思想+禁止话题；输入硬拦截；**输出二次扫描**（禁词命中整条换兜底，千问说了不算）；只带最近 6 轮+脱敏记忆。回复自动剥 emoji（千问会带 ✨ 等，违反项目规范）。配置页新增核心思想标签多选（诚实/勇敢/友善/分享/不攀比/爱劳动/守时+自定义 20 字）和禁止话题增删，存 `xjx_parent_config`，即时生效。CDP 实测：真实多轮对话（记住朵朵、引用画老虎上下文）、"讲鬼故事"被本地拦截、输出扫描生效 |
| 2026-09-02 | 语音模块 | `js/tts.js` 升级双引擎：有 Key 时优先 CosyVoice（龙小淳等 4 个温柔音色可选，口型用 220ms 定时器驱动），失败（超时/断网/Key 无效/欠费）自动静默降级 Web Speech，再不行静默文字；Key 存 localStorage base64 混淆（`xjx_dashscope_key`）。demo 页新增 Key 输入/清除、引擎指示、音色下拉（随引擎切换内容）。踩坑：Google 音色名 "Google 普通话" 中空格是 NBSP(U+00A0)，匹配前需归一化；源码中正则要写 `\u00a0` 转义，不能直接贴 NBSP 字符。CDP 实测：无 Key 走 webspeech，事件 start→m1→end 正确；**CosyVoice 待用户提供真实 Key 联调（CORS 待验证）** |
| 2026-09-18 | tools/ | **`tools/tts_server.py` 升级：支持长文本 + 进度上报**。`POST /speak` 不再截断 500 字（整段上限改为 4000 字），按句切分（单句 ≤160 字；短句合并、长句按逗号再切、兜底硬切，保证不丢任何非空白字符）后逐句"合成→播放"推进，首句出声更快。新增 `GET /status`（state/index/total/percent/charsDone/chunkElapsed/chunkDuration/hasKey/error；percent 按字数加权并计入当前句内进度，句内时长用 `afinfo` 读）、`POST /config {rate,voice,pitch}`（播放中改，**下一句生效**）、**`OPTIONS` 预检**（此前浏览器从 3080 跨域调 8799 会因缺预检直接失败）。临时 mp3 只保留最近几个。自测（无 Key，用本地生成静音 wav 顶替 CosyVoice 合成）：分句不丢字、进度推进到 100%、中途 stop、rate 钳位 0.5-2.0、预检 204 全通。**文档 `docs/tts-api.md` 已同步** |
| 2026-09-18 | DSH 插件 | **新增 DSH 插件 `dsh-tts-summary`**（装在 `~/.dsh/plugins/dsh-tts-summary`，**不在本仓库**）：每轮对话结束后自动播报本轮总结，输入框下方常驻一条控件（复选框开关 / 进度条 / 语速 0.6-1.6x / 停止 / 历史）。host 半边注册设置命名空间 `dsh-tts-summary` 并监听 `session/event`，取本轮**最后一条带文字的助手回复**（忽略 tool-call / reasoning 块）POST 到 8799；子代理会话不播报。client 半边注册进 `conversation.composer.dock` 插槽，轮询 `/status` 显示进度。**历史对话**：浮层列出本会话每一轮（最新在上），数据是「`turnOutline` 投影（全量轮次，但 prompt/response 截断 50/120 字）∪ `useChat(s=>s.legacy.nodes)`（已加载窗口内的助手全文）」；近期轮标「播放」读全文，窗口外的标「摘要」读投影摘要，手动点播不受开关影响。踩坑：① 第三方插件 host 半边 `import "@deepseek-ai/schemastery"` 是按**插件真实路径**解析的，不会回退到 profile 的 node_modules，**必须在插件目录里自带 `node_modules/@deepseek-ai/schemastery` 链接**（`dsh-auto-mode` 的做法）；② client 半边 `__ModuleLoader__.load` 的 id 必须**等于包名**，`require("react")` 是平台种子模块。**已实测**：用临时实例（3081）+ 调试 Chrome CDP 验证插件被扫进 boot manifest、`dsh-tts-summary/client.js` 200 下发、控件与历史浮层在真实页面渲染且未被 overflow 裁剪。自测：host 侧 8 组用例（多步取末条 / 纯工具调用 / 子代理 / 开关关闭 / 轮次不匹配 / 服务不可达）、client 侧真实 React 渲染 + 状态文字与进度条 + 历史合并/排序/全文优先/摘要标记断言全通过。**待重启 3080 的 DSH Web 后在正式页面验收** |
| 2026-11-20 | 千问接入 | 用户提供百炼 API Key，聊天链路实测接通：Key 写入调试 Chrome（127.0.0.1:8899）的 localStorage `xjx_dashscope_key`（btoa，与配置页同格式，**Key 不进仓库**）；`js/qwen.js` 对话模型由 `qwen-turbo` 改为 **`qwen-flash`**（同一 Key 下 turbo 持续 429 Throttling.RateQuota，flash/plus/max 均 200）。CDP 实测：`replySmart()` source=qwen、985ms 返回、输出扫描与历史持久化正常；CosyVoice 同 Key 合成与播放均 200。注意：首屏开场白无用户手势会被 Chrome 自动播放策略拦下（toast 提示"嗓子有点哑"），点一下页面后播放正常 |
| 2026-11-20 | 父母面板 | **设置从 `index.html` 并入 `chat.html`**：头部右上角新增小齿轮（40px、浅灰、隐蔽入口）-> 点开密码框（`666`，错密码抖动提示"密码不对，再想想"）-> 全屏弹层「父母设置」。搬过来的内容：API Key 保存/清除与引擎状态、语速/音量/音效滑块与语音开关、35 个 CosyVoice 音色卡（试听并选中，三分组）、核心思想标签+自定义、禁止话题增删、日志。**`index.html` 已删除**（全仓库无残留引用）。配套改动：`js/tts.js` 新增 `enabled/rate/volume` getter，`js/sfx.js` 新增 `volume` getter，供面板回显当前值。CDP 实测：错密码拦截、666 进入、35 卡与分组、配置项渲染、768x1024 与 390x844 布局、关闭均正常，无脚本报错。注意：密码明文写在源码里，只能挡住孩子，挡不住会看源码的人 |
| 2026-11-20 | 记忆库 | **新增本机 SQLite 记忆库**：`tools/memory_server.py`（127.0.0.1:8899，同源提供静态页面 + `/api/*`，替代 `python3 -m http.server`），库文件 `data/memory.db`（已 gitignore），`messages` + `facts` 两张表。客户端新增 `js/store.js`：优先走 API，失败退回 localStorage；首次连上自动把浏览器里的旧对话/旧事实迁入。`js/qwen.js` 历史改为异步从库加载、写完库再返回；`js/memory.js` 事实变更同步写库（顺带修了 `{...DEFAULT_FACTS}` 数组共享引用的旧 bug）；`chat.html` 启动连库 -> 灌事实 -> **回显最近 40 条历史气泡**（有历史就不再自动开场白），父母设置新增「记忆库」状态行。实测：旧 localStorage 2 条迁移入库、千问一轮 663ms 入库（messages=4）、事实写入/清空、刷新回显 4 条气泡、服务停掉后 4ms 退回本地缓存、重启服务数据仍在、`/data/memory.db` 404 不可下载 |
| 2026-11-20 | 语音 | ① **录音固定优先内建麦克风**：页面原来只写 `getUserMedia({audio:true})`，Chrome 的采集设备落到了 Continuity 的 iPhone 麦克风（设备列表里的 “xxx”的麦克风）。`js/asr.js` 新增 `pickBuiltinMicId()/openMic()`，按 label 选 MacBook/iPad 内建麦并用 `deviceId:{exact}` 锁定，设备失效自动退回系统默认。实测：默认 getUserMedia 拿到 “zhu”的麦克风，指定后为 MacBook Pro麦克风 (Built-in)。② **TTS 改 SSE 流式**：`js/tts.js` 新增 `speakCosyVoiceStream()`（`X-DashScope-SSE: enable` + `format=pcm` + 24kHz，Web Audio 逐块排期播放），失败再走原非流式接口；`stop()` 会中断流并阻止降级重播，切后台挂起 AudioContext。实测首声 1226ms -> 370-446ms，打断/口型/结束回调正常 |
| 2026-11-20 | 角色纠偏 | 用户反馈"姐姐把孩子叫成小星姐姐"。根因：孩子说"端端正正…""空位你可以坐的"这类扮演语境时，模型把自己代入了妹妹/学生，且历史里有两条角色说反的回复（"谢谢小星姐姐！我坐得像小松树…"），后续轮次会照着学；另外 ASR 把孩子说的"小星姐姐"识别成了"朱星宇"。修复：① `buildSystemPrompt()` 重写【身份】段——孩子叫姐姐"小星姐姐"，姐姐称孩子"你"或名字，禁止叫孩子"小星姐姐/小星星"、禁止用"小星姐姐"自称、禁止扮演孩子/学生/老师；② `qwen.js` 加 `hasRoleDrift()` 输出检查，命中带纠正提示重试一次，仍错返回 null 走本地兜底；③ 喂回模型的历史过滤掉角色说反的旧回复，避免示范污染；④ ASR context 增加"孩子叫姐姐'小星姐姐'"热词；⑤ 修复数据库 4 条旧回复（去"小星星，"称呼、"小星姐姐记得…"改"我记得…"、"谢谢小星姐姐！我坐得…"改为姐姐坐旁边），孩子的话原样保留，改前备份 `data/memory.db.bak`。实测同一句"你可以坐的"现在回"谢谢！姐姐坐你旁边…"，不再叫错 |

---

## 一、项目结构与进度

（待开发，随进度增补）

## 二、题库设计

（二年级语数英本地题库结构、出题策略、奖励机制——待补充）

## 三、安全过滤设计

（前端敏感词表、API 红线、连续试探转移话术——待补充）

## 四、父母控制面板

（隐蔽入口方式、可配置项、脱敏摘要格式——待补充）

## 五、踩坑记录

（随开发增补）

## 六、记忆库（SQLite，2026-11-20）

- **启动**：`python3 tools/memory_server.py --port 8899`
  同时提供静态页面（`/` -> `chat.html`）与记忆 API，替代原来的 `python3 -m http.server 8899`。
- **数据库**：`data/memory.db`（SQLite，已 gitignore）。只监听 127.0.0.1；
  `data/`、`tools/`、`.git/`、`config.local.json` 一律不通过 HTTP 暴露（实测 `/data/memory.db` 返回 404）。
- **表结构**：
  - `messages(id, role, content, created_at)`：对话全文，`role` 仅 `user`/`assistant`
  - `facts(kind, value, updated_at)`：`kind` 取 `name`/`likes`/`pets`/`friends`/`misc`
- **接口**：
  - `GET /api/health` -> `{ok, db, messages, facts}`
  - `GET /api/history?limit=N` -> 最近 N 条（升序）
  - `POST /api/history`、`POST /api/history/bulk`、`DELETE /api/history`
  - `GET /api/facts`、`PUT /api/facts`
- **客户端**：`js/store.js` 优先 SQLite；服务不可用自动退回 localStorage（实测 4ms 切换，历史照常返回）。
  页面启动时若库为空，会把旧的 `xjx_history` / `xjx_memory` 自动迁入。
- **上下文策略**：数据库保留全量，给千问的仍只有最近 6 轮（`MAX_HISTORY`），页面回显最近 40 条。
- **尚未做**：自动摘要、事件时间线、父母查看/清空记忆的界面。
