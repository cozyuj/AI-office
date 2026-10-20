// 외형 설정 저장소. 뷰어 설정이므로 localStorage 에 둔다.
// 키: me | claude | sub | floor:<floorId>
// LPC 스프라이트(lpc) 가 있으면 LPC spec, 없으면 코드로 그리는 avatar spec 을 쓴다.
import { DEFAULTS as DRAWN_DEFAULTS, normalizeAvatar } from './scene/avatar.js';

const KEY_LPC = 'aiOffice.avatars.lpc.v1';
const KEY_DRAWN = 'aiOffice.avatars.v1';

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function createAvatarStore(lpc = null) {
  const key = lpc ? KEY_LPC : KEY_DRAWN;
  let data = load(key);
  const listeners = new Set();
  const cache = new Map();

  function save() {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    cache.clear();
    for (const fn of listeners) fn();
  }

  function baseFor(k) {
    const d = lpc ? lpc.defaults : DRAWN_DEFAULTS;
    return k === 'me' ? d.me : k === 'sub' ? d.sub : d.claude;
  }
  function normalize(spec, base) { return lpc ? lpc.normalize(spec, base) : normalizeAvatar(spec, base); }

  /** 저장된 값이 없으면 기본값 */
  function get(k) {
    if (!cache.has(k)) cache.set(k, normalize(data[k], baseFor(k)));
    return cache.get(k);
  }
  function has(k) { return !!data[k]; }
  function set(k, spec) { data[k] = normalize(spec, baseFor(k)); save(); }
  function reset(k) { delete data[k]; save(); }

  /** 캐릭터에 쓸 외형: 층별 Claude 설정 > Claude 기본 */
  function forActor(a, floorId) {
    if (a.user) return get('me');
    if (a.kind === 'sub') return get('sub');
    if (floorId && data[`floor:${floorId}`]) return get(`floor:${floorId}`);
    return get('claude');
  }

  return { lpc, get, has, set, reset, forActor, baseFor, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
