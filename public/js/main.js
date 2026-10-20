// 진입점: SSE 연결 → store 반영 → 패널/장면 갱신 루프.
import { store } from './store.js';
import { renderAll, renderHeader, renderPeople, bindPanelEvents } from './panels.js';
import { createScene } from './scene/index.js';
import { createActors } from './scene/actors.js';
import { project } from './scene/map.js';

const canvas = document.getElementById('office');
const scene = createScene(canvas, store);
const actors = createActors(store, scene);

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

window.aiOffice = { store, scene, actors }; // 디버그용
