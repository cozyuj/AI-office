// 층(= 프로젝트)별 인테리어 프리셋. 레이아웃은 그대로 두고 색만 바꾼다: 방 바닥/트림/체커 alt, 복도, 소품 강조색, 방 이름표 색조.
// 순수 모듈 (DOM·map 의존 없음) — 테스트와 map.js 양쪽에서 쓴다.

import { ROOM_IDS } from './layouts.js';
export { ROOM_IDS };

// 프리셋이 직접 색을 주지 않은 방(편의시설)은 비슷한 방의 색을 쓴다. 옥상정원은 프리셋의 잎 색에서 만든다 (palette 참고).
export const ROOM_FALLBACK = { gym: 'server', canteen: 'cafe', nap: 'mydesk', game: 'lounge', booklounge: 'library', studio: 'dev', seminar: 'meeting' };

// rooms: 방별 바닥색 (트림·체커 alt 는 바닥색에서 만든다). accent: 식물 잎 4색 · 소파/카페 의자 · 파라솔 · 목재(테이블·벤치) · 이름표 글자색.
// layout: 이 프리셋의 사무실 구조 (layouts.js, FE-35) — 방 배치와 편의시설이 다르다.
export const PRESETS = [
  { id: 'warm', label: '따뜻한 우드', emoji: '🪵', layout: 'classic',
    rooms: { library: '#ead6b4', dev: '#f7f8fa', research: '#eef5f3', meeting: '#f5f3ef', lounge: '#f9ecdf', server: '#ddefe7', mydesk: '#e1ebf7', lobby: '#f4f5f7', elevator: '#eceef2', cafe: '#f8efe4', terrace: '#dcc39f' },
    corridor: '#f5f6f8',
    accent: { leaf: ['#4e9a55', '#5fae6a', '#3f8a49', '#6bbd77'], sofa: '#f28c38', parasol: '#e8785a', wood: '#d9b382', text: '#4a515a' } },
  { id: 'cool', label: '쿨 그레이', emoji: '🩶', layout: 'studio',
    rooms: { library: '#ded4c6', dev: '#f3f5f9', research: '#ecf1f6', meeting: '#f0f2f6', lounge: '#e8ecf2', server: '#e1e8ee', mydesk: '#e2e9f4', lobby: '#f2f4f7', elevator: '#eaedf2', cafe: '#eff1f5', terrace: '#cfc6b8' },
    corridor: '#f3f5f8',
    accent: { leaf: ['#4f9c7a', '#5fb08c', '#3f8a6a', '#73bf9a'], sofa: '#4a7fd6', parasol: '#4d8fd1', wood: '#c9b89f', text: '#3f4a5a' } },
  { id: 'mint', label: '민트', emoji: '🌿', layout: 'fitness',
    rooms: { library: '#e4dcc2', dev: '#f0faf6', research: '#e6f5ef', meeting: '#eef7f2', lounge: '#e2f3ec', server: '#d6eee3', mydesk: '#dff2ea', lobby: '#f0f8f4', elevator: '#e8f1ec', cafe: '#eaf6ef', terrace: '#d3c6a0' },
    corridor: '#f2f9f5',
    accent: { leaf: ['#3f9a6e', '#52ad7f', '#348a5f', '#6abf93'], sofa: '#2fa38a', parasol: '#3ab0a0', wood: '#cdb48a', text: '#355a4a' } },
  { id: 'lavender', label: '라벤더', emoji: '💜', layout: 'play',
    rooms: { library: '#e6d8c8', dev: '#f6f3fb', research: '#efeaf8', meeting: '#f3f0f8', lounge: '#efe6f7', server: '#e5dff2', mydesk: '#e8e2f6', lobby: '#f5f2fa', elevator: '#ece8f3', cafe: '#f3edf8', terrace: '#d6c4a9' },
    corridor: '#f6f4fa',
    accent: { leaf: ['#5aa36b', '#6bb47c', '#4a9159', '#7cc48c'], sofa: '#9b6bd6', parasol: '#b36ad1', wood: '#d4b58e', text: '#4f4260' } },
  { id: 'sand', label: '샌드', emoji: '🏜️', layout: 'canteen',
    rooms: { library: '#e8d2a8', dev: '#fbf6ec', research: '#f5efe2', meeting: '#f8f2e6', lounge: '#f6e7cf', server: '#e9e5d4', mydesk: '#f0e4cf', lobby: '#f9f3e8', elevator: '#f1eadc', cafe: '#f8edd9', terrace: '#d9bb8a' },
    corridor: '#f8f4ea',
    accent: { leaf: ['#6f9a4a', '#80ad5a', '#5f8a3f', '#93bf6b'], sofa: '#d9a441', parasol: '#e0a23c', wood: '#d2a56a', text: '#5c4b2e' } },
  { id: 'pastel', label: '파스텔', emoji: '🍬', layout: 'classic',
    rooms: { library: '#f3dcc3', dev: '#fdf1f4', research: '#eef6fc', meeting: '#fbf3e8', lounge: '#fde9ec', server: '#e3f4ef', mydesk: '#e7ecfb', lobby: '#fbf5fc', elevator: '#f0f0f8', cafe: '#fff0e2', terrace: '#e3cfae' },
    corridor: '#faf7fb',
    accent: { leaf: ['#66b17a', '#7cc48d', '#56a06a', '#8fd49e'], sofa: '#f28ca8', parasol: '#f7a1b9', wood: '#e0bf98', text: '#5c4a5a' } },
];
// 테마 층(FE-60): 층 구조(레이아웃)는 그 층의 원래 프리셋을 따르고, 색과 소품(decor.js)만 덮는 스킨. 자동 배정에는 섞이지 않는다
export const THEMES = [
  // floor: 실내 바닥 무늬, wall: 벽 색·무늬, tint: 장면 틴트, deep: 바닥이 이미 어두워 다크 테마에서 더 누르지 않는다
  { id: 'halloween', label: '할로윈', emoji: '🎃', theme: true, floor: 'checker', deep: true, tint: 'rgba(60,20,110,0.12)',
    rooms: { library: '#7a6458', dev: '#7a6c94', research: '#73668e', meeting: '#7d6f96', lounge: '#836a7e', server: '#6d6188', mydesk: '#776a92', lobby: '#7f7398', elevator: '#776f8c', cafe: '#86707f', terrace: '#6b5d55', garden: '#55604f' },
    corridor: '#857a9c',
    wall: { face: '#4a3a62', top: '#5f4d7c', left: '#433558', right: '#33284a', lines: 'stripes', band: '#2a1f3a' },
    accent: { leaf: ['#4f6b4f', '#5d7a5b', '#405a42', '#6c8a69'], sofa: '#e8742c', parasol: '#6b3fa0', wood: '#8a6a4f', text: '#4a3a5c' } },
  { id: 'christmas', label: '크리스마스', emoji: '🎄', theme: true, floor: 'wood', tint: 'rgba(255,170,90,0.07)',
    wall: { face: '#b0703f', top: '#c8834e', left: '#a5683a', right: '#8a5530', lines: 'logs', band: null },
    rooms: { library: '#c9945f', dev: '#d8b088', research: '#d3ab84', meeting: '#d6ad86', lounge: '#dbb28a', server: '#cfa982', mydesk: '#d5ae88', lobby: '#dab48d', elevator: '#cdb39a', cafe: '#ddb58c', terrace: '#e6e2db' },
    corridor: '#e6cfb0',
    accent: { leaf: ['#2f7a45', '#3d8c52', '#24683a', '#4f9d62'], sofa: '#c8323b', parasol: '#c8323b', wood: '#a8743f', text: '#5a3a32' } },
  { id: 'summer', label: '여름휴가', emoji: '🏖️', theme: true, floor: 'deck',
    wall: { face: '#f6fafa', top: '#ffffff', left: '#e8f0f0', right: '#d8e4e4', lines: 'planks', band: '#5cc6c2' },
    rooms: { library: '#e3c592', dev: '#ead2a4', research: '#e6cd9f', meeting: '#e8cfa2', lounge: '#ecd5a8', server: '#e2caa0', mydesk: '#e7d0a3', lobby: '#efdcb6', elevator: '#e4d6bd', cafe: '#efd8ab', terrace: '#f0dcae' },
    corridor: '#f4e4bf',
    accent: { leaf: ['#3fa66b', '#52b87c', '#2f9459', '#6ccb92'], sofa: '#22a7c4', parasol: '#ff7a59', wood: '#e0bb85', text: '#2f5a66' } },
];
export const THEME_IDS = THEMES.map((t) => t.id);
export const isTheme = (id) => THEME_IDS.includes(id);
/** 날짜 → 그 철의 테마 id 또는 null. 할로윈 10/15~11/1, 크리스마스 12/1~12/26, 여름휴가 7/15~8/31 */
export function seasonTheme(date = new Date()) {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  if (md >= 1015 && md <= 1101) return 'halloween';
  if (md >= 1201 && md <= 1226) return 'christmas';
  if (md >= 715 && md <= 831) return 'summer';
  return null;
}
/**
 * 그리는 스타일 키: 프리셋 id('warm') 또는 테마+구조('halloween/warm').
 * → { look: 색을 줄 프리셋·테마 id, base: 구조를 줄 프리셋 id, theme: 테마 id|null }. 모르는 키면 null
 */
export function splitStyle(key) {
  const parts = String(key || '').split('/');
  if (parts.length > 2) return null;
  const [a, b] = parts;
  if (isTheme(a)) { if (b === undefined) return { look: a, base: DEFAULT_PRESET, theme: a }; return PRESET_IDS.includes(b) ? { look: a, base: b, theme: a } : null; }
  return PRESET_IDS.includes(a) && b === undefined ? { look: a, base: a, theme: null } : null;
}
export const PRESET_IDS = PRESETS.map((p) => p.id);
export const DEFAULT_PRESET = 'warm';
export const DEMO_PRESET = 'pastel';
export const AUTO_PRESETS = PRESET_IDS.filter((id) => id !== DEMO_PRESET); // 실제 층의 자동 배정 후보 (파스텔은 데모 층 전용)

/** 프리셋 또는 테마 */
export function presetById(id) { return PRESETS.find((p) => p.id === id) || THEMES.find((t) => t.id === id) || null; }
export function isDemoFloor(floor) { return !!floor && typeof floor.id === 'string' && floor.id.startsWith('/demo/'); }

// ---------- 색 유틸 (hex ↔ hsl) ----------
export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}
export function hslToHex({ h, s, l }) {
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  let r, g, b;
  if (s === 0) r = g = b = l;
  else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
  const to = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
const lum = (hex, dl) => { const c = hexToHsl(hex); return hslToHex({ ...c, l: Math.min(1, Math.max(0, c.l + dl)) }); };

/** 라이트 바닥색 → 다크 바닥색. 밝기 97% → 20%, 81% → 28% 쯤으로 눌러 기존 다크 팔레트와 비슷한 톤. */
export function toDark(hex) {
  const c = hexToHsl(hex);
  return hslToHex({ h: c.h, s: Math.min(0.5, 0.12 + c.s * 0.27), l: 0.20 + Math.max(0, 0.97 - c.l) * 0.5 });
}

export const DEFAULT_WALL = { face: '#fbfbfc', top: '#ffffff', left: '#e9ebf0', right: '#d8dbe2', lines: null, band: null };

/**
 * 프리셋 + 테마 → 렌더가 쓰는 팔레트.
 * { rooms: { id: { floor, trim, alt } }, corridor: { floor, trim }, accent, label: { text, bg } }
 */
export function palette(presetId, theme = 'light') {
  const sp = splitStyle(presetId);
  const p = presetById(sp ? sp.look : presetId) || presetById(DEFAULT_PRESET);
  const dark = theme === 'dark';
  const rooms = {};
  const lightOf = (id) => {
    if (p.rooms[id]) return p.rooms[id];
    if (id === 'garden') { const c = hexToHsl(p.accent.leaf[1]); return hslToHex({ h: c.h, s: Math.min(0.6, c.s * 0.8), l: 0.8 }); }
    return p.rooms[ROOM_FALLBACK[id]] || p.rooms.lobby;
  };
  const toDarkOf = (hex) => (p.deep ? lum(hex, -0.12) : toDark(hex));
  for (const id of ROOM_IDS) {
    const base = dark ? toDarkOf(lightOf(id)) : lightOf(id);
    rooms[id] = {
      floor: base,
      trim: id === 'library' || id === 'booklounge' ? null : lum(base, dark ? 0.04 : -0.05),       // 우드 바닥은 격자선 없음
      alt: lum(base, dark ? -0.02 : -0.03),                                 // 체커 무늬 칸
    };
  }
  const corridor = dark ? lum(toDarkOf(p.corridor), -0.03) : p.corridor;
  const w = p.wall || DEFAULT_WALL;
  const dw = p.deep ? -0.06 : -0.25;
  const wall = dark && p.wall ? { ...w, face: lum(w.face, dw), top: lum(w.top, dw), left: lum(w.left, dw), right: lum(w.right, dw) } : { ...w };
  return {
    id: p.id,
    floorPattern: p.floor || null,
    wall,
    tint: p.tint || null,
    rooms,
    corridor: { floor: corridor, trim: lum(corridor, dark ? 0.04 : -0.05) },
    accent: { ...p.accent, leaf: [...p.accent.leaf] },
    label: dark ? { text: '#c9cfd8', bg: 'rgba(30,34,41,0.9)', border: '#3a4049' } : { text: p.accent.text, bg: 'rgba(255,255,255,0.86)', border: rooms.lobby.trim },
  };
}

// ---------- 층 → 프리셋 배정 ----------
export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * 층 목록 전체에 프리셋을 배정한다 (Map floorId → presetId). 층 id 해시로 고르되, 아직 안 쓰인 프리셋이 남아 있으면
 * 그중에서 고르고(층이 적어도 편의시설이 다 다르게), 다 쓰였으면 번호가 바로 아래인 층과 같은 프리셋일 때 한 칸 민다. 실제 층은 파스텔을 제외한 후보에서, 데모 층은 파스텔을 포함한 전체에서 고른다
 * (데모 층끼리도 구조가 달라 보이게). 입력이 같으면 결과도 같다.
 */
export function assignPresets(floors) {
  const out = new Map();
  const sorted = [...floors].filter(Boolean).sort((a, b) => (a.no || 0) - (b.no || 0) || String(a.id).localeCompare(String(b.id)));
  let prev = null; // { no, preset } 바로 아래 층
  const used = new Set(); // 지금까지 배정된 프리셋 — 층이 프리셋 수 이하면 전부 다르게
  for (const f of sorted) {
    const pool = isDemoFloor(f) ? PRESET_IDS : AUTO_PRESETS;
    const n = pool.length;
    let idx = hashStr(f.id) % n;
    if (used.size < n) { for (let k = 0; k < n && used.has(pool[idx]); k++) idx = (idx + 1) % n; }
    else if (prev && prev.preset === pool[idx] && prev.no === (f.no || 0) - 1) idx = (idx + 1 + (f.no || 0) % (n - 1)) % n;
    const preset = pool[idx];
    out.set(f.id, preset);
    used.add(preset);
    prev = { no: f.no || 0, preset };
  }
  return out;
}
export function autoPresetFor(floor, floors) {
  if (!floor) return DEFAULT_PRESET;
  return assignPresets(floors && floors.length ? floors : [floor]).get(floor.id) || DEFAULT_PRESET;
}

// ---------- 층별 직접 선택 저장 (localStorage aiOffice.floorStyle.<floorId>) ----------
export const STORAGE_PREFIX = 'aiOffice.floorStyle.';
export function createFloorStyleBook(storage) {
  const st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const read = (k) => { try { return st ? st.getItem(k) : null; } catch { return null; } };
  const write = (k, v) => { try { if (!st) return; if (v == null) st.removeItem(k); else st.setItem(k, v); } catch {} };
  // 서버(FE-36)가 층마다 style/styleAuto/styleOverride 를 보내 주면 그 값이 우선이다 (모든 브라우저가 같은 층을 본다).
  // localStorage 는 그 값이 없는 옛 서버용 fallback.
  return {
    /** 직접 고른 프리셋 id, 없으면 null */
    get(floorId, floor) {
      if (floor && 'styleOverride' in floor) return floor.styleOverride && presetById(floor.styleOverride) ? floor.styleOverride : null;
      const v = read(STORAGE_PREFIX + floorId); return v && presetById(v) ? v : null;
    },
    /** presetId 가 null/'' 이면 자동으로 되돌린다 (브라우저 저장; 서버 저장은 floorStylePicker 가 API 로) */
    set(floorId, presetId) { write(STORAGE_PREFIX + floorId, presetId && presetById(presetId) ? presetId : null); },
    auto(floor, floors) { return (floor && floor.styleAuto && PRESET_IDS.includes(floor.styleAuto)) ? floor.styleAuto : autoPresetFor(floor, floors); },
    /**
     * 그릴 스타일 키 (splitStyle 참고). 서버가 정한 style > 직접 선택 > 자동 배정.
     * 테마를 고른 층은 'halloween/<자동 프리셋>' (구조는 그대로). season 이 있으면(설정 '날짜에 맞춰 자동') 직접 고르지 않은 층에 그 테마를 덮는다
     */
    resolve(floor, floors, season = null) {
      if (!floor) return DEFAULT_PRESET;
      const own = this.get(floor.id, floor);   // 직접 고른 프리셋·테마
      const auto = this.auto(floor, floors);
      const chosen = floor.style && presetById(floor.style) ? floor.style : own || auto;
      if (isTheme(chosen)) return `${chosen}/${auto}`;
      if (season && isTheme(season) && !own) return `${season}/${chosen}`;
      return chosen;
    },
  };
}
