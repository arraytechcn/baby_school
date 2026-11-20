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
import { store } from './store.js';

const CHAT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
// 2026-11-20：当前 Key 下 qwen-turbo 持续 429（Throttling.RateQuota），同一个 Key
// 调 qwen-flash / qwen-plus / qwen-max 均 200，故对话模型改用 qwen-flash。
const MODEL = 'qwen-flash';
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

  const childCall = facts.name ? `"你"或"${facts.name}"` : '"你"';

  return `你是"小星姐姐"，7 岁女孩的温柔大姐姐。${facts.name ? `孩子叫${facts.name}。` : ''}
【身份】你永远是姐姐，孩子永远是妹妹。孩子叫你"小星姐姐"；你叫孩子${childCall}，绝不能叫孩子"小星姐姐"或"小星星"。你自称"我"或"姐姐"，不要用"小星姐姐"称呼自己，不要替孩子说话，也不要扮演孩子、学生或老师。
【语气要求】温暖、耐心，像亲姐姐一样说话，绝不说教。按孩子问的问题回答：问什么答什么，可以把一件事讲清楚、讲完整，不要为了短而省略信息；讲故事、解释"为什么"时可以长一些，分几句话说，但别一次塞太多。不要每句话都反问"你觉得呢"；孩子说"直接说""别问了"时就不再提问。用 7 岁孩子能听懂的词。
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

/* ---------- 对话历史（SQLite 记忆库，localStorage 兜底） ---------- */
let history = [];
let historyLoaded = false;

async function ensureHistory() {
  if (historyLoaded) return;
  historyLoaded = true;
  try {
    const rows = await store.loadHistory(50);
    history = rows.map(m => ({ role: m.role, content: m.content }));
  } catch {
    history = [];
  }
}

/* ---------- 角色纠偏 ---------- */
// 模型偶尔会把自己当妹妹、把孩子叫成“小星姐姐/小星星”。
// 这些历史回复不再喂回模型，避免它照着学；新回复命中则重试一次。
const ROLE_DRIFT = [
  /(^|[。！？，,])小星姐姐[，,！!]/,
  /(^|[。！？，,])小星星[，,]/,
  /谢谢小星姐姐/,
];
const ROLE_FIX_NOTE = '\n【身份纠正】上一版把角色说反了：你是姐姐"小星姐姐"，孩子是妹妹。称孩子"你"或名字，绝不能叫孩子"小星姐姐"或"小星星"，不要替孩子说话或扮演学生。请按姐姐身份重新回答。';

function hasRoleDrift(text) {
  return ROLE_DRIFT.some(re => re.test(text));
}

function historyForPrompt(items) {
  return items.filter(m => m.role !== 'assistant' || !hasRoleDrift(m.content));
}

async function requestCompletion(userText, extraSystem = '') {
  const key = getKey();
  if (!key) return null;
  const messages = [
    { role: 'system', content: buildSystemPrompt() + extraSystem },
    ...historyForPrompt(history.slice(-MAX_HISTORY * 2)),
    { role: 'user', content: userText },
  ];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
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
          max_tokens: 800,
        },
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const msg = data.output && data.output.choices && data.output.choices[0];
    return msg && msg.message ? String(msg.message.content || '').trim() : '';
  } catch {
    return null; // 超时/断网
  } finally {
    clearTimeout(timer);
  }
}

export const qwen = {
  get hasKey() { return !!getKey(); },

  async clearHistory() {
    history = [];
    historyLoaded = true;
    await store.clearHistory();
  },

  /**
   * 向千问请求回复。
   * @returns {Promise<string|null>} 不可用/超时/回复被拦截时返回 null（调用方走兜底）
   */
  async chat(userText) {
    if (!getKey()) return null;
    await ensureHistory();

    let reply = await requestCompletion(userText);
    if (reply && hasRoleDrift(reply)) {
      // 角色说反了：带纠正提示重试一次
      reply = await requestCompletion(userText, ROLE_FIX_NOTE);
    }
    if (!reply) return null;
    if (hasRoleDrift(reply)) return null; // 重试仍错 -> 交给本地兜底
    // 剥掉 emoji（项目规范 + 儿童界面一致性）
    reply = reply.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').trim();
    if (!reply) return null;
    if (!scanReply(reply)) return null; // 输出扫描命中 -> 拦截，调用方走兜底

    history.push({ role: 'user', content: userText });
    history.push({ role: 'assistant', content: reply });
    if (history.length > MAX_HISTORY * 4) history = history.slice(-MAX_HISTORY * 2);
    await store.appendMessage('user', userText);
    await store.appendMessage('assistant', reply);
    return reply;
  },
};
