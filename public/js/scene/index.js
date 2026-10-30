// 사무실 장면 진입점: 캔버스 크기, 카메라, 프레임 루프. 캐릭터(FE-03)는 actorProvider 로 끼워 넣는다.
import { createCamera } from './camera.js';
import { drawFloor, drawEntities, drawLabels, setDebugDepth, setCacheEnabled, setTheme, setFloorStyle, setDaylight, drawDaylightFloor, drawDaylightLamps, drawDaylightTint, drawWeatherFloor, drawWeather, setWeather, drawThemeBackdrop } from './render.js';
import { worldBounds, unproject } from './map.js';

export function createScene(canvas, store) {
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);
  setDebugDepth(params.get('debug') === 'depth');
  setCacheEnabled(params.get('cache') !== '0');
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

  // 캔버스 크기는 바뀔 때만 읽는다. 매 프레임 getBoundingClientRect 는 DOM 이 바뀐 뒤 강제 레이아웃을 부른다 (FE-67)
  let box = null;
  const observed = typeof ResizeObserver !== 'undefined';
  if (observed) new ResizeObserver(() => { box = null; }).observe(canvas);
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    if (!box || !observed) { const r = canvas.getBoundingClientRect(); box = { width: r.width, height: r.height }; }
    const { width, height } = box;
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
    drawThemeBackdrop(ctx, width, height, now);
    const actors = actorProvider ? actorProvider(now) : [];
    const scale = camera.cam.zoom * (window.devicePixelRatio || 1);
    ctx.save();
    camera.applyTransform(ctx);
    drawFloor(ctx, scale);
    drawDaylightFloor(ctx);
    drawWeatherFloor(ctx);
    drawEntities(ctx, now, actors, scale);
    drawDaylightLamps(ctx);
    drawWeather(ctx, now);
    ctx.restore();
    drawDaylightTint(ctx, width, height);
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
    setFloorStyle,
    setDaylight,
    setWeather,
  };
}
