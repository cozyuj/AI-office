'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// render.js 는 canvas 없이도 import 가능 (그리기는 함수 안에서만 일어난다)
const renderP = import('../public/js/scene/render.js');

const box = (x0, y0, x1, y1, z1 = 1) => ({ x0, y0, x1, y1, z0: 0, z1 });

test('큰 테이블(3..7 × 12..14) 주변 의자: 북·서는 뒤, 남·동은 앞', async () => {
  const { makeEntity, compare } = await renderP;
  const table = makeEntity(box(3.05, 12.05, 6.95, 13.95, 0.75), () => {});
  const north = makeEntity(box(3.2, 11.2, 3.8, 11.8, 0.8), () => {});
  const west = makeEntity(box(2.2, 12.2, 2.8, 12.8, 0.8), () => {});
  const south = makeEntity(box(3.2, 14.2, 3.8, 14.8, 0.8), () => {});
  const east = makeEntity(box(7.2, 12.2, 7.8, 12.8, 0.8), () => {});
  assert.equal(compare(north, table), -1, '북쪽 의자가 먼저');
  assert.equal(compare(west, table), -1, '서쪽 의자가 먼저');
  assert.equal(compare(south, table), 1, '남쪽 의자가 나중 (앞)');
  assert.equal(compare(east, table), 1, '동쪽 의자가 나중 (앞)');
});

test('캐릭터와 긴 벽: 벽 북쪽이면 캐릭터가 뒤, 남쪽이면 앞', async () => {
  const { makeEntity, compare } = await renderP;
  const wall = makeEntity(box(3, 9.93, 4, 10.07, 0.9), () => {}); // h 벽 조각, y=10 윗변
  const behind = makeEntity(box(3.25, 9.25, 3.75, 9.75, 1.7), () => {});
  const front = makeEntity(box(3.25, 10.25, 3.75, 10.75, 1.7), () => {});
  assert.equal(compare(behind, wall), -1);
  assert.equal(compare(front, wall), 1);
});

test('화면에서 겹치지 않으면 관계 없음(0)', async () => {
  const { makeEntity, compare } = await renderP;
  const a = makeEntity(box(1, 1, 2, 2), () => {});
  const b = makeEntity(box(20, 20, 21, 21), () => {});
  assert.equal(compare(a, b), 0);
});

test('sortEntities: 소파 앞 캐릭터는 소파 다음, 책장 앞 캐릭터는 책장 다음, 책장 뒤(벽쪽)는 없음', async () => {
  const { makeEntity, sortEntities } = await renderP;
  const actor = makeEntity(box(12.25, 12.25, 12.75, 12.75, 1.7), () => {}, { label: 'actor' });
  const order = sortEntities([actor]);
  const idx = (pred) => order.findIndex(pred);
  const sofa = idx((e) => e.label === 'sofa');
  const me = idx((e) => e.label === 'actor');
  assert.ok(sofa >= 0 && me > sofa, `소파(${sofa}) 다음에 캐릭터(${me})`);
  // 회의실 남쪽 의자(3,14) 는 테이블 다음
  const table = idx((e) => e.label === 'table' && e.box.x0 > 3 && e.box.y0 > 12);
  const southChair = idx((e) => e.label === 'chair' && Math.floor(e.box.x0) === 3 && Math.floor(e.box.y0) === 14);
  const northChair = idx((e) => e.label === 'chair' && Math.floor(e.box.x0) === 3 && Math.floor(e.box.y0) === 11);
  assert.ok(northChair < table && table < southChair, `북의자 ${northChair} < 테이블 ${table} < 남의자 ${southChair}`);
  // 자료실 책장(x=4,y=1) 앞 타일(4,2)의 캐릭터는 책장 다음
  const reader = makeEntity(box(4.25, 2.25, 4.75, 2.75, 1.7), () => {}, { label: 'reader' });
  const order2 = sortEntities([reader]);
  const shelf = order2.findIndex((e) => e.label === 'shelf' && Math.floor(e.box.x0) === 4 && Math.floor(e.box.y0) === 1);
  const r = order2.findIndex((e) => e.label === 'reader');
  assert.ok(shelf < r, `책장 ${shelf} < 독서중 ${r}`);
  // 전체 개수 보존
  assert.equal(order.length, order2.length);
});

test('공유 스프라이트(FE-39): 같은 키의 정적 엔티티는 기준점 대비 오프셋·크기가 같다 (평행이동 불변)', async () => {
  const { STATIC, sortEntities } = await import('../public/js/scene/render.js');
  const groups = new Map();
  for (const e of STATIC) {
    if (!e.key) continue;
    assert.ok(e.anchor && Number.isFinite(e.anchor.x), `${e.label} 에 anchor 없음`);
    const sig = [e.sb.x0 - e.anchor.x, e.sb.y0 - e.anchor.y, e.sb.x1 - e.sb.x0, e.sb.y1 - e.sb.y0].map((v) => v.toFixed(3)).join(',');
    const g = groups.get(e.key);
    if (g) assert.equal(sig, g, `${e.key}: 같은 키인데 오프셋이 다름`); else groups.set(e.key, sig);
  }
  const keyed = STATIC.filter((e) => e.key).length;
  assert.ok(keyed > 0 && groups.size < keyed / 3, `고유 스프라이트 ${groups.size}개 / 엔티티 ${keyed}개 — 공유가 거의 안 됨`);
  assert.ok(sortEntities([]).every((e) => e.dynamic || e.key), '동적이 아닌 정적 엔티티는 모두 키가 있어야 한다');
});

test('되풀이 애니메이션(FE-68): 반짝이 소품은 장면별 스프라이트, 매 프레임 그리는 건 유령·박쥐뿐, 전구·엘리베이터 장면은 실제와 같다', async () => {
  const R = await renderP;
  const M = await import('../public/js/scene/map.js');
  // 그리기 호출을 문자열로 기록하는 컨텍스트
  const rec = () => { const calls = []; return { calls, ctx: new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? v.toFixed(3) : typeof v)).join(',')})`); return { addColorStop() {} }; }), set: (t, k, v) => { calls.push(`${String(k)}=${v}`); t[k] = v; return true; } }) }; };
  const phaseTime = ([period, frames], now) => { const step = period / frames; return (Math.floor(now / step) % frames) * step; };
  for (const style of ['christmas/cool', 'christmas/mint', 'halloween/warm', 'summer/warm']) {
    M.setFloorStyle(style);
    R.sortEntities([]);
    const dyn = new Set(R.STATIC.filter((e) => e.dynamic).map((e) => e.label));
    assert.ok([...dyn].every((l) => l === 'decor:ghost' || l === 'decor:bat'), `${style}: 매 프레임 그리는 것 ${[...dyn]}`);
    assert.ok(R.STATIC.filter((e) => e.label === 'rack').every((e) => e.live && !e.dynamic), '랙은 몸체 스프라이트 + 불빛');
    const xl = new Set(R.STATIC.filter((e) => e.label === 'decor:xlights').map((e) => e.key));
    assert.ok(xl.size <= 30, `${style}: 전구 줄 스프라이트 종류 ${xl.size}`);
    // 전구 줄·엘리베이터는 장면 대표 시각으로 그려도 실제 시각과 똑같다 (스프라이트가 화면을 바꾸지 않는다)
    for (const e of R.STATIC.filter((x) => x.label === 'decor:xlights' || x.label === 'elevator')) {
      for (const now of [0, 333, 612, 1199, 98765.4]) {
        const a = rec(), b = rec();
        e.draw(a.ctx, now); e.draw(b.ctx, phaseTime(e.anim, now));
        assert.deepEqual(a.calls, b.calls, `${style} ${e.label} @${now}`);
      }
    }
  }
  M.setFloorStyle('warm');
});
