/**
 * rewards.js — 星星、服装、每日作业
 *
 * V1 存在 localStorage；后续接 SQLite 时替换这一层即可。
 * 星星是成长值，不是消耗品：集齐门槛即解锁服装，不扣星星。
 */
const STARS_KEY = 'xjx_stars';
const OUTFITS_KEY = 'xjx_outfits';
const OUTFIT_KEY = 'xjx_outfit';
const HOMEWORK_KEY = 'xjx_homework';

export const OUTFITS = [
  { id: 'daily', name: '日常装', cost: 0, color: '#7FA8C9' },
  { id: 'pajama', name: '睡衣', cost: 3, color: '#A6C4E4' },
  { id: 'sport', name: '运动服', cost: 6, color: '#8FB79A' },
  { id: 'festival', name: '节日裙', cost: 10, color: '#E7B36A' },
];

export const SUBJECTS = ['语文', '数学', '英语'];
export const PER_SUBJECT = 2;

// 二年级水平：语文认字/词语，数学加减与乘法口诀，英语常见词
const HOMEWORK_BANK = {
  '语文': [
    { id: 'c1', subject: '语文', q: '“小兔子”的“兔”读什么？', options: ['tù', 'tǔ', 'dù'], answer: 0 },
    { id: 'c2', subject: '语文', q: '“太阳”的“阳”是什么结构？', options: ['左右结构', '上下结构', '独体字'], answer: 0 },
    { id: 'c3', subject: '语文', q: '哪个词和“高兴”意思最接近？', options: ['生气', '难过', '开心'], answer: 2 },
    { id: 'c4', subject: '语文', q: '“大”的反义词是什么？', options: ['多', '小', '高'], answer: 1 },
    { id: 'c5', subject: '语文', q: '“苹果”的“苹”是什么结构？', options: ['左右结构', '上下结构', '独体字'], answer: 1 },
    { id: 'c6', subject: '语文', q: '“小鸟”用哪个量词？', options: ['一条', '一只', '一头'], answer: 1 },
  ],
  '数学': [
    { id: 'm1', subject: '数学', q: '7 加 8 等于几？', options: ['14', '15', '16'], answer: 1 },
    { id: 'm2', subject: '数学', q: '15 减 9 等于几？', options: ['5', '6', '7'], answer: 1 },
    { id: 'm3', subject: '数学', q: '3 乘 4 等于几？', options: ['12', '7', '9'], answer: 0 },
    { id: 'm4', subject: '数学', q: '24 加 6 等于几？', options: ['28', '30', '32'], answer: 1 },
    { id: 'm5', subject: '数学', q: '5 乘 2 等于几？', options: ['7', '10', '12'], answer: 1 },
    { id: 'm6', subject: '数学', q: '18 减 7 等于几？', options: ['9', '10', '11'], answer: 2 },
  ],
  '英语': [
    { id: 'e1', subject: '英语', q: '“苹果”用英语怎么说？', options: ['apple', 'banana', 'orange'], answer: 0 },
    { id: 'e2', subject: '英语', q: '“cat”是什么小动物？', options: ['猫', '狗', '兔子'], answer: 0 },
    { id: 'e3', subject: '英语', q: '“red”是什么颜色？', options: ['蓝色', '绿色', '红色'], answer: 2 },
    { id: 'e4', subject: '英语', q: '“book”是什么意思？', options: ['书', '笔', '桌子'], answer: 0 },
    { id: 'e5', subject: '英语', q: '“two”是数字几？', options: ['1', '2', '3'], answer: 1 },
    { id: 'e6', subject: '英语', q: '“Good morning”是什么意思？', options: ['晚安', '早上好', '再见'], answer: 1 },
  ],
};

function dayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function pickDailyHomework() {
  const d = new Date();
  const seed = d.getDate() + (d.getMonth() + 1) * 31;
  const out = [];
  SUBJECTS.forEach((subject, si) => {
    const list = HOMEWORK_BANK[subject];
    const start = (seed + si * 3) % list.length;
    for (let i = 0; i < PER_SUBJECT; i++) {
      out.push(list[(start + i) % list.length]);
    }
  });
  return out;
}

export const rewards = {
  getStars() {
    const n = parseInt(read(STARS_KEY, 0), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  setStars(n) {
    write(STARS_KEY, Math.max(0, Math.floor(Number(n) || 0)));
    this.syncUnlocks();
  },
  syncUnlocks() {
    const stars = this.getStars();
    for (const o of OUTFITS) {
      if (o.cost > 0 && stars >= o.cost) this.unlockOutfit(o.id);
    }
  },
  addStars(n) {
    const total = this.getStars() + Math.floor(Number(n) || 0);
    this.setStars(total);
    return this.getStars();
  },

  hasOutfit(id) {
    const list = read(OUTFITS_KEY, ['daily']);
    return Array.isArray(list) && list.includes(id);
  },
  unlockOutfit(id) {
    const list = read(OUTFITS_KEY, ['daily']);
    if (!Array.isArray(list)) return;
    if (!list.includes(id)) {
      list.push(id);
      write(OUTFITS_KEY, list);
    }
  },
  getOutfit() {
    const id = read(OUTFIT_KEY, 'daily');
    return OUTFITS.some(o => o.id === id) ? id : 'daily';
  },
  setOutfit(id) {
    if (OUTFITS.some(o => o.id === id)) write(OUTFIT_KEY, id);
  },

  getDailyHomework() {
    return pickDailyHomework();
  },
  getHomeworkState() {
    const st = read(HOMEWORK_KEY, null);
    if (!st || st.day !== dayStamp() || !Array.isArray(st.done)) {
      return { day: dayStamp(), done: [] };
    }
    return { day: st.day, done: st.done };
  },
  completeHomework(id) {
    const st = this.getHomeworkState();
    if (!st.done.includes(id)) {
      st.done.push(id);
      write(HOMEWORK_KEY, st);
      this.addStars(1);
    }
    return this.getHomeworkState();
  },
  homeworkDoneCount() {
    const all = this.getDailyHomework();
    const st = this.getHomeworkState();
    return all.filter(t => st.done.includes(t.id)).length;
  },
};
