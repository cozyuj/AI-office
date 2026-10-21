// 세션별 캐릭터 이름. 직접 지은 이름(custom) > 자동 별명(auto: 처음 본 순서대로, 지금까지 가장 덜 쓰인 별명).
// 뷰어 설정이므로 localStorage(aiOffice.names.v1) 에 둔다. 서버의 agent.name('Claude') 은 그대로 두고 화면에서만 바꾼다.
export const NAME_POOL = ['Alex', 'Sam', 'Max', 'Leo', 'Mia', 'Zoe', 'Noah', 'Emma', 'Liam', 'Ava', 'Ivy', 'Finn', 'Luna', 'Milo', 'Nora', 'Owen', 'Ruby', 'Theo', 'Jude', 'Cleo', 'Remy', 'Nico', 'Elsie', 'Kai'];
const KEY = 'aiOffice.names.v1';
const MAX_AUTO = 200; // 오래된 자동 별명은 버린다
export const NAME_MAX = 20;

function defaultStorage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }

export function createNameBook(storage = defaultStorage()) {
  const data = load();
  function load() {
    try {
      const raw = storage && storage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : null;
      const obj = (v) => (v && typeof v === 'object' ? v : {});
      return { custom: obj(d && d.custom), auto: obj(d && d.auto) };
    } catch { return { custom: {}, auto: {} }; }
  }
  function save() { try { if (storage) storage.setItem(KEY, JSON.stringify(data)); } catch {} }
  /** 지금까지 가장 덜 쓰인 별명 (같으면 풀 순서) */
  function pick(exclude) {
    const used = new Map();
    for (const n of Object.values(data.auto)) used.set(n, (used.get(n) || 0) + 1);
    let best = NAME_POOL[0], bc = Infinity;
    for (const n of NAME_POOL) { const c = used.get(n) || 0; if (n !== exclude && c < bc) { best = n; bc = c; } }
    return best;
  }
  function trim() {
    const keys = Object.keys(data.auto);
    if (keys.length > MAX_AUTO) for (const k of keys.slice(0, keys.length - MAX_AUTO)) delete data.auto[k];
  }
  function nameOf(sessionId) {
    if (data.custom[sessionId]) return data.custom[sessionId];
    if (!NAME_POOL.includes(data.auto[sessionId])) { data.auto[sessionId] = pick(); trim(); save(); } // 없거나 옛 풀(한글)의 이름이면 다시 배정
    return data.auto[sessionId];
  }
  /** 빈 문자열이면 직접 지은 이름을 지우고 자동 별명으로 돌아간다 */
  function set(sessionId, name) {
    const n = String(name || '').trim().slice(0, NAME_MAX);
    if (n) data.custom[sessionId] = n; else delete data.custom[sessionId];
    save();
    return nameOf(sessionId);
  }
  function reroll(sessionId) {
    delete data.custom[sessionId];
    data.auto[sessionId] = pick(data.auto[sessionId]);
    save();
    return data.auto[sessionId];
  }
  function isCustom(sessionId) { return !!data.custom[sessionId]; }
  return { nameOf, set, reroll, isCustom };
}
