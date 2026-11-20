/**
 * rewards.js — 星星、装扮、每日作业
 *
 * 装扮按部位拆分：上衣 / 下装 / 鞋子 / 帽子 / 头饰 / 首饰。
 * 星星是成长值，不是消耗品：集齐门槛即解锁，不扣星星。
 * V1 存在 localStorage；后续接 SQLite 时替换这一层即可。
 */
import { SUBJECTS, PER_SUBJECT, pickHomeworkSet } from './homework.js';
export { SUBJECTS, PER_SUBJECT };

let currentHomework = null;

const STARS_KEY = 'xjx_stars';
const ITEMS_KEY = 'xjx_items';
const LOOK_KEY = 'xjx_look';
const HOMEWORK_KEY = 'xjx_homework';

export const CATEGORIES = [
  { id: 'top', name: '上衣' },
  { id: 'bottom', name: '下装' },
  { id: 'dress', name: '裙装' },
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
    { id: 'top-mist', name: '雾蓝衬衫', color: '#A9C6DC', cost: 2 },
    { id: 'top-apricot', name: '杏色毛衣', color: '#F2D2B6', cost: 3 },
    { id: 'top-pink', name: '粉色卫衣', color: '#F3C1CB', cost: 4 },
    { id: 'top-green', name: '绿色开衫', color: '#A8C8A8', cost: 5 },
    { id: 'top-lace', name: '米白蕾丝衫', color: '#FFF8EE', cost: 6 },
    { id: 'top-cape', name: '星月披肩', color: '#C9B7E6', cost: 30, premium: true },
  ],
  bottom: [
    { id: 'bottom-denim', name: '牛仔长裤', color: '#7FA8C9', cost: 0, type: 'pants' },
    { id: 'bottom-blue', name: '蓝色睡裤', color: '#8FB0D6', cost: 3, type: 'pants' },
    { id: 'bottom-navy', name: '藏蓝运动裤', color: '#4F6B86', cost: 5, type: 'pants' },
    { id: 'bottom-gold', name: '金色裙子', color: '#E7B36A', cost: 9, type: 'skirt' },
    { id: 'bottom-mist', name: '雾蓝长裤', color: '#A9C6DC', cost: 2, type: 'pants' },
    { id: 'bottom-pink', name: '粉色短裙', color: '#F3C1CB', cost: 3, type: 'skirt' },
    { id: 'bottom-beige', name: '米色长裤', color: '#DCC8B0', cost: 4, type: 'pants' },
    { id: 'bottom-green', name: '绿色长裙', color: '#A8C8A8', cost: 5, type: 'skirt' },
    { id: 'bottom-purple', name: '紫色长裤', color: '#C9B7E6', cost: 6, type: 'pants' },
    { id: 'bottom-galaxy', name: '银河长裙', color: '#B9C8E8', cost: 50, premium: true, type: 'skirt' },
  ],
  dress: [
    { id: 'dress-none', name: '不穿裙装', color: '#F3E8DC', cost: 0, none: true },
    { id: 'dress-cream', name: '奶油背带裙', color: '#FFF3D6', cost: 3 },
    { id: 'dress-mist', name: '雾蓝连衣裙', color: '#A9C6DC', cost: 4 },
    { id: 'dress-pink', name: '粉色连衣裙', color: '#F3C1CB', cost: 5 },
    { id: 'dress-green', name: '绿色连衣裙', color: '#A8C8A8', cost: 6 },
    { id: 'gown-star', name: '星星纱裙', color: '#CBB7E8', cost: 30, premium: true },
    { id: 'gown-rainbow', name: '彩虹礼服', color: '#F3B7C6', cost: 50, premium: true },
    { id: 'gown-moon', name: '月光长裙', color: '#9FB6D9', cost: 100, premium: true },
    { id: 'gown-flower', name: '花仙子裙', color: '#E9A6B8', cost: 200, premium: true },
    { id: 'gown-dream', name: '星愿公主裙', color: '#F2D9A6', cost: 500, premium: true },
  ],
  shoes: [
    { id: 'shoe-brown', name: '棕色皮鞋', color: '#8A6844', cost: 0 },
    { id: 'shoe-pink', name: '粉色拖鞋', color: '#D9A5A0', cost: 2 },
    { id: 'shoe-white', name: '白色球鞋', color: '#FFFDF9', cost: 4 },
    { id: 'shoe-red', name: '红色小鞋', color: '#B04A28', cost: 7 },
    { id: 'shoe-mist', name: '雾蓝小鞋', color: '#A9C6DC', cost: 2 },
    { id: 'shoe-apricot', name: '杏色小鞋', color: '#E7C3A0', cost: 3 },
    { id: 'shoe-green', name: '绿色小鞋', color: '#8FB79A', cost: 4 },
    { id: 'shoe-purple', name: '紫色小鞋', color: '#C9B7E6', cost: 5 },
    { id: 'shoe-cream', name: '米白小鞋', color: '#FFF8EE', cost: 6 },
    { id: 'shoe-crystal', name: '水晶鞋', color: '#DCEBF7', cost: 100, premium: true },
  ],
  hat: [
    { id: 'hat-none', name: '不戴帽子', color: '#F3E8DC', cost: 0, none: true },
    { id: 'hat-cap', name: '运动帽', color: '#4F6B86', cost: 3 },
    { id: 'hat-beret', name: '贝雷帽', color: '#B04A28', cost: 6 },
    { id: 'hat-mist', name: '雾蓝小帽', color: '#A9C6DC', cost: 2 },
    { id: 'hat-apricot', name: '杏色小帽', color: '#F2D2B6', cost: 3 },
    { id: 'hat-pink', name: '粉色小帽', color: '#F3C1CB', cost: 4 },
    { id: 'hat-green', name: '绿色小帽', color: '#A8C8A8', cost: 5 },
    { id: 'hat-cream', name: '米色小帽', color: '#FFF3D6', cost: 6 },
    { id: 'hat-purple', name: '紫色小帽', color: '#C9B7E6', cost: 7 },
    { id: 'hat-crown', name: '小皇冠', color: '#F4D35E', cost: 30, premium: true },
  ],
  hair: [
    { id: 'hair-none', name: '自然披发', color: '#F3E8DC', cost: 0, none: true },
    { id: 'hair-bow', name: '蝴蝶结', color: '#E4572E', cost: 2 },
    { id: 'hair-star', name: '星星发夹', color: '#F4D35E', cost: 5 },
    { id: 'hair-mist', name: '雾蓝蝴蝶结', color: '#A9C6DC', cost: 2 },
    { id: 'hair-apricot', name: '杏色蝴蝶结', color: '#F2D2B6', cost: 3 },
    { id: 'hair-pink', name: '粉色蝴蝶结', color: '#F3C1CB', cost: 4 },
    { id: 'hair-green', name: '绿色蝴蝶结', color: '#A8C8A8', cost: 5 },
    { id: 'hair-cream', name: '米色蝴蝶结', color: '#FFF3D6', cost: 6 },
    { id: 'hair-purple', name: '紫色蝴蝶结', color: '#C9B7E6', cost: 7 },
    { id: 'hair-crown', name: '星月发冠', color: '#F4D35E', cost: 50, premium: true },
  ],
  jewelry: [
    { id: 'jewelry-none', name: '不戴首饰', color: '#F3E8DC', cost: 0, none: true },
    { id: 'jewelry-necklace', name: '小项链', color: '#E7B36A', cost: 4 },
    { id: 'jewelry-bracelet', name: '小手链', color: '#B04A28', cost: 6 },
    { id: 'jewelry-mist', name: '雾蓝项链', color: '#A9C6DC', cost: 2 },
    { id: 'jewelry-apricot', name: '杏色项链', color: '#F2D2B6', cost: 3 },
    { id: 'jewelry-pink', name: '粉色项链', color: '#F3C1CB', cost: 4 },
    { id: 'jewelry-green', name: '绿色项链', color: '#A8C8A8', cost: 5 },
    { id: 'jewelry-cream', name: '米色项链', color: '#FFF3D6', cost: 6 },
    { id: 'jewelry-purple', name: '紫色项链', color: '#C9B7E6', cost: 7 },
    { id: 'jewelry-moon', name: '月光项链', color: '#F6EBCF', cost: 50, premium: true },
  ],
};

const DEFAULT_LOOK = {
  top: 'top-cream',
  bottom: 'bottom-denim',
  dress: 'dress-none',
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
      if (item.premium) return;
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
    const owned = read(ITEMS_KEY, ['top-cream', 'bottom-denim', 'dress-none', 'shoe-brown', 'hat-none', 'hair-none', 'jewelry-none']);
    return Array.isArray(owned) && owned.includes(id);
  },
  unlockItem(id) {
    const item = this.itemById(id);
    if (!item) return;
    const owned = read(ITEMS_KEY, ['top-cream', 'bottom-denim', 'dress-none', 'shoe-brown', 'hat-none', 'hair-none', 'jewelry-none']);
    const list = Array.isArray(owned) ? owned : [];
    if (!list.includes(id)) {
      list.push(id);
      write(ITEMS_KEY, list);
    }
  },
  buyItem(id) {
    const item = this.itemById(id);
    if (!item || !item.premium || this.isOwned(id)) return false;
    if (this.getStars() < item.cost) return false;
    this.setStars(this.getStars() - item.cost);
    this.unlockItem(id);
    return true;
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

  /** 每次打开作业都重新抽一套（语数英各 2 题 + 画画 1 题）。 */
  startHomeworkSession() {
    currentHomework = pickHomeworkSet();
    const st = this.getHomeworkState();
    st.done = [];
    write(HOMEWORK_KEY, st);
    return currentHomework;
  },
  getCurrentHomework() {
    if (!currentHomework) currentHomework = pickHomeworkSet();
    return currentHomework;
  },
  getHomeworkState() {
    const st = read(HOMEWORK_KEY, null);
    if (!st || st.day !== dayStamp() || !Array.isArray(st.done)) {
      return { day: dayStamp(), done: [], earned: 0 };
    }
    const earned = Number.isFinite(Number(st.earned)) ? Number(st.earned) : Math.min(7, st.done.length);
    return { day: st.day, done: st.done, earned };
  },
  completeHomework(id, stars = 1) {
    const st = this.getHomeworkState();
    if (!st.done.includes(id)) {
      const gain = Math.max(1, Math.floor(Number(stars) || 1));
      st.done.push(id);
      st.earned += gain;
      this.addStars(gain);
      write(HOMEWORK_KEY, st);
    }
    return this.getHomeworkState();
  },
  homeworkEarned() {
    return this.getHomeworkState().earned;
  },
  homeworkDoneCount() {
    const set = currentHomework || [];
    const st = this.getHomeworkState();
    return set.filter(t => st.done.includes(t.id)).length;
  },
};
