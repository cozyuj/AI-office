# AI Office 구조 설계

Claude Code 세션이 지금 무엇을 하는지 아이소메트릭 사무실 화면으로 실시간 보여주는 로컬 앱 (웹 + macOS/Windows 데스크톱).
파일을 읽으면 자료실, 명령을 돌리면 서버실, 막히면 그 자리에서 고민, 서브에이전트는 엘리베이터로 출근.

> 이 문서는 v0.29 기준이다. 기능 소개·스크린샷은 `docs/AI-Office-소개.html`.

## 1. 전체 흐름

```
Claude Code 세션 (여러 터미널, 여러 프로젝트, 워크트리)
  │  ~/.claude/settings.json hooks (12개 이벤트)
  ▼
hooks/emit.js            stdin JSON → POST 127.0.0.1:<port>/hook (Node 만 사용, 1초 타임아웃, 항상 exit 0, 시작 시각을 X-AI-Office-Ts 헤더로)
lib/reorder.js           시작 시각이 붙은 훅을 300ms 모았다가 그 순서로 적용 (백그라운드 훅의 도착 순서 보정)
  │
  ▼  POST /hook
server.js (Node 18+, 외부 의존성 0, 127.0.0.1 에만 listen)
  ├─ 접근 검사   Host 루프백 · Origin 허용 목록 (9절)
  ├─ journal     payload 를 ~/.ai-office/events.jsonl 에 append → 기동 시 최근 2시간 재생
  ├─ dailyStats  상태 전이·훅을 일별 집계 → ~/.ai-office/stats/YYYY-MM-DD.json (30일)   lib/dailyStats.js
  ├─ normalize   payload → 작은 Event (도구→방·말풍선, 큰 필드 자르기)        lib/normalize.js
  ├─ state       Event → 층/세션/캐릭터 상태 머신, 활동 로그 500건, sweep      lib/state.js
  └─ broadcast   SSE /events 로 snapshot · update · remove · floor · demo
  │
  ▼  GET /events (SSE), GET /api/state
public/ (브라우저, 번들러 없음, ES module)
  ├─ store       서버 상태 미러 + 선택·접기 상태 + 구독
  ├─ scene       canvas 아이소메트릭 사무실: 층 레이아웃, 가구, 캐릭터 이동(A*), 말풍선, 카메라, 시간대 조명
  ├─ panels      좌: 층별 안내(층·세션 목록) / 우: 사무실 사람들·활동 로그·범례 / 전체 보기(건물 단면)
  └─ i18n        한국어 원문 + 영어 번역 (DOM 자동, 캔버스는 tr())
```

- 훅은 Claude 실행을 절대 막지 않는다. 서버가 꺼져 있어도 1초 안에 조용히 포기한다.
- 서버는 "지금 상태"의 단일 진실 공급원이다. 브라우저는 상태를 받아 애니메이션만 담당한다.
- 브라우저를 몇 개 열어도, 새로 열어도 같은 화면이다 (접속 시 snapshot 수신). 서버를 다시 켜도 저널 재생으로 같은 화면이 돌아온다.
- 데스크톱 앱은 같은 서버를 사이드카 Node 로 띄우고 창에 같은 화면을 연다 (10절).

## 2. 데이터 모델

```ts
Floor {                      // 프로젝트 = 층. id = git 저장소 루트 (lib/project.js 가 .git 을 위로 찾는다. 없으면 cwd)
  id: string                 // 워크트리도 원래 저장소의 층으로 모인다
  name: string               // basename(id). 이름이 겹치면 상위 폴더를 붙여 구분
  no: number                 // 출현 순서로 1F, 2F, ...
  style: string              // 인테리어 프리셋 id (직접 선택 > 층 id 해시). ~/.ai-office/floor-styles.json
  sessions: Set<sessionId>
  lastActivity: number
}

Session {
  id: string                 // hook.session_id
  floorId: string            // 처음 정해진 층 유지 (cwd 가 하위 폴더로 바뀌어도). 예외: git 저장소가 아닌 폴더에서 연 세션은
                             // 도구 경로(file_path·path·Bash 앞머리 cd)의 저장소를 세어 고친 파일 최다 → 본 횟수 최다 저장소 층으로 옮긴다 (BE-22, lib/state.js follow)
  title: string              // 훅 session_title > transcript 의 마지막 custom-title > 첫 요청 앞부분
  firstPrompt, lastPrompt    // 첫 요청(transcript 앞 1MB 에서 복원), 최근 요청
  status: 'thinking' | 'working' | 'waiting' | 'idle' | 'ended'
  cwd, branch, worktree      // 헤더·툴팁 표시용
  transcriptPath             // 제목 갱신·생존 확인(stat)용
  startedAt, lastActivity: number
  agents: { [agentId]: Agent } // 'main' + 서브에이전트들
  pendingSubagents: string[] // Agent 툴 PreToolUse 의 description 큐 (SubagentStart 와 짝지음)
}

Agent {                      // 화면의 캐릭터 한 명
  id: 'main' | agent_id
  kind: 'main' | 'sub'
  name: string               // "Claude" | Agent 툴 description | agent_type. 화면 이름은 클라이언트 names.js 가 별명으로 바꾼다
  room: RoomId               // 지금 있어야 할 방
  activity: ActivityId       // 'arrive' | 'think' | 'read' | 'search' | 'run' | 'edit' | 'web' | 'delegate' | 'plan' | 'ask' | 'rest' | 'compact' | 'work' | 'leave'
  icon, bubble: string       // 말풍선  예: "📖 server.js 읽는 중"
  tool?: { name, useId, target, detail }
  since: number              // 현재 activity 시작 시각 (경과 시간 표시용)
}

LogEntry { t, floorId, sessionId, agentId, agentName, icon, text }

RoomId = 'library' | 'dev' | 'research' | 'server' | 'meeting' | 'lounge' | 'cafe' | 'terrace' | 'mydesk' | 'lobby' | 'elevator'
         // cafe/terrace 는 서버의 "휴식 방" id. 층 레이아웃이 실제 편의시설(헬스장·구내식당 …)로 별칭한다 (6절)
```

세션 생명주기 (sweep 은 1초마다, transcript stat 은 세션당 1분에 한 번, 일하는 중·답 기다림이면 10초)
- 허락 요청·질문(waiting)은 도구가 끝나면(PostToolUse) 답을 받은 것으로 보고 고민 중으로 → Dock·메뉴바 빨간 점이 바로 꺼진다
- Esc 중단은 Stop 훅이 오지 않는다 → 마지막 훅 뒤 transcript 의 마지막 대화 줄이 `[Request interrupted by user…]` 면 휴식 방으로 "중단됨", 서브에이전트는 퇴근
- 30분 무활동 → 휴식 방으로 "자리 비움"
- 10분 무활동부터 transcript 를 확인해 60분 동안 갱신이 없으면 퇴근 처리 (터미널을 그냥 닫은 경우)
- 2시간 무활동 → 퇴근. SessionEnd 후 10초 뒤 제거
- 사용자가 화면에서 치운 세션(DELETE)은 저널에 `SessionEnd(reason: dismissed)` 로 남겨 재시작해도 되살아나지 않는다
- 제목: 훅의 session_title 이 바뀔 때마다 따르고(분리된 세션), transcript 끝 64KB 의 custom-title 을 mtime 이 바뀌었을 때만 1분에 한 번 읽는다. 바뀌면 로그 "🏷️ 제목: …"

## 3. 훅 이벤트 → 상태 전이

Claude Code 2.1.x 훅 payload 기준. 서브에이전트가 낸 도구 호출은 `agent_id` 가 실려 오므로 그 값으로 캐릭터를 찾는다. 없으면 `main`.

| 훅 이벤트 | 대상 | 방 | activity | 말풍선 | 비고 |
|---|---|---|---|---|---|
| SessionStart | main 생성 | elevator → mydesk | wait | "출근" | source=resume/compact 는 기존 세션 유지 |
| UserPromptSubmit | main | 현재 위치 | think | "고민 중…" | firstPrompt(없을 때)·lastPrompt 갱신. status=thinking |
| PreToolUse | agent_id 또는 main | 도구별 방 (4절) | 도구별 | 도구별 문구 | status=working |
| PostToolUse | 동일 | 그 자리 | think | "고민 중…" | tool 해제. duration_ms 로그 |
| PostToolUseFailure | 동일 | 그 자리 | think | "❌ 실패, 다시 생각 중" | error 앞 80자 로그 |
| PreToolUse(Agent) | main | meeting | delegate | "{description} 맡기는 중" | description 을 pendingSubagents 에 push |
| SubagentStart | 새 sub 생성 | elevator → meeting | think | "출근했습니다" | name = pendingSubagents.shift() ?? agent_type |
| SubagentStop | sub | elevator | leave | "퇴근" | 3초 뒤 제거 (클라이언트가 걸어서 나감) |
| Notification(permission_prompt) | main | mydesk | ask | "허락이 필요해요" | status=waiting |
| Notification(idle_prompt) | main | 휴식 방* | rest | "할 일 기다리는 중" | status=idle |
| Notification(elicitation_*, agent_needs_input) | main | mydesk | ask | message 앞 40자 | status=waiting |
| PreToolUse(AskUserQuestion) | main | mydesk | ask | "질문 있어요" | status=waiting |
| Stop | main | 휴식 방* | rest | "휴식 중" / "커피 마시는 중" / "바람 쐬는 중" | status=idle. last_assistant_message 앞 60자 + 간 곳 로그 |
| PreCompact | main | 현재 위치 | compact | "기억 정리 중" | 쉬는 중 자동 압축(백그라운드)은 기록만 |
| PostCompact | main | 원래대로 | think / rest | | 기억 정리 중일 때만. SessionStart(compact)도 같은 정리 |
| TaskCompleted | – | – | – | – | 로그만 ("✅ {task_subject}") |
| SessionEnd | 세션 | elevator | leave | "퇴근" | status=ended, 10초 뒤 세션 제거 |

추가 규칙
- *휴식 방: `lounge`(휴게실) · `cafe`(카페) · `terrace`(테라스) 중 하나를 세션 id 해시(`restRoomFor`)로 고른다. 서버가 정하므로 모든 클라이언트가 같은 방을 보고, 같은 세션은 늘 같은 방이다. 30분 자리 비움도 같은 방.
- 휴식 중인 캐릭터는 클라이언트(`actors.js` roamStep)가 그 방의 명소(`spots.js` REST_SPOTS)를 10~30초마다 옮겨 다니게 한다. 자리는 Slots 로 점유해 둘이 겹치지 않고, 새 이벤트가 오면 즉시 멈추고 해당 방으로 간다. "생동감" 이 꺼져 있으면 자리를 옮기지 않는다.
- 2시간 동안 이벤트 없는 세션은 `ended` 로 간주해 정리한다 (터미널을 그냥 닫은 경우).
- 서브에이전트가 있는 동안 main 은 meeting 에서 `delegate` 를 유지하되, main 이 직접 도구를 쓰면 그 도구 규칙을 따른다.
- `tool_response`, `prompt`, `last_assistant_message` 등 큰 필드는 normalize 단계에서 앞부분만 남기고 버린다 (메모리/SSE 크기 보호).

## 4. 도구 → 방 / 말풍선

| 도구 | 방 | activity | 말풍선 예시 |
|---|---|---|---|
| Read, NotebookRead | library | read | `server.js 읽는 중` |
| Grep, Glob, LS | library | search | `"TODO" 검색 중` / `*.ts 찾는 중` |
| Bash | server | run | description 있으면 그것, 없으면 명령 앞 30자 + ` 실행 중` |
| Edit, Write, MultiEdit, NotebookEdit | dev | edit | `app.js 수정 중` / `README.md 작성 중` |
| WebSearch, WebFetch | research | web | `"tauri vs electron" 검색 중` / `docs.claude.com 읽는 중` |
| mcp__* (MCP 도구) | research | web | `{server}: {tool} 조회 중` |
| Agent, Task | meeting | delegate | `{description} 맡기는 중` |
| TodoWrite, Skill, EnterPlanMode, ExitPlanMode | meeting | plan | `할 일 정리 중` / `{skill} 실행 중` / `계획 세우는 중` |
| AskUserQuestion | mydesk | ask | `질문 있어요` |
| 그 외 | dev | work | `{tool} 사용 중` |


## 5. 서버 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/hook` | 훅 payload 수신. body 2MB 제한. 먼저 204 를 돌려주고 처리. 데모가 꺼져 있으면 `/demo/` 이벤트는 무시 |
| GET | `/events` | SSE. 접속 즉시 `snapshot` 1회, 25초마다 ping |
| GET | `/api/state` | 현재 전체 상태 JSON (snapshot 과 같은 모양) |
| POST | `/api/floors/style` | `{ floorId, style }` 층 인테리어 프리셋 지정 (null 이면 자동) |
| DELETE | `/api/sessions/:id` | 끝난/자리 비운 세션을 목록에서 치운다 |
| GET | `/api/stats?date=YYYY-MM-DD` | 그날 근무 기록 요약 `{ date, today, totals, projects[], sessions[], dates[] }` (생략하면 오늘, 형식이 틀리면 400) |
| POST | `/api/demo/start` · `/api/demo/stop` | 데모 세션 시작 / 중지(데모 세션 전부 제거) |
| GET | `/` | `public/` 정적 파일 |

SSE 메시지
```
event: snapshot   data: { me, floors, sessions, log, serverPort, hookPort, version, demo, journal }
event: update     data: { session, floor, log? }
event: remove     data: { sessionId, floorId? }
event: floor      data: Floor            // 이름 구분·프리셋 변경
event: demo       data: { on }
```

- 포트 기본 4777, `AI_OFFICE_PORT` 로 변경. 훅 명령에 포트가 박혀 있어(`lib/hookport.js` 로 읽음) 서버 포트와 다르면 화면에 경고한다.
- 홈 폴더 `~/.ai-office` (`AI_OFFICE_HOME`). `--no-journal` 로 저널 끄기 (근무 기록도 디스크에 쓰지 않고 메모리에만).
- `AI_OFFICE_WATCH_PARENT=1` 이면 부모 프로세스(앱·CLI)가 강제 종료될 때 서버도 스스로 끝난다.

### 저널 (lib/journal.js)

- 훅 payload 를 큰 필드를 자른 채 한 줄씩 append (데모 이벤트는 남기지 않음).
- 기동 시 최근 2시간(SESSION_TTL)만 시간 순서대로 `state.apply` 에 다시 흘려 상태를 복원한다.
- 매시간 + 20MB 초과 시 오래된 줄을 버리고 다시 쓴다(압축). `ai-office compact` 로 즉시 압축, `ai-office doctor` 가 크기를 보여준다.

### 근무 기록 (lib/dailyStats.js, FE-72)

- 저널은 2시간만 남기므로 하루 요약은 원본 이벤트가 아니라 **세션별 하루 합계**로 따로 쌓는다: `stats/YYYY-MM-DD.json` = `{ date, sessions: { id → { title, project, cwd, branch, thinkMs, workMs, waitMs, prompts, tools: { 이름 → 횟수 }, files[], fileCount, subagents, firstAt, lastAt } } }`
- 시간: 세션마다 `{ status, since }` 를 들고, 훅 적용 직전(`observe`)·직후와 1초 sweep(`sync`)마다 직전 상태로 머문 시간을 더한다. thinking → `thinkMs`, working → `workMs`, waiting → `waitMs` (idle·away·ended 는 세지 않음). 로컬 자정을 넘기면 날짜별로 나눈다. 요약의 "일한 시간" = thinking + working
- 개수: 적용한 훅 payload 로 센다 — `UserPromptSubmit`(시스템 알림 제외) · `PreToolUse`(도구 이름별, Edit·MultiEdit·Write·NotebookEdit 의 파일 경로는 중복 없이) · `SubagentStart`
- 데모 세션(`/demo/`)은 세지 않는다. 저널 재생은 이미 센 이벤트라 `daily` 를 부르지 않고, 재생이 끝난 뒤의 상태부터 시간을 잰다 → 재시작해도 이중 집계 없이 같은 날 파일에 이어 쌓인다 (꺼져 있던 동안은 빈다)
- 쓰기는 5초마다 바뀐 날짜만 (임시 파일 → rename), 종료 시 한 번 더. 메모리에는 오늘·어제만. 30일이 지난 파일은 기동 시·날짜가 바뀔 때 지운다

## 6. 프론트엔드 모듈

```
public/
  index.html          3단 레이아웃 (좌 층별 안내 / 중앙 canvas / 우 사람들·로그), 상단 헤더(층·세션 제목·브랜치·LIVE)
  style.css           라이트/다크 테마 토큰, 패널 카드
  fonts/              서브셋 웹폰트 (scripts/subset-fonts.sh)
  assets/characters/  캐릭터 스프라이트 webp: 12명 색 시트(머리·몸통 레이어) + 마스크 시트(머리카락·상의·하의 음영) + 소품 4장 + 테마 캐릭터 6장 (scripts/bake-characters 로 굽는다)
  js/
    weather.js        야외 날씨 (FE-61): WMO 코드 → 비·눈, Open-Meteo 지오코딩·현재 날씨
    main.js           SSE 연결·재접속, store 갱신, 알림(소리·브라우저 알림), 설정, 키보드(1~9 층 이동)
    store.js          floors/sessions/log 미러, 선택된 층/세션, 층 접기(auto/all/none), subscribe()
    panels.js         좌·우 패널 DOM (층 목록 + 모두 펼치기/접기, 세션 목록, 사람들, 활동 로그, 범례)
    overview.js       전체 보기: 층을 건물처럼 쌓아 미니 사무실 + 캐릭터 점
    i18n.js           언어: 한국어 원문, 영어는 사전 → 패턴 규칙 → 구절 치환. 사용자 요청·제목은 번역하지 않는다
    names.js          세션별 캐릭터 별명 (localStorage)
    customize.js, avatarStore.js   캐릭터 고르기 (대상별 12명 중 하나 / 자동 / 올린 그림)
    customCharacters.js            커스텀 캐릭터: PNG 투명 여백 자르기·256px 축소, dataURL 을 localStorage 에 (FE-56)
    floorStylePicker.js            층 🎨 → 인테리어 프리셋 선택 (서버에 저장)
    statsView.js                   📊 오늘의 근무 기록 모달: GET /api/stats → 합계·프로젝트별·세션별·도구별, 날짜 이동 (FE-72)
    tooltip.js, texttip.js         캐릭터 툴팁, 잘린 글자 툴팁
    scene/
      layouts.js      층 레이아웃 생성기: 4열 × 띠 격자에 방 배치, 방 크기에 맞는 가구·서는 자리·휴식 명소
      floorStyle.js   인테리어 프리셋(색) ↔ 레이아웃 연결
      map.js          타일 격자(x 1..35, y 1..21), 벽·문, 통행 맵, 투영. setLayout() 으로 층마다 교체
      pathfind.js     A* (4방향), 벽 edge 와 solid 가구 회피
      actors.js       Agent → Actor(위치, 경로, 걷기 애니, 말풍선, 슬롯 점유/해제, 휴식 방 안 배회)
      spots.js        휴식 방 명소 (레이아웃이 채우는 live 객체)
      decorPlan.js    테마 층 소품 배치 (순수 함수, FE-60)
      decor.js        테마 층 소품 그리기 (호박·솥·유령·박쥐·트리·벽난로·눈사람·파라솔·선베드·풀장 …)
      characters.js   캐릭터 스프라이트 (Kenney Mini Characters, CC0) 동작 프레임·안전모, 파트 조합('mix:...') 레이어·색 입히기·소품, 커스텀 그림('custom:<id>') 그리기
      render.js       바닥 → 3D AABB 깊이 정렬된 가구/벽/캐릭터 → 방 이름표·말풍선
      sprites.js      가구·벽을 코드로 그리는 함수들 (외부 이미지 없음)
      camera.js       팬·줌·맵 맞춤·클릭 판정, 선택 세션 따라가기
      daylight.js     실제 시각 → 아침/낮/저녁/밤 창문·실내 틴트
```

층 레이아웃과 인테리어 프리셋

| 프리셋 | 레이아웃 | 휴식 방 cafe / terrace 가 되는 곳 |
|---|---|---|
| 따뜻한 우드 · 파스텔 | classic | 카페 / 테라스 |
| 쿨 그레이 | studio | 스튜디오 / 세미나실 |
| 민트 | fitness | 헬스장 / 옥상정원 |
| 라벤더 | play | 북 라운지 / 게임룸 |
| 샌드 | canteen | 구내식당 / 수면실 |

- 업무 방 9개(library·dev·research·meeting·lounge·server·mydesk·lobby·elevator)는 모든 레이아웃에 있다. 위치만 다르다.
- 서버(`lib/floorStyle.js`)가 같은 표를 CommonJS 로 들고 있어 휴식 말풍선을 그 층 편의시설에 맞춘다 (`test/floorStyleShared.test.js` 가 두 표 일치를 고정).
- 캐릭터는 방마다 정해진 "서는 자리(slot)" 중 빈 곳을 차지한다. 이동은 A* 경로, 초당 4타일.
- 휴식 중인 캐릭터는 그 방 명소를 10~30초마다 옮겨 다닌다. 새 이벤트가 오면 즉시 해당 방으로 간다.
- 서브에이전트는 엘리베이터에서 생성되어 회의실로 걸어오고, 끝나면 엘리베이터로 걸어가 사라진다.
- 사용자 캐릭터("{me} (나)")는 내 자리에 앉아 있다. Claude 가 `ask` 상태면 그 옆에 와서 선다.

## 7. CLI · 설치 스크립트

| 파일 | 역할 |
|---|---|
| `bin/ai-office.js` | `ai-office` (설치 + 훅 등록 + 서버 + 브라우저), `install [--force]`, `install-hooks`, `uninstall-hooks`, `start`, `demo`, `doctor`, `compact` |
| `hooks/emit.js` | 훅 명령. stdin → POST. 실패 무시 (`emit.sh` 는 예전 curl 버전. 등록돼 있으면 install-hooks 가 emit.js 로 바꾼다) |
| `scripts/install-hooks.js` | `settings.json` 백업 후 12개 이벤트에 emit.js 항목 병합, 이미 있으면 건너뜀, `--remove` 로 제거. 도구 훅 3종(PreToolUse · PostToolUse · PostToolUseFailure)은 `async: true` 로 등록해 Claude 가 Node 시작(약 40ms)을 기다리지 않는다 |
| `lib/nodepath.js` | 훅 명령에 넣을 Node 경로: `~/.ai-office/node` > Homebrew Cellar 버전 폴더 → 버전 없는 opt 링크 > 현재 Node. Node 를 업그레이드해도 훅이 안 깨지게 |
| `scripts/demo.js` | 가짜 세션들이 읽기→검색→실행→수정→서브에이전트→질문→휴식 시나리오를 반복 POST |
| `scripts/bump-version.js` | 버전을 package.json · app/package.json · tauri.conf.json · Cargo.toml 에 동시 반영 (`npm run bump:patch|minor`) |
| `scripts/fetch-node.js` | 데스크톱 앱 사이드카용 Node 바이너리 다운로드 (커밋하지 않음) |
| `scripts/update-homebrew.js` | 릴리스 뒤 Homebrew tap 의 cask·formula 버전과 sha256 갱신 |
| `scripts/make-tray-icon.js` | 메뉴바 템플릿 아이콘(빨간 점 변형 포함) 생성 |

- CLI 는 앱 파일을 `~/.ai-office/app` 에 복사해 두고 거기서 실행한다(npx 캐시가 지워져도 훅이 살아 있게). 데스크톱 앱이 깔아 둔 것(`.app-version`)은 `--force` 없이는 덮어쓰지 않는다.


## 8. 설계상 결정

- **의존성 0**: 설치 마찰을 없애고 데스크톱 앱(사이드카 Node)으로 그대로 옮기기 위해 Node 내장 모듈과 바닐라 JS 만 쓴다.
- **SSE, WebSocket 아님**: 서버→브라우저 단방향이면 충분하고 재접속이 브라우저에 내장돼 있다.
- **상태는 서버에서 계산**: 훅 이벤트 해석 규칙이 한 곳에 있어야 테스트하기 쉽고, 브라우저는 "어디로 가서 무슨 말풍선" 만 받는다.
- **그림 자산 없음**: 가구·캐릭터를 canvas 코드로 그린다 (sprites.js · avatar.js).
- **재생 가능한 저널**: 상태를 직접 저장하지 않고 원본 이벤트를 남겨 재생한다. 상태 머신이 바뀌어도 저널은 그대로 쓸 수 있다.
- **뷰어 설정은 브라우저에**: 별명·외형·언어·테마는 localStorage. 층 인테리어처럼 모두가 같이 봐야 하는 것만 서버에 둔다.
- **커스텀 캐릭터도 브라우저에 (FE-56)**: 올린 PNG 는 서버로 보내지 않는다. 투명 여백을 자르고 긴 변 256px 로 줄인 dataURL 을 `aiOffice.customCharacters.v1` 에 두고(최대 24장·2.5MB, 실패하면 되돌림), 고른 값은 `custom:<id>` 로 `aiOffice.characters.v1` 에 섞인다. 키를 나눠 그림 저장이 실패해도 고르기 설정은 남는다. '자동' 해시는 Kenney 12명만 쓴다. 정지 그림 한 장이라 동작은 몸 전체의 오프셋·기울기·눌림으로 보이고, 안전모 위치는 스프라이트와 같은 알파 스캔(`scanHead`)으로 찾는다.
- **파트 조합은 굽고 겹친다 (FE-57)**: Kenney 12명은 뼈대가 같고 모델이 머리·몸통 두 덩어리라, 굽기에서 머리 레이어(몸통은 깊이만 써서 팔이 앞에 오면 머리가 잘린다)와 몸통 레이어를 따로 굽는다. 모두 같은 배율(가장 큰 캐릭터 기준)·같은 앉기 높이라 아무 머리나 아무 몸 위에 겹치면 맞는다. 색 바꾸기는 팔레트(8열×4띠) 칸으로 부위를 고른다: 피부 = 머리와 팔에 함께 쓰인 칸, 머리카락 = 머리의 그다음 넓은 칸(얼굴에 붙은 납작한 눈·입은 뺌), 상의·하의 = 몸통·팔 / 다리(신발 위)에서 가장 넓은 칸. 그 부위를 흰 알베도 × 상대 밝기로 다시 그린 음영을 마스크 시트에 두고, 그릴 때 선형 색공간에서 음영 × 새 색으로 칠한 레이어를 캐시한다(최근 16개). 소품은 원래 안경이 없는 male-f 의 머리 뼈에 붙여 구운 시트 하나를 모든 머리에 얹는다. 값은 문자열 `mix:<머리>.<몸>.<머리카락>.<상의>.<하의>.<소품>` 이라 기존 저장·정규화·대상별 설정을 그대로 탄다.
- **테마 층은 구조 위에 덮는 스킨 (FE-60)**: 할로윈·크리스마스·여름휴가는 프리셋과 달리 레이아웃을 바꾸지 않는다. 그리는 키가 `halloween/mint` 처럼 테마/구조라, 서버는 직접 고른 값(`floor.style`)이 테마면 휴식 방 이름을 자동 프리셋(`styleAuto`) 구조로 말한다(`FS.baseOf`). 날짜 자동(설정 '테마 층')은 브라우저 설정이고 직접 고르지 않은 층에만 덮이며, 구조가 그대로라 서버의 휴식 방 말과 어긋나지 않는다. 소품 자리는 `decorPlan.js` 가 레이아웃만 보고 정하고(자리·명소·문 앞 비우기, 구석·뒷벽 우선, 벽 소품은 키 큰 바깥벽에만), `map.js` 가 큰 소품을 막아도 엘리베이터에서 모든 자리·명소에 길이 남을 때만 막는다. 그리기는 `decor.js`(평면 벡터, 반짝이·흔들리는 것만 매 프레임), 바닥 무늬·벽 색·틴트는 팔레트(`palette()`)가 테마에서 준다. 정적 엔티티 캐시는 `레이아웃|테마` 키. 층 전체 분위기(FE-63): 화면 공간 배경 하늘(`drawThemeBackdrop`, 별·달·박쥐 떼·눈송이·구름), 문 구멍 사이 벽 토막마다 가랜드(그 벽 높이에 맞춰), 방마다 러그·안개(`kind: 'flat'` 은 바닥 캐시에 그린다), 복도 빈 타일에 띄엄띄엄 소품.
- **테마 캐릭터 (FE-62)**: Graveyard Kit 캐릭터는 뼈대 대신 부위별 메시(머리·몸통·팔·다리)로 움직이지만 동작 이름이 미니 캐릭터와 같아, 굽기에서 `head` 메시를 머리 레이어로 나눠 같은 시트 모양(머리 행 + 몸통 행)으로 굽는다(색 마스크 없음). 그래서 뱀파이어·좀비·해골은 `MIX_PARTS` 로 머리·몸 섞기에 들어간다. Holiday Kit 의 눈사람·순록은 동작이 없어 미니 캐릭터 키로 줄여 한 장을 모든 칸에 복사하고, 그릴 때 올린 그림과 같은 몸 전체 움직임(`motionOf`)을 준다. 산타 모자·루돌프 뿔·호박 탈은 굽지 않는 코스튬(`ACCESSORIES` 의 `draw`)으로 안전모처럼 프레임마다 찾은 머리 위치에 그린다(머리 레이어가 비면 몸통 레이어에서 찾는다).
- **야외 날씨는 브라우저에서 (FE-61)**: 비·눈은 뷰어 설정(`aiOffice.weather`)이라 서버를 거치지 않는다. 실제 날씨는 브라우저가 Open-Meteo 에 직접 묻는다(키·CORS 문제 없음, 도시 이름과 좌표만): 지오코딩은 이름이 같은 작은 마을이 먼저 나오고 한글 짧은 이름('서울')이 안 잡혀, 행정구역 접미사를 붙인 후보까지 모아 인구가 가장 많은 곳을 고른다. 현재 날씨 코드(WMO)를 30분마다 받아 비·눈·맑음으로 줄이고, 지금 내릴 것은 설정·실제 날씨·층 테마(크리스마스는 기본 눈)를 합쳐 매 프레임 정한다(`effectiveWeather`). 그리기는 야외 방 위 상자 안에서 떨어지는 입자(월드 공간, 엔티티 뒤에 그려 앞을 덮음)와 바닥 톤, 비 오는 날 장면 틴트.
- **범위**: Claude Code 훅만 받는다. claude.ai 채팅·클라우드 세션은 훅이 없어 다루지 않는다.

## 9. 보안 (BE-21)

서버는 `127.0.0.1` 에만 열리지만, 브라우저에 열린 다른 웹사이트도 그 주소로 요청할 수 있다. 세션 제목·요청·경로를 읽거나 가짜 이벤트를 넣지 못하게:

- `Host` 이름이 `127.0.0.1` / `localhost` / `[::1]` 이 아니면 403 → DNS 리바인딩 차단
- `Origin` 이 있으면 이 서버 화면(같은 포트), 데스크톱 앱 창(`tauri://localhost`, `http(s)://tauri.localhost`)만 허용, 나머지(`null` 포함) 403
- `Access-Control-Allow-Origin` 은 허용된 Origin 만 그대로 돌려준다 (`*` 쓰지 않음)
- 훅(emit.js)·CLI·curl 은 Origin 을 보내지 않으므로 영향 없음

## 10. 데스크톱 앱 (app/, Tauri 2)

```
AI Office.app / AI Office.exe  (app/src-tauri/src/lib.rs)
  ├─ 리소스(server.js·lib·public·hooks·scripts) → ~/.ai-office/app 에 복사 (.app-version 이 다를 때만)
  ├─ 사이드카 Node → ~/.ai-office/node 에 복사 → 훅 명령도 이 Node 를 쓴다
  ├─ 훅 등록 (install-hooks.js --app-dir …)
  ├─ 서버 자식 프로세스 (AI_OFFICE_WATCH_PARENT=1, Windows 는 CREATE_NO_WINDOW). 포트가 이미 열려 있으면 그 서버를 쓴다
  ├─ 창: app/dist/index.html 로더가 /api/state 가 뜰 때까지 기다렸다 http://127.0.0.1:<port>/ 로 이동
  ├─ 트레이(메뉴바): 왼쪽·오른쪽 클릭 모두 메뉴. 기다리는 세션이나 받아 둔 업데이트가 있으면 빨간 점
  │    (macOS 는 status item 의 effectiveAppearance 로 글자 색 결정), Dock 배지 / Windows 오버레이 아이콘도 같은 규칙
  ├─ 업데이터 (tauri-plugin-updater): 백그라운드에서 내려받기만 → 메뉴 "업데이트 적용" 때 서버 종료 → 설치 → 재시작.
  │    성공 전엔 5분마다, 성공 뒤엔 6시간마다 확인
  │    메뉴 "업데이트 확인"·"업데이트 적용" 은 진행 창(app/dist/update.html)을 띄운다: 확인 → 다운로드 막대(취소) → 설치 중 → 재시작.
  │    창은 IPC 권한 없이 Rust 가 eval 로 상태를 넣고, 버튼은 가짜 주소 이동 → on_navigation 이 받는다
  └─ 로그인 시 자동 실행 (tauri-plugin-autostart, LaunchAgent / Run 키, --hidden). 첫 실행에 한 번 켜고 메뉴 체크박스로 끔
```

## 11. 배포 · CI

| 경로 | 내용 |
|---|---|
| GitHub Release | 태그 `v*` → `.github/workflows/release.yml`: macOS arm64 dmg + `.app.tar.gz(.sig)`, Windows NSIS(.sig), `latest.json`(업데이터), 고정 이름 사본(`AI-Office-mac-arm64.dmg`, `AI-Office-windows-x64-setup.exe`), Windows 설치 스모크 테스트 |
| npm | `claude-ai-office` (bin `ai-office`). 2FA 때문에 사람이 `npm publish` |
| Homebrew | `cozyuj/homebrew-tap`: `Casks/ai-office.rb`(dmg, 격리 속성 제거), `Formula/claude-ai-office.rb`(npm tarball). release 가 성공하면 `homebrew.yml` 이 둘을 갱신해 푸시(formula 는 npm 에 그 버전이 있을 때). npm publish 뒤엔 `gh workflow run homebrew.yml -f version=x.y.z` |

- `test.yml`: `npm test` (node --test) 를 ubuntu · windows · macos 에서
- `app-check.yml`: `app/**` 가 바뀌면 macOS · Windows 에서 `cargo check --locked`
- 아직 서명·공증 전이라 macOS 는 처음 열 때 "확인되지 않은 개발자" 경고가 뜬다 (Homebrew cask 는 격리 속성을 지워 우회).

## 12. 작업 규칙

- 작업마다 GitHub 이슈 `[FE-nn]` / `[BE-nn]` / `[APP-nn]` → main 에서 `feature|fix|test|docs/<ID>` 브랜치 → PR → CI(test, app-check) 통과 후 머지 → 이슈에 결과·테스트·캡처 댓글.
- 변경마다 버전을 올린다: 버그·문서 `npm run bump:patch`, 기능 `npm run bump:minor`.
