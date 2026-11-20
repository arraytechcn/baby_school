/**
 * rewards.js — 星星、装扮、每日作业
 *
 * 装扮按部位拆分：上衣 / 下装 / 鞋子 / 帽子 / 头饰 / 首饰。
 * 星星是成长值，不是消耗品：集齐门槛即解锁，不扣星星。
 * V1 存在 localStorage；后续接 SQLite 时替换这一层即可。
 */
const STARS_KEY = 'xjx_stars';
const ITEMS_KEY = 'xjx_items';
const LOOK_KEY = 'xjx_look';
const HOMEWORK_KEY = 'xjx_homework';

export const CATEGORIES = [
  { id: 'top', name: '上衣' },
  { id: 'bottom', name: '下装' },
  { id: 'shoes', name: '鞋子' },
  { id: 'hat', name: '帽子' },
  { id: 'hair', name: '头饰' },
  { id: 'jewelry', name: '首饰' },
];

export const ITEMS = {
  top: [
    { id: 'top-cream', name: '奶油衬衫', color: '#FFF3E0', cost: 0 },
    { id: 'top-tee', name: '薄荷 T 恤', color: '#8FB79A', cost: 2 },
    { id: 'top-pajama', name: '星星睡衣', color: '#A6C4E4', cost: 4 },
    { id: 'top-festival', name: '节日衬衫', color: '#FFF3D6', cost: 8 },
  ],
  bottom: [
    { id: 'bottom-denim', name: '牛仔长裤', color: '#7FA8C9', cost: 0, type: 'pants' },
    { id: 'bottom-blue', name: '蓝色睡裤', color: '#8FB0D6', cost: 3, type: 'pants' },
    { id: 'bottom-navy', name: '藏蓝运动裤', color: '#4F6B86', cost: 5, type: 'pants' },
    { id: 'bottom-gold', name: '金色裙子', color: '#E7B36A', cost: 9, type: 'skirt' },
  ],
  shoes: [
    { id: 'shoe-brown', name: '棕色皮鞋', color: '#8A6844', cost: 0 },
    { id: 'shoe-pink', name: '粉色拖鞋', color: '#D9A5A0', cost: 2 },
    { id: 'shoe-white', name: '白色球鞋', color: '#FFFDF9', cost: 4 },
    { id: 'shoe-red', name: '红色小鞋', color: '#B04A28', cost: 7 },
  ],
  hat: [
    { id: 'hat-none', name: '不戴帽子', color: '#F3E8DC', cost: 0, none: true },
    { id: 'hat-cap', name: '运动帽', color: '#4F6B86', cost: 3 },
    { id: 'hat-beret', name: '贝雷帽', color: '#B04A28', cost: 6 },
  ],
  hair: [
    { id: 'hair-none', name: '自然披发', color: '#F3E8DC', cost: 0, none: true },
    { id: 'hair-bow', name: '蝴蝶结', color: '#E4572E', cost: 2 },
    { id: 'hair-star', name: '星星发夹', color: '#F4D35E', cost: 5 },
  ],
  jewelry: [
    { id: 'jewelry-none', name: '不戴首饰', color: '#F3E8DC', cost: 0, none: true },
    { id: 'jewelry-necklace', name: '小项链', color: '#E7B36A', cost: 4 },
    { id: 'jewelry-bracelet', name: '小手链', color: '#B04A28', cost: 6 },
  ],
};

const DEFAULT_LOOK = {
  top: 'top-cream',
  bottom: 'bottom-denim',
  shoes: 'shoe-brown',
  hat: 'hat-none',
  hair: 'hair-none',
  jewelry: 'jewelry-none',
};

// 旧版整套装扮 -> 新分件搭配，保留用户上次穿的风格
const OLD_OUTFIT_MAP = {
  daily: { top: 'top-cream', bottom: 'bottom-denim', shoes: 'shoe-brown', hat: 'hat-none', hair: 'hair-none', jewelry: 'jewelry-none' },
  pajama: { top: 'top-pajama', bottom: 'bottom-blue', shoes: 'shoe-pink', hat: 'hat-none', hair: 'hair-none', jewelry: 'jewelry-none' },
  sport: { top: 'top-tee', bottom: 'bottom-navy', shoes: 'shoe-white', hat: 'hat-cap', hair: 'hair-none', jewelry: 'jewelry-none' },
  festival: { top: 'top-festival', bottom: 'bottom-gold', shoes: 'shoe-red', hat: 'hat-beret', hair: 'hair-bow', jewelry: 'jewelry-necklace' },
};

function migrateLook() {
  const old = read('xjx_outfit', null);
  if (old && OLD_OUTFIT_MAP[old]) {
    write(LOOK_KEY, OLD_OUTFIT_MAP[old]);
    return OLD_OUTFIT_MAP[old];
  }
  return null;
}

export const SUBJECTS = ['语文', '数学', '英语', '画画'];
export const PER_SUBJECT = { '语文': 2, '数学': 2, '英语': 2, '画画': 1 };

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
  '画画': [
    { id: 'd1', subject: '画画', type: 'draw', q: '画一画你想象中的彩虹蘑菇吧', hint: '可以选颜色，画完让姐姐看看' },
    { id: 'd2', subject: '画画', type: 'draw', q: '画一只你最喜欢的小动物吧', hint: '它长什么样？画给姐姐看看' },
    { id: 'd3', subject: '画画', type: 'draw', q: '画一画今天的天空吧', hint: '今天的天是什么颜色的？' },
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
    const quota = PER_SUBJECT[subject] || 1;
    const start = (seed + si * 3) % list.length;
    for (let i = 0; i < quota; i++) {
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
    Object.values(ITEMS).flat().forEach(item => {
      if (item.cost > 0 && stars >= item.cost) this.unlockItem(item.id);
    });
  },
  addStars(n) {
    const total = this.getStars() + Math.floor(Number(n) || 0);
    this.setStars(total);
    return this.getStars();
  },

  allItems() {
    return Object.values(ITEMS).flat();
  },
  itemById(id) {
    return this.allItems().find(item => item.id === id) || null;
  },
  isOwned(id) {
    const item = this.itemById(id);
    if (!item) return false;
    if (item.cost === 0) return true;
    const owned = read(ITEMS_KEY, ['top-cream', 'bottom-denim', 'shoe-brown', 'hat-none', 'hair-none', 'jewelry-none']);
    return Array.isArray(owned) && owned.includes(id);
  },
  unlockItem(id) {
    const item = this.itemById(id);
    if (!item) return;
    const owned = read(ITEMS_KEY, ['top-cream', 'bottom-denim', 'shoe-brown', 'hat-none', 'hair-none', 'jewelry-none']);
    const list = Array.isArray(owned) ? owned : [];
    if (!list.includes(id)) {
      list.push(id);
      write(ITEMS_KEY, list);
    }
  },
  getLook() {
    let saved = read(LOOK_KEY, null);
    if (!saved) saved = migrateLook();
    const look = { ...DEFAULT_LOOK };
    if (saved && typeof saved === 'object') {
      Object.keys(look).forEach(category => {
        const id = saved[category];
        if (ITEMS[category] && ITEMS[category].some(item => item.id === id)) look[category] = id;
      });
    }
    return look;
  },
  setLook(category, id) {
    if (!ITEMS[category] || !ITEMS[category].some(item => item.id === id)) return;
    const look = this.getLook();
    look[category] = id;
    write(LOOK_KEY, look);
  },
  ownedCount() {
    return this.allItems().filter(item => this.isOwned(item.id)).length;
  },
  totalCount() {
    return this.allItems().length;
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
