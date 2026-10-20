// 카메라: 팬(드래그), 줌(휠/버튼), 맵 맞춤, 클릭 판정. 월드 ↔ 화면 변환.

export function createCamera(canvas, { onClick } = {}) {
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

  canvas.addEventListener('pointerdown', (e) => {
    const p = pointer(e);
    drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pointer(e);
    const dx = p.x - drag.sx, dy = p.y - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    cam.x = drag.cx - dx / cam.zoom;
    cam.y = drag.cy - dy / cam.zoom;
  });
  const end = (e) => {
    if (!drag) return;
    canvas.classList.remove('dragging');
    const p = pointer(e);
    if (!drag.moved && onClick) onClick(screenToWorld(p.x, p.y), p);
    drag = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pointer(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  return { cam, setSize, fit, zoomAt, applyTransform, worldToScreen, screenToWorld };
}
