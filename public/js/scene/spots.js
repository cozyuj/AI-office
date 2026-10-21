// 휴식 방(휴게실 + 층의 편의시설) 안의 명소: 쉬는 캐릭터가 10~30초마다 옮겨 다니는 자리와 그때 띄우는 말풍선.
// 명소는 레이아웃(layouts.js)의 방 생성기가 만들고 map.setLayout() 이 서버 휴식 방 id(lounge/cafe/terrace) 키로 채운다 — live 객체.
// tile 은 그 방 안의 통행 가능 타일이어야 한다 (test/spots.test.js 가 모든 레이아웃에서 검증).
import { REST_SPOTS } from './map.js';
export { REST_SPOTS };
