// 근무 기록 모달 (FE-72): 시간 표시 꼴과 영어 번역 (화면 문구가 한글로 남지 않게)
const test = require('node:test');
const assert = require('node:assert/strict');

let I, V;
test.before(async () => {
  globalThis.localStorage = { getItem: () => 'en', setItem() {} };
  I = await import('../public/js/i18n.js');
  V = await import('../public/js/statsView.js');
});

test('dur: 0 은 –, 나머지는 초 · 분 초 · 시간 분 (영어 규칙으로 번역된다)', () => {
  assert.equal(V.dur(0), '–');
  assert.equal(V.dur(45 * 1000), '45초');
  assert.equal(V.dur(12 * 60 * 1000 + 30 * 1000), '12분 30초');
  assert.equal(V.dur((2 * 60 + 5) * 60 * 1000), '2시간 5분');
  I.setLang('en');
  assert.equal(I.tr(V.dur((2 * 60 + 5) * 60 * 1000)), '2h 5m');
});

test('모달 문구는 모두 영어로 바뀐다', () => {
  I.setLang('en');
  const ko = ['🛠️ 일한 시간', '🙋 답 기다린 시간', '💬 요청 수', '🔧 도구 사용', '✏️ 고친 파일', '🤝 서브에이전트 수', '기다린 시간', '도구', '프로젝트별', '세션별', '도구 종류별',
    '일한 시간 (생각·작업)', '이 날은 기록이 없습니다', '기록을 불러오지 못했습니다', '오늘', '어제', '일한 시간 1시간 4분 · 기다린 시간 15분 0초'];
  for (const s of ko) assert.doesNotMatch(I.tr(s), /[가-힣]/, s);
  assert.equal(I.tr('💬 요청 수'), '💬 Prompts');
});
