/**
 * memory.js — 孩子信息记忆（SQLite 记忆库 + localStorage 兜底，不出设备）
 *
 * facts: { name, likes: [], pets: [], friends: [], misc: [] } 由 brain 提取实体写入
 * 敏感信息（住址等）只存本地；父母面板摘要需脱敏展示。
 */
import { store } from './store.js';

const STORAGE = 'xjx_memory';

function blankFacts() {
  return { name: '', likes: [], pets: [], friends: [], misc: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return blankFacts();
    return { ...blankFacts(), ...JSON.parse(raw) };
  } catch {
    return blankFacts();
  }
}

let facts = load();

function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify(facts)); } catch {}
  store.saveFacts(facts).catch(() => {});
}

function pushUnique(arr, val, max = 10) {
  if (!val || arr.includes(val)) return;
  arr.push(val);
  if (arr.length > max) arr.shift();
}

export const memory = {
  get facts() { return facts; },
  get name() { return facts.name; },

  setName(n) { facts.name = n; save(); },
  addLike(v) { pushUnique(facts.likes, v); save(); },
  addPet(v) { pushUnique(facts.pets, v); save(); },
  addFriend(v) { pushUnique(facts.friends, v); save(); },
  addMisc(v) { pushUnique(facts.misc, v, 20); save(); },

  /** 启动时从记忆库灌入（不反向写库）。 */
  hydrate(next) {
    if (!next || typeof next !== 'object') return;
    facts = { ...blankFacts(), ...next };
    try { localStorage.setItem(STORAGE, JSON.stringify(facts)); } catch {}
  },

  clear() {
    facts = blankFacts();
    localStorage.removeItem(STORAGE);
    store.saveFacts(facts).catch(() => {});
  },
};
