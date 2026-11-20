/**
 * brain.js — 本地话术引擎（MVP，不接千问时的对话闭环）
 *
 * reply(text) -> { text, mood } mood: idle|happy|encouraging|thinking
 * 职责：安全拦截 > 记忆提取 > 规则应答 > 兜底话术。
 * 千问接入后，规则接不住的再走 API（第 4 阶段）。
 */
import { memory } from './memory.js';
import { qwen } from './qwen.js';

/* ---------- 敏感词硬拦截（前端第一层） ---------- */
const BLOCKED = [
  '男朋友', '女朋友', '早恋', '谈恋爱', '恋爱', '结婚', '亲亲', '亲吻',
  '自杀', '死亡', '杀人', '血腥', '鬼', '恐怖', '尸体',
  '裸体', '脱衣服', '色情',
  '傻逼', '白痴', '笨蛋去死', '滚开',
];
const DEFLECT = '这个话题小星姐姐不太懂呢，我们一起去问爸爸妈妈好不好？';

/**
 * 显示层敏感词打码：识别文本可能含误识别的脏话（2026-09-02 实测
 * "多多"被误识别为"我操操"），上屏前打码，不让孩子看到。
 */
const MASK_WORDS = [...BLOCKED, '我操', '操操', '卧槽', '操你', '妈的', '尼玛', '去死']; // 注意：不能单加"操"，"做操/早操"是正常词
export function sanitize(text) {
  let out = text;
  for (const w of MASK_WORDS) {
    out = out.split(w).join('*'.repeat(w.length));
  }
  return out;
}

let deflectCount = 0; // 连续试探计数

/* ---------- 兜底话术池（>=10 条） ---------- */
const FALLBACKS = [
  '这个问题有点复杂哦，我们记下来问问爸爸妈妈吧~',
  '小星姐姐觉得，我们可以聊聊你今天吃了什么好吃的！',
  '嗯嗯，小星姐姐在认真听呢，你再多说一点好不好？',
  '哇，这个话题好有意思！那你最喜欢它哪一点呀？',
  '小星姐姐想不太明白，不过我很喜欢你跟我分享这些~',
  '要不我们来玩个游戏吧？我问你答，怎么样？',
  '你说得真好！那你今天在学校还发生了什么好玩的事？',
  '哈哈，小星姐姐被你逗笑了。你还知道什么有趣的事吗？',
  '小星姐姐小时候也想过这个问题呢！你觉得答案是什么呀？',
  '这个问题我们留着问爸爸妈妈，你先跟我说说你的好朋友吧！',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ---------- 记忆提取：从孩子的话里捞实体 ---------- */
function extractFacts(text) {
  const found = [];
  let m;
  if ((m = text.match(/我叫([一-龥a-zA-Z]{1,4})/))) {
    if (!memory.name) {
      // 名字一旦确定就不再让语音识别改掉，避免把“朱炘榆”听成别的名字
      memory.setName(m[1]);
      found.push({ type: 'name', value: m[1] });
    }
  }
  if ((m = text.match(/我喜欢(吃|玩|看|画)?([一-龥a-zA-Z]{1,6})/))) {
    memory.addLike(m[2]);
    found.push({ type: 'like', value: m[2] });
  }
  if ((m = text.match(/我家(有|养了)(一[只条个])?([一-龥]{1,4})/))) {
    memory.addPet(m[3]);
    found.push({ type: 'pet', value: m[3] });
  }
  if ((m = text.match(/我的好朋友(叫|是)([一-龥]{1,4})/))) {
    memory.addFriend(m[2]);
    found.push({ type: 'friend', value: m[2] });
  }
  return found;
}

/* ---------- 规则应答 ---------- */
const RULES = [
  {
    match: /^(你好|hi|hello|嗨)/i,
    reply: () => ({ text: `你好呀${memory.name ? '，' + memory.name : ''}！见到你真开心~`, mood: 'happy' }),
  },
  {
    match: /你叫什么名字|你是谁/,
    reply: () => ({ text: '我是小星姐姐呀，你的好朋友！我可以陪你聊天、讲故事，还能一起做题哦。', mood: 'happy' }),
  },
  {
    match: /难过|伤心|哭|不开心|委屈/,
    reply: () => ({ text: '抱抱你，愿意和小星姐姐说说发生什么了吗？说出来心里会舒服一点哦。', mood: 'encouraging' }),
  },
  {
    match: /害怕|怕黑|做噩梦/,
    reply: () => ({ text: '别怕别怕，小星姐姐陪着你呢。我们一起深呼吸三次，好不好？', mood: 'encouraging' }),
  },
  {
    match: /开心|高兴|太棒|赢了|考了?100/,
    reply: () => ({ text: '哇，太棒啦！小星姐姐也替你开心！快跟我讲讲细节~', mood: 'happy' }),
  },
  {
    match: /颜色/,
    reply: () => ({ text: '小星姐姐最喜欢暖暖的橘色，像夕阳一样。你最喜欢什么颜色呀？', mood: 'idle' }),
  },
  {
    match: /故事/,
    reply: () => ({ text: '从前有只小兔子，它每天都会给月亮写一封信……想听完整的故事吗？明天我讲给你听！', mood: 'idle' }),
  },
  {
    match: /谜语/,
    reply: () => ({ text: '那我来出一个：白白胖胖一身毛，爱吃萝卜爱吃草。猜猜是什么小动物？', mood: 'thinking' }),
  },
  {
    match: /再见|拜拜|我去睡/,
    reply: () => ({ text: `再见啦${memory.name ? '，' + memory.name : ''}，今天聊得真开心，明天见~`, mood: 'happy' }),
  },
];

/* ---------- 开场白（按时段 + 记忆） ---------- */
export function greeting() {
  const h = new Date().getHours();
  const name = memory.name ? `，${memory.name}` : '';
  let base;
  if (h < 11) base = `早安呀${name}，今天精神好吗？`;
  else if (h < 18) base = `下午好${name}~ 今天学校有什么好玩的事吗？`;
  else base = `晚上好${name}，今天最开心的一件事是什么？`;
  // 引用记忆，营造连续陪伴感
  if (memory.facts.pets.length) {
    base += `对了，你家${memory.facts.pets[memory.facts.pets.length - 1]}今天乖不乖呀？`;
  }
  return base;
}

/**
 * 生成回复。
 * @returns {{ text: string, mood: string, blocked: boolean }}
 */
export function reply(text) {
  text = (text || '').trim();
  if (!text) return { text: '小星姐姐没听清，你可以再说一次吗？', mood: 'thinking', blocked: false };

  // 1. 敏感词硬拦截
  if (BLOCKED.some(w => text.includes(w))) {
    deflectCount++;
    if (deflectCount >= 3) {
      deflectCount = 0;
      return { text: '我们去看看窗外的风景吧~ 或者，小星姐姐给你讲个好玩的？', mood: 'idle', blocked: true };
    }
    return { text: DEFLECT, mood: 'idle', blocked: true };
  }
  deflectCount = 0;

  // 2. 记忆提取
  const found = extractFacts(text);

  // 3. 规则应答
  for (const r of RULES) {
    if (r.match.test(text)) return { ...r.reply(), blocked: false };
  }

  // 4. 记忆确认回复（"我叫朵朵" -> "朵朵，我记住你啦"）
  const nameFact = found.find(f => f.type === 'name');
  if (nameFact) {
    return { text: `${nameFact.value}，真好听的名字！小星姐姐记住你啦~`, mood: 'happy', blocked: false };
  }
  const likeFact = found.find(f => f.type === 'like');
  if (likeFact) {
    return { text: `原来你喜欢${likeFact.value}呀！为什么呢？它哪里最吸引你？`, mood: 'happy', blocked: false };
  }

  // 5. 兜底
  return { text: pick(FALLBACKS), mood: 'idle', blocked: false };
}

/* ---------- 千问接入后的智能回复（优先本地规则，接不住的走千问） ---------- */

/** 从千问回复文本粗猜表情 */
function guessMood(text) {
  if (/太棒|好厉害|真聪明|为你开心|恭喜你/.test(text)) return 'happy';
  if (/抱抱|别难过|没关系|陪着你/.test(text)) return 'encouraging';
  if (/想想|猜一猜|为什么呢/.test(text)) return 'thinking';
  return 'idle';
}

/**
 * 智能回复：硬拦截 -> 记忆提取 -> 千问（有 Key）-> 本地规则兜底。
 * 情绪类输入（难过/害怕）固定走本地安抚话术，不问模型。
 * @returns {Promise<{ text: string, mood: string, blocked: boolean, source: string }>}
 */
export async function replySmart(text) {
  text = (text || '').trim();
  if (!text) return { text: '小星姐姐没听清，你可以再说一次吗？', mood: 'thinking', blocked: false, source: 'local' };

  // 1. 敏感词硬拦截（不进入千问）
  if (BLOCKED.some(w => text.includes(w))) {
    deflectCount++;
    if (deflectCount >= 3) {
      deflectCount = 0;
      return { text: '我们去看看窗外的风景吧~ 或者，小星姐姐给你讲个好玩的？', mood: 'idle', blocked: true, source: 'local' };
    }
    return { text: DEFLECT, mood: 'idle', blocked: true, source: 'local' };
  }
  deflectCount = 0;

  // 2. 记忆提取（无论谁回答都要先捞实体）
  const found = extractFacts(text);

  // 3. 情绪类固定走本地安抚（共情话术是安全红线，不交给模型发挥）
  if (/难过|伤心|哭|不开心|委屈/.test(text)) {
    return { text: '抱抱你，愿意和小星姐姐说说发生什么了吗？说出来心里会舒服一点哦。', mood: 'encouraging', blocked: false, source: 'local' };
  }
  if (/害怕|怕黑|做噩梦/.test(text)) {
    return { text: '别怕别怕，小星姐姐陪着你呢。我们一起深呼吸三次，好不好？', mood: 'encouraging', blocked: false, source: 'local' };
  }

  // 4. 记忆确认类（报名字/喜好）本地直接确认，体验最稳
  const nameFact = found.find(f => f.type === 'name');
  if (nameFact) {
    return { text: `${nameFact.value}，真好听的名字！小星姐姐记住你啦~`, mood: 'happy', blocked: false, source: 'local' };
  }

  // 5. 千问（有 Key 时；输出已二次扫描）
  if (qwen.hasKey) {
    const aiText = await qwen.chat(text);
    if (aiText) {
      return { text: aiText, mood: guessMood(aiText), blocked: false, source: 'qwen' };
    }
    // 千问不可用/被拦截 -> 落本地规则
  }

  // 6. 本地规则兜底
  for (const r of RULES) {
    if (r.match.test(text)) return { ...r.reply(), blocked: false, source: 'local' };
  }
  const likeFact = found.find(f => f.type === 'like');
  if (likeFact) {
    return { text: `原来你喜欢${likeFact.value}呀！为什么呢？它哪里最吸引你？`, mood: 'happy', blocked: false, source: 'local' };
  }
  return { text: pick(FALLBACKS), mood: 'idle', blocked: false, source: 'local' };
}
