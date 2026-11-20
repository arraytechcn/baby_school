/**
 * tts.js — 小星姐姐语音合成模块
 *
 * 引擎三级降级：CosyVoice（百炼神经合成，有 Key 时优先）-> Web Speech API -> 静默文字
 * 对外统一接口 speak(text, handlers)，handlers 与引擎无关：
 *   onStart()      语音开始播放（上层切入 talking 动画）
 *   onMouth(frame) 口型帧 0/1/2（Web Speech 按词边界驱动，CosyVoice 用定时器驱动）
 *   onEnd()        语音结束（上层 0.2s 后回 idle，由上层控制延时）
 *   onFallback()   所有引擎不可用，仅显示文字
 *
 * CosyVoice 说明：走 DashScope 同步 HTTP 接口
 *   POST {DASHSCOPE_BASE}/services/audio/tts/SpeechSynthesizer
 *   返回 JSON，音频在 output.audio.url（OSS 链接，24h 有效），需二次 fetch 下载。
 *   模型用 cosyvoice-v3-flash（便宜），音色必须带 _v3 后缀，与 v2 音色不通用。
 * Key 存 localStorage（base64 混淆，防窥不防攻；本地面向家庭设备足够）。
 */
const DEFAULTS = {
  rate: 0.88,
  pitch: 1.05,
  volume: 0.9,
};

// 用公共域名：业务空间专属域名（*.maas.aliyuncs.com）未放开 CORS，浏览器直调会被拦
const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/api/v1';
const COSYVOICE_URL = DASHSCOPE_BASE + '/services/audio/tts/SpeechSynthesizer';
const COSYVOICE_MODEL = 'cosyvoice-v3-flash';
const COSYVOICE_TIMEOUT = 8000; // 与千问一致的 8 秒超时
const KEY_STORAGE = 'xjx_dashscope_key';

// cosyvoice-v3-flash 实测可用音色（2026-09-02 全量扫描 42 个候选，35 个可用）
// 名称/特质来自官方音色列表 https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list
export const COSYVOICE_VOICES = [
  // 温柔向女声（姐姐人设推荐）
  { id: 'longyingling_v3', name: '龙应聆', trait: '温和共情女' },
  { id: 'longanrou_v3', name: '龙安柔', trait: '温柔闺蜜女' },
  { id: 'longwanjun_v3', name: '龙婉君', trait: '细腻柔声女' },
  { id: 'longyingtao_v3', name: '龙应桃', trait: '温柔淡定女' },
  { id: 'longanwen_v3', name: '龙安温', trait: '优雅知性女' },
  { id: 'longxiaochun_v3', name: '龙小淳', trait: '知性积极女' },
  { id: 'longanqin_v3', name: '龙安亲', trait: '亲和活泼女' },
  { id: 'longanling_v3', name: '龙安灵', trait: '思维灵动女' },
  { id: 'longanya_v3', name: '龙安雅', trait: '高雅气质女' },
  { id: 'longanli_v3', name: '龙安莉', trait: '利落从容女' },
  { id: 'longyingmu_v3', name: '龙应沐', trait: '优雅知性女' },
  { id: 'longyingjing_v3', name: '龙应静', trait: '低调冷静女' },
  { id: 'longxiaoxia_v3', name: '龙小夏', trait: '沉稳权威女' },
  { id: 'longdaiyu_v3', name: '龙黛玉', trait: '娇率才女音' },
  { id: 'longanhuan', name: '龙安欢', trait: '欢脱元气女' },
  { id: 'longanran_v3', name: '龙安燃', trait: '活泼质感女' },
  { id: 'longanxuan_v3', name: '龙安宣', trait: '经典直播女' },
  { id: 'longyingxiao_v3', name: '龙应笑', trait: '清甜推销女' },
  // 童声（儿童陪伴场景）
  { id: 'longhuhu_v3', name: '龙呼呼', trait: '天真女童声' },
  { id: 'longpaopao_v3', name: '龙泡泡', trait: '飞天泡泡音' },
  { id: 'longshanshan_v3', name: '龙闪闪', trait: '戏剧化童声' },
  { id: 'longniuniu_v3', name: '龙牛牛', trait: '阳光男童声' },
  { id: 'longwangwang_v3', name: '龙汪汪', trait: '台湾少年音' },
  // 男声/长辈/特色（备选用）
  { id: 'longanyang', name: '龙安洋', trait: '阳光大男孩' },
  { id: 'longanshuo_v3', name: '龙安朔', trait: '干净清爽男' },
  { id: 'longanlang_v3', name: '龙安朗', trait: '清爽利落男' },
  { id: 'longanyun_v3', name: '龙安昀', trait: '居家暖男' },
  { id: 'longanzhi_v3', name: '龙安智', trait: '睿智轻熟男' },
  { id: 'longyichen_v3', name: '龙逸尘', trait: '洒脱活力男' },
  { id: 'longsanshu_v3', name: '龙三叔', trait: '沉稳质感男' },
  { id: 'longlaobo_v3', name: '龙老伯', trait: '沧桑岁月爷' },
  { id: 'longlaoyi_v3', name: '龙老姨', trait: '烟火从容阿姨' },
  { id: 'longyingxun_v3', name: '龙应询', trait: '年轻青涩男' },
  { id: 'longhouge_v3', name: '龙猴哥', trait: '经典猴哥' },
  { id: 'longjiqi_v3', name: '龙机器', trait: '呆萌机器人' },
];

// 旧版 localStorage 里可能存着 v2 音色 id，校验后兜底
// 默认音色：龙应聆（温和共情女），用户 2026-09-02 试听 10 款后选定
const DEFAULT_COSY_VOICE = 'longyingling_v3';
function validCosyVoice(id) {
  return COSYVOICE_VOICES.some(v => v.id === id) ? id : DEFAULT_COSY_VOICE;
}

const state = {
  enabled: true,
  rate: DEFAULTS.rate,
  pitch: DEFAULTS.pitch,
  volume: DEFAULTS.volume,
  speaking: false,
  voice: null,            // Web Speech 音色对象
  cosyVoiceId: validCosyVoice(localStorage.getItem('xjx_cosy_voice')),
  supported: 'speechSynthesis' in window,
};

/* ---------- API Key（base64 混淆存储） ---------- */
function getKey() {
  const s = localStorage.getItem(KEY_STORAGE);
  if (!s) return null;
  try { return atob(s); } catch { return null; }
}
function setKey(k) {
  if (k) localStorage.setItem(KEY_STORAGE, btoa(k));
  else localStorage.removeItem(KEY_STORAGE);
}

/* ---------- Web Speech 音色挑选 ---------- */
/** 优先：Edge/微软 Xiaoxiao > Google 普通话 > 其他 zh-CN 女声 > 任意 zh-CN */
function pickVoice() {
  if (!state.supported) return null;
  const voices = speechSynthesis.getVoices();
  const norm = s => s.toLowerCase().replace(/\u00a0/g, ' '); // 音色名含 NBSP
  const zh = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('zh'));
  const prefer = [
    'xiaoxiao', 'xiaoyi', 'yunxia',   // 微软神经语音（Edge 最自然）
    'google 普通话',                   // Chrome 谷歌女声，比系统合成柔
    'meijia', '美嘉', 'tingting', '婷婷',
    'female',
  ];
  for (const key of prefer) {
    const hit = zh.find(v => norm(v.name).includes(key));
    if (hit) return hit;
  }
  return zh[0] || null;
}

function refreshVoice() {
  state.voice = pickVoice();
  return state.voice;
}

if (state.supported) {
  refreshVoice();
  speechSynthesis.addEventListener('voiceschanged', refreshVoice);
}

/* ---------- 口型定时驱动 ---------- */
let mouthTimer = null;

function startMouthFallback(onMouth) {
  // 部分浏览器不触发 onboundary，用定时器兜底驱动口型，
  // 保证“语音在播嘴巴就动”。
  let frame = 0;
  stopMouthFallback();
  mouthTimer = setInterval(() => {
    frame = (frame + 1) % 3;
    onMouth(frame);
  }, 220);
}

function stopMouthFallback() {
  if (mouthTimer) {
    clearInterval(mouthTimer);
    mouthTimer = null;
  }
}

/* ---------- CosyVoice 引擎 ---------- */
let cosyAudio = null;

function stopCosyAudio() {
  if (cosyAudio) {
    cosyAudio.pause();
    if (cosyAudio.src) URL.revokeObjectURL(cosyAudio.src);
    cosyAudio = null;
  }
}

/**
 * @returns {Promise<boolean>} true=成功播放完成，false=失败需降级
 */
async function speakCosyVoice(text, handlers) {
  const { onStart, onMouth, onEnd } = handlers;
  const key = getKey();
  if (!key) return false;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), COSYVOICE_TIMEOUT);
  let blob;
  try {
    const resp = await fetch(COSYVOICE_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: COSYVOICE_MODEL,
        input: {
          text,
          voice: state.cosyVoiceId,
          format: 'mp3',
          rate: state.rate,
          pitch: state.pitch,
        },
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return false; // Key 无效/欠费等 -> 降级
    const data = await resp.json();
    const url = data.output && data.output.audio && data.output.audio.url;
    if (!url) return false;     // 合成失败 -> 降级
    // OSS 链接默认 http，换成 https 避免 https 部署时混合内容拦截
    const audioResp = await fetch(url.replace(/^http:\/\//, 'https://'), { signal: ctrl.signal });
    if (!audioResp.ok) return false;
    blob = await audioResp.blob();
  } catch {
    clearTimeout(timer);
    return false; // 超时/断网 -> 降级
  }
  clearTimeout(timer);
  if (!blob.size) return false;

  return new Promise(resolve => {
    stopCosyAudio();
    cosyAudio = new Audio(URL.createObjectURL(blob));
    cosyAudio.volume = state.volume;

    cosyAudio.onplay = () => {
      state.speaking = true;
      onStart && onStart();
      if (onMouth) startMouthFallback(onMouth); // 同步接口无词时间戳，定时驱动口型
    };
    const finish = () => {
      state.speaking = false;
      stopMouthFallback();
      stopCosyAudio();
      onEnd && onEnd();
      resolve(true);
    };
    cosyAudio.onended = finish;
    cosyAudio.onerror = () => { resolve(false); }; // 播放失败 -> 降级
    cosyAudio.play().catch(() => resolve(false));
  });
}

/* ---------- CosyVoice 流式引擎（SSE + PCM，降低首声延迟） ----------
   非流式接口要等整段合成完（实测约 1.2s）才返回音频 url；
   加 X-DashScope-SSE 后首个音频块约 0.5s 到达，边下边播。
   用 Web Audio 按 24kHz PCM16 直接排期，不依赖 MediaSource（iPad 兼容）。 */
const STREAM_RATE = 24000;
let streamCtx = null;
let streamGain = null;
let streamAbort = null;
let streamSources = [];
let speakSeq = 0;

function stopStream() {
  if (streamAbort) {
    try { streamAbort.abort(); } catch {}
    streamAbort = null;
  }
  for (const src of streamSources) {
    try { src.stop(); } catch {}
  }
  streamSources = [];
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pcm16ToFloat32(bytes) {
  const n = bytes.byteLength >> 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function ensureAudio() {
  if (!streamCtx) {
    streamCtx = new (window.AudioContext || window.webkitAudioContext)();
    streamGain = streamCtx.createGain();
    streamGain.connect(streamCtx.destination);
  }
  return streamCtx;
}

function speakCosyVoiceStream(text, handlers) {
  return new Promise(async resolve => {
    const key = getKey();
    if (!key) return resolve(false);
    const { onStart, onMouth, onEnd } = handlers;

    const ctx = ensureAudio();
    try { await ctx.resume(); } catch {}
    // 自动播放策略拦住 Web Audio 时，交给 <audio> 兜底再试
    if (ctx.state !== 'running') return resolve(false);
    streamGain.gain.value = state.volume;

    const ctrl = new AbortController();
    streamAbort = ctrl;
    let nextAt = 0;
    let firstAudio = false;
    let ended = false;
    let settled = false;
    let timer = setTimeout(() => ctrl.abort(), COSYVOICE_TIMEOUT);

    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopMouthFallback();
      state.speaking = false;
      if (streamAbort === ctrl) streamAbort = null;
      if (firstAudio) onEnd && onEnd();
      resolve(ok);
    };

    const schedule = b64 => {
      const bytes = base64ToBytes(b64);
      if (bytes.byteLength < 2) return;
      const samples = pcm16ToFloat32(bytes);
      const buffer = ctx.createBuffer(1, samples.length, STREAM_RATE);
      buffer.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(streamGain);
      const at = Math.max(ctx.currentTime + 0.08, nextAt);
      src.start(at);
      nextAt = at + buffer.duration;
      streamSources.push(src);
      src.onended = () => {
        streamSources = streamSources.filter(s => s !== src);
        if (ended && streamSources.length === 0) finish(firstAudio);
      };
      if (!firstAudio) {
        firstAudio = true;
        clearTimeout(timer);
        timer = setTimeout(() => ctrl.abort(), 20000); // 长文本兜底
        state.speaking = true;
        onStart && onStart();
        if (onMouth) startMouthFallback(onMouth);
      }
    };

    try {
      const resp = await fetch(COSYVOICE_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'enable',
        },
        body: JSON.stringify({
          model: COSYVOICE_MODEL,
          input: {
            text,
            voice: state.cosyVoiceId,
            format: 'pcm',
            sample_rate: STREAM_RATE,
            rate: state.rate,
            pitch: state.pitch,
          },
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) return finish(false);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            let evt;
            try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (evt.code || evt.message) return finish(firstAudio);
            const audio = evt.output && evt.output.audio && evt.output.audio.data;
            if (audio) schedule(audio);
          }
        }
      }
      ended = true;
      if (streamSources.length === 0) finish(firstAudio);
    } catch {
      ended = true;
      if (streamSources.length === 0) finish(firstAudio);
    }
  });
}

/* ---------- Web Speech 引擎 ---------- */
function speakWebSpeech(text, handlers) {
  const { onStart, onMouth, onEnd, onFallback } = handlers;
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    if (state.voice) u.voice = state.voice;
    u.lang = 'zh-CN';
    u.rate = state.rate;
    u.pitch = state.pitch;
    u.volume = state.volume;

    let started = false;
    let boundarySeen = false;

    u.onstart = () => {
      started = true;
      state.speaking = true;
      onStart && onStart();
      onMouth && onMouth(1);
      // 2 秒内没有 boundary 事件就启用定时兜底口型
      setTimeout(() => {
        if (state.speaking && !boundarySeen && onMouth) startMouthFallback(onMouth);
      }, 2000);
    };

    u.onboundary = () => {
      boundarySeen = true;
      if (onMouth) {
        stopMouthFallback();
        onMouth(1 + Math.floor(Math.random() * 2)); // 1/2 两帧交替
      }
    };

    const finish = () => {
      state.speaking = false;
      stopMouthFallback();
      onEnd && onEnd();
      resolve();
    };

    u.onend = finish;
    u.onerror = () => {
      if (started) { finish(); return; }
      // 引擎级失败：静默降级为文字
      state.speaking = false;
      stopMouthFallback();
      onFallback && onFallback();
      onEnd && onEnd();
      resolve();
    };

    speechSynthesis.speak(u);
  });
}

/* ---------- 对外接口 ---------- */
export const tts = {
  get supported() { return state.supported || !!getKey(); },
  get speaking() { return state.speaking; },
  get enabled() { return state.enabled; },
  get rate() { return state.rate; },
  get volume() { return state.volume; },
  get engine() { return getKey() ? 'cosyvoice' : (state.supported ? 'webspeech' : 'none'); },
  get voiceName() {
    if (getKey()) {
      const v = COSYVOICE_VOICES.find(v => v.id === state.cosyVoiceId);
      return 'CosyVoice ' + (v ? v.name : state.cosyVoiceId);
    }
    return state.voice ? state.voice.name : '(未找到中文语音)';
  },

  setEnabled(v) {
    state.enabled = v;
    if (!v) this.stop();
  },
  setRate(v) { state.rate = Math.min(1.2, Math.max(0.7, v)); },
  setVolume(v) { state.volume = Math.min(1, Math.max(0, v)); },

  /** 百炼 API Key（同时用于千问聊天与 CosyVoice 语音） */
  setApiKey(k) { setKey(k); },
  hasApiKey() { return !!getKey(); },
  /** CosyVoice 音色切换（webspeech 引擎下无效） */
  setCosyVoice(id) {
    state.cosyVoiceId = id;
    localStorage.setItem('xjx_cosy_voice', id);
  },
  get cosyVoiceId() { return state.cosyVoiceId; },

  /** 列出 Web Speech 可用中文音色（供父母面板/demo 选择） */
  listVoices() {
    if (!state.supported) return [];
    return speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.toLowerCase().startsWith('zh'));
  },
  /** 手动指定 Web Speech 音色（按 name 精确匹配），传 null 恢复自动挑选 */
  setVoice(name) {
    if (!state.supported) return;
    if (name == null) { refreshVoice(); return; }
    const v = speechSynthesis.getVoices().find(v => v.name === name);
    if (v) state.voice = v;
  },

  /** 在用户手势里调用一次，解锁 iOS 的 Web Audio */
  warmup() {
    try {
      const ctx = ensureAudio();
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(streamGain);
      src.start(0);
    } catch {}
  },

  /**
   * 朗读一段文案。有 Key 优先 CosyVoice，失败自动降级 Web Speech，再不行静默文字。
   * handlers.onDegrade(engine) 可选：发生降级时回调（'webspeech'），便于上层/调试用。
   * @returns {Promise<void>} 朗读完成或降级后 resolve
   */
  async speak(text, handlers = {}) {
    const { onFallback, onDegrade } = handlers;
    this.stop();
    const seq = speakSeq;

    if (!state.enabled) {
      onFallback && onFallback();
      handlers.onEnd && handlers.onEnd();
      return;
    }

    if (getKey()) {
      // 先走流式（首声约 0.5s）；失败再走非流式，最后 Web Speech
      const streamed = await speakCosyVoiceStream(text, handlers);
      if (streamed) return;
      if (seq !== speakSeq) return; // 中途被 stop，不重播
      const ok = await speakCosyVoice(text, handlers);
      if (ok) return;
      if (seq !== speakSeq) return;
      // CosyVoice 失败，静默降级 Web Speech（不打扰孩子）
      onDegrade && onDegrade('webspeech');
    }

    if (state.supported) {
      await speakWebSpeech(text, handlers);
      return;
    }

    onFallback && onFallback();
    handlers.onEnd && handlers.onEnd();
  },

  stop() {
    speakSeq++;
    if (state.supported) speechSynthesis.cancel();
    stopCosyAudio();
    stopStream();
    state.speaking = false;
    stopMouthFallback();
  },
};

// 页面切后台时暂停语音与口型，回来继续
document.addEventListener('visibilitychange', () => {
  if (state.supported) {
    if (document.hidden) speechSynthesis.pause();
    else speechSynthesis.resume();
  }
  if (cosyAudio) {
    if (document.hidden) cosyAudio.pause();
    else cosyAudio.play().catch(() => {});
  }
  if (streamCtx) {
    if (document.hidden) streamCtx.suspend().catch(() => {});
    else streamCtx.resume().catch(() => {});
  }
});
