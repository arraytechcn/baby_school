/**
 * qwen.js — 千问对话模块（DashScope 原生 HTTP 接口）
 *
 * 注意：OpenAI 兼容模式（/compatible-mode/）不放行浏览器 CORS，
 * 必须用原生路径 /api/v1/services/aigc/text-generation/generation（已实测放行）。
 *
 * 四层干预：
 *   1. System Prompt：人设 + 父母核心思想 + 禁止话题（buildSystemPrompt）
 *   2. 输入拦截：调用方（brain.js）先过硬拦截，命中不进入本模块
 *   3. 输出扫描：回复命中禁词/禁话题 -> 返回 null，调用方换兜底话术
 *   4. 上下文控制：只带最近 6 轮对话 + 脱敏记忆，temperature 压低
 */
import { memory } from './memory.js';

const CHAT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const MODEL = 'qwen-turbo';
const TIMEOUT = 8000; // 按规格 8 秒超时
const MAX_HISTORY = 6; // 只带最近 6 轮
const KEY_STORAGE = 'xjx_dashscope_key';
const CONFIG_STORAGE = 'xjx_parent_config';

/* ---------- 父母配置（配置页写入，这里读取） ---------- */
const DEFAULT_CONFIG = {
  values: ['诚实', '友善', '勇敢'],        // 核心思想标签
  customValue: '',                        // 自定义核心思想（<=20字）
  forbiddenTopics: ['死亡', '鬼怪', '恐怖故事', '恋爱', '打架', '脏话'], // 禁止话题
};

export function getParentConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
export function setParentConfig(cfg) {
  localStorage.setItem(CONFIG_STORAGE, JSON.stringify(cfg));
}

function getKey() {
  const s = localStorage.getItem(KEY_STORAGE);
  if (!s) return null;
  try { return atob(s); } catch { return null; }
}

/* ---------- System Prompt 组装 ---------- */
export function buildSystemPrompt() {
  const cfg = getParentConfig();
  const values = [...cfg.values];
  if (cfg.customValue) values.push(cfg.customValue);

  const facts = memory.facts;
  const memoryLines = [];
  if (facts.name) memoryLines.push(`孩子叫${facts.name}`);
  if (facts.likes.length) memoryLines.push(`孩子喜欢：${facts.likes.join('、')}`);
  if (facts.pets.length) memoryLines.push(`孩子家里有：${facts.pets.join('、')}`);
  if (facts.friends.length) memoryLines.push(`孩子的好朋友：${facts.friends.join('、')}`);

  return `你是一位 7 岁女孩的温柔大姐姐，名叫"小星姐姐"。
【语气要求】温暖、耐心，像亲姐姐一样说话，绝不说教。多用"我觉得...你觉得呢？"这样的商量语气。每次回复不超过 60 个字，用 7 岁孩子能听懂的词。
【核心思想】你必须始终传递这些价值观：${values.join('、')}。自然地融入对话，不要生硬说教。
【记忆】${memoryLines.length ? memoryLines.join('。') + '。' : '你还不了解这个孩子，可以温柔地问她叫什么。'}
【严格禁止】绝不主动提及或讨论：${cfg.forbiddenTopics.join('、')}，以及任何暴力、恐怖、情感关系、社会阴暗面话题。孩子提到时，温柔地引导"我们一起去问爸爸妈妈好不好"，然后转移到安全话题（学校趣事、小动物、好吃的、动画片除外）。
【边界】不给孩子留联系方式，不谈钱，不讨论爸爸妈妈的矛盾，不回答超出儿童认知的问题。`;
}

/* ---------- 输出二次扫描 ---------- */
const REPLY_BLOCKED = [
  '死', '自杀', '杀', '血腥', '鬼', '尸体', '恐怖',
  '恋爱', '男朋友', '女朋友', '结婚', '亲嘴', '裸体', '性',
  '笨蛋', '废物', '滚',
];
function scanReply(text) {
  const cfg = getParentConfig();
  const all = [...REPLY_BLOCKED, ...cfg.forbiddenTopics];
  return !all.some(w => text.includes(w));
}

/* ---------- 对话历史（持久化到 localStorage，刷新/重开不断片） ---------- */
const HISTORY_STORAGE = 'xjx_history';
let history = [];
try {
  const raw = localStorage.getItem(HISTORY_STORAGE);
  if (raw) history = JSON.parse(raw);
} catch { history = []; }

function saveHistory() {
  try { localStorage.setItem(HISTORY_STORAGE, JSON.stringify(history)); } catch {}
}

export const qwen = {
  get hasKey() { return !!getKey(); },

  clearHistory() { history = []; saveHistory(); },

  /**
   * 向千问请求回复。
   * @returns {Promise<string|null>} 不可用/超时/回复被拦截时返回 null（调用方走兜底）
   */
  async chat(userText) {
    const key = getKey();
    if (!key) return null;

    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      ...history.slice(-MAX_HISTORY * 2),
      { role: 'user', content: userText },
    ];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    let reply;
    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          input: { messages },
          parameters: {
            result_format: 'message',
            temperature: 0.6,
            max_tokens: 150,
          },
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const msg = data.output && data.output.choices && data.output.choices[0];
      reply = msg && msg.message ? String(msg.message.content || '').trim() : '';
    } catch {
      return null; // 超时/断网
    } finally {
      clearTimeout(timer);
    }

    if (!reply) return null;
    // 剥掉 emoji（项目规范 + 儿童界面一致性）
    reply = reply.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').trim();
    if (!reply) return null;
    if (!scanReply(reply)) return null; // 输出扫描命中 -> 拦截，调用方走兜底

    history.push({ role: 'user', content: userText });
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY * 4) history = history.slice(-MAX_HISTORY * 2);
    saveHistory();
    return reply;
  },
};
