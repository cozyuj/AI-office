'use strict';
// 야외 날씨 (FE-61): WMO 코드 → 비·눈, 설정·테마 → 지금 내릴 것, Open-Meteo 응답 읽기
const test = require('node:test');
const assert = require('node:assert/strict');
const wP = import('../public/js/weather.js');

test('weatherOfCode: WMO 코드 → 비·눈·맑음', async () => {
  const { weatherOfCode } = await wP;
  for (const c of [0, 1, 2, 3, 45, 48]) assert.equal(weatherOfCode(c), 'clear', c);
  for (const c of [51, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]) assert.equal(weatherOfCode(c), 'rain', c);
  for (const c of [71, 73, 75, 77, 85, 86]) assert.equal(weatherOfCode(c), 'snow', c);
  assert.equal(weatherOfCode(undefined), 'clear');
});

test('effectiveWeather: 직접 고른 비·눈 > 맑음 > 실제 날씨 > 테마(크리스마스 층은 눈)', async () => {
  const { effectiveWeather } = await wP;
  assert.equal(effectiveWeather('rain', null, null), 'rain');
  assert.equal(effectiveWeather('snow', { kind: 'rain' }, 'summer'), 'snow');
  assert.equal(effectiveWeather('clear', null, 'christmas'), null);
  assert.equal(effectiveWeather('real', { kind: 'rain' }, 'christmas'), 'rain');
  assert.equal(effectiveWeather('real', { kind: 'clear' }, 'christmas'), null, '실제 날씨가 맑으면 크리스마스여도 맑음');
  assert.equal(effectiveWeather('real', null, null), null, '아직 못 받았으면 아무것도');
  assert.equal(effectiveWeather('theme', null, 'christmas'), 'snow');
  assert.equal(effectiveWeather('theme', { kind: 'rain' }, 'halloween'), null);
});

test('geocode · currentWeather: 후보 중 인구가 가장 많은 곳, 한글 짧은 이름은 접미사로도, 도시 이름·좌표만 보낸다', async () => {
  const { geocode, currentWeather } = await wP;
  const urls = [];
  const DB = {
    서울특별시: [{ name: '서울특별시', country: '대한민국', latitude: 37.566, longitude: 126.978, population: 10349312 }],
    부산: [{ name: 'Pusan', country: '대한민국', latitude: 36.38, longitude: 128.37 }],
    부산광역시: [{ name: '부산광역시', country: '대한민국', latitude: 35.1, longitude: 129.04, population: 3285147 }],
    Jeju: [{ name: 'Jeju', country: 'Nigeria', latitude: 8.42, longitude: 7.9 }, { name: '제주시', country: '대한민국', latitude: 33.51, longitude: 126.52, population: 488844 }],
  };
  const fetchFn = async (url) => { urls.push(url); const n = new URL(url).searchParams.get('name'); return { ok: true, status: 200, json: async () => ({ results: DB[n] }) }; };
  assert.deepEqual(await geocode('서울', 'ko', fetchFn), { name: '서울특별시', country: '대한민국', lat: 37.566, lon: 126.978 });
  assert.equal((await geocode('부산', 'ko', fetchFn)).name, '부산광역시', '작은 마을 Pusan 보다 인구가 많은 곳');
  assert.equal((await geocode('Jeju', 'ko', fetchFn)).name, '제주시');
  assert.equal(await geocode('없는도시', 'ko', fetchFn), null);
  assert.equal(await geocode('  ', 'ko', fetchFn), null);
  for (const u of urls) assert.match(u, /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=[^&]+&count=5&language=ko&format=json$/);
  const place = { lat: 37.57, lon: 126.98 };
  const fake = (body, ok = true) => async (url) => { urls.push(url); return { ok, status: ok ? 200 : 500, json: async () => body }; };
  const w = await currentWeather(place, fake({ current: { weather_code: 73 } }));
  assert.equal(w.kind, 'snow'); assert.equal(w.code, 73);
  assert.match(urls.at(-1), /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=37\.57&longitude=126\.98&current=weather_code&timezone=auto$/);
  await assert.rejects(currentWeather(place, fake({}, false)));
});
