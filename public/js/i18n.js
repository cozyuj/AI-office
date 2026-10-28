// 언어 (FE-45): 한국어가 원문이고 영어는 번역이다.
// - tr(text): 캔버스·코드에서 만든 문자열을 번역한다 (사전 → 패턴 규칙 → 구절 치환). 한국어 모드면 그대로.
// - DOM 은 MutationObserver 가 텍스트 노드·title·placeholder 를 자동으로 바꾼다 (원문은 WeakMap 에 보관해 되돌릴 수 있다).
// 서버가 보내는 말풍선·로그도 한국어라 같은 규칙으로 번역한다.
const KEY = 'aiOffice.lang';
export const LANGS = [['ko', '한국어'], ['en', 'English']];
/** 브라우저면 localStorage, Node(테스트)면 테스트가 직접 넣은 것만 쓴다 — Node 25+ 의 실험용 localStorage getter 는 접근만 해도 경고를 찍는다 */
function storage() {
  try {
    if (typeof window !== 'undefined') return window.localStorage;
    const d = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    return d && 'value' in d ? d.value : null;
  } catch { return null; }
}
let lang = (() => {
  try { const v = storage()?.getItem(KEY); if (v === 'ko' || v === 'en') return v; } catch {}
  return (typeof navigator !== 'undefined' && /^ko/i.test(navigator.language || '')) ? 'ko' : 'en';
})();
export function getLang() { return lang; }
const listeners = new Set();
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- 사전 (정확히 일치) ----------
const DICT = {
  // 방·시설
  '자료실': 'Library', '개발실': 'Dev Room', '정보검색실': 'Research Room', '회의실': 'Meeting Room', '휴게실': 'Lounge', '서버실': 'Server Room',
  '내 자리': 'My Desk', '로비': 'Lobby', '엘리베이터': 'Elevator', '카페': 'Café', '테라스': 'Terrace', '복도': 'Corridor',
  '세미나실': 'Seminar Room', '스튜디오': 'Studio', '헬스장': 'Gym', '옥상정원': 'Rooftop Garden', '북 라운지': 'Book Lounge', '게임룸': 'Game Room', '구내식당': 'Canteen', '수면실': 'Nap Room',
  '카페 · 테라스': 'Café · Terrace', '세미나실 · 스튜디오': 'Seminar Room · Studio', '헬스장 · 옥상정원': 'Gym · Rooftop Garden', '북 라운지 · 게임룸': 'Book Lounge · Game Room', '구내식당 · 수면실': 'Canteen · Nap Room',
  '📖 자료실': '📖 Library', '✏️ 개발실': '✏️ Dev Room', '🖥️ 서버실': '🖥️ Server Room', '🌐 정보검색실': '🌐 Research Room', '🤝 회의실': '🤝 Meeting Room', '☕ 휴게실': '☕ Lounge', '🙋 내 자리': '🙋 My Desk', '🛗 엘리베이터': '🛗 Elevator',
  '파일 읽기 · 검색': 'reading · searching files', '코드 작성 · 수정': 'writing · editing code', '명령 실행 · git': 'commands · git', '웹 · 외부 도구': 'web · external tools', '계획 · 일 나누기': 'planning · delegating', '휴식 · 대기': 'resting · idle', '질문 · 허락 요청': 'questions · permission', '서브에이전트 출퇴근': 'subagents in and out',
  // 상태·말풍선 (서버)
  '고민 중…': 'thinking…', '고민 중': 'thinking', '생각 중': 'thinking', '작업 중': 'working', '답 기다리는 중': 'waiting for you', '답 기다림': 'waiting', '대기': 'idle', '조용함': 'quiet', '자리 비움': 'away', '퇴근': 'left', '휴식 중': 'resting',
  '커피 마시는 중': 'having coffee', '바람 쐬는 중': 'getting some air', '밥 먹는 중': 'eating', '낮잠 자는 중': 'napping', '운동 중': 'working out', '정원 산책 중': 'strolling the garden', '책 읽는 중': 'reading a book', '게임 한 판': 'a quick game', '녹음 중': 'recording', '세미나 듣는 중': 'at a seminar',
  '출근했습니다': 'arrived', '퇴근합니다': 'leaving', '요청 받음': 'request received', '입력 요청': 'input requested', '입력이 필요해요': 'input needed', '질문 있어요': 'I have a question', '허락이 필요해요': 'need permission',
  '할 일 기다리는 중': 'waiting for work', '기억 정리 중': 'compacting memory', '실패했네, 다시 생각 중': 'failed, thinking again', '알림 확인 중': 'checking a notification', '작업 완료': 'done', '자리 비움 (30분 무활동)': 'away (30 min idle)', '터미널 종료 추정': 'terminal probably closed',
  '할 일 정리 중': 'organizing tasks', '계획 세우는 중': 'planning', '서브에이전트': 'subagent', '부': 'sub', '제목 없는 세션': 'untitled session', '사무실': 'Office', '나': 'me',
  '☕ 라떼 한 잔': '☕ a latte', '🪟 창밖 구경': '🪟 looking outside', '🌤️ 바람 좋다': '🌤️ nice breeze', '커피 한 잔': 'a cup of coffee', '소파에서 잠깐': 'a moment on the sofa', '화분 구경': 'admiring plants', '창밖 구경': 'looking outside', '로비 산책': 'walking the lobby', '벤치에서 한숨': 'a sigh on the bench', '카페에서 라떼': 'a latte at the café', '창가 자리': 'window seat', '카페에서 수다': 'chatting at the café', '테라스 산책': 'a walk on the terrace', '벤치에서 햇볕': 'sun on the bench', '라떼 한 잔': 'a latte', '바람 좋다': 'nice breeze',
  // 헤더·패널
  '층별 안내': 'Floors', 'FLOOR GUIDE': 'FLOOR GUIDE', '사무실 사람들': 'People', '활동 로그': 'Activity log', '어디서 무엇을 하나': 'Who goes where', '세션': 'Session', '프로젝트': 'Project', '캐릭터': 'Character', '이어가기': 'Resume', '복사': 'Copy', '복사됨': 'Copied', '복사 실패': 'Copy failed',
  '훅 이벤트를 기다리는 중': 'waiting for hook events', '세션을 선택하세요': 'select a session', '아직 출근한 사람이 없습니다': 'Nobody is in yet', 'Claude Code 세션이 시작되면 여기에 나타납니다.': 'Characters appear here when a Claude Code session starts.', '훅을 아직 설치하지 않았다면': 'If the hooks are not installed yet', '미리 보려면': 'For a preview, run',
  '아직 열린 층이 없습니다': 'No floors yet', '이 층에는 아무도 없습니다': 'Nobody on this floor', '아직 활동이 없습니다': 'No activity yet', '조건에 맞는 로그가 없습니다': 'No log entries match', '지금 보는 중': 'viewing', '최근 세션 자동으로 따라가기': 'Follow the latest session automatically',
  '드래그로 이동 · 휠로 확대 · 캐릭터를 클릭하면 세션 선택': 'Drag to pan · wheel to zoom · click a character to select its session', '? 단축키': '? shortcuts', '단축키': 'Shortcuts', '검색 (내용·이름)': 'Search (text · name)', '선택 세션만': 'Selected only', '선택한 세션의 로그만': 'Only the selected session', '접기/펼치기': 'Collapse / expand',
  '🏢 전체 보기': '🏢 Building', '🏢 사무실로': '🏢 Back to office', '📍 따라가기': '📍 Follow', '⚙️ 설정': '⚙️ Settings', '설정': 'Settings', '💬 전체': '💬 All', '💬 선택만': '💬 Selected', '🔔 꺼짐': '🔔 Off', '🔔 켜짐': '🔔 On', '🔔 차단됨': '🔔 Blocked', '🔈 꺼짐': '🔈 Off', '✨ 꺼짐': '✨ Off', '✨ 켜짐': '✨ On', '🎬 꺼짐': '🎬 Off', '🎬 켜짐': '🎬 On', '☀️ 라이트': '☀️ Light', '🌙 다크': '🌙 Dark', '🌙 라이트': '🌙 Light', '👤 고르기…': '👤 Choose…', '🎨 고르기…': '🎨 Choose…', '⌨️ 보기…': '⌨️ Show…', '🗑 치우기': '🗑 Dismiss', '🗑 저장 삭제': '🗑 Delete saved', '🎲 랜덤': '🎲 Random', '🎲 다른 별명': '🎲 Another nickname', '↺ 초기화': '↺ Reset', '저장': 'Save', '닫기': 'Close', '이름': 'Name', '끔': 'Off', '자동': 'Auto', '자동 ': 'Auto ',
  '말풍선 범위': 'Bubbles', '브라우저 알림': 'Browser notifications', '대기 알림 소리': 'Waiting chime', '소리 범위': 'Sound scope', '답 기다림만': 'Waiting only', '실패·종료도': 'Also failures · end', '생동감': 'Liveliness', '테마': 'Theme', '데모': 'Demo', '캐릭터 외형': 'Character looks', '시간대 조명': 'Daylight', '층 인테리어': 'Floor interior', '언어': 'Language',
  '🕒 자동 (실제 시각)': '🕒 Auto (real clock)', '🌅 아침': '🌅 Morning', '☀️ 낮': '☀️ Day', '🌇 저녁': '🌇 Evening', '🌙 밤': '🌙 Night',
  '⌨️ 키보드 단축키': '⌨️ Keyboard shortcuts', '층 번호로 이동 (7 → 7F, 12F 는': 'Go to floor number (7 → 7F; for 12F press', '연타)': 'in a row)', '이전 · 다음 층': 'Previous · next floor', '선택한 세션 따라가기 (카메라)': 'Follow the selected session (camera)', '전체 보기 (건물 단면) ↔ 사무실': 'Building view ↔ office', '데모 켜기 · 끄기': 'Demo on · off', '말풍선 범위 (전체 ↔ 선택만)': 'Bubbles (all ↔ selected)', '대기 알림 소리 켜기 · 끄기': 'Waiting chime on · off', '테마 (라이트 ↔ 다크)': 'Theme (light ↔ dark)', '활동 로그 검색': 'Search the activity log', '닫기 · 검색 지우기 · 따라가기 해제': 'Close · clear search · stop following', '이 도움말': 'This help', '입력란에 포커스가 있을 때는 단축키가 동작하지 않습니다': 'Shortcuts are off while an input field has focus',
  '저장은 이 브라우저에만 남습니다 (localStorage)': 'Saved in this browser only (localStorage)', '— 자동이면 세션마다 다르게': '— auto picks one per session', '· 바로 저장': '· saves immediately', '프리셋 ': 'Preset ', '프리셋': 'Preset', '캐릭터 이름 ': 'Character name ', '캐릭터 ': 'Character ', '캐릭터': 'Character', '캐릭터: ': 'Characters: ', '세션마다 다른 캐릭터 (어느 브라우저에서도 같은 세션은 같은 캐릭터)': 'A different character per session (the same session gets the same one in every browser)', 'Claude 기본': 'Default Claude', '서브에이전트 기본': 'Default subagent', ' · 기본': ' · default', '다른 별명 뽑기': 'Draw another nickname',
  // 아바타 옵션
  '사람': 'Human', '로봇': 'Robot', '고양이': 'Cat', '곰': 'Bear', '짧은': 'Short', '앞머리': 'Bangs', '단발': 'Bob', '긴 머리': 'Long', '포니테일': 'Ponytail', '양갈래': 'Twin tails', '똥머리': 'Bun', '곱슬': 'Curly', '삐죽': 'Spiky', '민머리': 'Bald', '모호크': 'Mohawk', '아프로': 'Afro',
  '티셔츠': 'T-shirt', '후드': 'Hoodie', '셔츠': 'Shirt', '목폴라': 'Turtleneck', '조끼': 'Vest', '정장': 'Suit', '가운': 'Gown', '원피스': 'Dress', '바지': 'Pants', '반바지': 'Shorts', '치마': 'Skirt',
  '없음': 'None', '둥근 안경': 'Round glasses', '네모 안경': 'Square glasses', '선글라스': 'Sunglasses', '고글': 'Goggles', '외알 안경': 'Monocle', '캡': 'Cap', '비니': 'Beanie', '베레모': 'Beret', '머리띠': 'Headband', '버킷햇': 'Bucket hat', '실크햇': 'Top hat', '마법사': 'Wizard', '왕관': 'Crown', '헤드폰': 'Headphones', '스카프': 'Scarf', '사원증': 'Badge', '귀걸이': 'Earring', '나비넥타이': 'Bow tie', '수염': 'Beard', '마스크': 'Mask', '망토': 'Cape',
  '개발자': 'Developer', '연구원': 'Researcher', '캐주얼': 'Casual', '예술가': 'Artist', '임금님': 'King',
  // 층 스타일
  '따뜻한 우드': 'Warm Wood', '쿨 그레이': 'Cool Gray', '민트': 'Mint', '라벤더': 'Lavender', '샌드': 'Sand', '파스텔': 'Pastel', '(데모)': '(demo)',
  // 툴팁
  '지금': 'Now', '대상': 'Target', '요청': 'Prompt', '브랜치': 'Branch', '경로': 'Path', '종류': 'Type', '이어가기: ': 'Resume: ', ' — 클릭해 선택하면 우측 세션 카드에서 복사': ' — click to select, then copy from the session card',
  // 배너·기타
  '방금': 'just now', '시작': 'start', '초기 위치': 'Reset view', '확대': 'Zoom in', '축소': 'Zoom out',
  // 긴 title 들
  'Claude 가 질문하거나 허락을 기다리면 브라우저 알림을 보냅니다': 'Browser notification when Claude asks a question or waits for permission',
  "가짜 세션 4개로 사무실을 북적이게 (실제 세션과 별도 층, '(데모)' 표시)": "Fill the office with 4 fake sessions (separate floors marked '(demo)')",
  '끝난 세션을 목록에서 치우기 (TTL 을 기다리지 않음)': 'Remove the finished session from the list now (without waiting for the TTL)',
  '나 / Claude / 서브에이전트 캐릭터 고르기 — 12명 중 하나 또는 머리·몸·색·소품 조합, 세션마다 자동 또는 직접 올린 PNG, 지금 보는 세션의 캐릭터 이름': 'Choose characters for me / Claude / subagents — one of 12 or a mix of head, body, colors and accessories, auto per session or a PNG you upload, and the name of the session you are viewing',
  // 커스텀 캐릭터 (FE-56)
  '내 캐릭터': 'My characters', '— 배경 없는 PNG 를 올리거나 끌어다 놓기 · 자동에는 섞이지 않음': '— upload or drop a PNG with a transparent background · never picked by auto', 'PNG 올리기': 'Upload PNG',
  '배경이 투명한 PNG 를 고르거나 여기에 끌어다 놓기': 'Choose a PNG with a transparent background, or drop it here', '커스텀 캐릭터': 'Custom character', '이 커스텀 캐릭터 지우기': 'Delete this custom character',
  '한 번 더 누르면 지웁니다 — 이 그림을 쓰던 대상은 기본값으로': 'Click again to delete — anything using this picture goes back to its default', '지우기': 'Delete', '그림을 다듬는 중…': 'Preparing the picture…',
  '이미지 파일이 아닙니다 — 배경이 투명한 PNG 를 올려 주세요': 'Not an image file — please upload a PNG with a transparent background', '파일이 너무 큽니다 — 10MB 이하로 올려 주세요': 'File is too big — please keep it under 10 MB',
  '그림이 너무 큽니다 — 한 변 8192px 이하로 올려 주세요': 'Picture is too large — each side must be 8192 px or less', '이미지를 읽지 못했습니다 — 다른 파일로 해 보세요': 'Could not read the image — try another file', '그림이 전부 투명합니다': 'The picture is fully transparent',
  '커스텀 캐릭터가 너무 많습니다 — 안 쓰는 것을 지워 주세요': 'Too many custom characters — delete ones you no longer use', '저장 공간이 부족합니다 — 안 쓰는 커스텀 캐릭터를 지워 주세요': 'Out of storage space — delete custom characters you no longer use',
  '배경이 투명하지 않은 그림이라 사각형 그대로 보입니다': 'The background is not transparent, so it shows as a rectangle', '추가했습니다 — 저장을 누르면 이 대상에 적용됩니다': 'Added — press Save to use it for this target',
  // 파트 바꾸기 (FE-57)
  '파트 바꾸기': 'Mix parts', '— 머리·몸을 섞고 색·소품 고르기': '— mix heads and bodies, pick colors and accessories', '— 지금 캐릭터에서 시작합니다': '— starts from the current character',
  '머리': 'Head', '몸': 'Body', '머리카락': 'Hair', '상의': 'Top', '하의': 'Bottom', '소품': 'Accessory', '원래': 'Original', '원래 색': 'Original color', '다른 색 고르기': 'Pick another color',
  '없음': 'None', '안경': 'Glasses', '선글라스': 'Sunglasses', '마스크': 'Mask', '보청기': 'Hearing aid',
  '다크 모드 전환': 'Toggle dark mode', '다크 모드로': 'Switch to dark', '라이트 모드로': 'Switch to light',
  '답을 기다리는 세션이 생기면 짧은 소리 (한 번 클릭해 켜야 브라우저가 소리를 허용)': 'Short chime when a session starts waiting for you (click once so the browser allows audio)',
  '답을 기다릴 때만 (높은 2음)': 'Only when waiting for you (high two-tone)', '도구 실패·세션 종료에도 낮은 2음': 'Also on tool failure and session end (low two-tone)',
  '말풍선을 선택한 세션만 보일지 전체를 보일지': 'Show bubbles for the selected session only, or for all', '선택한 세션의 Claude 를 카메라가 따라갑니다 (F)': 'The camera follows the selected session\'s Claude (F)',
  '쉬는 캐릭터가 휴게실·카페·테라스 안을 옮겨 다니거나 산책하는 자율 행동': 'Resting characters wander around their rest room and go for walks',
  '실제 시각에 따라 창문·테라스·실내 빛이 바뀝니다 (아침 06~10 · 낮 10~17 · 저녁 17~20 · 밤 20~06). 미리보기로 시간대를 고정할 수도 있어요': 'Window, terrace and room light follow the real clock (morning 06–10 · day 10–17 · evening 17–20 · night 20–06). You can also fix one period for a preview',
  '이 세션 캐릭터의 이름 — 비우면 자동 별명, 이 브라우저에만 저장': 'This session\'s character name — empty means an automatic nickname; saved in this browser only',
  '저장한 설정을 지우고 기본값으로': 'Delete the saved look and go back to defaults',
  '지금 보는 층의 인테리어 프리셋 (층별 안내의 🎨 와 같음) — 색과 사무실 구조가 바뀝니다': 'Interior preset of the floor you are viewing (same as 🎨 in Floors) — changes colors and the office layout',
  '층을 건물처럼 쌓아 한눈에 (O)': 'Stack the floors like a building (O)', '키보드 단축키 표': 'Keyboard shortcut table', '터미널에서 이 세션을 이어가는 명령을 복사': 'Copy the command that resumes this session in a terminal', '이 층 인테리어 스타일 고르기': 'Pick this floor\'s interior style',
  '이 브라우저는 알림을 지원하지 않습니다': 'This browser does not support notifications', '답을 기다리고 있어요': 'waiting for your answer',
  '모두 펼치기': 'Expand all', '모두 접기': 'Collapse all', '모든 층의 세션 목록 열기': 'Open the session list of every floor', '모든 층의 세션 목록 닫기': 'Close the session list of every floor', '세션 없음': 'No sessions',
  '한국어 / English': '한국어 / English', '화면 언어': 'UI language',
  '드래그로 이동': 'Drag to pan', '휠로 확대': 'wheel to zoom', '캐릭터를 클릭하면 세션 선택': 'click a character to select its session',
  '숫자 층 번호로 이동 (12F 는 1,2 연타)': 'Digits go to a floor number (12F: press 1, 2)', '←/→ 이전·다음 층': '←/→ previous · next floor', 'F 따라가기': 'F follow', 'A 자동 따라가기': 'A auto-follow', 'D 데모': 'D demo', 'O 전체 보기': 'O building view', 'B 말풍선': 'B bubbles', 'S 소리': 'S sound', 'T 테마': 'T theme', '/ 로그 검색': '/ log search', 'Esc 닫기': 'Esc close', '? 이 도움말': '? this help',
  '어디서 무엇을 하나 ': 'Who goes where ',
};

// ---------- 패턴 규칙 (템플릿 문자열) ----------
const RULES = [
  [/^"(.+)" 검색 중$/, (m) => `searching "${m[1]}"`],
  [/^(.+) 읽는 중$/, (m) => `reading ${m[1]}`],
  [/^(.+) 수정 중$/, (m) => `editing ${m[1]}`],
  [/^(.+) 작성 중$/, (m) => `writing ${m[1]}`],
  [/^(.+) 실행 중$/, (m) => `running ${m[1]}`],
  [/^(.+) 찾는 중$/, (m) => `looking for ${m[1]}`],
  [/^(.+) 둘러보는 중$/, (m) => `browsing ${m[1]}`],
  [/^(.+) 맡기는 중$/, (m) => `delegating: ${m[1]}`],
  [/^(.+) 조회 중$/, (m) => `querying ${m[1]}`],
  [/^(.+) 사용 중$/, (m) => `using ${m[1]}`],
  [/^(.+) 실패: (.+)$/, (m) => `${m[1]} failed: ${m[2]}`],
  [/^허락 요청: (.+)$/, (m) => `permission request: ${m[1]}`],
  [/^(.+) 층으로 이동$/, (m) => `moved to ${m[1]}`],
  [/^(.+) 로 이동$/, (m) => `moving to ${m[1]}`],
  [/^제목: (.+)$/, (m) => `title: ${m[1]}`],
  [/^완료: (.+)$/, (m) => `done: ${m[1]}`],
  [/^알림 수신 \((.+)\)$/, (m) => `notification (${m[1]})`],
  [/^세션 종료 \((.+)\)$/, (m) => `session ended (${m[1]})`],
  [/^세션 (startup|resume|clear|compact|\w+)$/, (m) => `session ${m[1]}`],
  [/^기억 정리 \((.+)\)$/, (m) => `compacting memory (${m[1]})`],
  [/^(.+) 출근$/, (m) => `${m[1]} arrived`],
  [/^(.+) 퇴근(: .*)?$/, (m) => `${m[1]} left${m[2] || ''}`],
  [/^(.+) 세션을 목록에서 치우기$/, (m) => `Dismiss this ${tr(m[1])} session`],
  [/^(\d+)F (.+) 의 Claude$/, (m) => `Claude of ${m[1]}F ${m[2]}`],
  [/^(.+) \(나\)$/, (m) => `${m[1]} (me)`],
  [/^(.+) 의 머리$/, (m) => `head of ${m[1]}`],
  [/^(.+) 의 몸$/, (m) => `body of ${m[1]}`],
  [/^🎨 (\d+)F 인테리어$/, (m) => `🎨 ${m[1]}F interior`],
  [/^(.+) 의 Claude$/, (m) => `Claude of ${m[1]}`],
  [/^세션 (\d+)개$/, (m) => `${m[1]} session${m[1] === '1' ? '' : 's'}`],
  [/^프로젝트 (\d+)개$/, (m) => `${m[1]} project${m[1] === '1' ? '' : 's'}`],
  [/^(\d+)명 근무 중$/, (m) => `${m[1]} at work`],
  [/^(\d+)명 대기$/, (m) => `${m[1]} waiting`],
  [/^(\d+)건$/, (m) => `${m[1]} entries`],
  [/^(\d+) \/ (\d+)건$/, (m) => `${m[1]} / ${m[2]} entries`],
  [/^(\d+)초$/, (m) => `${m[1]}s`],
  [/^(\d+)분 (\d+)초$/, (m) => `${m[1]}m ${m[2]}s`],
  [/^(\d+)시간 (\d+)분$/, (m) => `${m[1]}h ${m[2]}m`],
  [/^(\d+)초 전$/, (m) => `${m[1]}s ago`],
  [/^(\d+)분 전$/, (m) => `${m[1]} min ago`],
  [/^(\d+)시간 전$/, (m) => `${m[1]} h ago`],
  [/^(\d+)일 전$/, (m) => `${m[1]} d ago`],
  [/^세션 시작 (.+) · 마지막 활동 (.+) · (.+)$/, (m) => `started ${tr(m[1])} · last activity ${tr(m[2])} · ${m[3]}`],
  [/^(.+) \(데모\)$/, (m) => `${m[1]} (demo)`],
  [/^· (.+)$/, (m) => `· ${tr(m[1])}`],
  [/^(\d+)F (.+)$/, (m) => `${m[1]}F ${tr(m[2])}`],
];

const cache = new Map();
const HANGUL = /[가-힣]/;
const EMOJI_LEAD = /^(\p{Extended_Pictographic}\uFE0F?)\s+(.+)$/u;
// 사전 → 패턴 → 이모지 머리 → ' → ' / ' · ' 로 나눠 조각별. 모르는 조각(사용자 프롬프트·세션 제목·Claude 메시지)은 손대지 않는다
function translate(s) {
  if (DICT[s] !== undefined) return DICT[s];
  const t = s.trim();
  if (t !== s && DICT[t] !== undefined) return s.replace(t, DICT[t]);
  if (/^".*"$/s.test(t)) return s; // 로그의 "프롬프트" 는 사용자 글
  for (const [re, fn] of RULES) { const m = re.exec(t); if (m) return s.replace(t, fn(m)); }
  const em = EMOJI_LEAD.exec(t);
  if (em) { const inner = tr(em[2]); return inner === em[2] ? s : s.replace(t, `${em[1]} ${inner}`); }
  if (t.includes(' → ')) return s.replace(t, t.split(' → ').map((p) => tr(p)).join(' → '));
  if (t.includes(' · ')) return s.replace(t, t.split(' · ').map((p) => tr(p)).join(' · '));
  return s;
}
/** 문자열 번역. 한국어 모드이거나 한글이 없으면 그대로 */
export function tr(s) {
  if (lang !== 'en' || typeof s !== 'string' || !HANGUL.test(s)) return s;
  let v = cache.get(s);
  if (v === undefined) { v = translate(s); if (cache.size > 5000) cache.clear(); cache.set(s, v); }
  return v;
}

// ---------- DOM ----------
const originals = new WeakMap();  // Text → 원문 (앱이 쓴 값)
const written = new WeakMap();    // Text → 우리가 마지막으로 쓴 값
const attrOrig = new WeakMap();   // Element → { attr: 원문 }
const attrWritten = new WeakMap();// Element → { attr: 우리가 쓴 값 }
const ATTRS = ['title', 'placeholder', 'data-tip', 'aria-label'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'KBD']);
function applyText(node) {
  const cur = node.nodeValue;
  if (written.get(node) !== cur) originals.set(node, cur); // 처음 보거나 앱이 새로 썼다
  const orig = originals.get(node);
  const want = lang === 'en' ? tr(orig) : orig;
  if (cur !== want) node.nodeValue = want;
  written.set(node, want);
}
function applyAttrs(el) {
  let o = attrOrig.get(el), w = attrWritten.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    if (!o) { o = {}; attrOrig.set(el, o); w = {}; attrWritten.set(el, w); }
    const cur = el.getAttribute(a);
    if (w[a] !== cur) o[a] = cur;
    const want = lang === 'en' ? tr(o[a]) : o[a];
    if (cur !== want) el.setAttribute(a, want);
    w[a] = want;
  }
}
function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!root.parentNode || !SKIP.has(root.parentNode.nodeName)) applyText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (SKIP.has(root.nodeName)) return; applyAttrs(root); }
  for (const c of root.childNodes) walk(c);
}
let observer = null;
/** 페이지에 붙인다: 지금 DOM 을 번역하고, 이후 바뀌는 노드도 따라간다 */
export function attach(root = document.body) {
  walk(root);
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') applyText(m.target);
      else if (m.type === 'attributes') applyAttrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });
}
export function setLang(v) {
  if (v !== 'ko' && v !== 'en') return;
  if (v === lang) return;
  lang = v;
  try { storage()?.setItem(KEY, v); } catch {}
  cache.clear();
  if (typeof document !== 'undefined') { document.documentElement.lang = v; walk(document.body); }
  for (const fn of listeners) fn(v);
}
