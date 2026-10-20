#!/usr/bin/env node
'use strict';
// Universal LPC Spritesheet Character Generator 에서 선택한 레이어 PNG 만 public/assets/lpc/ 로 들여온다.
//   node scripts/fetch-lpc.js [--src <repo 경로>]
// --src 가 없으면 임시 폴더에 얕은 클론을 받는다. 결과: sheets/**/{walk,idle,sit}.png, manifest.json, CREDITS.csv
//
// 라이선스: 에셋마다 다르다 (CC0 / OGA-BY / CC-BY / CC-BY-SA / GPL). CREDITS.csv 를 반드시 함께 배포한다.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const REPO = 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git';
const OUT = path.join(__dirname, '..', 'public', 'assets', 'lpc');
const BODY_TYPES = ['male', 'female'];
const ANIMS = ['walk', 'idle', 'sit'];

// 들여올 항목: [카테고리, id, 표시 이름, layer_1.male 경로 접두사]
const ITEMS = [
  ['hair', 'plain', '짧은 머리', 'hair/plain/'],
  ['hair', 'bangs', '앞머리', 'hair/bangs/'],
  ['hair', 'page', '페이지', 'hair/page/'],
  ['hair', 'pixie', '픽시', 'hair/pixie/'],
  ['hair', 'bob', '단발', 'hair/bob/'],
  ['hair', 'long', '긴 머리', 'hair/long/'],
  ['hair', 'ponytail', '포니테일', 'hair/ponytail/'],
  ['hair', 'high_ponytail', '높은 포니', 'hair/high_ponytail/'],
  ['hair', 'curly_short', '곱슬', 'hair/curly_short/'],
  ['hair', 'afro', '아프로', 'hair/afro/'],
  ['hair', 'buzzcut', '버즈컷', 'hair/buzzcut/'],
  ['top', 'tshirt', '티셔츠', 'torso/clothes/shortsleeve/tshirt/'],
  ['top', 'polo', '폴로', 'torso/clothes/shortsleeve/shortsleeve_polo/'],
  ['top', 'longsleeve', '긴팔', 'torso/clothes/longsleeve/longsleeve2_vneck/'],
  ['top', 'cardigan', '가디건', 'torso/clothes/shortsleeve/shortsleeve_cardigan/'],
  ['bottom', 'pants', '바지', 'legs/pants/'],
  ['bottom', 'formal', '정장 바지', 'legs/formal/'],
  ['bottom', 'cuffed', '롤업 바지', 'legs/cuffed/'],
  ['bottom', 'shorts', '반바지', 'legs/shorts/shorts/'],
  ['bottom', 'skirt', '치마', 'legs/skirts/plain/'],
  ['shoes', 'basic', '운동화', 'feet/shoes/basic/'],
  ['shoes', 'revised', '구두', 'feet/shoes/revised/'],
  ['shoes', 'boots', '부츠', 'feet/boots/basic/'],
  ['shoes', 'sandals', '샌들', 'feet/sandals/'],
];
const BODY = { male: 'body/bodies/male/', female: 'body/bodies/female/' };
const HEAD = { male: 'head/heads/human/male/', female: 'head/heads/human/female/' };
const PALETTES = {
  body: { file: 'palette_definitions/body/body_ulpc.json', base: 'light', pick: ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'] },
  hair: { file: 'palette_definitions/hair/hair_ulpc.json', base: 'orange', pick: ['black', 'raven', 'dark_brown', 'chestnut', 'light_brown', 'blonde', 'platinum', 'gray', 'white', 'ginger', 'red', 'pink', 'purple', 'blue', 'green'] },
  cloth: { file: 'palette_definitions/cloth/cloth_ulpc.json', base: 'white', pick: ['white', 'gray', 'charcoal', 'black', 'red', 'orange', 'yellow', 'green', 'forest', 'teal', 'sky', 'blue', 'navy', 'purple', 'lavender', 'pink', 'rose', 'tan', 'brown'] },
};

// ---------- 소스 준비 ----------
let src = null;
const i = process.argv.indexOf('--src');
if (i >= 0) src = path.resolve(process.argv[i + 1]);
if (!src || !fs.existsSync(path.join(src, 'sheet_definitions'))) {
  src = path.join(os.tmpdir(), 'ai-office-lpc-src');
  if (!fs.existsSync(path.join(src, 'sheet_definitions'))) {
    console.log(`cloning ${REPO} → ${src} (수백 MB, 시간이 걸립니다)`);
    execSync(`git clone --depth 1 "${REPO}" "${src}"`, { stdio: 'inherit' });
  }
}
console.log(`source: ${src}`);

// ---------- 정의 스캔 ----------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.json') && !e.name.startsWith('meta_')) out.push(p);
  }
  return out;
}
const defs = [];
for (const f of walk(path.join(src, 'sheet_definitions'))) {
  try { defs.push({ file: path.relative(path.join(src, 'sheet_definitions'), f), def: JSON.parse(fs.readFileSync(f, 'utf8')) }); } catch {}
}
function findDef(prefix) {
  return defs.find(({ def }) => def.layer_1 && typeof def.layer_1.male === 'string' && def.layer_1.male.startsWith(prefix));
}

// ---------- 복사 ----------
const copied = new Set();
function copySheets(layerPath) {
  const have = [];
  for (const anim of ANIMS) {
    const from = path.join(src, 'spritesheets', layerPath, `${anim}.png`);
    if (!fs.existsSync(from)) continue;
    const rel = path.join(layerPath, `${anim}.png`);
    const to = path.join(OUT, 'sheets', rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.add(rel.replace(/\\/g, '/'));
    have.push(anim);
  }
  return have;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });

const manifest = {
  source: REPO,
  frame: 64,
  animations: { walk: { frames: 9, rows: ['up', 'left', 'down', 'right'] }, idle: { frames: 2, rows: ['up', 'left', 'down', 'right'] }, sit: { frames: 3, rows: ['up', 'left', 'down', 'right'] } },
  bodyTypes: BODY_TYPES,
  base: { body: {}, head: {} },
  items: { hair: [], top: [], bottom: [], shoes: [] },
  palettes: {},
};

for (const bt of BODY_TYPES) {
  manifest.base.body[bt] = { path: BODY[bt], zPos: 10, material: 'body', anims: copySheets(BODY[bt]) };
  manifest.base.head[bt] = { path: HEAD[bt], zPos: 100, material: 'body', anims: copySheets(HEAD[bt]) };
}

let missing = 0;
for (const [cat, id, name, prefix] of ITEMS) {
  const hit = findDef(prefix);
  if (!hit) { console.warn(`  ! 정의 없음: ${prefix}`); missing++; continue; }
  const { def, file } = hit;
  const material = def.recolors?.material || (def.recolors?.color_1?.material) || 'cloth';
  const layers = [];
  for (const key of Object.keys(def).filter((k) => /^layer_\d+$/.test(k)).sort()) {
    const layer = def[key];
    const paths = {};
    for (const bt of BODY_TYPES) {
      const p = layer[bt] || layer.male;
      if (!p) continue;
      const anims = copySheets(p);
      if (anims.length) paths[bt] = { path: p, anims };
    }
    if (Object.keys(paths).length) layers.push({ zPos: layer.zPos, paths });
  }
  if (!layers.length) { console.warn(`  ! 시트 없음: ${prefix}`); missing++; continue; }
  manifest.items[cat].push({ id, name, material, layers, def: file, licenses: [...new Set((def.credits || []).flatMap((c) => c.licenses || []))] });
  console.log(`  + ${cat}/${id} (${name}) layers=${layers.length} z=${layers.map((l) => l.zPos).join(',')} [${file}]`);
}

// ---------- 팔레트 ----------
for (const [mat, cfg] of Object.entries(PALETTES)) {
  const all = JSON.parse(fs.readFileSync(path.join(src, cfg.file), 'utf8'));
  const ramps = {};
  for (const k of [cfg.base, ...cfg.pick]) if (all[k]) ramps[k] = all[k].map((c) => c.toLowerCase());
  manifest.palettes[mat] = { base: cfg.base, ramps };
}

// ---------- 크레딧 ----------
const credits = fs.readFileSync(path.join(src, 'CREDITS.csv'), 'utf8').split('\n');
const header = credits[0];
const rows = credits.slice(1).filter((line) => {
  const m = /^"([^"]+)"/.exec(line);
  if (!m) return false;
  const file = m[1];
  if (copied.has(file)) return true;
  // 디렉터리 단위 크레딧 (파일명이 폴더로 끝나는 경우)
  return [...copied].some((c) => c.startsWith(file.replace(/\/?$/, '/')));
});
fs.writeFileSync(path.join(OUT, 'CREDITS.csv'), [header, ...rows].join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, 'README.md'), `# LPC 캐릭터 에셋

이 폴더의 스프라이트는 [Universal LPC Spritesheet Character Generator](${REPO}) 에서 \`scripts/fetch-lpc.js\` 로 가져온 것이다.
에셋마다 저자와 라이선스가 다르다 (CC0 / OGA-BY 3.0 / CC-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0). 전체 목록은 \`CREDITS.csv\`.
이 프로젝트에서 재배포할 때는 CREDITS.csv 를 함께 배포하고, 가능한 경우 OGA-BY / CC-BY 조건(저작자 표시)을 따른다.
`);

let bytes = 0;
for (const rel of copied) bytes += fs.statSync(path.join(OUT, 'sheets', rel)).size;
console.log(`\n${copied.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${OUT}`);
console.log(`credits: ${rows.length} rows, missing: ${missing}`);
