// v1.9 서버 없이 연결: 게임 서버는 방장 브라우저의 Web Worker에서 돌아감
//  - 혼자 하기: 내 워커에 바로 연결 (인터넷 필요 없음)
//  - 같이 하기(방장): 내 워커 + PeerJS로 친구들의 P2P(WebRTC) 연결을 받아 워커로 이어 줌
//  - 같이 하기(참가): 방장 브라우저에 P2P로 연결
// 메시지는 예전 WebSocket 때와 같은 JSON 문자열이라 게임 코드는 그대로
import type { DataConnection, Peer as PeerT } from "peerjs";
import type { ClientMsg, ServerMsg } from "../shared/protocol";
import { readStoreRaw, writeStoreRaw } from "./localStore";

export type NetMode = "solo" | "host" | "guest";

/** 방 코드 → PeerJS 아이디 */
const PEER_PREFIX = "yangbaechu-yongsadan-v19-";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ADMIN_HASH = ((import.meta.env.VITE_ADMIN_HASH as string | undefined) ?? "").trim().toLowerCase();

function randomCode() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

/** 연결 중계 서버: 기본은 PeerJS 무료 공개 서버. 시험용으로 VITE_PEER_HOST 로 바꿀 수 있음 */
function peerOpts() {
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  if (!host) return { debug: 0 };
  return { debug: 0, host, port: Number(import.meta.env.VITE_PEER_PORT ?? 9000), path: "/", secure: false, config: { iceServers: [] } };
}

async function loadPeer() {
  const mod = await import("peerjs");
  return mod.Peer;
}

export class Net {
  onMessage: (m: ServerMsg) => void = () => {};
  /** 연결이 끊김 (참가자: 방장과 끊김) */
  onClose: () => void = () => {};
  /** 다시 연결됨 */
  onReopen: () => void = () => {};
  /** 같이 하기 방장: 누가 들어오거나 나갈 때 (연결 수) */
  onPeers: (n: number) => void = () => {};
  mode: NetMode | null = null;
  code = "";
  /** 참가자: 방장이 방을 닫음 (다시 연결해도 소용없음) */
  hostGone = false;

  private worker: Worker | null = null;
  private peer: PeerT | null = null;
  private hostConn: DataConnection | null = null;
  private guests = new Map<number, DataConnection>();
  private nextConn = 1;
  private queue: string[] = [];
  private open = false;
  private closed = false;
  /** 참가자: 방장에게서 마지막으로 받은 시각 (6초 넘게 조용하면 끊긴 것으로) */
  private lastRecv = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  get active() {
    return this.mode !== null;
  }

  /** 혼자 하기 / 같이 하기 방장: 내 브라우저에 게임 서버를 켬. 방 코드를 돌려줌 */
  async startHost(multi: boolean): Promise<string> {
    this.reset();
    this.closed = false;
    this.mode = multi ? "host" : "solo";
    if (multi) {
      this.code = await this.openPeer();
    } else {
      this.code = "SOLO";
    }
    const w = new Worker(new URL("../server/worker.ts", import.meta.url), { type: "module" });
    this.worker = w;
    w.onmessage = (e: MessageEvent<{ k: string; c?: number; d?: string; store?: string }>) => {
      const m = e.data;
      if (m.k === "persist" && m.store) writeStoreRaw(m.store);
      else if (m.k === "send" && m.d !== undefined) {
        if (m.c === 0) this.deliver(m.d);
        else {
          const dc = this.guests.get(m.c ?? -1);
          if (dc?.open) dc.send(m.d);
        }
      }
    };
    w.onerror = () => this.fail();
    // 개발 모드에서만: 주소의 ?env_START_WORLD=9 같은 값을 시험용 시작 지점으로
    const env: Record<string, string> = {};
    if (import.meta.env.DEV) for (const [k, v] of new URLSearchParams(location.search)) if (k.startsWith("env_")) env[k.slice(4)] = v;
    w.postMessage({ k: "init", store: readStoreRaw(), code: this.code, adminHash: ADMIN_HASH, env });
    w.postMessage({ k: "open", c: 0 });
    this.markOpen();
    return this.code;
  }

  /** PeerJS 방장 아이디 만들기 (코드가 이미 쓰이면 다른 코드로) */
  private async openPeer(): Promise<string> {
    const Peer = await loadPeer();
    for (let tries = 0; tries < 5; tries++) {
      const code = randomCode();
      const ok = await new Promise<PeerT | null>((resolve) => {
        const p = new Peer(PEER_PREFIX + code, peerOpts());
        const t = setTimeout(() => { p.destroy(); resolve(null); }, 12000);
        p.on("open", () => { clearTimeout(t); resolve(p); });
        p.on("error", (err) => {
          clearTimeout(t);
          p.destroy();
          resolve(null);
          if ((err as { type?: string }).type !== "unavailable-id") tries = 99;
        });
      });
      if (ok) {
        this.peer = ok;
        ok.on("connection", (dc) => this.acceptGuest(dc));
        // 중계 서버와 잠깐 끊겨도 이미 연결된 친구들은 그대로. 새 친구를 받으려면 다시 붙음
        ok.on("disconnected", () => { if (!this.closed) setTimeout(() => { if (!this.closed && ok.disconnected) ok.reconnect(); }, 2000); });
        return code;
      }
    }
    throw new Error("연결 중계 서버에 접속하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }

  private acceptGuest(dc: DataConnection) {
    const c = this.nextConn++;
    dc.on("open", () => {
      this.guests.set(c, dc);
      this.worker?.postMessage({ k: "open", c });
      this.onPeers(this.guests.size);
    });
    dc.on("data", (d) => {
      if (typeof d === "string" && d.length < 20000) this.worker?.postMessage({ k: "msg", c, d });
    });
    const gone = () => {
      if (!this.guests.has(c)) return;
      this.guests.delete(c);
      this.worker?.postMessage({ k: "close", c });
      this.onPeers(this.guests.size);
    };
    dc.on("close", gone);
    dc.on("error", gone);
  }

  /** 같이 하기 참가: 방장 브라우저에 연결 */
  async join(code: string): Promise<void> {
    this.reset();
    this.closed = false;
    this.hostGone = false;
    this.mode = "guest";
    this.code = code.toUpperCase().trim();
    const Peer = await loadPeer();
    const p = new Peer(peerOpts());
    this.peer = p;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("연결 중계 서버에 접속하지 못했어요.")), 12000);
      p.on("open", () => { clearTimeout(t); resolve(); });
      p.on("error", (err) => { clearTimeout(t); reject(new Error(this.peerError(err))); });
    });
    await this.connectHost();
  }

  private peerError(err: unknown) {
    const type = (err as { type?: string }).type;
    if (type === "peer-unavailable") return "그런 방이 없어요. 방 코드를 확인하거나, 방장이 아직 방에 있는지 물어봐 주세요.";
    if (type === "browser-incompatible") return "이 브라우저는 같이 하기를 지원하지 않아요.";
    return "연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  }

  private connectHost(): Promise<void> {
    const p = this.peer;
    if (!p) return Promise.reject(new Error("연결 준비가 안 됐어요."));
    return new Promise<void>((resolve, reject) => {
      const dc = p.connect(PEER_PREFIX + this.code, { serialization: "raw", reliable: true });
      this.hostConn = dc;
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; reject(new Error("그런 방이 없거나 방장과 연결되지 않아요.")); } }, 15000);
      const onErr = (err: unknown) => {
        if ((err as { type?: string }).type === "peer-unavailable") this.hostGone = true;
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(new Error(this.peerError(err)));
      };
      p.once("error", onErr);
      dc.on("open", () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        p.off("error", onErr);
        this.lastRecv = performance.now();
        if (!this.watchdog) {
          this.watchdog = setInterval(() => {
            if (this.mode !== "guest" || !this.hostConn?.open || performance.now() - this.lastRecv < 6000) return;
            const dead = this.hostConn;
            this.hostConn = null;
            dead.close();
            this.lost();
          }, 1000);
        }
        this.markOpen();
        resolve();
      });
      dc.on("data", (d) => { this.lastRecv = performance.now(); if (typeof d === "string") this.deliver(d); });
      dc.on("close", () => { if (this.hostConn === dc) this.lost(); });
      dc.on("error", () => { if (this.hostConn === dc) this.lost(); });
    });
  }

  private markOpen() {
    const again = this.open;
    this.open = true;
    for (const q of this.queue) this.rawSend(q);
    this.queue = [];
    if (again) this.onReopen();
  }

  private lost() {
    if (this.closed) return;
    this.hostConn = null;
    this.onClose();
  }

  private fail() {
    if (this.closed) return;
    this.onClose();
  }

  private deliver(d: string) {
    try {
      this.onMessage(JSON.parse(d));
    } catch {
      // 깨진 메시지는 무시
    }
  }

  /** 참가자: 끊긴 뒤 다시 연결 시도 */
  reconnect() {
    if (this.mode !== "guest" || this.closed || !this.peer) return;
    const p = this.peer;
    const go = () => this.connectHost().catch(() => this.lost());
    if (p.disconnected) {
      p.once("open", go);
      p.reconnect();
    } else go();
  }

  private rawSend(data: string) {
    if (this.mode === "guest") this.hostConn?.send(data);
    else this.worker?.postMessage({ k: "msg", c: 0, d: data });
  }

  send(m: ClientMsg) {
    const data = JSON.stringify(m);
    const ready = this.mode === "guest" ? !!this.hostConn?.open : !!this.worker;
    if (this.open && ready) this.rawSend(data);
    else this.queue.push(data);
  }

  /** 모두 끊고 처음 상태로 (방장이면 방이 없어짐) */
  close() {
    this.closed = true;
    this.reset();
  }

  private reset() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.worker?.terminate();
    this.worker = null;
    for (const dc of this.guests.values()) dc.close();
    this.guests.clear();
    this.hostConn?.close();
    this.hostConn = null;
    this.peer?.destroy();
    this.peer = null;
    this.queue = [];
    this.open = false;
    this.mode = null;
  }
}
