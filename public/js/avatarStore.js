// 캐릭터 고르기 저장소. 뷰어 설정이므로 localStorage 에 둔다.
// 키: me | claude | sub | floor:<floorId>   값: 캐릭터 이름(characters.js 의 CHARACTERS), 'custom:<id>'(올린 그림) 또는 'auto'(세션마다 다르게)
import { DEFAULTS, isCustomCharacter, normalizeCharacter, resolveCharacter } from './scene/characters.js';
import { createCustomCharacters } from './customCharacters.js';

const KEY = 'aiOffice.characters.v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}

export function createAvatarStore(customs = createCustomCharacters()) {
  let data = load();
  const listeners = new Set();
  customs.subscribe(() => { for (const fn of listeners) fn(); });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
    for (const fn of listeners) fn();
  }

  function baseFor(key) { return key === 'me' ? DEFAULTS.me : key === 'sub' ? DEFAULTS.sub : DEFAULTS.claude; }

  /** 저장된 값이 없으면 기본값. 지운 커스텀 그림을 가리키면 기본값. 나는 'auto' 가 없다 */
  function get(key) {
    let v = normalizeCharacter(data[key], baseFor(key));
    if (isCustomCharacter(v) && !customs.has(v)) v = baseFor(key);
    return key === 'me' && v === 'auto' ? DEFAULTS.me : v;
  }
  function has(key) { return key in data; }
  function set(key, value) { data[key] = normalizeCharacter(value, baseFor(key)); save(); }
  function reset(key) { delete data[key]; save(); }

  /** 캐릭터에 쓸 이름: 층별 Claude 설정 > Claude 기본. 'auto' 는 캐릭터 키 해시로 */
  function forActor(a, floorId) {
    if (a.user) return get('me');
    let v;
    if (a.kind === 'sub') v = get('sub');
    else if (floorId && has(`floor:${floorId}`)) v = get(`floor:${floorId}`);
    else v = get('claude');
    return resolveCharacter(v, a.key);
  }

  return { get, has, set, reset, forActor, baseFor, customs, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
}
