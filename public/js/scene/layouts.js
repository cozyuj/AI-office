// 층 레이아웃 생성기 (FE-35): 셀 격자에 방을 배치하고, 방마다 크기에 맞는 가구·서 있는 자리·휴식 명소를 만든다.
// 순수 데이터 모듈 — map.js 가 setLayout() 으로 결과를 받아 live 상수에 채운다. canvas·DOM 의존 없음.
//
// 격자는 x 1..35, y 1..21. 열(col) 4개는 x0 = 1·10·19·28 (폭 8), 열 사이 x = 9·18·27 은 세로 복도.
// 행 띠(band): top y1~7 · mid y10~15 · bot y18~21, 사이 y 8~9 · 16~17 은 가로 복도. 편의시설용 띠: tall y10~21 · hall y1~15.
// 문은 가로 벽에만 난다 (복도 쪽, 셀 x0+3·x0+4).

export const GRID = { x0: 1, y0: 1, x1: 35, y1: 21 };
export const CELL_W = 8;
export const COLS = [1, 10, 19, 28];
export const BANDS = {
  top: { y0: 1, y1: 7, doors: ['s'] },
  mid: { y0: 10, y1: 15, doors: ['n', 's'] },
  bot: { y0: 18, y1: 21, doors: ['n'] },
  tall: { y0: 10, y1: 21, doors: ['n'] },
  hall: { y0: 1, y1: 15, doors: ['s'] },
};
export const DOOR_OFFSETS = [3, 4];

// 서버가 쓰는 방 id. 업무 방 9개는 모든 레이아웃에 있어야 하고, 휴식 방 cafe/terrace 는 레이아웃의 편의시설로 별칭된다.
export const CORE_ROOMS = ['library', 'dev', 'research', 'meeting', 'lounge', 'server', 'mydesk', 'lobby', 'elevator'];
export const REST_ALIAS_KEYS = ['cafe', 'terrace'];

const S = (tile, icon, bubble, stay = [10000, 30000]) => ({ tile, icon, bubble, stay });
const A = (tile, icon, bubble, stay) => ({ tile, icon, bubble, stay });

// ---------- 방 정의: 라벨·바닥 무늬·가구 생성기 ----------
// furnish(r) → { furniture, slots, spots?, ambient?, seat?, spawn? }. r = { x0, y0, x1, y1, w, h }
export const ROOM_DEFS = {
  library: { label: '자료실', pattern: 'wood', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    for (let i = 0; i < 8; i++) { F.push(f('shelf', x0 + i, y0, { seed: x0 + i })); slots.push([x0 + i, y0 + 1]); }
    if (h >= 6) {
      for (let i = 1; i <= 6; i++) { F.push(f('shelf', x0 + i, y0 + 3, { seed: x0 + i + 10 })); slots.push([x0 + i, y0 + 4]); }
      if (h >= 7) {
        F.push(f('roundtable', x0 + 2, y0 + 5, { w: 2, d: 1 }), f('chair', x0 + 2, y0 + 6, { solid: false, face: 'n' }), f('chair', x0 + 3, y0 + 6, { solid: false, face: 'n' }), f('plant', x0 + 7, y0 + 6));
        slots.push([x0 + 2, y0 + 6], [x0 + 3, y0 + 6]);
      } else {
        F.push(f('roundtable', x0 + 3, y0 + 5, { w: 2, d: 1 }), f('chair', x0 + 2, y0 + 5, { solid: false, face: 'e' }), f('chair', x0 + 5, y0 + 5, { solid: false, face: 'w' }), f('plant', x0 + 7, y0 + 5));
        slots.push([x0 + 2, y0 + 5], [x0 + 5, y0 + 5]);
      }
    } else {
      F.push(f('roundtable', x0 + 2, y0 + 2, { w: 2, d: 1 }), f('chair', x0 + 2, y0 + 3, { solid: false, face: 'n' }), f('chair', x0 + 3, y0 + 3, { solid: false, face: 'n' }), f('plant', x0 + 7, y0 + 3));
      slots.push([x0 + 2, y0 + 3], [x0 + 3, y0 + 3], [x0 + 5, y0 + 2], [x0 + 6, y0 + 2]);
    }
    return { furniture: F, slots };
  } },
  dev: { label: '개발실', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    const rows = h >= 7 ? [1, 4] : h >= 6 ? [1, 3] : [1];
    const cols = h >= 6 ? [1, 3, 5] : [1, 3, 5, 7];
    for (const dy of rows) for (const dx of cols) { F.push(f('desk', x0 + dx, y0 + dy), f('chair', x0 + dx, y0 + dy + 1, { solid: false, face: 'n' })); slots.push([x0 + dx, y0 + dy + 1]); }
    if (h >= 6) {
      F.push(f('plant', x0 + 7, y0), f('cabinet', x0 + 7, y0 + h - 1), f('plant', x0, y0 + h - 1));
      for (const dy of rows) slots.push([x0 + 6, y0 + dy + 1]);
      slots.push([x0 + 2, y0 + h - 1], [x0 + 4, y0 + h - 1]);
    } else {
      F.push(f('plant', x0, y0), f('cabinet', x0, y0 + 3));
      slots.push([x0 + 2, y0 + 3], [x0 + 4, y0 + 3], [x0 + 6, y0 + 3]);
    }
    return { furniture: F, slots };
  } },
  research: { label: '정보검색실', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    F.push(f('wallscreen', x0 + 1, y0, { w: 2 }), f('wallscreen', x0 + 4, y0, { w: 2 }), f('globe', x0 + 7, y0));
    const dy = h >= 6 ? 3 : 2;
    F.push(f('desk', x0 + 2, y0 + dy), f('chair', x0 + 2, y0 + dy + 1, { solid: false, face: 'n' }), f('desk', x0 + 5, y0 + dy), f('chair', x0 + 5, y0 + dy + 1, { solid: false, face: 'n' }));
    F.push(f('plant', x0, y0 + h - 1));
    slots.push([x0 + 1, y0 + 1], [x0 + 2, y0 + 1], [x0 + 4, y0 + 1], [x0 + 5, y0 + 1], [x0 + 2, y0 + dy + 1], [x0 + 5, y0 + dy + 1]);
    if (h >= 6) slots.push([x0 + 3, y0 + 5], [x0 + 6, y0 + 5]);
    slots.push([x0 + 7, y0 + 2], [x0, y0 + 2]);
    const ambient = [A([x0 + 7, y0 + 3], '🪟', '창밖 구경', [5000, 9000]), A([x0 + 7, y0 + 1], '🪟', '창밖 구경', [5000, 9000])];
    return { furniture: F, slots, ambient };
  } },
  meeting: { label: '회의실', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    if (h >= 6) {
      F.push(f('whiteboard', x0, y0 + 1, { d: 3 }), f('table', x0 + 2, y0 + 2, { w: 4, d: 2 }));
      for (let i = 2; i <= 5; i++) { F.push(f('chair', x0 + i, y0 + 1, { solid: false, face: 's' }), f('chair', x0 + i, y0 + 4, { solid: false, face: 'n' })); }
      for (const dy of [2, 3]) F.push(f('chair', x0 + 1, y0 + dy, { solid: false, face: 'e' }), f('chair', x0 + 6, y0 + dy, { solid: false, face: 'w' }));
      F.push(f('plant', x0 + 7, y0 + h - 1));
      for (let i = 2; i <= 5; i++) slots.push([x0 + i, y0 + 1]);
      for (let i = 2; i <= 5; i++) slots.push([x0 + i, y0 + 4]);
      slots.push([x0 + 1, y0 + 2], [x0 + 1, y0 + 3], [x0 + 6, y0 + 2], [x0 + 6, y0 + 3], [x0 + 7, y0 + 1], [x0 + 7, y0 + 3]);
      if (h >= 7) { F.push(f('plant', x0, y0 + 6)); slots.push([x0 + 3, y0 + 6], [x0 + 4, y0 + 6]); }
    } else {
      F.push(f('whiteboard', x0, y0 + 1, { d: 2 }), f('table', x0 + 2, y0 + 1, { w: 4, d: 2 }));
      for (let i = 2; i <= 5; i++) { F.push(f('chair', x0 + i, y0, { solid: false, face: 's' }), f('chair', x0 + i, y0 + 3, { solid: false, face: 'n' })); slots.push([x0 + i, y0], [x0 + i, y0 + 3]); }
      for (const dy of [1, 2]) { F.push(f('chair', x0 + 6, y0 + dy, { solid: false, face: 'w' })); slots.push([x0 + 6, y0 + dy]); }
      F.push(f('plant', x0 + 7, y0 + 3));
      slots.push([x0 + 7, y0], [x0 + 7, y0 + 2]);
    }
    return { furniture: F, slots };
  } },
  lounge: { label: '휴게실', pattern: 'checker', rest: { bubble: '휴식 중', icon: '🛋️' }, furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [], spots = [];
    F.push(f('sofa', x0 + 1, y0 + 1, { w: 3 }), f('counter', x0 + 6, y0, { w: 2 }), f('plant', x0, y0));
    if (h >= 6) {
      F.push(f('coffeetable', x0 + 1, y0 + 3, { w: 3 }), f('armchair', x0 + 5, y0 + 1), f('armchair', x0 + 5, y0 + 3), f('vending', x0 + 7, y0 + 4), f('plant', x0, y0 + 5));
      for (let i = 1; i <= 5; i++) slots.push([x0 + i, y0 + 2]);
      slots.push([x0 + 2, y0 + 4], [x0 + 4, y0 + 4], [x0 + 6, y0 + 2], [x0 + 6, y0 + 4], [x0 + 3, y0 + 5]);
      spots.push(S([x0 + 6, y0 + 1], '☕', '커피 한 잔'), S([x0 + 7, y0 + 1], '☕', '커피 리필'), S([x0 + 1, y0 + 2], '🛋️', '소파에서 잠깐'), S([x0 + 2, y0 + 2], '🛋️', '소파에 기대기'),
        S([x0 + 3, y0 + 2], '📺', '멍 때리는 중'), S([x0 + 4, y0 + 1], '🙆', '기지개 켜기', [10000, 18000]), S([x0 + 6, y0 + 4], '🥤', '자판기 구경', [10000, 18000]), S([x0 + 7, y0 + 3], '🥤', '음료 고르는 중', [10000, 18000]),
        S([x0, y0 + 1], '🌿', '화분 구경', [10000, 16000]), S([x0, y0 + 4], '🌿', '화분에 물 주기', [10000, 16000]), S([x0 + 3, y0 + 5], '😮‍💨', '한숨 돌리기'));
      if (h >= 7) { F.push(f('plant', x0 + 7, y0 + 6)); slots.push([x0 + 2, y0 + 6], [x0 + 5, y0 + 6]); }
    } else {
      F.push(f('coffeetable', x0 + 1, y0 + 3, { w: 3 }), f('armchair', x0 + 5, y0 + 1), f('vending', x0 + 7, y0 + 3));
      for (let i = 1; i <= 6; i++) slots.push([x0 + i, y0 + 2]);
      slots.push([x0 + 5, y0 + 3], [x0, y0 + 2], [x0, y0 + 3], [x0 + 6, y0 + 3]);
      spots.push(S([x0 + 6, y0 + 1], '☕', '커피 한 잔'), S([x0 + 7, y0 + 1], '☕', '커피 리필'), S([x0 + 1, y0 + 2], '🛋️', '소파에서 잠깐'), S([x0 + 2, y0 + 2], '🛋️', '소파에 기대기'),
        S([x0 + 3, y0 + 2], '📺', '멍 때리는 중'), S([x0 + 4, y0 + 2], '🙆', '기지개 켜기', [10000, 18000]), S([x0 + 6, y0 + 3], '🥤', '자판기 구경', [10000, 18000]), S([x0, y0 + 2], '🌿', '화분 구경', [10000, 16000]),
        S([x0 + 5, y0 + 3], '😮‍💨', '한숨 돌리기'));
    }
    const ambient = [A([x0 + 6, y0 + 1], '☕', '커피 한 잔', [6000, 11000]), A([x0 + 7, y0 + 1], '☕', '커피 한 잔', [6000, 11000]), A([x0 + 1, y0 + 2], '🛋️', '소파에서 잠깐', [8000, 14000]),
      A([x0 - 1, y0], '🌿', '화분 구경', [4000, 8000]), A([x0, y0 + h], '🌿', '화분 구경', [4000, 8000])];
    return { furniture: F, slots, spots, ambient };
  } },
  server: { label: '서버실', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    for (let i = 1; i <= 6; i++) { F.push(f('rack', x0 + i, y0 + 1, { seed: x0 + i })); slots.push([x0 + i, y0 + 2]); }
    F.push(f('ac', x0 + 7, y0));
    if (h >= 6) {
      for (let i = 1; i <= 6; i++) { F.push(f('rack', x0 + i, y0 + 4, { seed: x0 + i + 7 })); slots.push([x0 + i, y0 + 5]); }
      if (h >= 7) slots.push([x0 + 2, y0 + 6], [x0 + 5, y0 + 6]);
    } else {
      for (let i = 1; i <= 4; i++) F.push(f('rack', x0 + i, y0 + 3, { seed: x0 + i + 7 }));
      slots.push([x0 + 5, y0 + 3], [x0 + 6, y0 + 3], [x0, y0 + 2]);
    }
    return { furniture: F, slots };
  } },
  mydesk: { label: '내 자리', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    F.push(f('desk2', x0 + 2, y0 + 1, { w: 2 }), f('chair', x0 + 3, y0 + 2, { solid: false, face: 'n' }), f('plant', x0, y0 + 3), f('cabinet', x0 + 7, y0), f('plant', x0 + 7, y0 + 3));
    slots.push([x0 + 5, y0 + 1], [x0 + 5, y0 + 2], [x0 + 1, y0 + 2], [x0 + 4, y0 + 3], [x0 + 6, y0 + 2], [x0 + 1, y0 + 1]);
    if (h >= 6) { F.push(f('sofa', x0 + 1, y0 + 4, { w: 3 }), f('plant', x0 + 7, y0 + h - 1)); slots.push([x0 + 2, y0 + 5], [x0 + 5, y0 + 4], [x0 + 5, y0 + 5]); }
    return { furniture: F, slots, seat: [x0 + 4, y0 + 2] };
  } },
  lobby: { label: '로비', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    F.push(f('reception', x0 + 2, y0 + 1, { w: 3 }), f('sign', x0 + 7, y0 + 2), f('plant', x0, y0), f('plant', x0 + 7, y0), f('plant', x0, y0 + 3));
    slots.push([x0 + 1, y0 + 2], [x0 + 3, y0 + 2], [x0 + 5, y0 + 2], [x0 + 2, y0 + 3], [x0 + 4, y0 + 3]);
    if (h >= 6) { F.push(f('bench', x0 + 1, y0 + 4, { w: 2 }), f('bench', x0 + 5, y0 + 4, { w: 2 }), f('plant', x0 + 7, y0 + h - 1)); slots.push([x0 + 1, y0 + 5], [x0 + 5, y0 + 5], [x0 + 3, y0 + 4]); }
    const ambient = [A([x0 + 3, y0 + 2], '🚶', '로비 산책', [3000, 6000])];
    return { furniture: F, slots, ambient };
  } },
  elevator: { label: '엘리베이터', pattern: 'grid', furnish(r) {
    const { x0, y0, h } = r, F = [], slots = [];
    F.push(f('elevator', x0 + 5, y0), f('elevator', x0 + 6, y0), f('bench', x0 + 1, y0 + 1, { w: 2 }), f('plant', x0, y0 + 3), f('plant', x0 + 7, y0 + 3));
    slots.push([x0 + 5, y0 + 1], [x0 + 6, y0 + 1], [x0 + 4, y0 + 1], [x0 + 7, y0 + 1], [x0 + 5, y0 + 2], [x0 + 6, y0 + 2], [x0 + 3, y0 + 1]);
    if (h >= 6) { F.push(f('bench', x0 + 1, y0 + 4, { w: 2 }), f('plant', x0 + 7, y0 + h - 1)); slots.push([x0 + 2, y0 + 3], [x0 + 5, y0 + 4]); }
    const ambient = [A([x0 + 2, y0 + 1], '🪑', '벤치에서 한숨', [6000, 10000])];
    return { furniture: F, slots, ambient, spawn: [x0 + 5, y0 + 1] };
  } },

  // ---------- 편의시설 (휴식 방 별칭 대상) ----------
  cafe: { label: '카페', pattern: 'checker', windows: true, rest: { bubble: '커피 마시는 중', icon: '☕' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('counter', x0, y0 + 1, { w: 3 }), f('coffeemachine', x0 + 3, y0 + 1));
    for (const dx of [0, 1, 2]) F.push(f('stool', x0 + dx, y0 + 2, { solid: false }));
    F.push(f('cafetable', x0 + 1, y0 + 4), f('armchair', x0 + 1, y0 + 5, { face: 'n' }), f('armchair', x0 + 2, y0 + 4, { face: 'w' }));
    F.push(f('cafetable', x0 + 4, y0 + 4), f('armchair', x0 + 4, y0 + 5, { face: 'n' }), f('armchair', x0 + 5, y0 + 4, { face: 'w' }));
    F.push(f('cafetable', x0 + 6, y0 + 2), f('armchair', x0 + 6, y0 + 3, { face: 'n' }), f('plant', x0 + 7, y0 + 6), f('plant', x0, y0 + 6));
    const slots = [[x0, y0 + 3], [x0 + 3, y0 + 3], [x0 + 3, y0 + 5], [x0 + 5, y0 + 6], [x0 + 2, y0 + 6], [x0 + 7, y0 + 4], [x0 + 6, y0 + 5], [x0, y0 + 5]];
    const spots = [S([x0, y0 + 2], '☕', '라떼 한 잔'), S([x0 + 1, y0 + 2], '☕', '아메리카노 한 잔'), S([x0 + 2, y0 + 2], '🥐', '크루아상 먹는 중'), S([x0 + 4, y0 + 1], '☕', '주문하는 중', [10000, 16000]),
      S([x0 + 1, y0], '🪟', '창밖 구경'), S([x0 + 4, y0], '🪟', '창가에서 멍'), S([x0 + 6, y0], '🪟', '햇살 쬐는 중'), S([x0, y0 + 4], '🪑', '테이블 자리'), S([x0 + 5, y0 + 5], '🥐', '수다 떠는 중'),
      S([x0 + 7, y0 + 2], '🍰', '디저트 고르는 중', [10000, 18000]), S([x0 + 3, y0 + 6], '🚶', '카페 둘러보기', [10000, 15000])];
    const ambient = [A([x0, y0 + 3], '☕', '카페에서 라떼', [7000, 12000]), A([x0 + 3, y0 + 3], '🪟', '창가 자리', [6000, 11000]), A([x0 + 6, y0 + 5], '🥐', '카페에서 수다', [5000, 9000])];
    return { furniture: F, slots, spots, ambient };
  } },
  terrace: { label: '테라스', pattern: 'deck', outdoor: true, rest: { bubble: '바람 쐬는 중', icon: '🌤️' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('planter', x0, y0, { w: 3 }), f('parasol', x0 + 2, y0 + 2, { w: 2, d: 2 }), f('parasol', x0 + 5, y0 + 6, { w: 2, d: 2 }), f('bench', x0 + 1, y0 + 9, { w: 2 }), f('bench', x0 + 4, y0 + 9, { w: 2 }),
      f('plant', x0 + 7, y0, { seed: 1 }), f('plant', x0 + 7, y0 + 11, { seed: 1 }), f('plant', x0, y0 + 11, { seed: 1 }), f('plant', x0, y0 + 5));
    const slots = [[x0 + 1, y0 + 1], [x0 + 5, y0 + 1], [x0 + 1, y0 + 3], [x0 + 5, y0 + 3], [x0 + 1, y0 + 6], [x0 + 4, y0 + 5], [x0 + 3, y0 + 9], [x0 + 6, y0 + 10], [x0 + 1, y0 + 11], [x0 + 5, y0 + 11]];
    const spots = [S([x0 + 1, y0 + 2], '🌤️', '바람 좋다'), S([x0 + 4, y0 + 2], '⛱️', '파라솔 아래'), S([x0 + 2, y0 + 4], '⛱️', '파라솔 그늘'), S([x0, y0 + 1], '🌱', '화단 구경', [10000, 16000]),
      S([x0 + 3, y0 + 1], '🌱', '꽃 구경', [10000, 16000]), S([x0 + 4, y0 + 5], '🌿', '테라스 산책', [10000, 15000]), S([x0 + 7, y0 + 3], '🌇', '난간에서 풍경'), S([x0 + 7, y0 + 6], '🌇', '난간에 기대기'),
      S([x0 + 1, y0 + 8], '🪑', '벤치에서 한숨'), S([x0 + 4, y0 + 8], '☀️', '벤치에서 햇볕'), S([x0 + 2, y0 + 10], '🪑', '벤치 옆에서'), S([x0 + 6, y0 + 11], '🚶', '데크 끝까지', [10000, 15000])];
    const ambient = [A([x0 + 1, y0 + 3], '🌤️', '바람 쐬는 중', [7000, 12000]), A([x0 + 4, y0 + 5], '🌿', '테라스 산책', [5000, 9000]), A([x0 + 3, y0 + 9], '☀️', '벤치에서 햇볕', [7000, 12000])];
    return { furniture: F, slots, spots, ambient };
  } },
  gym: { label: '헬스장', pattern: 'rubber', rest: { bubble: '운동 중', icon: '🏃' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    for (const dx of [1, 3, 5]) F.push(f('treadmill', x0 + dx, y0 + 1, { d: 2 }));
    F.push(f('dumbbells', x0 + 7, y0, { d: 2 }), f('mat', x0 + 1, y0 + 4, { w: 2, solid: false }), f('mat', x0 + 4, y0 + 4, { w: 2, solid: false }), f('cooler', x0 + 7, y0 + 5), f('plant', x0, y0 + 6), f('plant', x0 + 7, y0 + 6));
    const slots = [[x0 + 1, y0 + 3], [x0 + 3, y0 + 3], [x0 + 5, y0 + 3], [x0 + 1, y0 + 4], [x0 + 4, y0 + 4], [x0 + 6, y0 + 1], [x0, y0 + 2], [x0 + 3, y0 + 6], [x0 + 6, y0 + 6], [x0 + 7, y0 + 3]];
    const spots = [S([x0 + 1, y0 + 3], '🏃', '러닝머신 뛰는 중'), S([x0 + 3, y0 + 3], '🏃', '러닝머신 워밍업'), S([x0 + 5, y0 + 3], '🏃', '달리기 5분 더'), S([x0 + 1, y0 + 4], '🧘', '스트레칭'), S([x0 + 2, y0 + 4], '🧘', '요가 자세'),
      S([x0 + 4, y0 + 4], '🧘', '플랭크 버티기', [10000, 16000]), S([x0 + 5, y0 + 4], '🙆', '숨 고르기', [10000, 16000]), S([x0 + 6, y0 + 1], '🏋️', '덤벨 들기'), S([x0 + 6, y0 + 5], '💧', '물 마시기', [10000, 15000]), S([x0 + 3, y0 + 6], '🚶', '쿨다운 걷기', [10000, 15000])];
    const ambient = [A([x0 + 6, y0 + 1], '🏋️', '덤벨 한 세트', [6000, 11000]), A([x0 + 1, y0 + 4], '🧘', '스트레칭', [6000, 10000])];
    return { furniture: F, slots, spots, ambient };
  } },
  garden: { label: '옥상정원', pattern: 'grass', outdoor: true, rest: { bubble: '정원 산책 중', icon: '🌸' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('planter', x0, y0, { w: 3 }), f('planter', x0 + 4, y0, { w: 3 }), f('flowerbed', x0 + 2, y0 + 3, { w: 3, d: 2 }), f('plant', x0 + 6, y0 + 3, { seed: 1 }), f('bench', x0 + 1, y0 + 6, { w: 2 }), f('bench', x0 + 5, y0 + 6, { w: 2 }),
      f('pond', x0 + 1, y0 + 9, { w: 3, d: 2 }), f('plant', x0 + 7, y0 + 11, { seed: 1 }), f('plant', x0, y0 + 11, { seed: 1 }), f('plant', x0 + 5, y0 + 10), f('plant', x0 + 7, y0, { seed: 1 }));
    const slots = [[x0 + 1, y0 + 1], [x0 + 5, y0 + 1], [x0 + 1, y0 + 3], [x0 + 5, y0 + 4], [x0 + 1, y0 + 5], [x0 + 6, y0 + 5], [x0 + 3, y0 + 7], [x0 + 1, y0 + 8], [x0 + 5, y0 + 9], [x0 + 3, y0 + 11]];
    const spots = [S([x0 + 1, y0 + 2], '🌸', '꽃 구경'), S([x0 + 5, y0 + 2], '🌸', '향기 맡는 중'), S([x0 + 1, y0 + 4], '🌼', '화단 돌보기', [10000, 16000]), S([x0 + 5, y0 + 4], '🌳', '나무 그늘'), S([x0 + 1, y0 + 5], '🪑', '벤치에서 햇볕'),
      S([x0 + 5, y0 + 5], '☀️', '벤치에서 한숨'), S([x0, y0 + 9], '🐟', '연못 구경'), S([x0 + 4, y0 + 9], '🐟', '물고기 보는 중'), S([x0 + 3, y0 + 8], '🌱', '잔디에 눕기'), S([x0 + 6, y0 + 8], '🌇', '난간에서 풍경'),
      S([x0 + 2, y0 + 11], '🚶', '정원 한 바퀴', [10000, 15000]), S([x0 + 6, y0 + 11], '🌤️', '바람 쐬는 중')];
    const ambient = [A([x0 + 1, y0 + 2], '🌸', '꽃 구경', [6000, 10000]), A([x0, y0 + 9], '🐟', '연못 구경', [6000, 10000]), A([x0 + 1, y0 + 5], '☀️', '벤치에서 햇볕', [7000, 12000])];
    return { furniture: F, slots, spots, ambient };
  } },
  canteen: { label: '구내식당', pattern: 'checker', windows: true, rest: { bubble: '밥 먹는 중', icon: '🍱' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('buffet', x0, y0 + 1, { w: 4 }), f('fridge', x0 + 5, y0 + 1), f('coffeemachine', x0 + 6, y0 + 1), f('vending', x0 + 7, y0 + 1));
    const slots = [], spots = [];
    for (const dy of [4, 8, 12]) {
      F.push(f('table', x0 + 1, y0 + dy, { w: 3, d: 1 }));
      for (const dx of [1, 2, 3]) { F.push(f('stool', x0 + dx, y0 + dy - 1, { solid: false }), f('stool', x0 + dx, y0 + dy + 1, { solid: false })); }
      slots.push([x0 + 1, y0 + dy - 1], [x0 + 3, y0 + dy - 1], [x0 + 2, y0 + dy + 1]);
      spots.push(S([x0 + 1, y0 + dy + 1], '🍱', '도시락 먹는 중'), S([x0 + 3, y0 + dy + 1], '🍜', '라면 후루룩'));
    }
    F.push(f('cafetable', x0 + 6, y0 + 5), f('armchair', x0 + 6, y0 + 6, { face: 'n' }), f('cafetable', x0 + 6, y0 + 9), f('armchair', x0 + 6, y0 + 10, { face: 'n' }), f('plant', x0 + 7, y0 + 14), f('plant', x0, y0 + 14), f('plant', x0 + 7, y0 + 7));
    slots.push([x0 + 5, y0 + 4], [x0 + 5, y0 + 8], [x0 + 7, y0 + 11], [x0 + 5, y0 + 13], [x0 + 2, y0 + 14]);
    spots.push(S([x0 + 1, y0 + 2], '🍽️', '배식 받는 중', [10000, 16000]), S([x0 + 3, y0 + 2], '🥗', '샐러드 고르는 중', [10000, 16000]), S([x0 + 5, y0 + 2], '🧃', '냉장고에서 음료', [10000, 15000]), S([x0 + 6, y0 + 2], '☕', '식후 커피'),
      S([x0 + 7, y0 + 5], '🍰', '디저트 자리'), S([x0 + 5, y0 + 9], '🥐', '창가 테이블'), S([x0 + 4, y0 + 14], '🚶', '식판 반납', [10000, 15000]));
    const ambient = [A([x0 + 6, y0 + 2], '☕', '식후 커피', [6000, 11000]), A([x0 + 1, y0 + 2], '🍽️', '간식 집어 먹기', [5000, 9000])];
    return { furniture: F, slots, spots, ambient };
  } },
  nap: { label: '수면실', pattern: 'carpet', rest: { bubble: '낮잠 자는 중', icon: '😴' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    for (const dx of [1, 3, 5]) F.push(f('bed', x0 + dx, y0 + 2, { d: 2 }));
    F.push(f('partition', x0 + 2, y0 + 2, { d: 2 }), f('partition', x0 + 4, y0 + 2, { d: 2 }), f('floorlamp', x0 + 7, y0 + 3), f('plant', x0, y0 + 3), f('lowshelf', x0 + 7, y0));
    const slots = [[x0 + 1, y0 + 1], [x0 + 3, y0 + 1], [x0 + 5, y0 + 1], [x0 + 6, y0 + 2], [x0 + 7, y0 + 1], [x0, y0 + 1], [x0 + 6, y0 + 3], [x0, y0 + 2]];
    const spots = [S([x0 + 1, y0 + 1], '😴', '낮잠 자는 중'), S([x0 + 3, y0 + 1], '😴', '쪽잠 중'), S([x0 + 5, y0 + 1], '🛌', '눈 붙이는 중'), S([x0 + 6, y0 + 2], '🧘', '명상 중', [10000, 20000]),
      S([x0 + 6, y0 + 3], '🕯️', '조명 낮추는 중', [10000, 15000]), S([x0, y0 + 2], '🌿', '화분 옆에서 멍'), S([x0 + 7, y0 + 1], '📚', '잠 오는 책 고르기', [10000, 15000]), S([x0, y0 + 1], '🥱', '하품')];
    const ambient = [A([x0 + 6, y0 + 2], '🧘', '잠깐 명상', [6000, 11000])];
    return { furniture: F, slots, spots, ambient };
  } },
  game: { label: '게임룸', pattern: 'carpet', rest: { bubble: '게임 한 판', icon: '🎮' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('pooltable', x0 + 1, y0 + 1, { w: 3, d: 2 }));
    for (const dx of [5, 6, 7]) F.push(f('arcade', x0 + dx, y0));
    F.push(f('wallscreen', x0 + 5, y0 + 4, { w: 2 }), f('sofa', x0 + 5, y0 + 6, { w: 3 }), f('beanbag', x0 + 1, y0 + 5), f('beanbag', x0 + 2, y0 + 6), f('pingpong', x0 + 1, y0 + 8, { w: 3, d: 2 }),
      f('vending', x0 + 7, y0 + 9), f('plant', x0, y0 + 11), f('plant', x0 + 7, y0 + 11), f('plant', x0 + 7, y0 + 3), f('lowshelf', x0 + 4, y0 + 11));
    const slots = [[x0 + 2, y0 + 3], [x0 + 4, y0 + 2], [x0 + 5, y0 + 1], [x0 + 6, y0 + 1], [x0 + 7, y0 + 1], [x0 + 5, y0 + 7], [x0 + 6, y0 + 7], [x0 + 1, y0 + 4], [x0 + 3, y0 + 6], [x0, y0 + 8], [x0 + 4, y0 + 9], [x0 + 2, y0 + 10], [x0 + 6, y0 + 10]];
    const spots = [S([x0 + 2, y0 + 3], '🎱', '당구 치는 중'), S([x0 + 4, y0 + 2], '🎱', '큐 고르는 중', [10000, 16000]), S([x0, y0 + 1], '🎱', '다음 샷 구상'), S([x0 + 5, y0 + 1], '🕹️', '오락기 한 판'), S([x0 + 6, y0 + 1], '🕹️', '최고 기록 도전'),
      S([x0 + 7, y0 + 1], '🕹️', '동전 넣는 중', [10000, 15000]), S([x0 + 5, y0 + 7], '🎮', '게임 구경'), S([x0 + 6, y0 + 7], '🎮', '컨트롤러 잡는 중'), S([x0 + 1, y0 + 4], '🛋️', '빈백에 눕기'), S([x0 + 3, y0 + 6], '🛋️', '빈백에서 뒹굴'),
      S([x0, y0 + 8], '🏓', '탁구 한 판'), S([x0 + 4, y0 + 9], '🏓', '서브 넣는 중'), S([x0 + 6, y0 + 10], '🥤', '음료 고르는 중', [10000, 15000]), S([x0 + 2, y0 + 10], '🚶', '게임룸 한 바퀴', [10000, 15000])];
    const ambient = [A([x0 + 5, y0 + 1], '🕹️', '오락기 한 판', [7000, 12000]), A([x0 + 1, y0 + 4], '🛋️', '빈백에 눕기', [7000, 12000]), A([x0, y0 + 8], '🏓', '탁구 한 판', [6000, 10000])];
    return { furniture: F, slots, spots, ambient };
  } },
  booklounge: { label: '북 라운지', pattern: 'wood', windows: true, rest: { bubble: '책 읽는 중', icon: '📖' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    for (let i = 0; i < 8; i++) F.push(f('lowshelf', x0 + i, y0, { seed: x0 + i }));
    F.push(f('armchair', x0 + 1, y0 + 3, { face: 's' }), f('armchair', x0 + 3, y0 + 3, { face: 's' }), f('floorlamp', x0 + 2, y0 + 2), f('rug', x0 + 1, y0 + 4, { w: 3, d: 2, solid: false }),
      f('cafetable', x0 + 5, y0 + 4), f('armchair', x0 + 5, y0 + 5, { face: 'n' }), f('armchair', x0 + 6, y0 + 4, { face: 'w' }), f('plant', x0 + 7, y0 + 6), f('plant', x0, y0 + 6), f('lowshelf', x0 + 7, y0 + 2));
    const slots = [[x0 + 1, y0 + 1], [x0 + 3, y0 + 1], [x0 + 5, y0 + 1], [x0 + 1, y0 + 4], [x0 + 3, y0 + 4], [x0 + 2, y0 + 5], [x0 + 4, y0 + 5], [x0 + 6, y0 + 5], [x0 + 7, y0 + 4], [x0, y0 + 3], [x0 + 3, y0 + 6]];
    const spots = [S([x0 + 1, y0 + 1], '📚', '책 고르는 중', [10000, 16000]), S([x0 + 5, y0 + 1], '📚', '신간 둘러보기', [10000, 16000]), S([x0 + 1, y0 + 4], '📖', '안락의자에서 독서'), S([x0 + 3, y0 + 4], '📖', '소설 한 챕터'),
      S([x0 + 2, y0 + 5], '🧶', '러그에 앉기'), S([x0 + 4, y0 + 5], '☕', '차 한 잔과 책'), S([x0 + 6, y0 + 5], '📖', '창가에서 독서'), S([x0, y0 + 3], '🪟', '창밖 구경'), S([x0 + 7, y0 + 4], '📰', '잡지 넘기기', [10000, 16000]), S([x0 + 3, y0 + 6], '🚶', '서가 둘러보기', [10000, 15000])];
    const ambient = [A([x0 + 1, y0 + 4], '📖', '잠깐 독서', [7000, 12000]), A([x0 + 3, y0 + 1], '📚', '책 고르는 중', [5000, 9000])];
    return { furniture: F, slots, spots, ambient };
  } },
  studio: { label: '스튜디오', pattern: 'carpet', rest: { bubble: '녹음 중', icon: '🎙️' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('booth', x0 + 1, y0 + 1, { w: 2, d: 2 }), f('desk', x0 + 4, y0 + 1, { w: 2 }), f('chair', x0 + 5, y0 + 2, { solid: false, face: 'n' }), f('camera', x0 + 7, y0 + 2), f('lightstand', x0 + 6, y0), f('mic', x0 + 1, y0), f('plant', x0, y0), f('lowshelf', x0 + 7, y0));
    const slots = [[x0 + 3, y0 + 1], [x0 + 5, y0 + 2], [x0 + 1, y0 + 3], [x0 + 6, y0 + 3], [x0 + 3, y0 + 2], [x0, y0 + 1], [x0 + 4, y0 + 3], [x0 + 7, y0 + 1]];
    const spots = [S([x0 + 3, y0 + 1], '🎙️', '녹음 부스 앞'), S([x0 + 2, y0], '🎤', '마이크 테스트', [10000, 16000]), S([x0 + 5, y0 + 2], '🎚️', '믹싱 중'), S([x0 + 6, y0 + 3], '🎥', '카메라 세팅', [10000, 16000]),
      S([x0 + 3, y0 + 2], '🎧', '헤드폰으로 모니터링'), S([x0 + 7, y0 + 1], '💡', '조명 맞추는 중', [10000, 15000]), S([x0, y0 + 1], '📝', '대본 읽기'), S([x0 + 4, y0 + 3], '🚶', '테이크 사이 휴식', [10000, 15000])];
    const ambient = [A([x0 + 3, y0 + 1], '🎙️', '한 테이크 녹음', [7000, 12000])];
    return { furniture: F, slots, spots, ambient };
  } },
  seminar: { label: '세미나실', pattern: 'carpet', windows: true, rest: { bubble: '세미나 듣는 중', icon: '🎓' }, furnish(r) {
    const { x0, y0 } = r, F = [];
    F.push(f('podium', x0 + 1, y0 + 1), f('wallscreen', x0 + 3, y0, { w: 3 }), f('whiteboard', x0, y0 + 2, { d: 2 }));
    const slots = [], spots = [];
    for (const dy of [3, 5, 7, 9, 11]) for (const dx of [1, 2, 3, 5, 6, 7]) F.push(f('seat', x0 + dx, y0 + dy, { solid: false, face: 'n' }));
    for (const dy of [3, 7, 11]) slots.push([x0 + 1, y0 + dy], [x0 + 3, y0 + dy], [x0 + 5, y0 + dy], [x0 + 7, y0 + dy]);
    slots.push([x0 + 4, y0 + 5], [x0 + 4, y0 + 9], [x0 + 2, y0 + 1], [x0 + 2, y0 + 13]);
    spots.push(S([x0 + 1, y0 + 3], '🎓', '앞자리에서 집중'), S([x0 + 5, y0 + 3], '📝', '필기하는 중'), S([x0 + 3, y0 + 5], '🎓', '세미나 듣는 중'), S([x0 + 7, y0 + 5], '🤔', '질문 생각 중'), S([x0 + 4, y0 + 5], '🙋', '질문하는 중', [10000, 16000]),
      S([x0 + 2, y0 + 9], '😴', '뒷자리에서 꾸벅'), S([x0 + 6, y0 + 9], '💤', '뒷자리에서 졸기'), S([x0 + 2, y0 + 1], '🎤', '발표 준비', [10000, 18000]), S([x0 + 4, y0 + 1], '🖥️', '슬라이드 넘기기', [10000, 18000]),
      S([x0 + 1, y0 + 13], '☕', '쉬는 시간', [10000, 15000]), S([x0 + 6, y0 + 13], '🚶', '뒤에서 서성이기', [10000, 15000]));
    F.push(f('plant', x0, y0 + 14), f('plant', x0 + 7, y0 + 14), f('cabinet', x0 + 7, y0 + 13));
    const ambient = [A([x0 + 4, y0 + 7], '🎓', '세미나 살짝 듣기', [7000, 12000]), A([x0 + 2, y0 + 1], '🎤', '발표 연습', [6000, 10000])];
    return { furniture: F, slots, spots, ambient };
  } },
};
export const ROOM_IDS = Object.keys(ROOM_DEFS);
export const AMENITY_ROOMS = ROOM_IDS.filter((id) => !CORE_ROOMS.includes(id));

function f(type, x, y, extra = {}) { return { type, x, y, w: 1, d: 1, ...extra }; }

// ---------- 레이아웃 정의: 셀(열 index, 띠) → 방 ----------
// rest: 서버 휴식 방 id → 이 레이아웃의 편의시설 (cafe = 실내, terrace = 야외/큰 방)
export const LAYOUTS = {
  classic: { label: '카페 · 테라스', rest: { cafe: 'cafe', terrace: 'terrace' }, cells: [
    ['library', 0, 'top'], ['dev', 1, 'top'], ['research', 2, 'top'], ['meeting', 0, 'mid'], ['lounge', 1, 'mid'], ['server', 2, 'mid'],
    ['mydesk', 0, 'bot'], ['lobby', 1, 'bot'], ['elevator', 2, 'bot'], ['cafe', 3, 'top'], ['terrace', 3, 'tall'],
  ] },
  studio: { label: '세미나실 · 스튜디오', rest: { cafe: 'studio', terrace: 'seminar' }, cells: [
    ['seminar', 0, 'hall'], ['studio', 0, 'bot'], ['dev', 1, 'top'], ['research', 2, 'top'], ['library', 3, 'top'],
    ['server', 1, 'mid'], ['meeting', 2, 'mid'], ['lounge', 3, 'mid'], ['elevator', 1, 'bot'], ['mydesk', 2, 'bot'], ['lobby', 3, 'bot'],
  ] },
  fitness: { label: '헬스장 · 옥상정원', rest: { cafe: 'gym', terrace: 'garden' }, cells: [
    ['research', 0, 'top'], ['library', 1, 'top'], ['dev', 2, 'top'], ['lounge', 0, 'mid'], ['server', 1, 'mid'], ['meeting', 2, 'mid'],
    ['lobby', 0, 'bot'], ['elevator', 1, 'bot'], ['mydesk', 2, 'bot'], ['gym', 3, 'top'], ['garden', 3, 'tall'],
  ] },
  play: { label: '북 라운지 · 게임룸', rest: { cafe: 'booklounge', terrace: 'game' }, cells: [
    ['booklounge', 0, 'top'], ['game', 0, 'tall'], ['dev', 1, 'top'], ['library', 2, 'top'], ['research', 3, 'top'],
    ['meeting', 1, 'mid'], ['lounge', 2, 'mid'], ['server', 3, 'mid'], ['lobby', 1, 'bot'], ['mydesk', 2, 'bot'], ['elevator', 3, 'bot'],
  ] },
  canteen: { label: '구내식당 · 수면실', rest: { cafe: 'canteen', terrace: 'nap' }, cells: [
    ['library', 0, 'top'], ['research', 1, 'top'], ['dev', 2, 'top'], ['server', 0, 'mid'], ['meeting', 1, 'mid'], ['lounge', 2, 'mid'],
    ['elevator', 0, 'bot'], ['lobby', 1, 'bot'], ['mydesk', 2, 'bot'], ['canteen', 3, 'hall'], ['nap', 3, 'bot'],
  ] },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const DEFAULT_LAYOUT = 'classic';

// ---------- 생성 ----------
const cache = new Map();
/**
 * 레이아웃 id → 맵 데이터. 같은 id 는 같은 객체를 돌려준다 (map.js 가 복사해서 쓴다).
 * { id, rooms, furniture, walls, doors, slots, userSeat, spawn, ambient, restSpots, lamps, rest }
 */
export function buildLayout(id) {
  if (cache.has(id)) return cache.get(id);
  const spec = LAYOUTS[id] || LAYOUTS[DEFAULT_LAYOUT];
  const rooms = [], furniture = [], walls = [], slots = {}, ambient = [], restSpots = {}, lamps = [];
  let userSeat = null, spawn = null;

  for (const [roomId, col, bandId] of spec.cells) {
    const def = ROOM_DEFS[roomId], band = BANDS[bandId];
    const x0 = COLS[col], x1 = x0 + CELL_W - 1, y0 = band.y0, y1 = band.y1;
    const room = { id: roomId, label: def.label, x0, y0, x1, y1, floor: '#ffffff', trim: '#eeeeee', pattern: def.pattern, outdoor: !!def.outdoor, band: bandId };
    if (def.pattern === 'checker') room.alt = '#f0f0f0';
    rooms.push(room);
    const out = def.furnish({ x0, y0, x1, y1, w: CELL_W, h: y1 - y0 + 1 });
    furniture.push(...out.furniture);
    slots[roomId] = out.slots;
    if (out.ambient) ambient.push(...out.ambient);
    if (out.spots) restSpots[roomId] = out.spots;
    if (out.seat) userSeat = { x: out.seat[0], y: out.seat[1] };
    if (out.spawn) spawn = { x: out.spawn[0], y: out.spawn[1] };
    // 벽: 격자 안쪽 변에만. 문은 복도를 향한 가로 벽에.
    if (y0 > GRID.y0) walls.push({ dir: 'h', x: x0, y: y0, len: CELL_W, doors: band.doors.includes('n') ? [...DOOR_OFFSETS] : [], h: 0.6 });
    if (y1 < GRID.y1) walls.push({ dir: 'h', x: x0, y: y1 + 1, len: CELL_W, doors: band.doors.includes('s') ? [...DOOR_OFFSETS] : [], h: 0.6 });
    if (x0 > GRID.x0) walls.push({ dir: 'v', x: x0, y: y0, len: y1 - y0 + 1, doors: [], h: 0.6 });
    if (x1 < GRID.x1) walls.push({ dir: 'v', x: x1 + 1, y: y0, len: y1 - y0 + 1, doors: [], h: 0.6 });
    // 야외 방: 격자 바깥 변에 난간 + 난간 기둥 조명
    if (def.outdoor) {
      if (x1 === GRID.x1) { walls.push({ dir: 'v', x: x1 + 1, y: y0, len: y1 - y0 + 1, doors: [], h: 0.5, rail: true }); for (let y = y0; y <= y1; y += 3) lamps.push({ x: x1 + 1.04, y: y + 0.04, z: 0.56 }); }
      if (y1 === GRID.y1) { walls.push({ dir: 'h', x: x0, y: y1 + 1, len: CELL_W, doors: [], h: 0.5, rail: true }); for (let x = x0; x <= x1; x += 3) lamps.push({ x: x + 0.04, y: y1 + 1.04, z: 0.56 }); }
    }
    for (const it of out.furniture) if (it.type === 'parasol') lamps.unshift({ x: it.x + 1, y: it.y + 1, z: 1.45 });
  }
  // 바깥 벽 (북·서), 북쪽 벽의 창문은 창문 있는 방(top/hall 띠) 구간
  const windows = [];
  for (const r of rooms) if (ROOM_DEFS[r.id].windows && r.y0 === GRID.y0) for (let i = 0; i < 6; i++) windows.push(r.x0 + i);
  walls.unshift({ dir: 'h', x: GRID.x0, y: GRID.y0, len: GRID.x1 - GRID.x0 + 1, doors: [], h: 1.6, outer: true, windows: windows.sort((a, b) => a - b) });
  walls.splice(1, 0, { dir: 'v', x: GRID.x0, y: GRID.y0, len: GRID.y1 - GRID.y0 + 1, doors: [], h: 1.6, outer: true });
  // 문 목록
  const doors = [];
  for (const w of walls) if (w.dir === 'h') for (const off of w.doors) doors.push({ x: w.x + off, y: w.y, first: !w.doors.includes(off - 1), last: !w.doors.includes(off + 1) });
  // 휴식 방 별칭: 서버의 cafe/terrace → 이 레이아웃의 편의시설. 슬롯·명소에도 별칭 키를 넣어 둔다
  const rest = { lounge: 'lounge', ...spec.rest };
  for (const [alias, roomId] of Object.entries(spec.rest)) { if (slots[roomId]) slots[alias] = slots[roomId]; if (restSpots[roomId]) restSpots[alias] = restSpots[roomId]; }
  const built = { id: spec === LAYOUTS[id] ? id : DEFAULT_LAYOUT, label: spec.label, rooms, furniture, walls, doors, slots, userSeat, spawn, ambient, restSpots, lamps, rest };
  cache.set(built.id, built);
  return built;
}

/** 서버 방 id → 이 레이아웃에서 실제로 쓰는 방 id (별칭 풀기) */
export function resolveRoom(layout, roomId) { return (layout.rest && layout.rest[roomId]) || roomId; }
/** 레이아웃에서 서버 방 id 의 라벨 (별칭이면 편의시설 이름) */
export function roomLabelIn(layout, roomId) { const id = resolveRoom(layout, roomId); return ROOM_DEFS[id] ? ROOM_DEFS[id].label : null; }
