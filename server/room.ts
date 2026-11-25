// v1.9 방 관리 (예전 server/index.ts): 서버 없이 방장 브라우저의 Web Worker 안에서 돌아감
// 연결(Conn)은 방장 자신(로컬) 또는 P2P로 들어온 친구. 메시지 형식은 예전 WebSocket과 같음(JSON 문자열)
import { MAX_PLAYERS, PLAYER_COLORS, TICK_RATE } from "../shared/constants";
import { LobbyPlay } from "./lobbyPlay";
import { CLASS_IDS, type ClassId } from "../shared/classes";
import type { ClientMsg, RoomMode, ServerMsg } from "../shared/protocol";
import { Game } from "./game";
import { canHardcore, cosFor, getCodex, getProfile, getRecords, getSave, mergeSlice, savesFor, setEquip, setSkin, sliceFor, takeDirty, unlockAch, type Slice } from "./store";
import { ACHIEVEMENTS, SLOT_NAME, type Equip } from "../shared/achievements";

/** 커맨드 패널: 닉네임이 GRD + 비밀번호 해시가 맞아야 열림 (비밀번호 자체는 코드에 없음) */
const ADMIN_NAME = "GRD";
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 게임 중 연결이 끊긴 사람을 기다리는 시간 */
const RECONNECT_MS = 60_000;

/** 한 연결 (보내기만 하면 됨) */
export interface Conn {
  send(data: string): void;
}

interface Member {
  id: number;
  conn: Conn;
  /** 이번 게임에서 빠짐 (개발자 도구 감지) — 게임 메시지를 안 받음 */
  out?: boolean;
  /** 커맨드 권한 (접속할 때마다 다시 인증) */
  admin?: boolean;
  /** 채팅 도배 방지: 최근 보낸 시각들 */
  chatAt?: number[];
  /** 게임 중 연결이 끊겨 기다리는 중 (60초) */
  dc?: boolean;
  dcTimer?: ReturnType<typeof setTimeout>;
  name: string;
  color: number;
  cls: ClassId;
  ready: boolean;
  cos: Equip;
}

/**
 * v1.3 고정 간격 루프: 타이머가 늦게 울려도(윈도우는 약 15ms 단위) 밀린 틱만큼 따라잡아서
 * 게임 속도가 항상 실제 시간과 같게. 너무 밀리면(서버가 멈췄다 깨어남) 버리고 다시 시작
 */
function fixedLoop(step: () => void, hz: number) {
  const dt = 1000 / hz;
  let last = performance.now();
  let acc = 0;
  return setInterval(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    let n = 0;
    while (acc >= dt && n < 6) {
      step();
      acc -= dt;
      n++;
    }
    if (acc > dt * 6) acc = 0;
  }, 4);
}

class Room {
  members = new Map<number, Member>();
  /** 로비 미니게임 (양배추 축구) */
  play = new LobbyPlay();
  private playTimer: ReturnType<typeof setInterval> | null = null;
  hostId = 0;
  /** 원정·보석 쟁탈전: 다 같이 한 판 */
  game: Game | null = null;
  /** 스피드런: 각자 자기 맵에서 솔로 경주 */
  race: Map<number, Game> | null = null;
  private raceDone = new Set<number>();
  mode: RoomMode = { speedrun: false, gem: false, diff: 2 };
  saveId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raceTimer: ReturnType<typeof setInterval> | null = null;

  get inGame() {
    return !!this.game || !!this.race;
  }

  /** 로비 축구 루프 (게임 중엔 멈춤) */
  private startPlay() {
    if (this.playTimer) return;
    this.playTimer = fixedLoop(() => {
      if (this.inGame || this.members.size === 0) return;
      this.play.sync([...this.members.values()].filter((m) => !m.dc).map((m) => m.id));
      if (this.play.step()) this.broadcast(this.play.snapshot());
    }, 30);
  }

  gameFor(id: number) {
    return this.game ?? this.race?.get(id) ?? null;
  }

  constructor(public code: string, private onEmpty: () => void) {}

  send(m: Member, msg: ServerMsg) {
    m.conn.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMsg) {
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) {
      if (m.out && this.inGame) continue;
      m.conn.send(data);
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
      this.onEmpty();
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
  rejoin(m: Member, conn: Conn) {
    if (m.dcTimer) clearTimeout(m.dcTimer);
    m.dcTimer = undefined;
    m.dc = false;
    m.conn = conn;
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
        rawSend: (id: number, data: string) => {
          const m = this.members.get(id);
          if (m && !m.out) m.conn.send(data);
        },
        save,
        saveId: this.saveId ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        hostName: this.host?.name ?? "",
      },
    );
    this.timer = fixedLoop(() => this.game?.step(), TICK_RATE);
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
        { mode: { ...this.mode }, saveId: `race-${m.id}`, hostName: m.name, rawSend: (_id: number, data: string) => m.conn.send(data) },
      );
      this.race.set(m.id, g);
    }
    this.timer = fixedLoop(() => { for (const g of this.race?.values() ?? []) g.step(); }, TICK_RATE);
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

function cleanName(name: unknown) {
  const s = String(name ?? "").trim().slice(0, 10);
  return s || "무명 용사";
}



interface ConnState {
  conn: Conn;
  host: boolean;
  room: Room | null;
  me: Member | null;
}

/** 방장 브라우저 하나 = 방 하나. 연결이 열리고 메시지가 오고 닫히는 걸 처리 */
export class Hub {
  room: Room | null = null;
  private conns = new Map<number, ConnState>();
  private nextMemberId = 1;
  private syncTimer: ReturnType<typeof setInterval>;

  constructor(public code: string, private adminHash: string) {
    // 참가자 기록 동기화: 바뀐 사람 몫을 2초마다 그 사람에게 보냄 (방장 자신은 자기 저장소라 필요 없음)
    this.syncTimer = setInterval(() => this.flushSync(), 2000);
  }

  /** connId: 0 = 방장 자신 */
  open(connId: number, conn: Conn) {
    this.conns.set(connId, { conn, host: connId === 0, room: null, me: null });
  }

  close(connId: number) {
    const c = this.conns.get(connId);
    this.conns.delete(connId);
    if (!c?.room || !c.me || c.me.conn !== c.conn) return;
    if (c.room.inGame) c.room.disconnect(c.me);
    else c.room.remove(c.me.id);
  }

  flushSync() {
    const names = new Set(takeDirty());
    if (!names.size) return;
    for (const c of this.conns.values()) {
      if (c.host || !c.me || !names.has(c.me.name.trim().toLowerCase())) continue;
      c.conn.send(JSON.stringify({ t: "sync", slice: sliceFor(c.me.name) } satisfies ServerMsg));
    }
  }

  dispose() {
    clearInterval(this.syncTimer);
    this.room?.stopGame();
  }

  message(connId: number, raw: string) {
    const c = this.conns.get(connId);
    if (!c) return;
    const conn = c.conn;
    let room = c.room;
    let me = c.me;
    const error = (msg: string) => conn.send(JSON.stringify({ t: "error", msg } satisfies ServerMsg));
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.t === "ping") {
      conn.send(JSON.stringify({ t: "pong", c: Number(msg.c) || 0 }));
      return;
    }

    if (msg.t === "create" || msg.t === "join") {
      if (room) return;
      let target: Room | undefined;
      if (msg.t === "create") {
        // 방은 방장 브라우저에 하나뿐. 방장(자기 자신 연결)만 만들 수 있음
        if (!c.host) return error("방을 만들 수 없어요.");
        if (!this.room) this.room = new Room(this.code, () => { this.room = null; });
        target = this.room;
      } else {
        target = this.room && String(msg.code).toUpperCase().trim() === this.code ? this.room : undefined;
        if (!target) return error("그런 방이 없어요. 방 코드를 확인해 주세요.");
        // 연결이 끊겼던 사람이 같은 닉네임으로 돌아옴
        const back = [...target.members.values()].find((o) => o.dc && o.name === cleanName(msg.name));
        if (back) {
          room = target;
          me = back;
          c.room = room; c.me = me;
          target.rejoin(back, conn);
          return;
        }
        if (target.inGame) return error("이미 게임이 진행 중인 방이에요.");
        if (target.members.size >= MAX_PLAYERS) return error("방이 꽉 찼어요. (최대 8명)");
      }
      room = target;
      const name = cleanName(msg.name);
      // v1.9 참가자는 자기 브라우저의 기록(프로필·도감·순위)을 가져옴
      if (msg.t === "join" && !c.host && msg.slice && typeof msg.slice === "object") mergeSlice(name, msg.slice as Slice);
      me = { id: this.nextMemberId++, conn, name, color: 0, cls: "warrior", ready: false, cos: cosFor(name, "warrior") };
      c.room = room; c.me = me;
      room.add(me);
      return;
    }

    if (!room || !me) return;
    const game = room.gameFor(me.id);
    switch (msg.t) {
      case "class":
        if (!room.inGame && CLASS_IDS.includes(msg.cls)) { me.cls = msg.cls; me.cos = cosFor(me.name, me.cls); room.sendLobby(); }
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
      case "relic":
        game?.handleRelic(me.id, Number(msg.idx));
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
      case "forge":
        game?.handleForge(me.id, String(msg.id));
        break;
      case "restReady":
        game?.handleRestReady(me.id, !!msg.ready);
        break;
      case "chest":
        // 같은 키(E): 보물방이면 상자, 제단방이면 제단
        game?.handleChest(me.id);
        game?.handleAltar(me.id);
        break;
      case "trade":
        game?.handleTrade(me.id, Number(msg.idx));
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
        const who = me, inRoom = room;
        const code = typeof msg.code === "string" && msg.code.length < 64 ? msg.code.trim() : "";
        void (async () => {
          const ok = who.name === ADMIN_NAME && !!code && !!this.adminHash && (await sha256(code)) === this.adminHash;
          if (ok) who.admin = true;
          inRoom.send(who, ok ? { t: "admin", ok: true } : { t: "toast", msg: "알 수 없는 명령어예요" });
        })();
        break;
      }
      case "cmd":
        if (!me.admin) break;
        if (msg.cmd?.a === "unlockall") {
          for (const a of ACHIEVEMENTS) unlockAch(me.name, a.id);
          room.send(me, { t: "toast", msg: "업적·코스튬을 전부 해금했어요" });
          const pr = getProfile(me.name);
          room.send(me, { t: "profile", ach: pr.ach, equip: pr.equip, counters: pr.counters, mastery: pr.mastery, skins: pr.skins });
          break;
        }
        if (game) game.handleCmd(me.id, msg.cmd);
        else room.send(me, { t: "toast", msg: "커맨드는 게임 중에만 쓸 수 있어요" });
        break;
      case "profile": {
        const p = getProfile(me.name);
        room.send(me, { t: "profile", ach: p.ach, equip: p.equip, counters: p.counters, mastery: p.mastery, skins: p.skins });
        break;
      }
      case "skin": {
        // v1.7 직업 스킨 (지금 직업이면 바로 보임)
        if (!CLASS_IDS.includes(msg.cls)) break;
        setSkin(me.name, msg.cls, Number(msg.idx));
        me.cos = cosFor(me.name, me.cls);
        room.gameFor(me.id)?.setCos(me.id, me.cos);
        if (!room.inGame) room.sendLobby();
        const ps = getProfile(me.name);
        room.send(me, { t: "profile", ach: ps.ach, equip: ps.equip, counters: ps.counters, mastery: ps.mastery, skins: ps.skins });
        break;
      }
      case "equip": {
        if (!(msg.slot in SLOT_NAME)) break;
        setEquip(me.name, msg.slot, typeof msg.id === "string" ? msg.id : null);
        me.cos = cosFor(me.name, me.cls);
        room.gameFor(me.id)?.setCos(me.id, me.cos);
        const p = getProfile(me.name);
        room.send(me, { t: "profile", ach: p.ach, equip: p.equip, counters: p.counters, mastery: p.mastery, skins: p.skins });
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
  }
}
