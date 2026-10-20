// 사무실 장면 진입점. FE-01 단계: 캔버스 크기 관리 + 자리표시자. FE-02 에서 아이소메트릭 맵으로 교체.

export function createScene(canvas, store) {
  const ctx = canvas.getContext('2d');
  let zoom = 1;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  function frame() {
    const { width, height } = resize();
    ctx.clearRect(0, 0, width, height);
    // 바닥 느낌의 격자
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    const step = 40 * zoom;
    for (let x = 0; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    ctx.restore();
    if (store.sessions.size) {
      ctx.fillStyle = '#7a828c';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('아이소메트릭 사무실은 FE-02 에서 그려집니다', width / 2, height / 2);
    }
  }

  return {
    frame,
    zoomBy(f) { zoom = Math.min(3, Math.max(0.4, zoom * f)); },
    resetView() { zoom = 1; },
  };
}
