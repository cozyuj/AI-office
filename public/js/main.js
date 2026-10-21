// 진입점: SSE 연결 → store 반영 → 패널/장면 갱신 루프.
import { store } from './store.js';
import { renderAll, renderHeader, renderPeople, bindPanelEvents } from './panels.js';
import { createScene } from './scene/index.js';
import { createActors } from './scene/actors.js';
import { project } from './scene/map.js';
import { setLabels } from './scene/sprites.js';
import { createTooltip } from './tooltip.js';
import { initTextTips } from './texttip.js';
import { createAvatarStore } from './avatarStore.js';
import { createCustomizer } from './customize.js';
import { createOverview } from './overview.js';
import { createFloorStyleBook } from './scene/floorStyle.js';
import { createFloorStylePicker } from './floorStylePicker.js';
import { layoutOfPreset } from './scene/map.js';
import { buildLayout, roomLabelIn } from './scene/layouts.js';

const canvas = document.getElementById('office');
const scene = createScene(canvas, store);
const avatars = createAvatarStore();
const tooltip = createTooltip();

// ---------- 🎨 층 인테리어 (프리셋 = 색 + 사무실 구조) ----------
const floorStyles = createFloorStyleBook(); // 층별 인테리어 프리셋 (FE-34/35): 직접 고른 것 > id 해시 자동 배정
const styleOfFloor = (f) => floorStyles.resolve(f, store.floorsByNo());
function applyFloorStyle() { scene.setFloorStyle(styleOfFloor(store.selectedFloor())); }
// 캐릭터(createActors)보다 먼저 구독한다: 층이 바뀌면 레이아웃부터 바꾼 뒤 캐릭터를 그 레이아웃의 자리에 배치해야 한다
store.subscribe((kind) => { if (kind === 'select' || kind === 'snapshot' || kind === 'update' || kind === 'remove') applyFloorStyle(); });
applyFloorStyle();
store.roomLabelResolver = (room, floorId) => roomLabelIn(buildLayout(layoutOfPreset(styleOfFloor(store.floors.get(floorId)))), room);

const actors = createActors(store, scene, avatars);

// ---------- 전체 보기 (건물 단면) ----------
const stage = document.getElementById('stage');
const overviewBtn = document.getElementById('overview-btn');
const overview = createOverview(document.getElementById('overview'), store, { onPick: () => setOverview(false), styleOf: styleOfFloor });
function setOverview(v) {
  if (v) overview.show(); else overview.hide();
  stage.classList.toggle('overview', overview.visible);
  overviewBtn.classList.toggle('on', overview.visible);
  overviewBtn.textContent = overview.visible ? '🏢 사무실로' : '🏢 전체 보기';
}
function syncOverviewBtn() {
  const many = store.floors.size > 1;
  overviewBtn.classList.toggle('hidden', !many);
  if (!many && overview.visible) setOverview(false);
}
overviewBtn.onclick = () => setOverview(!overview.visible);
store.subscribe(syncOverviewBtn);
syncOverviewBtn();

// 🎨 팝오버: 프리셋을 바꾸면 레이아웃이 바뀔 수 있으니 캐릭터를 새 자리에 다시 놓는다
const floorStylePicker = createFloorStylePicker(store, floorStyles, { onChange: () => { applyFloorStyle(); actors.sync(true); dirty = true; } });

// ---------- ⚙️ 설정 팝오버 ----------
const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
function setSettings(open) { settingsMenu.classList.toggle('hidden', !open); settingsBtn.classList.toggle('on', open); }
const settingsOpen = () => !settingsMenu.classList.contains('hidden');
settingsBtn.onclick = (e) => { e.stopPropagation(); setSettings(!settingsOpen()); };
document.addEventListener('pointerdown', (e) => { if (settingsOpen() && !document.getElementById('settings-wrap').contains(e.target)) setSettings(false); });

// ---------- 렌더 스케줄 ----------
const stats = { last: 0, avg: 0, frames: 0 }; // scene.frame 소요 ms (EMA)
let dirty = true;
store.subscribe((kind) => { dirty = true; if (kind === 'snapshot') setLabels({ me: store.me }); });

function frame(now) {
  if (dirty) { renderAll(); dirty = false; }
  if (store.followCamera) {
    const a = actors.selectedActor();
    if (a) {
      const p = project(a.x + 0.5, a.y + 0.5, 0.6);
      const cam = scene.camera.cam;
      cam.x += (p.x - cam.x) * 0.08;
      cam.y += (p.y - cam.y) * 0.08;
    }
  }
  const t0 = performance.now();
  if (overview.visible) overview.frame(now); else scene.frame(now);
  stats.last = performance.now() - t0;
  stats.avg = stats.avg ? stats.avg * 0.95 + stats.last * 0.05 : stats.last;
  stats.frames++;
  tooltip.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 경과 시간 표시는 1초마다 갱신
setInterval(() => { renderPeople(); }, 1000);

// ---------- SSE ----------
function connect() {
  const es = new EventSource('/events');
  es.addEventListener('snapshot', (e) => { store.applySnapshot(JSON.parse(e.data)); store.setConnected(true); });
  es.addEventListener('update', (e) => store.applyUpdate(JSON.parse(e.data)));
  es.addEventListener('remove', (e) => store.applyRemove(JSON.parse(e.data)));
  es.addEventListener('floor', (e) => store.applyFloor(JSON.parse(e.data)));
  es.addEventListener('demo', (e) => store.setDemo(JSON.parse(e.data).on));
  es.onopen = () => store.setConnected(true);
  es.onerror = () => { store.setConnected(false); renderHeader(); }; // EventSource 가 알아서 재접속한다
}

bindPanelEvents();
initTextTips();
connect();

// 줌 버튼
document.getElementById('zoom-in').onclick = () => scene.zoomBy(1.25);
document.getElementById('zoom-out').onclick = () => scene.zoomBy(0.8);
document.getElementById('zoom-reset').onclick = () => scene.resetView();

// 따라가기 / 말풍선 모드
const followBtn = document.getElementById('follow-btn');
const bubblesBtn = document.getElementById('bubbles-btn');
function renderTools() {
  followBtn.classList.toggle('on', store.followCamera);
  bubblesBtn.classList.toggle('on', store.bubbleMode === 'selected');
  bubblesBtn.textContent = store.bubbleMode === 'selected' ? '💬 선택만' : '💬 전체';
}
followBtn.onclick = () => { store.setFollowCamera(!store.followCamera); if (store.followCamera && scene.camera.cam.zoom < 1.2) scene.camera.cam.zoom = 1.6; };
bubblesBtn.onclick = () => store.setBubbleMode(store.bubbleMode === 'selected' ? 'all' : 'selected');
canvas.addEventListener('pointerdown', () => { if (store.followCamera) store.setFollowCamera(false); }); // 드래그하면 따라가기 해제
store.subscribe((kind) => { if (kind === 'option') renderTools(); });
renderTools();

// ---------- 탭 제목 "(7F) ai-office" 고정 + 파비콘 (대기 세션이 있으면 빨간 점) ----------
const BASE_TITLE = 'AI Office';
let faviconState = null;
function renderTitle() {
  const f = store.selectedFloor();
  document.title = f ? `(${f.no}F) ${f.name}` : BASE_TITLE;
  const waiting = store.waitingSessions().length > 0;
  if (waiting !== faviconState) { faviconState = waiting; renderFavicon(waiting); }
}
function renderFavicon(badge) {
  const link = document.getElementById('favicon');
  if (!badge) { link.href = '/favicon.svg'; return; }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 64);
    ctx.fillStyle = '#e05252'; ctx.beginPath(); ctx.arc(50, 14, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    link.href = c.toDataURL('image/png');
  };
  img.src = '/favicon.svg';
}
setInterval(renderTitle, 1000);
store.subscribe((kind) => { if (kind === 'snapshot' || kind === 'select' || kind === 'update' || kind === 'remove' || kind === 'waiting-count') renderTitle(); });

const demoBtn = document.getElementById('demo-btn');
function renderDemoBtn() { demoBtn.classList.toggle('on', store.demo); demoBtn.textContent = store.demo ? '🎬 켜짐' : '🎬 꺼짐'; }
demoBtn.onclick = async () => {
  demoBtn.disabled = true;
  try { const r = await fetch(`/api/demo/${store.demo ? 'stop' : 'start'}`, { method: 'POST' }); const j = await r.json(); store.setDemo(j.demo); } catch {}
  demoBtn.disabled = false;
};
store.subscribe((kind) => { if (kind === 'option' || kind === 'snapshot') renderDemoBtn(); });
renderDemoBtn();

const ambientBtn = document.getElementById('ambient-btn');
function renderAmbientBtn() { ambientBtn.classList.toggle('on', store.ambient); ambientBtn.textContent = store.ambient ? '✨ 켜짐' : '✨ 꺼짐'; }
ambientBtn.onclick = () => store.setAmbient(!store.ambient);
store.subscribe((kind) => { if (kind === 'option') renderAmbientBtn(); });
renderAmbientBtn();

// ---------- 대기 알림 소리 (Web Audio 로 생성, 파일 없음) ----------
const soundBtn = document.getElementById('sound-btn');
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    for (const [i, freq] of [[0, 880], [0.14, 1174.7]]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + i); g.gain.exponentialRampToValueAtTime(0.18, t0 + i + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i + 0.35);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + i); o.stop(t0 + i + 0.4);
    }
  } catch {}
}
/** 실패·종료용 낮은 2음 (대기 차임과 구분되게 내려가는 음) */
function chimeLow() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    for (const [i, freq] of [[0, 392], [0.16, 293.7]]) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + i); g.gain.exponentialRampToValueAtTime(0.16, t0 + i + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i + 0.4);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + i); o.stop(t0 + i + 0.45);
    }
  } catch {}
}
const soundScope = document.getElementById('sound-scope');
function renderSoundBtn() {
  soundBtn.classList.toggle('on', store.sound); soundBtn.textContent = store.sound ? '🔔 켜짐' : '🔈 꺼짐';
  document.getElementById('sound-scope-row').classList.toggle('disabled', !store.sound);
  for (const b of soundScope.querySelectorAll('[data-scope]')) b.classList.toggle('on', b.dataset.scope === store.soundScope);
}
soundBtn.onclick = () => { store.setSound(!store.sound); if (store.sound) chime(); };
soundScope.addEventListener('click', (e) => {
  const b = e.target.closest('[data-scope]');
  if (!b) return;
  store.setSoundScope(b.dataset.scope);
  if (!store.sound) store.setSound(true); // 범위를 고르면 소리도 켠다 (그래야 의미가 있고, 클릭이 오디오 허용도 된다)
  if (b.dataset.scope === 'all') chimeLow(); else chime();
});
store.subscribe((kind) => {
  if (kind === 'option') renderSoundBtn();
  if (!store.sound) return;
  if (kind === 'waiting') chime();
  if ((kind === 'failure' || kind === 'ended') && store.soundScope === 'all') chimeLow();
});
renderSoundBtn();

const notifyBtn = document.getElementById('notify-btn');
const canNotify = () => typeof Notification !== 'undefined';
function renderNotifyBtn() {
  if (!canNotify()) { notifyBtn.classList.add('off'); notifyBtn.title = '이 브라우저는 알림을 지원하지 않습니다'; return; }
  notifyBtn.classList.toggle('on', Notification.permission === 'granted');
  notifyBtn.classList.toggle('off', Notification.permission === 'denied');
  notifyBtn.textContent = Notification.permission === 'granted' ? '🔔 켜짐' : Notification.permission === 'denied' ? '🔔 차단됨' : '🔔 꺼짐';
}
notifyBtn.onclick = async () => {
  if (!canNotify()) return;
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  renderNotifyBtn();
};
renderNotifyBtn();

store.subscribe((kind, detail) => {
  if (kind === 'waiting') {
    renderTitle();
    const { session, floor } = detail;
    const main = session.agents && session.agents.main;
    if (!canNotify() || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(`${floor ? floor.no + 'F ' + floor.name : '사무실'} · ${session.title || '제목 없는 세션'}`, {
        body: main ? `${main.icon || '🙋'} ${main.bubble}` : '답을 기다리고 있어요',
        tag: `ai-office-${session.id}`,
      });
      n.onclick = () => { window.focus(); store.selectSession(session.id); n.close(); };
    } catch {}
  }
  if (kind === 'waiting-count') renderTitle();
});

// ---------- 툴팁: 캔버스 hover + 사람 목록 hover ----------
let hovered = null;
scene.onHover((p) => {
  const a = actors.hoverAt(p);
  if (a === hovered) return;
  hovered = a;
  canvas.classList.toggle('hover-actor', !!a);
  if (!a || a.user) { tooltip.hide(); return; }
  const s = store.sessions.get(a.sessionId);
  const agent = s && s.agents[a.agentId];
  if (!agent) { tooltip.hide(); return; }
  const rect = () => canvas.getBoundingClientRect();
  tooltip.show({ agent, session: s }, () => {
    const live = actors.actors.get(a.key);
    if (!live) return null;
    const sp = actors.screenPosOf(live, scene.camera);
    const r = rect();
    return { x: r.left + sp.x, y: r.top + sp.y };
  });
});
const people = document.getElementById('people');
const lastMouse = { x: -1, y: -1 };
document.addEventListener('mousemove', (e) => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; }, { passive: true });
people.addEventListener('mouseover', (e) => {
  const row = e.target.closest('.person');
  if (!row || row === people._hoverRow) return;
  people._hoverRow = row;
  const s = store.sessions.get(row.dataset.session);
  const agent = s && s.agents[row.dataset.agent];
  if (!agent) return;
  // 목록은 자주 다시 그려지므로 행을 매번 다시 찾는다
  const sel = `.person[data-session="${CSS.escape(row.dataset.session)}"][data-agent="${CSS.escape(row.dataset.agent)}"]`;
  tooltip.show({ agent, session: s }, () => {
    const live = people.querySelector(sel);
    if (!live) return null;
    const r = live.getBoundingClientRect();
    // 목록이 다시 그려져도 마우스가 그 행 위에 있으면 유지
    if (lastMouse.x < r.left || lastMouse.x > r.right || lastMouse.y < r.top || lastMouse.y > r.bottom) return null;
    return { x: r.left - 10, y: r.top + r.height / 2 };
  });
});
people.addEventListener('mouseleave', () => { people._hoverRow = null; tooltip.hide(); });

// ---------- 외형 커스터마이즈 ----------
const customizer = createCustomizer(store, avatars);
document.getElementById('customize-btn').onclick = () => { setSettings(false); customizer.open(); };

// ---------- 단축키 도움말 모달 (alert 대신) ----------
const keysModal = document.getElementById('keys');
const keysOpen = () => !keysModal.classList.contains('hidden');
function setKeys(open) { keysModal.classList.toggle('hidden', !open); }
document.getElementById('keys-btn').onclick = () => { setSettings(false); setKeys(true); };
keysModal.addEventListener('click', (e) => { if (e.target === keysModal || e.target.closest('[data-action="close"]')) setKeys(false); }); // 바깥 클릭 · 닫기 버튼

// ---------- 키보드 단축키 ----------
const KEYS_HELP = '1~9 층 이동 · ←/→ 이전·다음 층 · F 따라가기 · A 자동 따라가기 · D 데모 · O 전체 보기 · B 말풍선 · S 소리 · T 테마 · / 로그 검색 · Esc 닫기 · ? 이 도움말';
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const modalOpen = !document.getElementById('customize').classList.contains('hidden');
  if (e.key === 'Escape') {
    if (keysOpen()) { setKeys(false); return; }
    if (modalOpen) { customizer.close(); return; }
    if (settingsOpen()) { setSettings(false); return; }
    if (overview.visible) { setOverview(false); return; }
    if (typing) { t.blur(); if (t.id === 'log-search') { t.value = ''; store.setLogFilter({ q: '' }); } return; }
    if (store.followCamera) store.setFollowCamera(false);
    return;
  }
  if (typing || modalOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  if (keysOpen()) { if (e.key === '?') { setKeys(false); e.preventDefault(); } return; } // 도움말이 열려 있으면 다른 단축키는 쉰다
  const floors = store.floorsByNo();
  const idx = floors.findIndex((f) => f.id === store.selectedFloorId);
  if (/^[1-9]$/.test(e.key)) { const f = floors[Number(e.key) - 1]; if (f) store.selectFloor(f.id); return; }
  switch (e.key) {
    case 'ArrowLeft': case 'ArrowUp': if (floors.length) store.selectFloor(floors[(idx - 1 + floors.length) % floors.length].id); break;
    case 'ArrowRight': case 'ArrowDown': if (floors.length) store.selectFloor(floors[(idx + 1) % floors.length].id); break;
    case 'f': case 'F': followBtn.click(); break;
    case 'a': case 'A': store.setAutoFollow(!store.autoFollow); break;
    case 'd': case 'D': demoBtn.click(); break;
    case 'o': case 'O': if (!overviewBtn.classList.contains('hidden')) overviewBtn.click(); break;
    case 'b': case 'B': bubblesBtn.click(); break;
    case 's': case 'S': soundBtn.click(); break;
    case 't': case 'T': themeBtn.click(); break;
    case '/': e.preventDefault(); document.getElementById('log-search').focus(); break;
    case '?': setKeys(true); break;
    default: return;
  }
  e.preventDefault();
});
document.getElementById('stage-hint').textContent += ' · ? 단축키';
document.getElementById('stage-hint').title = KEYS_HELP;

// ---------- 세션 이어가기 명령 복사 ----------
const resumeBtn = document.getElementById('resume-copy');
resumeBtn.onclick = async () => {
  const cmd = resumeBtn.dataset.cmd;
  if (!cmd) return;
  const s = store.selectedSession();
  const full = s && s.cwd ? `cd ${JSON.stringify(s.cwd)} && ${cmd}` : cmd;
  try { await navigator.clipboard.writeText(full); resumeBtn.textContent = '복사됨'; } catch { resumeBtn.textContent = '복사 실패'; }
  setTimeout(() => { resumeBtn.textContent = '복사'; }, 1500);
};

// ---------- 빈 상태: 설치 명령 복사 ----------
const copyBtn = document.getElementById('copy-cmd');
if (copyBtn) copyBtn.onclick = async () => {
  const text = document.getElementById('install-cmd').textContent;
  try { await navigator.clipboard.writeText(text); copyBtn.textContent = '복사됨'; } catch { copyBtn.textContent = '복사 실패'; }
  setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
};
fetch('/api/state').then((r) => r.json()).then((st) => { if (st.installDir) document.getElementById('install-dir').textContent = st.installDir; }).catch(() => {});

// ---------- 다크 모드 ----------
const themeBtn = document.getElementById('theme-btn');
const mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function currentTheme() {
  let saved = null; try { saved = localStorage.getItem('aiOffice.theme'); } catch {}
  if (saved === 'dark' || saved === 'light') return saved;
  return mql && mql.matches ? 'dark' : 'light';
}
function applyTheme() {
  const t = currentTheme();
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle('auto-dark', t === 'dark');
  scene.setTheme(t);
  overview.setTheme(t);
  themeBtn.textContent = t === 'dark' ? '🌙 다크' : '☀️ 라이트';
  themeBtn.title = t === 'dark' ? '라이트 모드로' : '다크 모드로';
}
themeBtn.onclick = () => { try { localStorage.setItem('aiOffice.theme', currentTheme() === 'dark' ? 'light' : 'dark'); } catch {} applyTheme(); };
if (mql) mql.addEventListener('change', applyTheme);
applyTheme();

// ---------- 시간대 조명 (FE-33): 실제 시각으로 아침·낮·저녁·밤, 설정 행으로 고정 가능 ----------
const daylightSel = document.getElementById('daylight-select');
function applyDaylight() { scene.setDaylight(store.daylight); if (daylightSel.value !== store.daylight) daylightSel.value = store.daylight; }
daylightSel.onchange = () => store.setDaylight(daylightSel.value);
store.subscribe((kind) => { if (kind === 'option') applyDaylight(); });
setInterval(applyDaylight, 60 * 1000); // 자동 모드: 1분마다 실제 시각으로 다시 판단 (시간대가 바뀔 때만 창문을 다시 그린다)
applyDaylight();

window.aiOffice = { store, scene, actors, tooltip, avatars, customizer, stats, applyTheme, chime, chimeLow, floorStyles, floorStylePicker, applyFloorStyle }; // 디버그용
