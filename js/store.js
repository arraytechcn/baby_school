/**
 * store.js — 记忆库客户端
 *
 * 数据优先写入本机 SQLite 服务（tools/memory_server.py，同源 /api/*，见 PROJECT_NOTES）；
 * 服务没开 / 请求失败时自动退回 localStorage，聊天与出题不中断。
 *
 * 本地缓存（localStorage）同时保留一份，用于断网时打开页面还能看到历史。
 */
const HISTORY_KEY = 'xjx_history';
const MEMORY_KEY = 'xjx_memory';
const CACHE_MAX = 200;

let mode = 'local'; // 'sqlite' | 'local'
let initPromise = null;

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

async function api(path, { method = 'GET', body, timeout = 2500 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const resp = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 第一次连上服务时，把浏览器里的旧数据搬进数据库（仅当库里还是空的）。 */
async function migrate(health) {
  const localHistory = readLocal(HISTORY_KEY, []);
  if (!health.messages && Array.isArray(localHistory) && localHistory.length) {
    await api('/api/history/bulk', {
      method: 'POST',
      body: { messages: localHistory.slice(-100) },
    }).catch(() => {});
  }
  const localFacts = readLocal(MEMORY_KEY, null);
  const hasFacts = localFacts && (
    localFacts.name || ['likes', 'pets', 'friends', 'misc'].some(k => (localFacts[k] || []).length)
  );
  if (!health.facts && hasFacts) {
    await api('/api/facts', { method: 'PUT', body: { facts: localFacts } }).catch(() => {});
  }
}

export const store = {
  get mode() { return mode; },

  /** 探测记忆服务；只执行一次。 */
  init() {
    if (!initPromise) {
      initPromise = (async () => {
        try {
          const health = await api('/api/health', { timeout: 1500 });
          if (health && health.ok) {
            mode = 'sqlite';
            await migrate(health);
          }
        } catch {
          // 服务没开：保持 local，页面照常可用
        }
        return mode;
      })();
    }
    return initPromise;
  },

  /** 最近的对话，返回 [{role, content}] 或带 id/created_at 的行。 */
  async loadHistory(limit = 50) {
    if (mode === 'sqlite') {
      try {
        const data = await api('/api/history?limit=' + encodeURIComponent(limit));
        const messages = data.messages || [];
        writeLocal(HISTORY_KEY, messages.map(m => ({ role: m.role, content: m.content })).slice(-CACHE_MAX));
        return messages;
      } catch {
        mode = 'local';
      }
    }
    return readLocal(HISTORY_KEY, []);
  },

  /** 追加一条消息：先写本地缓存，再写数据库。 */
  async appendMessage(role, content) {
    const local = readLocal(HISTORY_KEY, []);
    local.push({ role, content });
    if (local.length > CACHE_MAX) local.splice(0, local.length - CACHE_MAX);
    writeLocal(HISTORY_KEY, local);

    if (mode === 'sqlite') {
      try {
        await api('/api/history', { method: 'POST', body: { role, content } });
      } catch {
        mode = 'local';
      }
    }
  },

  async clearHistory() {
    writeLocal(HISTORY_KEY, []);
    if (mode === 'sqlite') {
      try {
        await api('/api/history', { method: 'DELETE' });
      } catch {
        mode = 'local';
      }
    }
  },

  /** 孩子事实（name/likes/pets/friends/misc）。 */
  async loadFacts() {
    if (mode === 'sqlite') {
      try {
        const data = await api('/api/facts');
        if (data.facts) {
          writeLocal(MEMORY_KEY, data.facts);
          return data.facts;
        }
      } catch {
        mode = 'local';
      }
    }
    return readLocal(MEMORY_KEY, null);
  },

  async saveFacts(facts) {
    writeLocal(MEMORY_KEY, facts);
    if (mode === 'sqlite') {
      try {
        await api('/api/facts', { method: 'PUT', body: { facts } });
      } catch {
        mode = 'local';
      }
    }
  },

  /** 父母设置页展示用：当前用的是数据库还是浏览器缓存。 */
  async status() {
    if (mode === 'sqlite') {
      try {
        const health = await api('/api/health', { timeout: 1200 });
        return { mode, messages: health.messages || 0, facts: health.facts || 0 };
      } catch {
        mode = 'local';
      }
    }
    return { mode, messages: readLocal(HISTORY_KEY, []).length, facts: 0 };
  },
};
