// 야외 날씨 (FE-61): 테라스·옥상정원 같은 야외 방에 비·눈. 뷰어 설정이라 브라우저에 저장한다.
// 모드: theme(크리스마스 층은 눈) | real(실제 날씨) | clear | rain | snow
// 실제 날씨는 Open-Meteo (키 없음, CC BY 4.0): 도시 이름 → 지오코딩 좌표 → 현재 날씨 코드(WMO)를 30분마다. 도시 이름·좌표만 보낸다.

export const WEATHER_MODES = ['theme', 'real', 'clear', 'rain', 'snow'];
export const REFRESH_MS = 30 * 60 * 1000;

/** WMO 날씨 코드 → 'rain' | 'snow' | 'clear' */
export function weatherOfCode(code) {
  const c = Number(code);
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
  return 'clear';
}

/** 설정·실제 날씨·층 테마 → 지금 내릴 것 ('rain' | 'snow' | null) */
export function effectiveWeather(mode, real, skin) {
  if (mode === 'rain' || mode === 'snow') return mode;
  if (mode === 'clear') return null;
  if (mode === 'real') return real && (real.kind === 'rain' || real.kind === 'snow') ? real.kind : null;
  return skin === 'christmas' ? 'snow' : null; // theme
}

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const NOW = 'https://api.open-meteo.com/v1/forecast';

/**
 * 도시 이름 → { name, country, lat, lon } 또는 null. 이름이 같은 작은 마을이 먼저 나오기도 해서 후보 중 인구가 가장 많은 곳.
 * 한글 짧은 이름('서울', '부산', '제주')은 공식 이름(서울특별시·부산광역시·제주시)으로만 잡히므로 행정구역 접미사를 붙여서도 찾는다
 */
export async function geocode(name, lang = 'ko', fetchFn = fetch) {
  const q = String(name || '').trim();
  if (!q) return null;
  const names = [q];
  if (/[가-힣]$/.test(q) && !/(시|도|군|구)$/.test(q)) names.push(`${q}특별시`, `${q}광역시`, `${q}특별자치시`, `${q}시`);
  let best = null;
  for (const n of names) {
    const r = await fetchFn(`${GEO}?${new URLSearchParams({ name: n, count: '5', language: lang, format: 'json' })}`);
    if (!r.ok) throw new Error(`geocode ${r.status}`);
    const j = await r.json();
    for (const g of (j && j.results) || []) if (!best || (g.population || 0) > (best.population || 0)) best = g;
  }
  return best ? { name: best.name, country: best.country || '', lat: best.latitude, lon: best.longitude } : null;
}

/** 좌표 → { kind, code, at } */
export async function currentWeather(place, fetchFn = fetch) {
  const r = await fetchFn(`${NOW}?${new URLSearchParams({ latitude: String(place.lat), longitude: String(place.lon), current: 'weather_code', timezone: 'auto' })}`);
  if (!r.ok) throw new Error(`weather ${r.status}`);
  const j = await r.json();
  const code = j && j.current ? j.current.weather_code : null;
  return { kind: weatherOfCode(code), code, at: Date.now() };
}
