// 외형 설정 저장소. 뷰어 설정이므로 localStorage 에 둔다.
// 키: me | claude | sub | floor:<floorId>
import { DEFAULTS, normalizeAvatar } from './scene/avatar.js';

const KEY = 'aiOffice.avatars.v2';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function createAvatarStore() {
  let data = load();
  const listeners = new Set();
  const cache = new Map();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    cache.clear();
    for (const fn of listeners) fn();
  }

  function baseFor(key) { return key === 'me' ? DEFAULTS.me : key === 'sub' ? DEFAULTS.sub : DEFAULTS.claude; }

  /** 저장된 값이 없으면 기본값 */
  function get(key) {
    if (!cache.has(key)) cache.set(key, normalizeAvatar(data[key], baseFor(key)));
    return cache.get(key);
  }
  function has(key) { return !!data[key]; }
  function set(key, spec) { data[key] = normalizeAvatar(spec, baseFor(key)); save(); }
  function reset(key) { delete data[key]; save(); }

  /** 캐릭터에 쓸 외형: 층별 Claude 설정 > Claude 기본 */
  function forActor(a, floorId) {
    if (a.user) return get('me');
    if (a.kind === 'sub') return get('sub');
    if (floorId && data[`floor:${floorId}`]) return get(`floor:${floorId}`);
    return get('claude');
  }

  return { get, has, set, reset, forActor, baseFor, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
