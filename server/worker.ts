// v1.9 방장 브라우저의 게임 서버 (Web Worker): 화면(메인 스레드)과 따로 돌아서 렌더링이 느려도 게임 속도는 그대로
// 메인 스레드 ↔ 워커 메시지
//  받음: init(저장소·방 코드·관리자 해시) · open/msg/close(연결 번호 c, 0 = 방장 자신)
//  보냄: send(연결 c에 문자열 d) · persist(저장소 JSON)
import { Hub } from "./room";
import { exportStore, loadStore, onPersist } from "./store";

type In =
  | { k: "init"; store: string | null; code: string; adminHash: string }
  | { k: "open"; c: number }
  | { k: "msg"; c: number; d: string }
  | { k: "close"; c: number };

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
let hub: Hub | null = null;

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.k === "init") {
    loadStore(m.store);
    onPersist(() => post({ k: "persist", store: JSON.stringify(exportStore()) }));
    hub = new Hub(m.code, m.adminHash);
    return;
  }
  if (!hub) return;
  if (m.k === "open") {
    const c = m.c;
    hub.open(c, { send: (d) => post({ k: "send", c, d }) });
  } else if (m.k === "msg") hub.message(m.c, m.d);
  else if (m.k === "close") hub.close(m.c);
};
