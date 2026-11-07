import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { MAX_PLAYERS, PLAYER_COLORS, TICK_RATE } from "../shared/constants";
import { LobbyPlay } from "./lobbyPlay";
import { CLASS_IDS, type ClassId } from "../shared/classes";
import type { ClientMsg, RoomMode, ServerMsg } from "../shared/protocol";
import { Game } from "./game";
import { canHardcore, getCodex, getProfile, getRecords, getSave, savesFor, setEquip, unlockAch } from "./store";
import { ACHIEVEMENTS, SLOT_NAME, type Equip } from "../shared/achievements";

// 개발 모드에선 Vite가 /ws 를 2567로 프록시하므로 PORT 환경변수를 무시한다
/** 커맨드 패널: 닉네임이 GRD + 이 해시와 맞는 명령어를 입력해야 열림 (비밀번호 자체는 코드에 없음) */
const ADMIN_NAME = "GRD";
// 해시도 코드에 두지 않음: 환경변수 ADMIN_HASH 또는 data/admin.hash (git에 안 올라감). 없으면 커맨드 패널 꺼짐
const ADMIN_HASH = (() => {
  if (process.env.ADMIN_HASH) return process.env.ADMIN_HASH.trim();
  try {
    return fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/admin.hash"), "utf8").trim();
  } catch {
    return "";
  }
})();
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** 게임 중 연결이 끊긴 사람을 기다리는 시간 */
const RECONNECT_MS = 60_000;
const PORT = process.argv.includes("--dev") ? 2567 : Number(process.env.PORT ?? 2567);
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", process.env.DIST_DIR ?? "dist");

interface Member {
  id: number;
  ws: WebSocket;
  /** 이번 게임에서 빠짐 (개발자 도구 감지) — 게임 메시지를 안 받음 */
  out?: boolean;
  /** 커맨드 권한 (접속할 때마다 다시 인증) */
  admin?: boolean;
  /** 채팅 도배 방지: 최근 보낸 시각들 */
  chatAt?: number[];
  /** 게임 중 연결이 끊겨 기다리는 중 (60초) */
  dc?: boolean;
  dcTimer?: NodeJS.Timeout;
  name: string;
  color: number;
  cls: ClassId;
  ready: boolean;
  cos: Equip;
}

class Room {
  members = new Map<number, Member>();
  /** 로비 미니게임 (양배추 축구) */
  play = new LobbyPlay();
  private playTimer: NodeJS.Timeout | null = null;
  hostId = 0;
  /** 원정·보석 쟁탈전: 다 같이 한 판 */
  game: Game | null = null;
  /** 스피드런: 각자 자기 맵에서 솔로 경주 */
  race: Map<number, Game> | null = null;
  private raceDone = new Set<number>();
  mode: RoomMode = { speedrun: false, gem: false, diff: 2 };
  saveId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private raceTimer: NodeJS.Timeout | null = null;

  get inGame() {
    return !!this.game || !!this.race;
  }

  /** 로비 축구 루프 (게임 중엔 멈춤) */
  private startPlay() {
    if (this.playTimer) return;
    this.playTimer = setInterval(() => {
      if (this.inGame || this.members.size === 0) return;
      this.play.sync([...this.members.values()].filter((m) => !m.dc).map((m) => m.id));
      if (this.play.step()) this.broadcast(this.play.snapshot());
    }, 1000 / 30);
  }

  gameFor(id: number) {
    return this.game ?? this.race?.get(id) ?? null;
  }

  constructor(public code: string) {}

  send(m: Member, msg: ServerMsg) {
    if (m.ws.readyState === WebSocket.OPEN) m.ws.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) {
      if (m.out && this.inGame) continue;
      if (m.ws.readyState === WebSocket.OPEN) m.ws.send(data);
    }
  }

  add(m: Member) {
    if (this.members.size === 0) this.hostId = m.id;
    const used = new Set([...this.members.values()].map((o) => o.color));
    m.color = PLAYER_COLORS.findIndex((_, i) => !used.has(i));
    this.members.set(m.id, m);
    this.send(m, { t: "joined", id: m.id, code: this.code });
    this.startPlay();
    this.sendLobby();
  }

  remove(id: number) {
    const gone = this.members.get(id);
    if (gone?.dcTimer) clearTimeout(gone.dcTimer);
    this.members.delete(id);
    this.game?.removePlayer(id);
    if (this.race) {
      this.race.delete(id);
      this.raceDone.delete(id);
      this.checkRaceOver();
    }
    if (this.hostId === id) this.hostId = this.members.keys().next().value ?? 0;
    if (this.members.size === 0) {
      this.stopGame();
      if (this.playTimer) clearInterval(this.playTimer);
      this.playTimer = null;
      rooms.delete(this.code);
      return;
    }
    if (!this.inGame) this.sendLobby();
  }

  /** 게임 중 연결이 끊김: 60초 동안 캐릭터를 남겨 둠 (무적) */
  disconnect(m: Member) {
    const g = this.gameFor(m.id);
    if (!g || !g.players.has(m.id)) {
      this.remove(m.id);
      return;
    }
    m.dc = true;
    g.setDisconnected(m.id, true);
    m.dcTimer = setTimeout(() => this.remove(m.id), RECONNECT_MS);
    if ([...this.members.values()].every((o) => o.dc)) {
      // 모두 끊겼어도 60초는 기다림
    }
  }

  /** 같은 닉네임으로 다시 들어옴 */
  rejoin(m: Member, ws: WebSocket) {
    if (m.dcTimer) clearTimeout(m.dcTimer);
    m.dcTimer = undefined;
    m.dc = false;
    m.ws = ws;
    m.admin = false;
    this.send(m, { t: "joined", id: m.id, code: this.code });
    const g = this.gameFor(m.id);
    if (g) {
      g.setDisconnected(m.id, false);
      g.resync(m.id);
    } else {
      this.sendLobby();
    }
  }

  /** 스피드런 경주에서 한 명 빼기 */
  leaveRace(id: number) {
    if (!this.race) return;
    this.race.delete(id);
    this.raceDone.delete(id);
    this.checkRaceOver();
  }

  get host() {
    return this.members.get(this.hostId);
  }

  /** 방장이 바뀌거나 저장이 지워졌을 때 모드·저장 선택이 유효한지 다시 맞춤 */
  private fixMode() {
    const host = this.host;
    if (!host) return;
    // 하드코어(4)는 8월드를 깬 닉네임이 방장일 때만
    if (this.mode.diff === 4 && !canHardcore(host.name) && !this.saveId) this.mode.diff = 2;
    if (this.saveId && !savesFor(host.name).some((s) => s.id === this.saveId)) this.saveId = null;
  }

  setMode(byId: number, speedrun: boolean, gem: boolean, diff: number, descent = false, panic = false) {
    const host = this.host;
    if (this.inGame || byId !== this.hostId || !host) return;
    const isGem = !!gem;
    let d = Math.max(1, Math.min(4, Math.floor(Number(diff) || 2)));
    if (d === 4 && !canHardcore(host.name)) d = 3;
    const isPanic = !isGem && !!panic;
    const isDescent = !isGem && !isPanic && !!descent;
    this.mode = { speedrun: !isGem && !isDescent && !isPanic && !!speedrun, gem: isGem, descent: isDescent, panic: isPanic, diff: d };
    // 스피드런·보석 쟁탈전은 저장 사용 안 함
    if (this.mode.speedrun || this.mode.gem || this.mode.descent || this.mode.panic) this.saveId = null;
    this.sendLobby();
  }

  useSave(byId: number, id: string | null) {
    const host = this.host;
    if (this.inGame || byId !== this.hostId || !host) return;
    if (id && !savesFor(host.name).some((s) => s.id === id)) return;
    this.saveId = id;
    if (id) {
      const save = getSave(id)!;
      this.mode = { speedrun: false, gem: false, diff: save.diff };
      // 저장된 닉네임이면 그 직업으로 맞춰줌
      for (const m of this.members.values()) {
        const sp = save.players.find((p) => p.name.trim().toLowerCase() === m.name.trim().toLowerCase());
        if (sp) m.cls = sp.cls;
      }
    }
    this.sendLobby();
  }

  sendLobby(only?: Member) {
    this.fixMode();
    const host = this.host;
    const players = [...this.members.values()].map((m) => ({
      id: m.id, name: m.name, color: m.color, cls: m.cls, ready: m.ready, host: m.id === this.hostId, cos: m.cos,
    }));
    for (const m of only ? [only] : this.members.values()) {
      const isHost = m.id === this.hostId;
      this.send(m, {
        t: "lobby",
        code: this.code,
        players,
        mode: this.mode,
        canHardcore: !!host && canHardcore(host.name),
        saves: isHost && host ? savesFor(host.name) : [],
        saveId: this.saveId,
        records: getRecords(),
      });
    }
  }

  start(byId: number, force = false) {
    if (this.inGame || byId !== this.hostId) return;
    const notReady = [...this.members.values()].filter((m) => m.id !== this.hostId && !m.ready);
    if (notReady.length && !force) return;
    if (this.mode.speedrun) {
      this.startRace();
      return;
    }
    const save = this.saveId ? getSave(this.saveId) : undefined;
    this.game = new Game(
      [...this.members.values()].map((m) => ({ id: m.id, name: m.name, color: m.color, cls: m.cls, cos: m.cos })),
      (msg) => this.broadcast(msg),
      (id, msg) => { const m = this.members.get(id); if (m) this.send(m, msg); },
      () => this.stopGame(),
      {
        mode: { ...this.mode },
        save,
        saveId: this.saveId ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        hostName: this.host?.name ?? "",
      },
    );
    this.timer = setInterval(() => this.game?.step(), 1000 / TICK_RATE);
  }

  /** 스피드런: 한 명당 게임 하나씩 (각자 다른 맵), 진행 현황은 모두에게 */
  private startRace() {
    this.race = new Map();
    this.raceDone.clear();
    for (const m of this.members.values()) {
      const g = new Game(
        [{ id: m.id, name: m.name, color: m.color, cls: m.cls, cos: m.cos }],
        (msg) => this.send(m, msg),
        (_id, msg) => this.send(m, msg),
        () => { this.raceDone.add(m.id); this.sendRace(); this.checkRaceOver(); },
        { mode: { ...this.mode }, saveId: `race-${m.id}`, hostName: m.name },
      );
      this.race.set(m.id, g);
    }
    this.timer = setInterval(() => { for (const g of this.race?.values() ?? []) g.step(); }, 1000 / TICK_RATE);
    this.raceTimer = setInterval(() => this.sendRace(), 1000);
    this.sendRace();
  }

  private sendRace() {
    if (!this.race) return;
    const entries = [...this.race.entries()].map(([id, g]) => {
      const m = this.members.get(id);
      return { id, name: m?.name ?? "?", color: m?.color ?? 0, ...g.progress() };
    });
    this.broadcast({ t: "race", entries, over: entries.every((e) => e.state !== "run") });
  }

  private checkRaceOver() {
    if (!this.race) return;
    if ([...this.race.keys()].every((id) => this.raceDone.has(id))) {
      this.sendRace();
      this.stopGame();
    }
  }

  stopGame() {
    if (this.timer) clearInterval(this.timer);
    if (this.raceTimer) clearInterval(this.raceTimer);
    this.timer = null;
    this.raceTimer = null;
    this.game = null;
    this.race = null;
    this.raceDone.clear();
    this.saveId = null;
    for (const m of this.members.values()) { m.ready = false; m.out = false; }
  }
}

const rooms = new Map<string, Room>();
let nextMemberId = 1;

function makeCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(name: unknown) {
  const s = String(name ?? "").trim().slice(0, 10);
  return s || "무명 용사";
}

// ---------- HTTP (빌드된 클라이언트 서빙) ----------
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(DIST, url === "/" ? "index.html" : url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html");
  }
  if (!fs.existsSync(file)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("양배추 용사단 서버 실행 중. 개발 중에는 http://localhost:5173 으로 접속하세요.");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

// ---------- WebSocket ----------
// 압축: 큰 메시지(스냅샷)만 가볍게 압축해서 터널·와이파이에서도 덜 끊기게
const wss = new WebSocketServer({
  server,
  path: "/ws",
  perMessageDeflate: { threshold: 512, zlibDeflateOptions: { level: 1 }, serverNoContextTakeover: false },
});

wss.on("connection", (ws) => {
  let room: Room | null = null;
  let me: Member | null = null;

  const error = (msg: string) => ws.send(JSON.stringify({ t: "error", msg } satisfies ServerMsg));

  ws.on("message", (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.t === "create" || msg.t === "join") {
      if (room) return;
      let target: Room | undefined;
      if (msg.t === "create") {
        target = new Room(makeCode());
        rooms.set(target.code, target);
      } else {
        target = rooms.get(String(msg.code).toUpperCase().trim());
        if (!target) return error("그런 방이 없어요. 방 코드를 확인해 주세요.");
        // 연결이 끊겼던 사람이 같은 닉네임으로 돌아옴
        const back = [...target.members.values()].find((o) => o.dc && o.name === cleanName(msg.name));
        if (back) {
          room = target;
          me = back;
          target.rejoin(back, ws);
          return;
        }
        if (target.inGame) return error("이미 게임이 진행 중인 방이에요.");
        if (target.members.size >= MAX_PLAYERS) return error("방이 꽉 찼어요. (최대 8명)");
      }
      room = target;
      const name = cleanName(msg.name);
      me = { id: nextMemberId++, ws, name, color: 0, cls: "warrior", ready: false, cos: { ...getProfile(name).equip } };
      room.add(me);
      return;
    }

    if (!room || !me) return;
    const game = room.gameFor(me.id);
    switch (msg.t) {
      case "class":
        if (!room.inGame && CLASS_IDS.includes(msg.cls)) { me.cls = msg.cls; room.sendLobby(); }
        break;
      case "ready":
        if (!room.inGame) { me.ready = !!msg.ready; room.sendLobby(); }
        break;
      case "mode":
        room.setMode(me.id, !!msg.speedrun, !!msg.gem, Number(msg.diff), !!msg.descent, !!msg.panic);
        break;
      case "useSave":
        room.useSave(me.id, typeof msg.id === "string" ? msg.id : null);
        break;
      case "start":
        room.start(me.id);
        break;
      case "input":
        game?.handleInput(me.id, msg.input);
        break;
      case "cast":
        game?.handleCast(me.id, Number(msg.slot), Number(msg.x), Number(msg.y));
        break;
      case "pick":
        game?.handlePick(me.id, Number(msg.idx));
        break;
      case "talent":
        game?.handleTalent(me.id, Number(msg.branch));
        break;
      case "vote":
        game?.handleVote(me.id, Number(msg.idx));
        break;
      case "buy":
        game?.handleBuy(me.id, msg.tier);
        break;
      case "restReady":
        game?.handleRestReady(me.id, !!msg.ready);
        break;
      case "chest":
        game?.handleChest(me.id);
        break;
      case "gamble":
        game?.handleGamble(me.id, msg.game, Number(msg.bet), msg.pick === "even" ? "even" : "odd");
        break;
      case "trial":
        game?.handleTrial(me.id, !!msg.yes);
        break;
      case "leaveGame":
        // 이 사람만 게임에서 빼고 로비 화면으로 (다른 사람 게임은 계속)
        if (room.inGame) {
          me.out = true;
          room.game?.removePlayer(me.id);
          room.leaveRace(me.id);
          me.ready = false;
          if (room.game && room.game.players.size === 0) {
            room.stopGame();
            room.sendLobby();
          } else {
            room.sendLobby(me);
          }
        }
        break;
      case "lobbyInput":
        if (!room.inGame) room.play.input(me.id, msg);
        break;
      case "chat": {
        // 자유 채팅: 80자까지, 5초에 5번까지
        const text = String(msg.text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
        if (!text) break;
        const now = Date.now();
        me.chatAt = (me.chatAt ?? []).filter((t) => now - t < 5000);
        if (me.chatAt.length >= 5) {
          room.send(me, { t: "toast", msg: "채팅을 너무 빨리 보내고 있어요" });
          break;
        }
        me.chatAt.push(now);
        room.broadcast({ t: "chat", id: me.id, name: me.name, color: me.color, text });
        room.gameFor(me.id)?.noteChat(me.id);
        break;
      }
      case "menuPause":
        if (game && !room.race) game.setMenuPause(!!msg.on);
        break;
      case "auth": {
        // 닉네임 GRD + 비밀번호가 둘 다 맞아야 열림. 틀리면 그냥 '알 수 없는 명령어'
        const ok = me.name === ADMIN_NAME && typeof msg.code === "string" && msg.code.length < 64 && !!ADMIN_HASH && sha256(msg.code.trim()) === ADMIN_HASH;
        if (ok) me.admin = true;
        room.send(me, ok ? { t: "admin", ok: true } : { t: "toast", msg: "알 수 없는 명령어예요" });
        break;
      }
      case "cmd":
        if (!me.admin) break;
        if (msg.cmd?.a === "unlockall") {
          for (const a of ACHIEVEMENTS) unlockAch(me.name, a.id);
          room.send(me, { t: "toast", msg: "업적·코스튬을 전부 해금했어요" });
          const pr = getProfile(me.name);
          room.send(me, { t: "profile", ach: pr.ach, equip: pr.equip, counters: pr.counters });
          break;
        }
        if (game) game.handleCmd(me.id, msg.cmd);
        else room.send(me, { t: "toast", msg: "커맨드는 게임 중에만 쓸 수 있어요" });
        break;
      case "profile": {
        const p = getProfile(me.name);
        room.send(me, { t: "profile", ach: p.ach, equip: p.equip, counters: p.counters });
        break;
      }
      case "equip": {
        if (!(msg.slot in SLOT_NAME)) break;
        me.cos = setEquip(me.name, msg.slot, typeof msg.id === "string" ? msg.id : null);
        room.gameFor(me.id)?.setCos(me.id, me.cos);
        const p = getProfile(me.name);
        room.send(me, { t: "profile", ach: p.ach, equip: p.equip, counters: p.counters });
        if (!room.inGame) room.sendLobby();
        break;
      }
      case "codex": {
        const c = getCodex(me.name);
        room.send(me, { t: "codex", cards: c.cards, kills: c.kills });
        break;
      }
      case "toLobby":
        if (!room.inGame) room.sendLobby();
        break;
      case "retry":
        // 결과 화면 재도전: 방장은 같은 모드로 바로 다시 시작, 다른 사람은 준비 완료로
        if (room.inGame) break;
        if (me.id === room.hostId) room.start(me.id, true);
        else { me.ready = true; room.sendLobby(); }
        break;
    }
  });

  ws.on("close", () => {
    // 이미 새 연결로 돌아온 사람이면 무시
    if (!room || !me || me.ws !== ws) return;
    if (room.inGame) room.disconnect(me);
    else room.remove(me.id);
  });
});

server.listen(PORT, () => {
  console.log(`양배추 용사단 서버: http://localhost:${PORT}  (WebSocket /ws)`);
});
