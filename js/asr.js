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
const INTERIM_MS = 3000;     // 实时上屏的前缀识别间隔

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
  const parts = ['这是小朋友和AI姐姐（小星姐姐）的语音对话，语气童真'];
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
  async startLive(onPartial, onAutoStop) {
    if (liveActive) return true;
    try {
      liveStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return false;
    }
    liveActive = true;
    liveChunks = [];
    liveOnPartial = onPartial;
    interimBusy = false;

    const mime = pickMime();
    liveRecorder = new MediaRecorder(liveStream, mime ? { mimeType: mime } : undefined);
    liveRecorder.ondataavailable = e => { if (e.data.size) liveChunks.push(e.data); };
    liveRecorder.start();

    // 前缀识别上屏：每 INTERIM_MS 把完整前缀识别一次（仅显示用）
    interimTimer = setInterval(() => {
      if (!liveActive || interimBusy || !liveChunks.length) return;
      interimBusy = true;
      liveRecorder.requestData(); // 让已录内容立刻落进 chunks
      setTimeout(async () => {
        try {
          const blob = new Blob(liveChunks, { type: liveRecorder.mimeType || 'audio/webm' });
          const r = await this.recognize(blob);
          if (r && r.text && liveActive) liveOnPartial && liveOnPartial(r.text);
        } finally {
          interimBusy = false;
        }
      }, 60);
    }, INTERIM_MS);

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
