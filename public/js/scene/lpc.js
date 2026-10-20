// LPC 스프라이트 캐릭터: manifest 의 레이어 PNG 를 팔레트 치환으로 색 입히고 zPos 순으로 합성해 그린다.
// spec = { body:'male'|'female', skin, hair:{id,color}, top:{id,color}, bottom:{id,color}, shoes:{id,color} }
// top.color 'auto' 는 세션 색에 가까운 천 팔레트.

const FRAME = 64;
const ROWS = ['up', 'left', 'down', 'right'];
const SESSION_RAMP = { '#e8683a': 'orange', '#3b6fd6': 'blue', '#2fa36b': 'green', '#9b59b6': 'purple', '#e0a526': 'yellow', '#1fa2b5': 'teal', '#d9507a': 'pink', '#6b7fd6': 'lavender' };

/** 순수 함수: 픽셀 배열에서 from 램프 색을 to 램프 색으로 바꾼다 (정확히 일치하는 색만) */
export function recolorPixels(data, fromRamp, toRamp) {
  const map = new Map();
  const n = Math.min(fromRamp.length, toRamp.length);
  for (let i = 0; i < n; i++) map.set(hexToInt(fromRamp[i]), hexToRgb(toRamp[i]));
  let changed = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue;
    const t = map.get((data[p] << 16) | (data[p + 1] << 8) | data[p + 2]);
    if (t) { data[p] = t[0]; data[p + 1] = t[1]; data[p + 2] = t[2]; changed++; }
  }
  return changed;
}
function hexToInt(h) { return parseInt(h.slice(1), 16); }
function hexToRgb(h) { const v = hexToInt(h); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }

export function createLpc(manifest, baseUrl = '/assets/lpc') {
  const images = new Map();   // path → { img, ready, failed }
  const recolored = new Map(); // key → canvas
  const composed = new Map();  // key → { canvas, frames }
  const pending = new Set();

  const items = manifest.items;
  const pal = manifest.palettes;
  const byId = (cat, id) => items[cat].find((i) => i.id === id);

  const options = {
    body: [['male', '남성 체형'], ['female', '여성 체형']],
    skin: Object.entries(pal.body.ramps).map(([k, ramp]) => [k, ramp[3]]),
    hair: [['none', '민머리'], ...items.hair.map((i) => [i.id, i.name])],
    hairColors: Object.entries(pal.hair.ramps).filter(([k]) => k !== 'orange' || true).map(([k, ramp]) => [k, ramp[3]]),
    top: items.top.map((i) => [i.id, i.name]),
    bottom: items.bottom.map((i) => [i.id, i.name]),
    shoes: items.shoes.map((i) => [i.id, i.name]),
    clothColors: [['auto', 'auto'], ...Object.entries(pal.cloth.ramps).map(([k, ramp]) => [k, ramp[3]])],
  };

  const defaults = {
    claude: { body: 'male', skin: 'light', hair: { id: 'plain', color: 'dark_brown' }, top: { id: 'tshirt', color: 'auto' }, bottom: { id: 'pants', color: 'navy' }, shoes: { id: 'basic', color: 'charcoal' } },
    sub: { body: 'female', skin: 'amber', hair: { id: 'bob', color: 'black' }, top: { id: 'cardigan', color: 'sky' }, bottom: { id: 'cuffed', color: 'navy' }, shoes: { id: 'revised', color: 'brown' } },
    me: { body: 'male', skin: 'light', hair: { id: 'bangs', color: 'black' }, top: { id: 'longsleeve', color: 'white' }, bottom: { id: 'formal', color: 'charcoal' }, shoes: { id: 'revised', color: 'black' } },
  };

  const has = (list, v) => list.some(([k]) => k === v);
  function normalize(spec, base = defaults.claude) {
    const s = spec && typeof spec === 'object' ? spec : {};
    return {
      body: has(options.body, s.body) ? s.body : base.body,
      skin: has(options.skin, s.skin) ? s.skin : base.skin,
      hair: { id: has(options.hair, s.hair?.id) ? s.hair.id : base.hair.id, color: has(options.hairColors, s.hair?.color) ? s.hair.color : base.hair.color },
      top: { id: has(options.top, s.top?.id) ? s.top.id : base.top.id, color: has(options.clothColors, s.top?.color) ? s.top.color : base.top.color },
      bottom: { id: has(options.bottom, s.bottom?.id) ? s.bottom.id : base.bottom.id, color: has(options.clothColors, s.bottom?.color) ? s.bottom.color : base.bottom.color },
      shoes: { id: has(options.shoes, s.shoes?.id) ? s.shoes.id : base.shoes.id, color: has(options.clothColors, s.shoes?.color) ? s.shoes.color : base.shoes.color },
    };
  }

  function randomSpec(seed = Math.random()) {
    let x = Math.floor(seed * 2 ** 31) || 1;
    const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
    const pick = (arr) => arr[Math.floor(r() * arr.length)][0];
    const cloth = options.clothColors.filter(([k]) => k !== 'auto');
    return normalize({
      body: pick(options.body), skin: pick(options.skin),
      hair: { id: pick(options.hair), color: pick(options.hairColors) },
      top: { id: pick(options.top), color: pick(cloth) },
      bottom: { id: pick(options.bottom), color: pick(cloth) },
      shoes: { id: pick(options.shoes), color: pick(cloth) },
    });
  }

  // ---------- 이미지 ----------
  function image(path) {
    let e = images.get(path);
    if (!e) {
      const img = new Image();
      e = { img, ready: false, failed: false };
      img.onload = () => { e.ready = true; };
      img.onerror = () => { e.failed = true; };
      img.src = `${baseUrl}/sheets/${path}`;
      images.set(path, e);
    }
    return e;
  }

  function recolorSheet(path, material, variant) {
    const key = `${path}|${material}|${variant}`;
    if (recolored.has(key)) return recolored.get(key);
    const e = image(path);
    if (!e.ready) return null;
    const c = document.createElement('canvas');
    c.width = e.img.naturalWidth; c.height = e.img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(e.img, 0, 0);
    const p = pal[material];
    if (p && variant && variant !== p.base && p.ramps[variant]) {
      const id = ctx.getImageData(0, 0, c.width, c.height);
      recolorPixels(id.data, p.ramps[p.base], p.ramps[variant]);
      ctx.putImageData(id, 0, 0);
    }
    recolored.set(key, c);
    return c;
  }

  /** spec 의 레이어 목록 (zPos 순) */
  function layersOf(spec, sessionColor) {
    const bt = spec.body;
    const topColor = spec.top.color === 'auto' ? (SESSION_RAMP[(sessionColor || '').toLowerCase()] || 'orange') : spec.top.color;
    const out = [];
    const base = manifest.base;
    out.push({ zPos: base.body[bt].zPos, path: base.body[bt].path, anims: base.body[bt].anims, material: 'body', variant: spec.skin });
    out.push({ zPos: base.head[bt].zPos, path: base.head[bt].path, anims: base.head[bt].anims, material: 'body', variant: spec.skin });
    const add = (cat, id, variant) => {
      const it = byId(cat, id);
      if (!it) return;
      for (const l of it.layers) {
        const p = l.paths[bt] || l.paths.male;
        if (p) out.push({ zPos: l.zPos, path: p.path, anims: p.anims, material: it.material, variant });
      }
    };
    if (spec.hair.id !== 'none') add('hair', spec.hair.id, spec.hair.color);
    add('top', spec.top.id, topColor);
    add('bottom', spec.bottom.id, spec.bottom.color);
    add('shoes', spec.shoes.id, spec.shoes.color);
    return out.sort((a, b) => a.zPos - b.zPos);
  }

  /** 합성된 시트. 아직 로딩 중이면 null (로딩을 시작해 둔다) */
  function sheet(spec, anim, sessionColor) {
    const layers = layersOf(spec, sessionColor);
    if (!layers.every((l) => l.anims.includes(anim))) return null;
    const key = `${JSON.stringify(spec)}|${sessionColor || ''}|${anim}`;
    if (composed.has(key)) return composed.get(key);
    const parts = [];
    let waiting = false;
    for (const l of layers) {
      const c = recolorSheet(`${l.path}${anim}.png`, l.material, l.variant);
      if (!c) { if (image(`${l.path}${anim}.png`).failed) return null; waiting = true; continue; }
      parts.push(c);
    }
    if (waiting) { pending.add(key); return null; }
    const c = document.createElement('canvas');
    c.width = parts[0].width; c.height = parts[0].height;
    const ctx = c.getContext('2d');
    for (const p of parts) ctx.drawImage(p, 0, 0);
    const out = { canvas: c, frames: c.width / FRAME };
    composed.set(key, out);
    pending.delete(key);
    return out;
  }

  /**
   * 발 위치 (fx, fy) 에 그린다. o: { dir:'up'|'left'|'down'|'right', walking, walkT, now, sitting, sessionColor, scale }
   * 그렸으면 true, 아직 로딩 중이면 false
   */
  function draw(ctx, fx, fy, spec, o = {}) {
    const dir = ROWS.includes(o.dir) ? o.dir : 'down';
    let anim = 'walk', frame = 0;
    if (o.sitting) {
      const s = sheet(spec, 'sit', o.sessionColor);
      if (s) { anim = 'sit'; frame = 0; }
    } else if (o.walking) {
      frame = 1 + Math.floor((o.walkT || 0) * 11) % 8;
    } else {
      const s = sheet(spec, 'idle', o.sessionColor);
      if (s) { anim = 'idle'; frame = Math.floor((o.now || 0) / 900) % 2; }
    }
    const s = sheet(spec, anim, o.sessionColor) || (anim !== 'walk' ? sheet(spec, 'walk', o.sessionColor) : null);
    if (!s) return false;
    if (frame >= s.frames) frame = 0;
    const row = ROWS.indexOf(dir);
    const sc = o.scale || 1;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.canvas, frame * FRAME, row * FRAME, FRAME, FRAME, fx - 32 * sc, fy - 60 * sc, FRAME * sc, FRAME * sc);
    ctx.restore();
    return true;
  }

  /** 세션 색 → 램프 이름 (커스터마이즈 미리보기용) */
  function rampForSession(color) { return SESSION_RAMP[(color || '').toLowerCase()] || 'orange'; }

  return { manifest, options, defaults, normalize, randomSpec, sheet, draw, rampForSession, FRAME, ROWS };
}

export async function loadLpc(baseUrl = '/assets/lpc') {
  try {
    const res = await fetch(`${baseUrl}/manifest.json`);
    if (!res.ok) return null;
    return createLpc(await res.json(), baseUrl);
  } catch { return null; }
}
