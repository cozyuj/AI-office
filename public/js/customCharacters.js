// 커스텀 캐릭터 (FE-56): 사용자가 올린 배경 없는 그림. 뷰어 설정이므로 localStorage 에 dataURL 로 둔다.
// 키: aiOffice.customCharacters.v1 = [{ id, name, src, w, h, at }]   캐릭터 값은 'custom:<id>' (characters.js)
// 고른 캐릭터(aiOffice.characters.v1)와 키를 나눠, 그림이 커서 저장에 실패해도 고르기 설정은 남는다.
import { setCustomCharacters } from './scene/characters.js';

const KEY = 'aiOffice.customCharacters.v1';
export const LIMITS = {
  fileBytes: 10 * 1024 * 1024, // 올리는 파일
  pixels: 8192,                // 원본 한 변
  side: 256,                   // 저장할 그림의 긴 변
  srcChars: 400 * 1024,        // 한 장의 dataURL 길이
  totalChars: 2.5 * 1024 * 1024, // 전부 합친 길이 (localStorage 는 보통 5MB 안팎)
  count: 24,
};

/** 오류 코드 → 안내 문구 (고르기 창에 그대로 보인다) */
export const MESSAGES = {
  'not-image': '이미지 파일이 아닙니다 — 배경이 투명한 PNG 를 올려 주세요',
  'too-big': '파일이 너무 큽니다 — 10MB 이하로 올려 주세요',
  'too-large': '그림이 너무 큽니다 — 한 변 8192px 이하로 올려 주세요',
  'decode': '이미지를 읽지 못했습니다 — 다른 파일로 해 보세요',
  'empty': '그림이 전부 투명합니다',
  'too-many': '커스텀 캐릭터가 너무 많습니다 — 안 쓰는 것을 지워 주세요',
  'quota': '저장 공간이 부족합니다 — 안 쓰는 커스텀 캐릭터를 지워 주세요',
  'opaque': '배경이 투명하지 않은 그림이라 사각형 그대로 보입니다',
  'added': '추가했습니다 — 저장을 누르면 이 대상에 적용됩니다',
};

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((c) => c && /^[a-z0-9]{1,32}$/.test(c.id) && typeof c.src === 'string' && c.src.startsWith('data:image/')) : [];
  } catch { return []; }
}

const sizeOf = (list) => list.reduce((n, c) => n + c.src.length, 0);
const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(-10);

export function createCustomCharacters() {
  let list = load();
  const listeners = new Set();
  setCustomCharacters(list);

  function changed() { setCustomCharacters(list); for (const fn of listeners) fn(); }
  /** 저장. 공간이 모자라면(QuotaExceeded) 이전 목록으로 되돌리고 'quota' */
  function save(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { return 'quota'; }
    list = next; changed();
    return null;
  }

  /** 다듬은 그림 { src, w, h, name } 을 더한다 → { value: 'custom:<id>' } 또는 { error } */
  function add(img) {
    if (!img || typeof img.src !== 'string' || !img.src.startsWith('data:image/')) return { error: 'decode' };
    if (list.length >= LIMITS.count) return { error: 'too-many' };
    if (img.src.length > LIMITS.srcChars || sizeOf(list) + img.src.length > LIMITS.totalChars) return { error: 'quota' };
    const c = { id: newId(), name: String(img.name || '').slice(0, 40), src: img.src, w: img.w | 0, h: img.h | 0, at: Date.now() };
    const error = save([...list, c]);
    return error ? { error } : { value: `custom:${c.id}` };
  }
  function remove(value) {
    const id = String(value).replace(/^custom:/, '');
    if (!list.some((c) => c.id === id)) return;
    save(list.filter((c) => c.id !== id));
  }
  const has = (value) => list.some((c) => `custom:${c.id}` === value);

  return {
    has, add, remove,
    list: () => list.map((c) => ({ ...c, value: `custom:${c.id}` })),
    bytes: () => sizeOf(list),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// ---------- 그림 다듬기 ----------
/** 알파가 min 이상인 픽셀의 경계 상자. 전부 투명하면 null. opaque: 투명한 픽셀이 하나도 없다 */
export function alphaBounds(data, w, h, min = 16) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, clear = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a < 250) clear = true;
      if (a < min) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, opaque: !clear };
}

/** 긴 변이 side 를 넘으면 줄인 크기 */
export function fitSize(w, h, side = LIMITS.side) {
  const k = Math.min(1, side / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * 파일 → { src(dataURL), w, h, name, opaque } 또는 { error }. 브라우저에서만.
 * 투명 여백을 잘라내고 긴 변을 LIMITS.side 로 줄인다. PNG 가 크면 WebP 와 비교해 작은 쪽
 */
export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type || '')) return { error: 'not-image' };
  if (file.size > LIMITS.fileBytes) return { error: 'too-big' };
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return { error: 'decode' }; }
  try {
    const { width: W, height: H } = bmp;
    if (!W || !H) return { error: 'decode' };
    if (W > LIMITS.pixels || H > LIMITS.pixels) return { error: 'too-large' };
    const src = document.createElement('canvas');
    src.width = W; src.height = H;
    const sx = src.getContext('2d', { willReadFrequently: true });
    sx.drawImage(bmp, 0, 0);
    const box = alphaBounds(sx.getImageData(0, 0, W, H).data, W, H);
    if (!box) return { error: 'empty' };
    const out = document.createElement('canvas');
    const size = fitSize(box.w, box.h);
    out.width = size.w; out.height = size.h;
    const ox = out.getContext('2d');
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high';
    ox.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, size.w, size.h);
    let url = out.toDataURL('image/png');
    if (url.length > 120 * 1024) {
      const webp = out.toDataURL('image/webp', 0.92);
      if (webp.startsWith('data:image/webp') && webp.length < url.length) url = webp;
    }
    return { src: url, w: size.w, h: size.h, name: String(file.name || '').replace(/\.[^.]+$/, ''), opaque: box.opaque };
  } finally { bmp.close?.(); }
}
