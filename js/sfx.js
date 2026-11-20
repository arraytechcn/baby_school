/**
 * sfx.js — 音效模块（Web Audio 合成，无外部音频文件，离线可用）
 * correct()  答对：清脆"叮"
 * wrong()    答错：柔和下行音，不刺耳
 * star()     获得星星：轻快魔法音
 */
let ctx = null;
let volume = 0.3; // 默认 30%，父母可调

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freqStart, freqEnd, dur, type = 'sine', delay = 0) {
  const c = ac();
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  get volume() { return volume; },
  setVolume(v) { volume = Math.min(1, Math.max(0, v)); },
  correct() { tone(880, 1320, 0.35, 'sine'); },                          // 叮，<0.5s
  wrong()   { tone(320, 220, 0.45, 'triangle'); },                        // 柔和"唔"
  star()    { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 'sine', i * 0.09)); }, // 魔法上行
};
