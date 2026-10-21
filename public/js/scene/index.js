// 사무실 장면 진입점: 캔버스 크기, 카메라, 프레임 루프. 캐릭터(FE-03)는 actorProvider 로 끼워 넣는다.
import { createCamera } from './camera.js';
import { drawFloor, drawEntities, drawLabels, setDebugDepth, setTheme } from './render.js';
import { worldBounds, unproject } from './map.js';

export function createScene(canvas, store) {
  const ctx = canvas.getContext('2d');
  setDebugDepth(new URLSearchParams(location.search).get('debug') === 'depth');
  let fitted = false;
  let actorProvider = null;   // () => [{ key, draw(ctx, now), overlay?(ctx, camera, now), hit?(world) }]
  let clickHandler = null;
  let hoverHandler = null;

  const camera = createCamera(canvas, {
    onClick: (world, screen) => {
      if (!clickHandler) return;
      const t = unproject(world.x, world.y);
      clickHandler({ world, screen, tile: { x: Math.floor(t.tx), y: Math.floor(t.ty) }, tx: t.tx, ty: t.ty });
    },
    onHover: (world, screen) => {
      if (!hoverHandler) return;
      if (!world) { hoverHandler(null); return; }
      const t = unproject(world.x, world.y);
      hoverHandler({ world, screen, tx: t.tx, ty: t.ty });
    },
  });

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw; canvas.height = ph;
      camera.setSize(width, height);
      if (fitted) camera.fit(worldBounds()); // 창 크기가 바뀌면 다시 맞춤
    }
    if (!fitted && width > 0) { camera.setSize(width, height); camera.fit(worldBounds()); fitted = true; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function frame(now) {
    const { width, height } = resize();
    ctx.clearRect(0, 0, width, height);
    const actors = actorProvider ? actorProvider(now) : [];
    ctx.save();
    camera.applyTransform(ctx);
    drawFloor(ctx);
    drawEntities(ctx, now, actors);
    ctx.restore();
    drawLabels(ctx, camera);
    for (const a of actors) if (a.overlay) a.overlay(ctx, camera, now);
  }

  return {
    frame,
    camera,
    zoomBy: (f) => camera.zoomAt(f),
    resetView: () => camera.fit(worldBounds()),
    setActorProvider: (fn) => { actorProvider = fn; },
    onClick: (fn) => { clickHandler = fn; },
    onHover: (fn) => { hoverHandler = fn; },
    setTheme,
  };
}
