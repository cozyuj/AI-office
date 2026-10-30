// 언어 (FE-45): tr() 규칙과 "사용자 글은 번역하지 않는다" 보장
const test = require('node:test');
const assert = require('node:assert/strict');

let I;
test.before(async () => {
  globalThis.localStorage = { getItem: () => 'en', setItem() {} };
  I = await import('../public/js/i18n.js');
});

test('영어 모드: 방·상태·말풍선·로그 문구를 번역한다', () => {
  const cases = {
    '자료실': 'Library', '고민 중…': 'thinking…', 'server.js 읽는 중': 'reading server.js', '"TODO" 검색 중': 'searching "TODO"',
    'npm test 실행 중': 'running npm test', '작업 완료 → ☕ 휴게실': 'done → ☕ Lounge', '세션 3개 · 작업 중': '3 sessions · working',
    '세션 1개 · 방금': '1 session · just now', '3분 12초': '3m 12s', '5분 전': '5 min ago', 'nccx (데모)': 'nccx (demo)', 'jinyu (나)': 'jinyu (me)',
    '기억 용량 78% (156K / 200K 토큰)': 'Context used 78% (156K / 200K tokens)', '(318K / 1M 토큰)': '(318K / 1M tokens)', '기억': 'Memory',
    'Bash 실패: exit 1': 'Bash failed: exit 1', '🙋 질문 있어요': '🙋 I have a question', '· 4초': '· 4s', '헬스장 · 옥상정원': 'Gym · Rooftop Garden',
    'lib/state.js 을 졸린 판다 도 고치는 중': '졸린 판다 is also editing lib/state.js', '⚠️ server.js 을 abcd1234 도 고치는 중': '⚠️ abcd1234 is also editing server.js', '겹침': 'Overlap',
  };
  for (const [ko, en] of Object.entries(cases)) assert.equal(I.tr(ko), en, ko);
});

test('사용자 프롬프트·세션 제목·Claude 메시지는 손대지 않는다', () => {
  for (const s of ['"카페 추가해줘"', '카페, 테라스 추가', '초기 요구사항', 'API 엔드포인트 찾기', '수정 완료했습니다. 테스트 15건 통과.']) assert.equal(I.tr(s), s, s);
  // 알려진 틀 안의 사용자 부분도 그대로
  assert.equal(I.tr('API 엔드포인트 찾기 맡기는 중'), 'delegating: API 엔드포인트 찾기');
  assert.equal(I.tr('초기 요구사항 · 작업 중'), '초기 요구사항 · working');
});

test('한국어 모드로 바꾸면 원문 그대로, 영어로 다시 바꾸면 번역', () => {
  I.setLang('ko');
  assert.equal(I.getLang(), 'ko');
  assert.equal(I.tr('자료실'), '자료실');
  I.setLang('en');
  assert.equal(I.tr('자료실'), 'Library');
  I.setLang('xx'); // 모르는 값은 무시
  assert.equal(I.getLang(), 'en');
});

test('index.html 의 한글 문구는 모두 사전에 있다 (영어 화면에 한글이 남지 않게)', () => {
  const fs = require('fs'); const path = require('path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const texts = new Set();
  for (const m of html.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g)) texts.add(m[1].trim());
  for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]*[가-힣][^"]*)"/g)) texts.add(m[1]);
  const KEEP = new Set(['한국어']); // 언어 이름은 그 언어로 보인다
  const missing = [...texts].filter((t) => !KEEP.has(t) && /[가-힣]/.test(I.tr(t)));
  assert.deepEqual(missing, []);
});

test('기억 용량 게이지: 80% 주황 · 90% 빨강, 토큰 표기 (FE-70)', async () => {
  const C = await import('../public/js/context.js');
  assert.deepEqual([0, 79, 80, 89, 90, 100].map(C.ctxLevel), ['ok', 'ok', 'warn', 'warn', 'danger', 'danger']);
  assert.deepEqual([999, 156000, 200000, 1000000, 1250000].map(C.fmtTokens), ['999', '156K', '200K', '1M', '1.3M']);
  const c = { tokens: 318000, limit: 1000000, pct: 32 };
  assert.equal(C.ctxLabel(c), '🧠 32%');
  assert.equal(C.ctxTip(c), '기억 용량 32% (318K / 1M 토큰)');
  assert.equal(I.tr(C.ctxTip(c)), 'Context used 32% (318K / 1M tokens)');
});
