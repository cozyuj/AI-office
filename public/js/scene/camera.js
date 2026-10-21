// 카메라: 팬(드래그), 줌(휠/버튼), 맵 맞춤, 클릭 판정. 월드 ↔ 화면 변환.

export function createCamera(canvas, { onClick, onHover } = {}) {
  const cam = { x: 0, y: 0, zoom: 1, w: 0, h: 0 };
  let drag = null;

  function worldToScreen(wx, wy) {
    return { x: (wx - cam.x) * cam.zoom + cam.w / 2, y: (wy - cam.y) * cam.zoom + cam.h / 2 };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - cam.w / 2) / cam.zoom + cam.x, y: (sy - cam.h / 2) / cam.zoom + cam.y };
  }
  function setSize(w, h) { cam.w = w; cam.h = h; }

  function fit(bounds, margin = 40) {
    const bw = bounds.x1 - bounds.x0, bh = bounds.y1 - bounds.y0;
    if (!cam.w || !cam.h || !bw || !bh) return;
    cam.zoom = Math.min((cam.w - margin * 2) / bw, (cam.h - margin * 2) / bh);
    cam.zoom = Math.max(0.3, Math.min(2.5, cam.zoom));
    cam.x = (bounds.x0 + bounds.x1) / 2;
    cam.y = (bounds.y0 + bounds.y1) / 2;
  }

  function zoomAt(factor, sx = cam.w / 2, sy = cam.h / 2) {
    touch();
    const before = screenToWorld(sx, sy);
    cam.zoom = Math.max(0.3, Math.min(3, cam.zoom * factor));
    const after = screenToWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
  }

  function applyTransform(ctx) {
    ctx.translate(cam.w / 2, cam.h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // 터치: 손가락(포인터)들을 추적해 두 개면 핀치 줌 + 두 손가락 이동
  let activeUntil = 0;         // 최근 입력(휠·포인터) 뒤 잠깐은 60fps 로 그린다 (FE-39 적응형 프레임)
  const touch = () => { activeUntil = performance.now() + 400; };
  const touches = new Map();   // pointerId → {x, y}
  let pinch = null;            // { d0, zoom0, cx, cy, wx, wy }  cx,cy: 화면 중심, wx,wy: 그 아래 월드 좌표
  function startPinch() {
    const [a, b] = [...touches.values()];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const w = screenToWorld(cx, cy);
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: cam.zoom, cx, cy, wx: w.x, wy: w.y };
    drag = null;
  }
  function movePinch() {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    cam.zoom = Math.max(0.3, Math.min(3, pinch.zoom0 * (d / pinch.d0)));
    // 처음 잡은 월드 점이 지금 두 손가락 중심 아래에 오도록 카메라 이동
    cam.x = pinch.wx - (cx - cam.w / 2) / cam.zoom;
    cam.y = pinch.wy - (cy - cam.h / 2) / cam.zoom;
  }

  canvas.addEventListener('pointerdown', (e) => {
    touch();
    const p = pointer(e);
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, p);
      if (touches.size === 2) { startPinch(); canvas.classList.add('dragging'); return; }
      if (touches.size > 2) return;
    }
    drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: false, id: e.pointerId };
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    touch();
    const p = pointer(e);
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, p);
      if (pinch && touches.size >= 2) { movePinch(); return; }
    }
    if (!drag) { if (onHover && e.pointerType !== 'touch') onHover(screenToWorld(p.x, p.y), p); return; }
    if (drag.id !== e.pointerId) return;
    const dx = p.x - drag.sx, dy = p.y - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    cam.x = drag.cx - dx / cam.zoom;
    cam.y = drag.cy - dy / cam.zoom;
  });
  const end = (e) => {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) {
        if (touches.size < 2) {
          pinch = null;
          // 손가락 하나가 남으면 그 손가락으로 이동을 이어 간다 (클릭으로는 치지 않음)
          const rest = [...touches.entries()][0];
          if (rest) drag = { sx: rest[1].x, sy: rest[1].y, cx: cam.x, cy: cam.y, moved: true, id: rest[0] };
          else canvas.classList.remove('dragging');
        }
        return;
      }
    }
    if (!drag || drag.id !== e.pointerId) return;
    canvas.classList.remove('dragging');
    const p = pointer(e);
    if (!drag.moved && onClick) onClick(screenToWorld(p.x, p.y), p);
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); pinch = null; drag = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('pointerleave', () => { if (onHover) onHover(null, null); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    touch();
    const p = pointer(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  return { cam, setSize, fit, zoomAt, applyTransform, worldToScreen, screenToWorld, get active() { return !!drag || !!pinch || performance.now() < activeUntil; } };
}
