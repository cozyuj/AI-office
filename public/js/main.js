// 진입점: SSE 연결 → store 반영 → 패널/장면 갱신 루프.
import { store } from './store.js';
import { renderAll, renderHeader, renderPeople, bindPanelEvents } from './panels.js';
import { createScene } from './scene/index.js';
import { createActors } from './scene/actors.js';
import { project } from './scene/map.js';
import { createTooltip } from './tooltip.js';

const canvas = document.getElementById('office');
const scene = createScene(canvas, store);
const actors = createActors(store, scene);
const tooltip = createTooltip();

// ---------- 렌더 스케줄 ----------
let dirty = true;
store.subscribe(() => { dirty = true; });

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
  scene.frame(now);
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
  es.onopen = () => store.setConnected(true);
  es.onerror = () => { store.setConnected(false); renderHeader(); }; // EventSource 가 알아서 재접속한다
}

bindPanelEvents();
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
  bubblesBtn.textContent = store.bubbleMode === 'selected' ? '💬 말풍선: 선택만' : '💬 말풍선: 전체';
}
followBtn.onclick = () => { store.setFollowCamera(!store.followCamera); if (store.followCamera && scene.camera.cam.zoom < 1.2) scene.camera.cam.zoom = 1.6; };
bubblesBtn.onclick = () => store.setBubbleMode(store.bubbleMode === 'selected' ? 'all' : 'selected');
canvas.addEventListener('pointerdown', () => { if (store.followCamera) store.setFollowCamera(false); }); // 드래그하면 따라가기 해제
store.subscribe((kind) => { if (kind === 'option') renderTools(); });
renderTools();

// ---------- 대기 알림: 탭 제목 + 브라우저 알림 ----------
const BASE_TITLE = 'AI Office';
let blink = false;
function renderTitle() {
  const n = store.waitingSessions().length;
  if (!n) { document.title = BASE_TITLE; return; }
  blink = !blink;
  document.title = blink ? `(${n}) 🙋 답을 기다립니다 · ${BASE_TITLE}` : `(${n}) ${BASE_TITLE}`;
}
setInterval(renderTitle, 1000);

const notifyBtn = document.getElementById('notify-btn');
const canNotify = () => typeof Notification !== 'undefined';
function renderNotifyBtn() {
  if (!canNotify()) { notifyBtn.classList.add('off'); notifyBtn.title = '이 브라우저는 알림을 지원하지 않습니다'; return; }
  notifyBtn.classList.toggle('on', Notification.permission === 'granted');
  notifyBtn.classList.toggle('off', Notification.permission === 'denied');
  notifyBtn.textContent = Notification.permission === 'granted' ? '🔔 알림 켜짐' : '🔔 알림';
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

window.aiOffice = { store, scene, actors, tooltip }; // 디버그용
