/**
 * rewards.js — 星星、服装、每日任务
 *
 * V1 存在 localStorage；后续接 SQLite 时替换这一层即可。
 * 星星是成长值，不是消耗品：集齐门槛即解锁服装，不扣星星。
 */
const STARS_KEY = 'xjx_stars';
const OUTFITS_KEY = 'xjx_outfits';
const OUTFIT_KEY = 'xjx_outfit';
const TASKS_KEY = 'xjx_tasks';

export const OUTFITS = [
  { id: 'daily', name: '日常裙', cost: 0, color: '#F3A074' },
  { id: 'pajama', name: '睡衣', cost: 3, color: '#A6C4E4' },
  { id: 'sport', name: '运动服', cost: 6, color: '#8FB79A' },
  { id: 'festival', name: '节日裙', cost: 10, color: '#E7B36A' },
];

const TASK_BANK = {
  '数学': [
    { id: 'm1', subject: '数学', q: '3 加 4 等于几？', options: ['6', '7', '8'], answer: 1 },
    { id: 'm2', subject: '数学', q: '10 减 6 等于几？', options: ['3', '4', '5'], answer: 1 },
    { id: 'm3', subject: '数学', q: '5 加 5 等于几？', options: ['10', '11', '9'], answer: 0 },
  ],
  '语文': [
    { id: 'c1', subject: '语文', q: '“小兔子”的“兔”读什么？', options: ['tù', 'tǔ', 'dù'], answer: 0 },
    { id: 'c2', subject: '语文', q: '“太阳”的“阳”是什么结构？', options: ['左右结构', '上下结构', '独体字'], answer: 0 },
    { id: 'c3', subject: '语文', q: '下面哪个词是形容开心的？', options: ['高兴', '生气', '难过'], answer: 0 },
  ],
  '英语': [
    { id: 'e1', subject: '英语', q: '“苹果”用英语怎么说？', options: ['apple', 'banana', 'orange'], answer: 0 },
    { id: 'e2', subject: '英语', q: '“cat”是什么小动物？', options: ['猫', '狗', '兔子'], answer: 0 },
    { id: 'e3', subject: '英语', q: '“red”是什么颜色？', options: ['红色', '蓝色', '绿色'], answer: 0 },
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

function pickDailyTasks() {
  const d = new Date();
  const seed = d.getDate() + (d.getMonth() + 1) * 31;
  return ['数学', '语文', '英语'].map((subject, i) => {
    const list = TASK_BANK[subject];
    return list[(seed + i) % list.length];
  });
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

  getDailyTasks() {
    return pickDailyTasks();
  },
  getTaskState() {
    const st = read(TASKS_KEY, null);
    if (!st || st.day !== dayStamp() || !Array.isArray(st.done)) {
      return { day: dayStamp(), done: [] };
    }
    return { day: st.day, done: st.done };
  },
  completeTask(id) {
    const st = this.getTaskState();
    if (!st.done.includes(id)) {
      st.done.push(id);
      write(TASKS_KEY, st);
      this.addStars(1);
    }
    return this.getTaskState();
  },
  tasksDoneCount() {
    const tasks = this.getDailyTasks();
    const st = this.getTaskState();
    return tasks.filter(t => st.done.includes(t.id)).length;
  },
};
