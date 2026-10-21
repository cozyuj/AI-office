# AI Office 구조 설계 (웹 버전)

Claude Code 세션이 지금 무엇을 하는지 아이소메트릭 사무실 화면으로 실시간 보여주는 로컬 웹 앱.
파일을 읽으면 자료실, 명령을 돌리면 서버실, 막히면 그 자리에서 고민, 서브에이전트는 엘리베이터로 출근.

## 1. 전체 흐름

```
Claude Code 세션 (여러 터미널, 여러 프로젝트)
  │  settings.json hooks (PreToolUse, PostToolUse, SubagentStart, Stop, ...)
  ▼
hooks/emit.sh            stdin JSON → curl POST (1초 타임아웃, 백그라운드, 항상 exit 0)
  │
  ▼  POST /hook
server.js (Node 18+, 외부 의존성 0)
  ├─ normalize   훅 payload → 내부 Event (도구명/대상 파일/서브에이전트 id 추출, 대용량 필드 제거)
  ├─ reduce      Event → Floor/Session/Agent 상태 갱신 (상태 머신)
  ├─ log         최근 500건 ring buffer
  └─ broadcast   SSE /events 로 {snapshot | update} 전송
  │
  ▼  GET /events (SSE), GET /api/state
public/ (브라우저, 번들러 없음, ES module)
  ├─ store       서버 상태 미러 + 구독
  ├─ scene       canvas 아이소메트릭 사무실: 맵, 가구, 캐릭터 이동(A*), 말풍선, 카메라
  └─ panels      좌: 층(프로젝트)·세션 목록 / 우: 사무실 사람들·활동 로그·범례
```

- 훅은 Claude 실행을 절대 막지 않는다. 서버가 꺼져 있어도 1초 안에 조용히 포기한다.
- 서버는 "지금 상태"의 단일 진실 공급원이다. 브라우저는 상태를 받아 애니메이션만 담당한다.
- 브라우저를 몇 개 열어도, 새로 열어도 같은 화면이다 (접속 시 snapshot 수신).

## 2. 데이터 모델

```ts
Floor {                      // 프로젝트 = 층. key = cwd 절대경로
  id: string                 // cwd
  name: string               // basename(cwd)  예: "nccx"
  no: number                 // 출현 순서로 1F, 2F, ... 부여
  sessions: Map<sessionId, Session>
  lastActivity: number       // epoch ms
}

Session {
  id: string                 // hook.session_id
  floorId: string
  title: string              // 첫 UserPromptSubmit 의 prompt 앞 40자 (session_title 있으면 그것)
  status: 'thinking' | 'working' | 'waiting' | 'idle' | 'ended'
  startedAt, lastActivity: number
  agents: Map<agentId, Agent> // 'main' + 서브에이전트들
  pendingSubagents: string[]  // Agent 툴 PreToolUse 의 description 큐 (SubagentStart 와 짝지음)
}

Agent {                      // 화면의 캐릭터 한 명
  id: 'main' | agent_id
  sessionId: string
  kind: 'main' | 'sub'
  name: string               // "Claude" | agent_type ("Explore") | Agent 툴 description
  room: RoomId               // 지금 있어야 할 방
  activity: ActivityId       // 'think' | 'read' | 'search' | 'run' | 'edit' | 'web' | 'delegate' | 'ask' | 'wait' | 'rest' | 'compact' | 'leave'
  bubble: string             // 말풍선 텍스트  예: "server.js 읽는 중"
  tool?: { name, useId, target }
  since: number              // 현재 activity 시작 시각 (경과 시간 표시용)
}

LogEntry { t, floorId, sessionId, agentId, agentName, icon, text }

RoomId = 'library' | 'dev' | 'research' | 'server' | 'meeting' | 'lounge' | 'mydesk' | 'elevator' | 'corridor'
```

## 3. 훅 이벤트 → 상태 전이

Claude Code 2.1.x 훅 payload 기준. 서브에이전트가 낸 도구 호출은 `agent_id` 가 실려 오므로 그 값으로 캐릭터를 찾는다. 없으면 `main`.

| 훅 이벤트 | 대상 | 방 | activity | 말풍선 | 비고 |
|---|---|---|---|---|---|
| SessionStart | main 생성 | elevator → mydesk | wait | "출근" | source=resume/compact 는 기존 세션 유지 |
| UserPromptSubmit | main | 현재 위치 | think | "고민 중…" | title 미설정이면 prompt 로 설정. status=thinking |
| PreToolUse | agent_id 또는 main | 도구별 방 (4절) | 도구별 | 도구별 문구 | status=working |
| PostToolUse | 동일 | 그 자리 | think | "고민 중…" | tool 해제. duration_ms 로그 |
| PostToolUseFailure | 동일 | 그 자리 | think | "❌ 실패, 다시 생각 중" | error 앞 80자 로그 |
| PreToolUse(Agent) | main | meeting | delegate | "{description} 맡기는 중" | description 을 pendingSubagents 에 push |
| SubagentStart | 새 sub 생성 | elevator → meeting | think | "출근했습니다" | name = pendingSubagents.shift() ?? agent_type |
| SubagentStop | sub | elevator | leave | "퇴근" | 3초 뒤 제거 (클라이언트가 걸어서 나감) |
| Notification(permission_prompt) | main | mydesk | ask | "허락이 필요해요" | status=waiting |
| Notification(idle_prompt) | main | lounge | rest | "할 일 기다리는 중" | status=idle |
| Notification(elicitation_*, agent_needs_input) | main | mydesk | ask | message 앞 40자 | status=waiting |
| PreToolUse(AskUserQuestion) | main | mydesk | ask | "질문 있어요" | status=waiting |
| Stop | main | lounge | rest | "휴식 중" | status=idle. last_assistant_message 앞 60자 로그 |
| PreCompact | main | 현재 위치 | compact | "기억 정리 중" | |
| TaskCompleted | – | – | – | – | 로그만 ("✅ {task_subject}") |
| SessionEnd | 세션 | elevator | leave | "퇴근" | status=ended, 10초 뒤 세션 제거 |

추가 규칙
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
| POST | `/hook` | 훅 payload 수신. body 2MB 제한. 항상 204 |
| GET | `/events` | SSE. 접속 즉시 `snapshot` 1회, 이후 `update` (갱신된 Session 전체 + 새 LogEntry) |
| GET | `/api/state` | 현재 전체 상태 JSON (디버그용) |
| GET | `/` | `public/` 정적 파일 |

SSE 메시지
```
event: snapshot   data: { me: "jinyu", floors: Floor[], log: LogEntry[] }
event: update     data: { session: Session, floor: {id,name,no,lastActivity}, log?: LogEntry }
event: remove     data: { sessionId, floorId? }
```

포트 기본 4777, 환경변수 `AI_OFFICE_PORT` 로 변경. 서버/훅 양쪽이 같은 변수를 본다.

## 6. 프론트엔드 모듈

```
public/
  index.html          3단 레이아웃 (좌 260px / 중앙 canvas / 우 300px), 상단 헤더(층 이름·세션 제목·LIVE)
  style.css           라이트 톤, 패널 카드 스타일
  js/
    main.js           SSE 연결, store 갱신, requestAnimationFrame 루프
    store.js          floors/sessions/log 미러, 선택된 floor/session, subscribe()
    panels.js         좌·우 패널 DOM 렌더 (층 목록, 세션 목록, 사람들, 활동 로그, 범례)
    scene/
      map.js          28x22 타일 그리드, 방 영역, 가구 footprint, 벽, 서 있는 자리(slot), 통행 가능 맵
      pathfind.js     A* (4방향), 타일 단위
      actors.js       Agent → Actor(위치, 경로, 걷기 애니, 말풍선, 슬롯 점유/해제)
      render.js       canvas 2D 아이소메트릭: 바닥 → 깊이 정렬된 가구/벽/캐릭터 → 말풍선/이름표 → 선택 하이라이트
      camera.js       pan(드래그), zoom(휠/버튼), 초기 fit, 선택 세션 따라가기
      sprites.js      가구/캐릭터를 코드로 그리는 함수들 (외부 이미지 없음, 색상 팔레트)
      daylight.js     시간대 조명: 실제 시각 → 아침/낮/저녁/밤, 창문·테라스·실내 틴트 팔레트 (설정 '시간대 조명', aiOffice.daylight)
```

맵 레이아웃 (타일 좌표, 그림 참고)

```
        x 1-8          x 10-17         x 19-26          x 28-35
y 1-7   자료실(책장)     개발실(책상6)     정보검색실(대형 화면, 지구본)   카페(북쪽 유리창, 카운터·커피머신·테이블)
y 8-9   ───────────── 복도 ─────────────────────────────
y 10-15 회의실(테이블)   휴게실(소파)      서버실(랙 2열)    테라스(데크 바닥, 난간, 파라솔·벤치·나무)
y 16-17 ───────────── 복도 ─────────────                  (테라스는 y 10-21 까지, 북쪽 벽 문으로 출입)
y 18-21 내 자리(사용자)   로비(안내, 화분)   엘리베이터(문 2개)
```

- x 27 은 세로 복도. 카페는 남쪽 벽 문, 테라스는 북쪽 벽 문으로 드나든다. 카페·테라스는 활동 매핑 대상이 아니라 "생동감" 자율 행동의 목적지(커피, 창가, 바람 쐬기)다.
- 테라스 난간은 격자 밖(x 36, y 22)에 놓인 낮은 벽이라 통행에는 영향이 없다.

- 캐릭터는 방마다 정해진 "서는 자리(slot)" 중 빈 곳을 차지한다. 같은 방에 여럿이면 옆 자리로.
- 이동은 A* 경로를 따라 초당 4타일. 걷는 동안 상하 바운스, 발밑 그림자.
- 서브에이전트는 엘리베이터 타일에서 생성되어 회의실로 걸어오고, 끝나면 엘리베이터로 걸어가 사라진다.
- 말풍선: `{아이콘} {bubble} · {경과시간}`. 선택된 세션의 캐릭터는 테두리 강조, 나머지는 반투명.
- 사용자 캐릭터("{me} (나)")는 내 자리에 항상 앉아 있다. Claude 가 `ask` 상태면 그 옆에 와서 선다.
- 한 층 = 한 프로젝트. 그 프로젝트의 모든 세션 캐릭터가 같은 층에 보인다. 좌측에서 층을 바꾸면 맵이 통째로 바뀐다.

## 7. 설치·운영 스크립트

| 파일 | 역할 |
|---|---|
| `hooks/emit.sh` | 훅 명령. stdin → POST. 실패 무시 |
| `scripts/install-hooks.js` | `~/.claude/settings.json` 백업 후 11개 이벤트에 emit.sh 항목을 병합. 이미 있으면 건너뜀. `--remove` 로 제거 |
| `scripts/demo.js` | 가짜 세션 2개(프로젝트 2개)가 읽기→검색→실행→수정→서브에이전트→질문→휴식 시나리오를 반복 POST. UI 개발·시연용 |
| `npm start` | 서버 기동. 콘솔에 접속 URL 출력 |

## 8. 설계상 결정

- **의존성 0**: 설치 마찰을 없애고 나중에 Electron/Tauri 로 감쌀 때 그대로 옮기기 위해 Node 내장 모듈과 바닐라 JS 만 쓴다.
- **SSE, WebSocket 아님**: 서버→브라우저 단방향이면 충분하고 재접속이 브라우저에 내장돼 있다.
- **상태는 서버에서 계산**: 훅 이벤트 해석 규칙이 한 곳에 있어야 테스트하기 쉽고, 브라우저는 "어디로 가서 무슨 말풍선" 만 받는다.
- **그림 자산 없음**: 가구·캐릭터를 canvas 코드로 그린다. 처음엔 단순한 상자 조합으로 시작하고, 나중에 스프라이트 시트로 교체 가능하도록 sprites.js 에 격리한다.
- **메모리 상태**: 서버 재시작 시 상태는 사라진다. 다음 훅부터 다시 채워진다. 필요해지면 `~/.ai-office/events.jsonl` 로 append 후 재생하는 옵션을 추가한다.

## 9. 티켓 분할

BE
1. `BE-01` 훅 수신 서버 + emit.sh + install-hooks (POST /hook, SSE, 정적 서빙)
2. `BE-02` 이벤트 정규화 + 상태 머신 (3·4절 표 구현, 단위 테스트는 `node --test`)
3. `BE-03` 데모 시나리오 스크립트

FE
4. `FE-01` 3단 레이아웃 + 좌·우 패널 (층/세션 목록, 사람들, 활동 로그, 범례), SSE 연결·store
5. `FE-02` 아이소메트릭 맵 + 가구 + 카메라 (정적 사무실이 그려지는 단계)
6. `FE-03` 캐릭터 이동(A*)·말풍선·슬롯·엘리베이터 출퇴근
7. `FE-04` 선택/하이라이트/따라가기, 경과 시간, 마무리 다듬기

순서: BE-01 → BE-02 → BE-03 → FE-01 → FE-02 → FE-03 → FE-04. 브랜치는 `feature/BE-01`, `fix/FE-02`, `test/BE-02` 처럼 `<type>/<티켓ID>`. FE 는 BE-03 데모로 실제 훅 없이도 개발·검증한다.
