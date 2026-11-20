/**
 * asr.js — 语音识别模块（按住说话，松开发送）
 *
 * 录音：MediaRecorder 本地采集，音频不出设备。
 * 识别：百炼 qwen3-asr-flash（与千问/CosyVoice 同 Key 同域名），
 *   返回 { text, emotion, language }；emotion 可直接给情绪识别用。
 * 断网/无 Key/识别失败返回 null，调用方自行兜底。
 *
 * 识别策略（2026-09-02 定稿）：
 *   - 整段录音一次识别出最终稿——分段硬切会把句子从中间切断，
 *     单段缺上下文识别成乱码（实测"你不要叫我朵朵"->"你不要到。我操操"）。
 *   - 边说边出字用"前缀识别"：录音不中断，每 3 秒把【到目前为止的完整录音】
 *     识别一次仅用于气泡上屏；松手后以完整音频的最终识别为准覆盖。
 *   - 上传前统一本地转 16kHz 单声道 WAV（webm/opus 直接送识别率极差）。
 *   - 官方流式 ASR 是 WebSocket + Authorization 头，浏览器带不了自定义头
 *     （实测 query/subprotocol 鉴权均不通），故不用。
 */
import { memory } from './memory.js';

const ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const ASR_TIMEOUT = 8000;
const KEY_STORAGE = 'xjx_dashscope_key';
const MAX_RECORD_MS = 20000; // 最长录音 20 秒，防孩子按住不放
const FIRST_INTERIM_MS = 900; // 第一次实时上屏：尽早出字
const INTERIM_MS = 1400;      // 之后的前缀识别间隔
const VAD_TICK_MS = 100;      // 音量采样间隔
const VAD_CALIBRATION_MS = 400; // 开头静音校准
const VAD_SILENCE_MS = 1200;  // 说完后静音多久算一轮结束

function getKey() {
  const s = localStorage.getItem(KEY_STORAGE);
  if (!s) return null;
  try { return atob(s); } catch { return null; }
}

/**
 * 上下文偏置：把孩子名字等专有名词喂给 ASR，纠正同音误识别
 * （真实麦克风下 "朵朵" 会被听成 "宝宝"，2026-09-02 用户实测）。
 */
function buildContext() {
  const parts = ['这是小朋友和AI姐姐（小星姐姐）的语音对话，语气童真', '孩子叫姐姐"小星姐姐"'];
  const f = memory.facts;
  if (f.name) parts.push(`孩子的名字叫${f.name}`);
  if (f.likes.length) parts.push(`孩子喜欢：${f.likes.join('、')}`);
  if (f.pets.length) parts.push(`孩子家有：${f.pets.join('、')}`);
  if (f.friends.length) parts.push(`孩子的好朋友：${f.friends.join('、')}`);
  return parts.join('。');
}

let maxTimer = null;
let liveStream = null;
let liveRecorder = null;
let liveChunks = [];
let liveActive = false;
let liveOnPartial = null;
let interimTimer = null;
let interimBusy = false;

function pickMime() {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

/* ---------- 麦克风选择：优先内建，避免被 Continuity 的 iPhone 麦克风抢走 ---------- */
async function pickBuiltinMicId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter(d =>
      d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'
    );
    // macOS 内建叫 “MacBook Pro麦克风”，iPad 叫 “iPad 麦克风”；
    // iPhone 连续性麦克风是 “某某”的麦克风，不匹配这里。
    const builtin = inputs.find(d =>
      /MacBook|Built-?in|内建|iPad/i.test(d.label) && !/iPhone/i.test(d.label)
    );
    return builtin ? builtin.deviceId : null;
  } catch {
    return null;
  }
}

async function openMic() {
  const id = await pickBuiltinMicId();
  if (id) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id } } });
    } catch {
      // 设备被拔掉 / deviceId 失效：退回系统默认
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

/* ---------- 静音检测（免提连续通话用） ---------- */
let vadCtx = null;
let vadTimer = null;
let vadAnalyser = null;
let vadSpeech = false;
let vadSilenceAt = 0;
let vadNoise = 0.008;
let vadOnSilence = null;

function stopVad() {
  if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
  if (vadCtx) {
    try { vadCtx.close(); } catch {}
    vadCtx = null;
  }
  vadAnalyser = null;
  vadOnSilence = null;
  vadSpeech = false;
  vadSilenceAt = 0;
}

function startVad(stream, onSilence) {
  stopVad();
  vadOnSilence = onSilence || null;
  if (!vadOnSilence) return;
  try {
    vadCtx = new (window.AudioContext || window.webkitAudioContext)();
    vadCtx.resume().catch(() => {});
    const source = vadCtx.createMediaStreamSource(stream);
    vadAnalyser = vadCtx.createAnalyser();
    vadAnalyser.fftSize = 512;
    source.connect(vadAnalyser);
  } catch {
    vadOnSilence = null;
    return;
  }
  const data = new Uint8Array(vadAnalyser.fftSize);
  const startedAt = performance.now();
  const noiseSamples = [];
  vadSpeech = false;
  vadSilenceAt = 0;

  vadTimer = setInterval(() => {
    if (!vadAnalyser || !vadOnSilence) return;
    vadAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    if (performance.now() - startedAt < VAD_CALIBRATION_MS) {
      noiseSamples.push(rms);
      vadNoise = Math.min(0.012, Math.max(0.004, noiseSamples.reduce((a, b) => a + b, 0) / noiseSamples.length));
      return;
    }
    const speechLevel = Math.max(0.020, vadNoise * 3);
    const silenceLevel = Math.max(0.012, vadNoise * 1.8);
    if (rms > speechLevel) {
      vadSpeech = true;
      vadSilenceAt = 0;
    } else if (vadSpeech && rms < silenceLevel) {
      if (!vadSilenceAt) vadSilenceAt = performance.now();
      else if (performance.now() - vadSilenceAt > VAD_SILENCE_MS) {
        vadSpeech = false;
        vadSilenceAt = 0;
        const cb = vadOnSilence;
        vadOnSilence = null;
        cb && cb();
      }
    } else if (rms >= silenceLevel) {
      vadSilenceAt = 0;
    }
  }, VAD_TICK_MS);
}

export const asr = {
  get supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  },
  get hasKey() { return !!getKey(); },
  get recording() { return liveActive; },

  /**
   * 开始录音（边说边出字）。
   * @param {function(string)} onPartial 前缀识别结果回调（每次是到目前全文，覆盖显示）
   * @param {function} onAutoStop 超最长时长自动停
   * @returns {Promise<boolean>} 麦克风授权失败返回 false
   */
  async startLive(onPartial, onAutoStop, onSilence) {
    if (liveActive) return true;
    try {
      liveStream = await openMic();
    } catch {
      return false;
    }
    liveActive = true;
    startVad(liveStream, onSilence);
    liveChunks = [];
    liveOnPartial = onPartial;
    interimBusy = false;

    const mime = pickMime();
    liveRecorder = new MediaRecorder(liveStream, mime ? { mimeType: mime } : undefined);
    liveRecorder.ondataavailable = e => { if (e.data.size) liveChunks.push(e.data); };
    liveRecorder.start();

    // 前缀识别上屏：第一次 0.9s 就出字，之后每 1.4s 更新一次（仅显示用）
    const scheduleInterim = delay => {
      interimTimer = setTimeout(async () => {
        if (!liveActive || !liveRecorder) return;
        if (interimBusy) {
          scheduleInterim(INTERIM_MS);
          return;
        }
        // 免提模式下没检测到人声就不传音频，省调用；按住说话模式没有 VAD，照常识别
        if (vadTimer && !vadSpeech) {
          scheduleInterim(INTERIM_MS);
          return;
        }
        interimBusy = true;
        const rec = liveRecorder;
        try {
          // 必须先 requestData，否则 chunks 里只有松手时那一段，永远出不了实时字
          const before = liveChunks.length;
          try { rec.requestData(); } catch { return; }
          await new Promise(r => setTimeout(r, 150));
          if (!liveActive || !rec || liveChunks.length === before) return;
          const blob = new Blob(liveChunks, { type: rec.mimeType || 'audio/webm' });
          if (blob.size < 1200) return;
          const r = await this.recognize(blob);
          if (r && r.text && liveActive) liveOnPartial && liveOnPartial(r.text);
        } finally {
          interimBusy = false;
          if (liveActive) scheduleInterim(INTERIM_MS);
        }
      }, delay);
    };
    scheduleInterim(FIRST_INTERIM_MS);

    maxTimer = setTimeout(() => {
      if (liveActive) {
        this.stopLive();
        onAutoStop && onAutoStop();
      }
    }, MAX_RECORD_MS);
    return true;
  },

  /**
   * 结束录音，用完整音频做最终识别并返回全文。
   * @returns {Promise<string>} 失败或空返回 ''
   */
  /** ASR 一旦出字，就告诉 VAD 已经检测到人声（防止开头太轻没触发） */
  noteSpeech() {
    if (liveActive) {
      vadSpeech = true;
      vadSilenceAt = 0;
    }
  },

  abortLive() {
    clearTimeout(maxTimer);
    clearTimeout(interimTimer);
    const rec = liveRecorder;
    liveRecorder = null;
    if (rec && rec.state !== 'inactive') {
      rec.ondataavailable = null;
      try { rec.stop(); } catch {}
    }
    liveChunks = [];
    liveActive = false;
    cleanupStream();
  },

  stopLive() {
    clearTimeout(maxTimer);
    clearInterval(interimTimer);
    return new Promise(resolve => {
      const rec = liveRecorder;
      liveRecorder = null;
      if (!rec || rec.state !== 'recording') {
        cleanupStream();
        resolve('');
        return;
      }
      rec.addEventListener('stop', async () => {
        cleanupStream();
        const blob = new Blob(liveChunks, { type: rec.mimeType || 'audio/webm' });
        liveChunks = [];
        if (blob.size < 2000) { resolve(''); return; }
        const r = await this.recognize(blob);
        resolve(r && r.text ? r.text : '');
      }, { once: true });
      rec.stop();
    });
  },

  /**
   * 识别录音为文字。先本地转成 16kHz 单声道 WAV 再上传
   * （webm/opus 直送识别率极差，2026-09-02 实测）。
   * @param {Blob} blob
   * @returns {Promise<{text:string, emotion:string|null}|null>} 失败返回 null
   */
  async recognize(blob) {
    const key = getKey();
    if (!key || !blob) return null;

    let payload = blob;
    try {
      payload = await toWav16k(blob);
    } catch { /* 转换失败用原始格式兜底 */ }

    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(payload);
    });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ASR_TIMEOUT);
    try {
      const resp = await fetch(ASR_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3-asr-flash',
          input: {
            messages: [{
              role: 'user',
              content: [{ audio: `data:${payload.type};base64,${base64}` }],
            }],
          },
          // 上下文偏置：专有名词（孩子名字等）+ 语种，纠正同音误识别
          parameters: { language_hints: ['zh'], context: buildContext() },
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const choice = data.output && data.output.choices && data.output.choices[0];
      if (!choice) return null;
      const content = choice.message && choice.message.content;
      const text = Array.isArray(content)
        ? content.map(c => c.text || '').join('').trim()
        : String(content || '').trim();
      const anno = choice.message && choice.message.annotations;
      const emotion = Array.isArray(anno) && anno[0] ? anno[0].emotion : null;
      return { text, emotion };
    } catch {
      return null; // 超时/断网
    } finally {
      clearTimeout(timer);
    }
  },
};

function cleanupStream() {
  liveActive = false;
  stopVad();
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
}

/* ---------- 音频格式转换：webm/opus -> 16kHz 单声道 WAV ---------- */
let audioCtx = null;

async function toWav16k(blob) {
  const buf = await blob.arrayBuffer();
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const audio = await audioCtx.decodeAudioData(buf);
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const pcm = rendered.getChannelData(0);

  // 编码 16-bit PCM WAV
  const bufLen = 44 + pcm.length * 2;
  const ab = new ArrayBuffer(bufLen);
  const dv = new DataView(ab);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  dv.setUint32(4, bufLen - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);          // PCM
  dv.setUint16(22, 1, true);          // 单声道
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    dv.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}
