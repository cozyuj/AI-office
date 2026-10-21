// 시간대 조명: 실제 시각(브라우저 로컬)으로 아침·낮·저녁·밤을 정하고, 창문·테라스·실내 틴트 팔레트를 준다.
// 다크 모드(UI 팔레트)와는 별개다. 그리기는 render.js / sprites.js 가 하고, 여기는 순수 계산만 (Node 테스트 가능).

export const PERIODS = ['morning', 'day', 'evening', 'night'];
export const MODES = ['auto', 'off', ...PERIODS]; // 설정값: 자동(실제 시각) / 끔 / 강제 시간대

/** 시(0~23) → 시간대. 아침 06~10 · 낮 10~17 · 저녁 17~20 · 밤 20~06 */
export function periodOf(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

/** 설정 모드 + 현재 시각 → 적용할 시간대. 'off' 는 낮(중립)으로 그린다 */
export function resolve(mode = 'auto', date = new Date()) {
  if (PERIODS.includes(mode)) return mode;
  if (mode === 'off') return 'day';
  return periodOf(date.getHours());
}

// 시간대별 팔레트. 낮은 중립(틴트 없음·조명 꺼짐)이라 기존 모습 그대로.
export const PALETTE = {
  morning: {
    sky: ['#f6d6dc', '#d6e8f6'],           // 유리: 위 → 아래 (연한 분홍 → 하늘)
    glare: 0.5,                            // 사선 하이라이트 알파
    terrace: 'rgba(255,205,180,0.10)',     // 테라스 바닥 틴트
    scene: null,                           // 장면 전체 틴트 (화면 공간)
    lamp: 0,                               // 조명 점 세기 0~1
  },
  day: { sky: ['#bfe3f7', '#d6edf9'], glare: 0.55, terrace: null, scene: null, lamp: 0 },
  evening: {
    sky: ['#f5a05c', '#f3c77e', '#e87a63'],
    glare: 0.3,
    terrace: 'rgba(255,145,70,0.16)',
    scene: 'rgba(255,150,80,0.04)',
    lamp: 0.55,
  },
  night: {
    sky: ['#17203a', '#2a3760'],
    glare: 0.14,
    stars: true,                           // 작은 별 + 달
    terrace: 'rgba(18,28,70,0.30)',
    scene: 'rgba(40,60,150,0.06)',
    lamp: 1,
  },
};

// 테라스 조명 점 위치 (타일 좌표, z). 파라솔 기둥 아래 + 난간 기둥 위.
export const LAMPS = [
  { x: 31, y: 13, z: 1.45 },               // 파라솔 (30,12 w2 d2) 기둥
  { x: 34, y: 17, z: 1.45 },               // 파라솔 (33,16 w2 d2) 기둥
  { x: 36.04, y: 10.04, z: 0.56 }, { x: 36.04, y: 13.04, z: 0.56 }, { x: 36.04, y: 16.04, z: 0.56 }, { x: 36.04, y: 19.04, z: 0.56 }, // 동쪽 난간
  { x: 28.04, y: 22.04, z: 0.56 }, { x: 31.04, y: 22.04, z: 0.56 }, { x: 34.04, y: 22.04, z: 0.56 },                             // 남쪽 난간
];

// ---------- 현재 상태 (그리기 모듈이 읽는다) ----------
let current = 'day';
export function getPeriod() { return current; }
export function palette() { return PALETTE[current]; }
/** 시간대를 바꾸고, 바뀌었으면 true (호출자가 창문 스프라이트 캐시를 무효화한다) */
export function setPeriod(p) {
  const next = PERIODS.includes(p) ? p : 'day';
  if (next === current) return false;
  current = next;
  return true;
}
