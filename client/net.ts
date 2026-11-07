import type { ClientMsg, ServerMsg } from "../shared/protocol";

export class Net {
  private ws!: WebSocket;
  private queue: string[] = [];
  onMessage: (m: ServerMsg) => void = () => {};
  onClose: () => void = () => {};
  /** 다시 연결됐을 때 (처음 연결은 제외) */
  onReopen: () => void = () => {};
  private opened = false;

  constructor() {
    this.connect();
  }

  private connect() {
    // 화면과 서버가 다른 곳에 있을 때(예: Netlify + Render): 빌드할 때 VITE_SERVER_URL=https://서버주소
    const remote = import.meta.env.VITE_SERVER_URL as string | undefined;
    const url = remote
      ? `${remote.replace(/^http/, "ws").replace(/\/$/, "")}/ws`
      : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.opened) this.onReopen();
      this.opened = true;
      for (const q of this.queue) ws.send(q);
      this.queue = [];
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = () => { if (this.ws === ws) this.onClose(); };
  }

  /** 끊긴 뒤 다시 연결 시도 */
  reconnect() {
    this.queue = [];
    this.connect();
  }

  /** 완전히 끊기 (다시 연결 안 함) */
  close() {
    this.onClose = () => {};
    this.ws.close();
  }

  send(m: ClientMsg) {
    const data = JSON.stringify(m);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
    else this.queue.push(data);
  }
}
