/**
 * memory.js — 孩子信息记忆（全部存 localStorage，不出设备）
 *
 * facts: { name, likes: [], pets: [], friends: [], misc: [] } 由 brain 提取实体写入
 * 敏感信息（住址等）只存本地；父母面板摘要需脱敏展示。
 */
const STORAGE = 'xjx_memory';

const DEFAULT_FACTS = {
  name: '',
  likes: [],
  pets: [],
  friends: [],
  misc: [],
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { ...DEFAULT_FACTS };
    return { ...DEFAULT_FACTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_FACTS };
  }
}

let facts = load();

function save() {
  localStorage.setItem(STORAGE, JSON.stringify(facts));
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

  clear() {
    facts = { ...DEFAULT_FACTS };
    localStorage.removeItem(STORAGE);
  },
};
