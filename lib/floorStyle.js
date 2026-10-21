'use strict';
// 층 인테리어 프리셋 — 서버 쪽 (FE-36). 클라이언트 public/js/scene/floorStyle.js · layouts.js 와 같은 규칙을 CommonJS 로 둔다
// (브라우저 ESM 을 서버가 바로 쓸 수 없어 작은 표를 복제하고, test/floorStyleShared.test.js 가 둘이 일치하는지 고정한다).
// 서버는 층마다 프리셋을 정해(직접 선택 > 층 id 해시) 휴식 방 cafe/terrace 를 그 층의 편의시설 이름·아이콘·말풍선으로 바꿔 말한다.

const PRESET_IDS = ['warm', 'cool', 'mint', 'lavender', 'sand', 'pastel'];
const DEMO_PRESET = 'pastel';
const AUTO_PRESETS = PRESET_IDS.filter((id) => id !== DEMO_PRESET);   // 실제 층의 자동 배정 후보 (데모 층은 전체)
const PRESET_LAYOUT = { warm: 'classic', cool: 'studio', mint: 'fitness', lavender: 'play', sand: 'canteen', pastel: 'classic' };
// 레이아웃별 휴식 방 별칭: 서버 방 id → 그 층의 편의시설
const LAYOUT_REST = {
  classic: { cafe: 'cafe', terrace: 'terrace' },
  studio: { cafe: 'studio', terrace: 'seminar' },
  fitness: { cafe: 'gym', terrace: 'garden' },
  play: { cafe: 'booklounge', terrace: 'game' },
  canteen: { cafe: 'canteen', terrace: 'nap' },
};
// 휴식 방 라벨·아이콘·기본 말풍선
const ROOM_REST = {
  lounge: { label: '휴게실', icon: '🛋️', bubble: '휴식 중' },
  cafe: { label: '카페', icon: '☕', bubble: '커피 마시는 중' },
  terrace: { label: '테라스', icon: '🌤️', bubble: '바람 쐬는 중' },
  gym: { label: '헬스장', icon: '🏃', bubble: '운동 중' },
  garden: { label: '옥상정원', icon: '🌸', bubble: '정원 산책 중' },
  canteen: { label: '구내식당', icon: '🍱', bubble: '밥 먹는 중' },
  nap: { label: '수면실', icon: '😴', bubble: '낮잠 자는 중' },
  game: { label: '게임룸', icon: '🎮', bubble: '게임 한 판' },
  booklounge: { label: '북 라운지', icon: '📖', bubble: '책 읽는 중' },
  studio: { label: '스튜디오', icon: '🎙️', bubble: '녹음 중' },
  seminar: { label: '세미나실', icon: '🎓', bubble: '세미나 듣는 중' },
};

function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function isDemoFloor(f) { return !!f && typeof f.id === 'string' && f.id.startsWith('/demo/'); }

/** 층 목록 → Map(floorId → presetId). 층 id 해시로 고르되, 아직 안 쓰인 프리셋이 남아 있으면 그중에서(층이 적어도 시설이 다 다르게), 다 쓰였으면 바로 아래 층과만 안 겹치게. 클라이언트 assignPresets 와 동일 */
function assignPresets(floors) {
  const out = new Map();
  const sorted = [...floors].filter(Boolean).sort((a, b) => (a.no || 0) - (b.no || 0) || String(a.id).localeCompare(String(b.id)));
  let prev = null;
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

/** 서버 휴식 방 id → 프리셋 층에서 실제 방 id */
function restRoomIn(presetId, room) {
  const layout = PRESET_LAYOUT[presetId] || PRESET_LAYOUT.warm;
  return (LAYOUT_REST[layout] && LAYOUT_REST[layout][room]) || room;
}
/** 휴식 방의 라벨·아이콘·말풍선 (프리셋 층 기준). 모르는 방은 원래 id 그대로 */
function restInfo(presetId, room) {
  const id = restRoomIn(presetId, room);
  return ROOM_REST[id] || { label: id, icon: '☕', bubble: '휴식 중' };
}

module.exports = { PRESET_IDS, DEMO_PRESET, AUTO_PRESETS, PRESET_LAYOUT, LAYOUT_REST, ROOM_REST, hashStr, isDemoFloor, assignPresets, restRoomIn, restInfo };
