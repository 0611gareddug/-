/// <reference types="vite/client" />
import "galmuri/dist/galmuri.css";
import "./style.css";
import Phaser from "phaser";
import { CLASSES, CLASS_IDS, SKILL_UNLOCK, type ClassId } from "../shared/classes";
import { CARD_BY_ID, FORGE_PRICE, GACHA_PRICE, RARITY_NAME, canForge } from "../shared/cards";
import { MARKET_RANGE, PLAYER_COLORS, ROUNDS_PER_WORLD, VIEW_H, VIEW_W } from "../shared/constants";
import { type SnapMonster, type SnapProj, type SnapshotWire, GEM_GOAL, LOBBY_FIELD_H, LOBBY_FIELD_W, LOBBY_GOAL_HALF, MOD_NAME, PANIC_ZONES, type GachaTier, type LobbyPlayer, type RaceEntry, type ServerMsg, type Snapshot, type StageInfo } from "../shared/protocol";
import { DIFFS, MONSTERS, WORLDS, WORLD_COUNT, diffDmgMul, diffHpMul, diffName } from "../shared/worlds";
import { initMenu, isCapturingKey, isMenuOpen, mySkin, onCodex, onProfile, setAdmin, toggleMenu } from "./menu";
import { ACH_BY_ID, titleName } from "../shared/achievements";
import { displayKey, isKey, onSettingsChange, settings } from "./settings";
import { GameScene } from "./GameScene";
import { bgm, sfx } from "./sound";
import { initGuard } from "./guard";
import { panicComplete, panicEnd, panicReset, panicSnap, panicStage } from "./panic";
import { closeModeSelect, initModeSelect, isModeSelectOpen, miniBanner, modeIdOf, openModeSelect } from "./modeSelect";
import { Net } from "./net";
import { BODIES, heroPalette, heroRows, heroSkinCanvas, monsterPalette, paint } from "./sprites";
import { MASTERY_TIERS, SKINS } from "../shared/skins";
import { paintCard } from "./cardArt";
import { initTouch } from "./touch";
import { TALENTS, TALENT_TIERS, tier } from "../shared/talents";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ["title", "lobby", "hud", "cards", "vote", "market", "gamble", "trial", "result"] as const;
type ScreenId = (typeof screens)[number];
const BLOCKING: ScreenId[] = ["cards", "vote", "market", "gamble", "trial", "result"];
function show(...ids: ScreenId[]) {
  for (const s of screens) $(s).classList.toggle("hidden", !ids.includes(s));
  // 모바일 조작 버튼은 게임 화면(HUD)일 때만
  document.body.classList.toggle("in-game", ids.includes("hud"));
  refreshUiOpen();
}
/** 창(카드·상점·메뉴 등)이 열려 있으면 게임 입력을 막음 */
function refreshUiOpen() {
  if (scene) scene.uiOpen = chatOpen || isMenuOpen() || BLOCKING.some((id) => !$(id).classList.contains("hidden"));
}

// ---------- 자유 채팅 ----------
let chatOpen = false;
const CHAT_KEEP = 40;
const CHAT_SHOW_MS = 10000;
function setChat(open: boolean) {
  chatOpen = open;
  const input = $("chat-input") as HTMLInputElement;
  $("chat").classList.toggle("open", open);
  input.classList.toggle("hidden", !open);
  if (open) {
    input.value = "";
    input.focus();
    const log = $("chat-log");
    log.scrollTop = log.scrollHeight;
  } else {
    input.blur();
  }
  refreshUiOpen();
}
function addChat(name: string, color: number, text: string, id: number) {
  const log = $("chat-log");
  const el = document.createElement("div");
  el.className = "chat-line";
  const c = PLAYER_COLORS[color] ?? "#fff";
  el.innerHTML = `<span class="who" style="color:${c}">${escapeHtml(name)}:</span><span style="color:${c}">${escapeHtml(text)}</span>`;
  log.append(el);
  while (log.children.length > CHAT_KEEP) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => el.classList.add("fade"), CHAT_SHOW_MS);
  scene?.showChat(id, text);
}
($("chat-input") as HTMLInputElement).addEventListener("keydown", (e) => {
  e.stopPropagation();
  const input = e.target as HTMLInputElement;
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    const text = input.value.trim();
    if (text) net.send({ t: "chat", text });
    setChat(false);
  } else if (e.key === "/" || e.code === "Slash" || e.key === "Escape") {
    // / 를 다시 누르면 닫힘
    e.preventDefault();
    setChat(false);
  }
});
const visible = (id: ScreenId) => !$(id).classList.contains("hidden");

function heroCanvas(cls: ClassId, color: number, skin?: number) {
  return skin === undefined ? paint(heroRows(cls, 0), heroPalette(cls, color)) : heroSkinCanvas(cls, color, skin);
}

function cardIcon(id: string, size: number): HTMLElement {
  const c = paintCard(id, Math.max(2, Math.round(size / 14)));
  if (c) {
    c.style.width = `${size}px`;
    c.style.imageRendering = "pixelated";
    return c;
  }
  // 아이콘이 없는 카드는 이름 첫 글자를 도트 글씨로
  const s = document.createElement("span");
  s.className = "letter";
  s.textContent = CARD_BY_ID[id]?.name[0] ?? "?";
  return s;
}

function cardEl(id: string, num?: number): HTMLElement {
  const c = CARD_BY_ID[id];
  const el = document.createElement("div");
  el.className = `card r-${c.rarity}`;
  // v1.4: 희귀도별 반짝임 (희귀=빛줄기, 전설=무지개 홀로그램)
  const shine = document.createElement("div");
  shine.className = "shine";
  el.append(shine);
  const icon = document.createElement("div");
  icon.className = "icon";
  icon.append(cardIcon(id, 56));
  el.append(icon);
  const rows: [string, string][] = [["name", c.name], ["desc", c.desc], ["quote", c.quote ? `"${c.quote}"` : ""], ["rar", RARITY_NAME[c.rarity]]];
  if (num !== undefined) rows.push(["num", `[${num}]`]);
  for (const [cls, text] of rows) {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    el.append(d);
  }
  return el;
}

/** v1.4 카드 고를 때 터지는 빛 조각 */
function cardBurst(x: number, y: number, color: string) {
  for (let k = 0; k < 18; k++) {
    const d = document.createElement("div");
    d.className = "card-spark";
    const a = (k / 18) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 70 + Math.random() * 60;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.background = k % 3 ? color.trim() : "#ffffff";
    d.style.setProperty("--dx", `${Math.cos(a) * dist}px`);
    d.style.setProperty("--dy", `${Math.sin(a) * dist}px`);
    d.addEventListener("animationend", () => d.remove());
    document.body.append(d);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

let toastTimer: number | undefined;
function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.add("hidden"), 2600);
}

// ---------- 상태 ----------
const net = new Net();
let myId = 0;
let roomCode = "";
let lobby: LobbyPlayer[] = [];
type LobbyMsg = Extract<ServerMsg, { t: "lobby" }>;
let lobbyInfo: LobbyMsg | null = null;
let game: Phaser.Game | null = null;
let scene: GameScene | null = null;
let stage: StageInfo | null = null;
let lastSnap: Snapshot | null = null;
/** v1.0 특성 트리 (원정·무한 하강에서만 서버가 보내 줌) */
let myTal: Record<string, number> = {};
let myTalPts = 0;
let countdown: number | undefined;
let lastHud = 0;
let restReady = false;
let voteOptions: string[] = [];
let myVote = -1;
/** 보물방: 내가 연 상자 / 미믹에게 당했는지 */
let chestOpened = new Set<number>();
let chestBusted = false;

const params = new URLSearchParams(location.search);
$<HTMLInputElement>("code").value = params.get("room") ?? "";
try { $<HTMLInputElement>("name").value = localStorage.getItem("name") ?? ""; } catch { /* 무시 */ }

function myName() {
  const n = $<HTMLInputElement>("name").value.trim();
  try { localStorage.setItem("name", n); } catch { /* 저장 안 돼도 무관 */ }
  return n;
}

function startCountdown(elId: string, seconds: number) {
  let left = seconds;
  clearInterval(countdown);
  $(elId).textContent = `${left}초`;
  countdown = window.setInterval(() => {
    left = Math.max(0, left - 1);
    $(elId).textContent = `${left}초`;
  }, 1000);
}

// ---------- 타이틀 ----------
$("btn-create").onclick = () => net.send({ t: "create", name: myName() });
$("btn-join").onclick = () => {
  const code = $<HTMLInputElement>("code").value.trim();
  if (code.length !== 4) return ($("title-error").textContent = "방 코드 4글자를 입력해 주세요.");
  net.send({ t: "join", code, name: myName() });
};
$<HTMLInputElement>("code").onkeydown = (e) => { if (e.key === "Enter") $("btn-join").click(); };

// ---------- 로비 ----------
function renderLobby() {
  $("room-code").textContent = roomCode;
  const me = lobby.find((p) => p.id === myId);
  const slots = $("slots");
  slots.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const p = lobby[i];
    const el = document.createElement("div");
    el.className = "slot" + (p ? "" : " empty");
    if (p) {
      el.append(heroCanvas(p.cls, p.color, p.cos?.sk));
      const name = document.createElement("div");
      name.textContent = (p.host ? "👑 " : "") + p.name;
      const ttl = titleName(p.cos?.title);
      if (ttl) {
        const tag = document.createElement("div");
        tag.className = "ttl-tag";
        tag.textContent = `[${ttl}]`;
        el.append(tag);
      }
      name.style.color = PLAYER_COLORS[p.color];
      const st = document.createElement("div");
      st.className = p.ready || p.host ? "ready" : "wait";
      st.textContent = `${CLASSES[p.cls].name} · ${p.host ? "방장" : p.ready ? "준비 완료" : "대기 중"}`;
      el.append(name, st);
    } else {
      el.textContent = "빈 자리";
    }
    slots.append(el);
  }

  const classes = $("classes");
  classes.innerHTML = "";
  // 근접 / 원거리 / 서포터로 묶어서
  const groups: [string, string][] = [["melee", "근접"], ["ranged", "원거리"], ["support", "서포터"]];
  const ordered = groups.flatMap(([g]) => CLASS_IDS.filter((id) => CLASSES[id].group === g));
  let lastGroup = "";
  for (const id of ordered) {
    const c = CLASSES[id];
    if (c.group !== lastGroup) {
      lastGroup = c.group;
      const h = document.createElement("div");
      h.className = "class-group";
      h.textContent = groups.find(([g]) => g === c.group)?.[1] ?? "";
      classes.append(h);
    }
    const el = document.createElement("div");
    el.className = "class-card" + (me?.cls === id ? " sel" : "");
    const b = document.createElement("b");
    b.textContent = c.name;
    const role = document.createElement("span");
    role.textContent = `${c.role} · 체력 ${c.hp}`;
    const sk = document.createElement("span");
    sk.textContent = `1 ${c.skills[0].name}`;
    el.append(heroCanvas(id, me?.color ?? 0, mySkin(id)), b, role, sk);
    el.title = c.skills.map((s, i) => `${i + 1}번 (Lv${s.unlock}) ${s.name}: ${s.desc}`).join("\n");
    el.onclick = () => net.send({ t: "class", cls: id });
    classes.append(el);
  }

  const isHost = !!me?.host;
  renderModes(isHost);
  renderRecords();
  $("btn-ready").classList.toggle("hidden", isHost);
  $("btn-ready").classList.toggle("on", !!me?.ready);
  $("btn-ready").textContent = me?.ready ? "준비 취소" : "준비";
  $("btn-start").classList.toggle("hidden", !isHost);
  const notReady = lobby.filter((p) => !p.host && !p.ready).length;
  $("lobby-hint").textContent = isHost
    ? notReady ? `${notReady}명이 아직 준비하지 않았어요` : "모두 준비됐어요. 시작하세요!"
    : "방장이 시작하면 원정이 시작돼요";
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

function renderModes(isHost: boolean) {
  const info = lobbyInfo;
  if (!info) return;
  const box = $("mode-box");
  box.innerHTML = "";
  const mode = info.mode;
  const gem = !!mode.gem;
  const descent = !!mode.descent;
  const panic = !!mode.panic;
  // 현재 모드 배너 + 모드 선택 버튼 (배너를 넘겨서 고르는 창)
  const cur = miniBanner(modeIdOf(mode));
  cur.title = "눌러서 모드 선택";
  cur.style.cursor = "pointer";
  const openSel = () => openModeSelect({
    mode, isHost, canHardcore: info.canHardcore, diffLocked: !!info.saveId, send: (m) => net.send(m),
  });
  cur.onclick = openSel;
  const pickBtn = document.createElement("button");
  pickBtn.className = "btn mode-pick" + (isHost ? " primary" : "");
  pickBtn.textContent = isHost ? "모드 선택 ▶" : "모드 둘러보기 (방장이 골라요)";
  pickBtn.onclick = openSel;
  box.append(cur, pickBtn);

  const note = document.createElement("div");
  note.className = "mode-note";
  const notes: string[] = [];
  if (panic) {
    notes.push("PANIC: 16구역 × 1분 30초 협동 타임어택. 임무 + 몬스터 전멸을 시간 안에 못 하면 바로 TIME OVER!");
  } else if (gem) {
    notes.push("보석 쟁탈전: 레벨 10에서 카드 5장을 드래프트한 뒤 대결. 보석을 든 사람만 공격하고 공격받을 수 있어요. 보석 점수(초당 1점) 100점을 먼저 모으면 우승!");
  } else if (descent) {
    notes.push("무한 하강: 1층부터 끝없이. 층마다 테마와 변형 규칙이 바뀌고 10층마다 보스, 5층마다 이벤트. 최고 층수로 순위를 매겨요.");
  } else if (mode.speedrun) {
    notes.push("스피드런: 각자 자기 맵에서 솔로로 동시에 경주해요. 카드·투표·휴게소 시간은 빼고 재요. 저장 없음.");
  } else {
    notes.push(`원정: 다 같이 월드 ${WORLD_COUNT}개 × (6라운드 + 보스). 월드를 깰 때마다 자동 저장돼요.`);
  }
  if (!gem) notes.push(`난이도 ${diffName(mode.diff)}: 적 체력 ×${diffHpMul(mode.diff)}, 피해 ×${diffDmgMul(mode.diff)}.`);
  if (!gem && !info.canHardcore) notes.push("하드코어는 8월드를 깬 적 있는 닉네임이 방장이면 열려요.");
  note.textContent = notes.join(" ");
  box.append(note);

  // 이어하기 (방장 이름으로 된 저장)
  const sb = $("save-box");
  sb.innerHTML = "";
  if (isHost && info.saves.length) {
    const t = document.createElement("div");
    t.className = "muted";
    t.textContent = "이어하기 (누르면 선택 / 다시 누르면 새로 시작)";
    sb.append(t);
    for (const s of info.saves) {
      const el = document.createElement("div");
      el.className = "save-item" + (info.saveId === s.id ? " sel" : "");
      const d = new Date(s.savedAt);
      el.innerHTML = `<span><b>월드 ${s.world}</b> ${WORLDS[s.world - 1]?.name ?? ""} · ${diffName(s.diff)}<br>${s.names.map(escapeHtml).join(", ")}</span><span class="muted">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</span>`;
      el.onclick = () => net.send({ t: "useSave", id: info.saveId === s.id ? null : s.id });
      sb.append(el);
    }
  } else if (!isHost && info.saveId) {
    sb.innerHTML = '<div class="mode-note">방장이 저장된 원정을 이어해요. 같은 닉네임이면 내 캐릭터가 복구돼요.</div>';
  }
}

function renderRecords() {
  const box = $("records");
  // 순위는 지금 고른 난이도 것만 (난이도는 모드 선택 창에서)
  const diff = lobbyInfo?.mode.diff ?? 2;
  const rec = lobbyInfo?.records[String(diff)];
  $("rec-title").textContent = `순위 · ${diffName(diff)}`;
  box.innerHTML = "";
  if (!rec) return;
  const add = (label: string, names: string, time: string) => {
    const r = document.createElement("div");
    r.className = "rrow";
    r.innerHTML = `<span>${label}</span><span>${escapeHtml(names)}</span><span class="t">${time}</span>`;
    box.append(r);
  };
  const sub = (text: string) => {
    const d = document.createElement("div");
    d.className = "sub";
    d.textContent = text;
    box.append(d);
  };
  sub("PANIC 클리어 시간");
  if (!rec.panic?.length) add("-", "아직 기록 없음", "");
  (rec.panic ?? []).slice(0, 3).forEach((e, i) => add(`${i + 1}위`, e.names.join(", "), fmtTime(e.time)));
  sub("무한 하강 최고 층");
  if (!rec.descent?.length) add("-", "아직 기록 없음", "");
  (rec.descent ?? []).slice(0, 3).forEach((e, i) => add(`${i + 1}위`, e.names.join(", "), `${e.floor}층`));
  sub(`스피드런 완주 (월드 ${WORLD_COUNT})`);
  if (!rec.total.length) add("-", "아직 기록 없음", "");
  rec.total.slice(0, 5).forEach((e, i) => add(`${i + 1}위`, e.names.join(", "), fmtTime(e.time)));
  sub("월드별 최고 구간 기록");
  for (let w = 1; w <= WORLD_COUNT; w++) {
    const best = rec.worlds[w]?.[0];
    add(`W${w}`, best ? best.names.join(", ") : "-", best ? fmtTime(best.time) : "");
  }
}

$("btn-ready").onclick = () => {
  const me = lobby.find((p) => p.id === myId);
  net.send({ t: "ready", ready: !me?.ready });
};
$("btn-start").onclick = () => net.send({ t: "start" });
$("btn-copy").onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    await navigator.clipboard.writeText(url);
    $("btn-copy").textContent = "복사됨!";
  } catch {
    $("btn-copy").textContent = url;
  }
  setTimeout(() => ($("btn-copy").textContent = "초대 링크 복사"), 1500);
};
$("btn-lobby").onclick = () => net.send({ t: "toLobby" });
$("btn-retry").onclick = () => net.send({ t: "retry" });

// ---------- 게임 ----------
async function ensureGame(): Promise<GameScene> {
  if (scene) return scene;
  await document.fonts.load("8px Galmuri7");
  scene = new GameScene();
  scene.net = net;
  scene.myId = myId;
  scene.onSnapshot = updateHud;
  scene.touch.on = document.body.classList.contains("touch");
  scene.onAutoLite = () => toast("화면이 버벅여서 이펙트를 자동으로 줄였어요 (설정 → 성능 → 감자 모드로 더 가볍게)");
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: "#0b0a0f",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
  });
  return scene;
}

function stopGame() {
  game?.destroy(true);
  game = null;
  scene = null;
  $("chat-bubbles").innerHTML = "";
}

// ---------- HUD ----------
function updateHud(s: Snapshot) {
  lastSnap = s;
  const now = performance.now();
  if (now - lastHud < 100) return;
  lastHud = now;
  panicSnap(s);
  const me = s.players.find((p) => p.id === myId);
  if (me) {
    const ratio = Math.max(0, me.hp / me.mhp);
    const col = ratio > 0.5 ? "var(--hp)" : ratio > 0.25 ? "var(--legend)" : "var(--danger)";
    const def = CLASSES[me.cls];
    $("hud-me").innerHTML = `
      <div style="display:flex;justify-content:space-between"><span style="color:${PLAYER_COLORS[me.c]}">${escapeHtml(me.n)} · ${def.name}</span><span class="gold">${me.gold}원</span></div>
      <div class="bar"><i style="width:${ratio * 100}%;background:${col}"></i></div>
      <div class="muted">HP ${me.hp} / ${me.mhp}${me.shield ? ` <span style="color:var(--accent)">+보호막 ${me.shield}</span>` : ""}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:var(--legend)">Lv ${me.lv}</span><span class="muted">${me.xp} / ${me.xpn}</span></div>
      <div class="xpbar"><i style="width:${(me.xp / me.xpn) * 100}%"></i></div>`;

    // 스킬 바
    const bar = $("skill-bar");
    bar.innerHTML = "";
    def.skills.forEach((sk, i) => {
      const el = document.createElement("div");
      const locked = me.lv < SKILL_UNLOCK[i];
      const cd = me.cds[i];
      const passive = sk.aim === "passive";
      el.className = "skill-slot" + (passive ? " passive" : "") + (locked ? " locked" : !passive && cd <= 0 ? " ready" : "") + (scene?.aiming === i ? " aiming" : "");
      el.innerHTML = `<span class="k">${i + 1}</span><span class="nm">${sk.name}</span>${passive ? '<span class="pv">passive</span>' : ""}`;
      if (passive && !locked) {
        // 패시브는 쿨타임 표시 없음
      } else if (locked) {
        const lk = document.createElement("div");
        lk.className = "muted";
        lk.textContent = `Lv ${SKILL_UNLOCK[i]}`;
        el.append(lk);
      } else if (cd > 0) {
        const fill = document.createElement("div");
        fill.className = "cdfill";
        fill.style.height = `${Math.min(100, (cd / (me.cdm?.[i] || 1)) * 100)}%`;
        const v = document.createElement("div");
        v.className = "cdv";
        v.textContent = cd >= 1 ? `${Math.ceil(cd)}` : cd.toFixed(1);
        el.append(fill, v);
      }
      el.title = sk.desc;
      bar.append(el);
    });

    const cards = $("hud-cards");
    cards.innerHTML = "";
    for (const id of me.cards ?? []) {
      const c = CARD_BY_ID[id];
      if (!c) continue;
      const el = document.createElement("div");
      el.className = `mini-card r-${c.rarity}`;
      el.append(cardIcon(id, 22));
      el.title = `${c.name}: ${c.desc}`;
      cards.append(el);
    }

    const msg = $("hud-msg");
    let text = "";
    if (me.ghost) text = "유령 상태예요. 동료가 옆에 오면 부활해요!";
    else if (me.rev) text = "거꾸로 걷기 발동! 방향키가 반대예요";
    else if (stage?.kind === "rest" && stage.market && nearMarket()) text = `${displayKey(settings.keys.market)} 를 눌러 ${stage.stall === "gambler" ? "도박꾼" : "암시장"} 열기`;
    else if (stage?.kind === "treasure" && chestBusted) text = "미믹에게 당했어요... 출구로 가세요";
    else if (stage?.kind === "treasure" && (scene?.nearChest(chestOpened) ?? Infinity) <= 26) text = `${displayKey(settings.keys.market)} 를 눌러 상자 열기 (미믹 조심!)`;
    else if (stage?.kind === "altar" && (scene?.nearAltar() ?? Infinity) <= 30) text = `${displayKey(settings.keys.market)} 를 눌러 제단에 피를 바치기 (체력 30% → 전설 카드, 한 번만)`;
    else if (s.portal && stage?.kind !== "rest") text = "포탈이 열렸어요! 살아있는 모두가 포탈에 모이면 출발해요.";
    msg.textContent = text;
    msg.classList.toggle("hidden", !text);

    if (visible("market") && !nearMarket()) closeMarket();
  }

  // 보석 쟁탈전 점수판
  if (s.scores) {
    const board = $("side-board");
    board.classList.remove("hidden");
    board.innerHTML = `<div class="ttl">보석 점수 (${GEM_GOAL}점 먼저!)</div>`;
    const list = [...s.players].sort((a, b) => (s.scores![b.id] ?? 0) - (s.scores![a.id] ?? 0));
    for (const p of list) {
      const sc = s.scores[p.id] ?? 0;
      const holding = s.gem?.holder === p.id;
      const el = document.createElement("div");
      el.className = "ent";
      el.innerHTML = `<span style="color:${PLAYER_COLORS[p.c]}">${holding ? "💎" : p.ghost ? "💀" : "·"}</span><span style="color:${PLAYER_COLORS[p.c]}">${escapeHtml(p.n)}</span><span class="st">${sc}</span><div class="gbar"><i style="width:${Math.min(100, (sc / GEM_GOAL) * 100)}%"></i></div>`;
      board.append(el);
    }
  }

  // 스피드런 타이머

  const timerEl = $("hud-timer");
  timerEl.classList.toggle("hidden", s.timer === undefined);
  if (s.timer !== undefined) timerEl.textContent = `⏱ ${fmtTime(s.timer)}`;

  // 보스 체력바
  const boss = s.monsters.find((mo) => MONSTERS[mo.k]?.boss);
  const bossEl = $("boss-bar");
  bossEl.classList.toggle("hidden", !boss);
  if (boss) {
    const enraged = boss.hp < boss.mhp / 2;
    $("boss-name").textContent = `${MONSTERS[boss.k].name}${enraged ? " (광폭화!)" : ""}`;
    (bossEl.querySelector(".bar > i") as HTMLElement).style.width = `${Math.max(0, (boss.hp / boss.mhp) * 100)}%`;
  }

  const stageEl = $("hud-stage");
  const label = stageEl.dataset.label ?? "";
  const sub = stage?.kind === "goldrush"
    ? `<span class="gold">황금 슬라임을 잡아라! 남은 시간 ${s.eventT ?? 0}초</span>`
    : stage?.kind === "altar"
    ? `<span style="color:#c060f0">남은 시간 ${s.eventT ?? 0}초</span> <span class="muted">출구에 모두 모이면 출발</span>`
    : stage?.kind === "treasure"
    ? `<span class="gold">상자 ${chestOpened.size}/4 · 남은 시간 ${s.treasureT ?? 0}초</span> <span class="muted">출구에 모두 모이면 출발</span>`
    : stage?.kind === "trial"
    ? `<span style="color:var(--danger)">버티세요! 남은 시간 ${s.trialT ?? 0}초</span>`
    : stage?.kind === "arena"
    ? '<span class="muted">보석을 든 사람만 공격하고 공격받아요</span>'
    : stage?.kind === "rest"
    ? '<span class="muted">스킬 쿨타임 없음 · 허수아비로 DPS 측정</span>'
    : s.portal ? '<span class="portal">포탈 열림!</span>' : `<span class="muted">남은 몬스터 ${s.remaining}</span>`;
  stageEl.innerHTML = `${label}<br>${sub}`;

  const team = $("hud-team");
  team.innerHTML = "";
  for (const p of s.players) {
    if (p.id === myId) continue;
    const el = document.createElement("div");
    el.className = "box";
    const ratio = p.ghost ? 0 : Math.max(0, p.hp / p.mhp);
    el.innerHTML = `<div style="color:${PLAYER_COLORS[p.c]}">${p.ghost ? "💀 " : ""}${escapeHtml(p.n)} <span class="muted">Lv${p.lv} ${CLASSES[p.cls].name}</span></div>
      <div class="bar"><i style="width:${ratio * 100}%"></i></div>`;
    team.append(el);
  }
}


// ---------- v1.2 스냅샷 압축 풀기 ----------
const monCache = new Map<number, { k: string; mhp: number; el?: SnapMonster["el"] }>();
const projCache = new Map<number, SnapProj["k"]>();
let lastCdm = new Map<number, number[]>();
function decodeSnap(w: SnapshotWire): Snapshot {
  const monsters: SnapMonster[] = [];
  const seenM = new Set<number>();
  for (const t of w.mz) {
    const [id, x, y, hp, ex] = t as [number, number, number, number, Partial<SnapMonster>?];
    let c = monCache.get(id);
    if (ex?.k) { c = { k: ex.k, mhp: ex.mhp ?? c?.mhp ?? hp, el: ex.el }; monCache.set(id, c); }
    seenM.add(id);
    if (!c) continue; // 종류를 아직 모름 (늦게 들어온 경우 2초 안에 채워짐)
    monsters.push({ id, k: c.k, x, y, hp, mhp: c.mhp, el: c.el, f: ex?.f ?? false, sp: ex?.sp ?? 0, st: ex?.st ?? "", ca: ex?.ca, dps: ex?.dps, tot: ex?.tot });
  }
  for (const id of monCache.keys()) if (!seenM.has(id)) monCache.delete(id);
  const projs: SnapProj[] = [];
  const seenP = new Set<number>();
  for (const t of w.pz) {
    const [id, x, y, a, k] = t as [number, number, number, number, SnapProj["k"]?];
    if (k) projCache.set(id, k);
    seenP.add(id);
    const kind = projCache.get(id);
    if (kind) projs.push({ id, k: kind, x, y, a: a / 100 });
  }
  for (const id of projCache.keys()) if (!seenP.has(id)) projCache.delete(id);
  // 스킬 최대 쿨타임은 바뀔 때만 옴
  const cdm = new Map<number, number[]>();
  for (const p of w.players) {
    const v = (p.cdm as number[] | undefined) ?? lastCdm.get(p.id) ?? [1, 1, 1, 1];
    p.cdm = v;
    cdm.set(p.id, v);
  }
  lastCdm = cdm;
  const { mz: _mz, pz: _pz, ...rest } = w;
  return { ...rest, monsters, projs };
}

function handleSnap(m: Snapshot) {
  // 서버는 카드·코스튬을 바뀔 때만 보냄 → 이전 값으로 채움
  if (lastSnap) {
    for (const p of m.players) {
      const prev = lastSnap.players.find((q) => q.id === p.id);
      if (!p.cards) p.cards = prev?.cards ?? [];
      if (p.cos === undefined) p.cos = prev?.cos;
    }
  } else {
    for (const p of m.players) p.cards ??= [];
  }
  scene?.pushSnapshot(m);
  if (visible("market")) $("market-gold").textContent = `${m.players.find((p) => p.id === myId)?.gold ?? 0}원`;
  $("cmd-badge").classList.toggle("hidden", !m.cmd);
}

// ---------- 카드 선택 ----------
function showCards(options: string[], time: number, left: number) {
  const list = $("card-list");
  list.innerHTML = "";
  options.forEach((id, i) => {
    const el = cardEl(id, i + 1);
    el.onclick = () => pickCard(i);
    // v1.4: 한 장씩 뒤집히며 등장
    el.classList.add("deal");
    el.style.animationDelay = `${i * 110}ms`;
    list.append(el);
  });
  $("cards-left").textContent = left > 1 ? `(남은 선택 ${left}장) ` : "";
  $("talent-tree").classList.add("hidden");
  $("cards-status").textContent = "";
  show("hud", "cards");
  startCountdown("cards-timer", time);
}

function pickCard(i: number) {
  if (!visible("cards")) return;
  const list = [...$("card-list").children];
  if (i >= list.length) return;
  list.forEach((el, j) => el.classList.toggle("picked", i === j));
  // v1.4: 고른 카드에서 빛 조각이 터짐
  const r = list[i].getBoundingClientRect();
  if (!settings.potato) cardBurst(r.left + r.width / 2, r.top + r.height / 2, getComputedStyle(list[i]).getPropertyValue("--c") || "#fff");
  sfx.magic();
  net.send({ t: "pick", idx: i });
}

// ---------- v1.0 특성 트리 ----------
function renderTalents() {
  const box = $("talent-tree");
  const me = lastSnap?.players.find((p) => p.id === myId);
  if (!me) return;
  const branches = TALENTS[me.cls];
  box.innerHTML = "";
  const head = document.createElement("div");
  head.className = "tt-head";
  head.innerHTML = `<span>특성 트리</span><span class="tt-pts${myTalPts ? "" : " zero"}">포인트 ${myTalPts}</span>`;
  const cols = document.createElement("div");
  cols.className = "tt-cols";
  branches.forEach((b, bi) => {
    const col = document.createElement("div");
    const n = tier(myTal, b.id);
    col.innerHTML = `<div class="tt-br">${b.icon} ${b.name}</div>`;
    b.tiers.forEach((t, ti) => {
      const el = document.createElement("div");
      const on = ti < n;
      const next = ti === n;
      el.className = "tt-node" + (on ? " on" : next ? " next" : "") + (next && myTalPts > 0 ? " can" : "") + (ti === TALENT_TIERS - 1 ? " ult" : "");
      el.innerHTML = `<div class="tn">${t.name}</div><div class="td">${t.desc}</div>`;
      el.title = `${ti + 1}단계 · ${t.desc}`;
      if (next && myTalPts > 0) {
        el.onclick = () => {
          net.send({ t: "talent", branch: bi });
          sfx.magic();
        };
      }
      col.append(el);
    });
    cols.append(col);
  });
  const tip = document.createElement("div");
  tip.className = "muted";
  tip.style.cssText = "font-size:10px;margin-top:4px";
  tip.textContent = "2레벨마다 1포인트 · 위에서부터 차례로 · 되돌릴 수 없어요 · ★ = 비기";
  box.append(head, cols, tip);
  box.classList.remove("hidden");
}

// ---------- 팀카드 투표 ----------
function showVote(options: string[], time: number) {
  voteOptions = options;
  myVote = -1;
  const list = $("vote-list");
  list.innerHTML = "";
  options.forEach((id, i) => {
    const el = cardEl(id, i + 1);
    const dots = document.createElement("div");
    dots.className = "votes";
    el.append(dots);
    el.onclick = () => castVote(i);
    list.append(el);
  });
  show("hud", "vote");
  startCountdown("vote-timer", time);
}

function castVote(i: number) {
  if (!visible("vote") || i >= voteOptions.length) return;
  myVote = i;
  net.send({ t: "vote", idx: i });
}

function renderVotes(votes: Record<number, number>) {
  const cards = [...$("vote-list").children] as HTMLElement[];
  cards.forEach((el, i) => {
    el.classList.toggle("voted", myVote === i);
    const dots = el.querySelector(".votes")!;
    dots.innerHTML = "";
    for (const [pid, idx] of Object.entries(votes)) {
      if (idx !== i) continue;
      const p = lastSnap?.players.find((q) => q.id === Number(pid));
      const d = document.createElement("i");
      d.style.background = PLAYER_COLORS[p?.c ?? 0];
      d.title = p?.n ?? "";
      dots.append(d);
    }
  });
}

// ---------- 암시장 ----------
function nearMarket() {
  const pos = scene?.myPos();
  if (!pos || !stage?.market) return false;
  return Math.hypot(pos.x - stage.market.x, pos.y - stage.market.y) <= MARKET_RANGE;
}

function renderMarket() {
  const me = lastSnap?.players.find((p) => p.id === myId);
  const gold = me?.gold ?? 0;
  $("market-gold").textContent = `${gold}원`;
  const boxes = $("market-boxes");
  boxes.innerHTML = "";
  (["common", "rare", "legend"] as GachaTier[]).forEach((tier) => {
    const b = document.createElement("button");
    b.className = `box-btn r-${tier}` + (gold < GACHA_PRICE[tier] ? " poor" : "");
    b.innerHTML = `<span class="chest">▣</span><span>${RARITY_NAME[tier]} 상자</span><span class="price">${GACHA_PRICE[tier]}원</span>`;
    b.onclick = () => net.send({ t: "buy", tier });
    boxes.append(b);
  });
  renderForge(gold);
}

/** v1.6 대장간: 내 카드 중 강화할 수 있는 것 */
let myUpgraded = new Set<string>();
function renderForge(gold: number) {
  const me = lastSnap?.players.find((p) => p.id === myId);
  const list = $("forge-list");
  list.innerHTML = "";
  const ids = [...new Set(me?.cards ?? [])].filter((id) => canForge(id));
  if (!ids.length) {
    list.innerHTML = '<span class="muted">강화할 수 있는 카드가 없어요</span>';
    return;
  }
  for (const id of ids) {
    const c = CARD_BY_ID[id];
    const price = FORGE_PRICE[c.rarity as keyof typeof FORGE_PRICE];
    const done = myUpgraded.has(id);
    const el = document.createElement("div");
    el.className = `forge-item r-${c.rarity}` + (done ? " done" : gold < price ? " poor" : "");
    el.append(cardIcon(id, 22));
    const t = document.createElement("span");
    t.textContent = `${c.name}${done ? " +1" : ""}`;
    const pr = document.createElement("span");
    pr.className = "fp";
    pr.textContent = done ? "강화됨" : `${price}원`;
    el.append(t, pr);
    el.title = `${c.desc} → 한 번 더`;
    if (!done) el.onclick = () => net.send({ t: "forge", id });
    list.append(el);
  }
}

/** 휴게소 가판대 열기: 암시장 또는 도박꾼 */
function openMarket() {
  if (stage?.stall === "gambler") {
    $("gamble-result").innerHTML = "";
    renderGamble();
    show("hud", "gamble");
    return;
  }
  $("market-result").innerHTML = "";
  renderMarket();
  show("hud", "market");
}

function closeMarket() {
  show("hud");
}
$("btn-market-close").onclick = closeMarket;
$("btn-gamble-close").onclick = closeMarket;

// ---------- 도박꾼 ----------
let bet = 10;
function myGold() {
  return lastSnap?.players.find((p) => p.id === myId)?.gold ?? 0;
}
function renderGamble(gold = myGold()) {
  bet = Math.max(10, Math.min(bet, Math.floor(gold / 10) * 10 || 10));
  $("gamble-gold").textContent = `${gold}원`;
  $("bet-amount").textContent = `${bet}원`;
}
for (const b of document.querySelectorAll<HTMLButtonElement>(".bet-row button")) {
  b.onclick = () => {
    const v = b.dataset.bet!;
    bet = v === "all" ? Math.floor(myGold() / 10) * 10 : bet + Number(v);
    bet = Math.max(10, bet);
    renderGamble();
  };
}
$("g-odd").onclick = () => net.send({ t: "gamble", game: "oddeven", bet, pick: "odd" });
$("g-even").onclick = () => net.send({ t: "gamble", game: "oddeven", bet, pick: "even" });
$("g-roulette").onclick = () => net.send({ t: "gamble", game: "roulette", bet });
for (const b of document.querySelectorAll<HTMLButtonElement>(".g-card")) {
  b.onclick = () => net.send({ t: "gamble", game: "card", bet: 50 });
}

function showGambleResult(m: Extract<ServerMsg, { t: "gambleResult" }>) {
  const box = $("gamble-result");
  box.innerHTML = "";
  const head = document.createElement("div");
  let text = "";
  if (m.game === "oddeven") text = `결과: ${m.outcome}!`;
  else if (m.game === "roulette") text = `룰렛: ${m.outcome}칸!`;
  else text = m.outcome === "legend" ? "전설 카드!" : m.outcome === "curse" ? "저주 카드..." : "꽝!";
  head.textContent = text;
  const delta = document.createElement("div");
  delta.className = m.delta > 0 ? "win" : m.delta < 0 ? "lose" : "";
  delta.textContent = m.delta > 0 ? `+${m.delta}원` : m.delta < 0 ? `${m.delta}원` : "본전";
  box.append(head, delta);
  if (m.card) box.append(cardEl(m.card));
  renderGamble(m.gold);
}

// ---------- 시련의 방 ----------
$("trial-yes").onclick = () => net.send({ t: "trial", yes: true });
$("trial-no").onclick = () => net.send({ t: "trial", yes: false });

// ---------- 휴게소 ----------
function setRestReady(v: boolean) {
  restReady = v;
  net.send({ t: "restReady", ready: v });
}
$("btn-rest-ready").onclick = () => setRestReady(!restReady);

/** E: 가판대 열기·닫기 / 보물 상자 / 제단 (키보드·모바일 버튼 공용) */
function interact() {
  if (visible("market") || visible("gamble")) closeMarket();
  else if (stage?.kind === "rest" && nearMarket() && !visible("cards") && !visible("vote")) openMarket();
  else if (stage?.kind === "treasure" && !chestBusted) net.send({ t: "chest" });
  else if (stage?.kind === "altar") net.send({ t: "chest" });
}

// ---------- 키보드 ----------
window.addEventListener("keydown", (e) => {
  if (isCapturingKey()) return;
  // / : 채팅 열기 (다른 입력칸에 쓰는 중이면 무시)
  if ((e.key === "/" || e.code === "Slash") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && (lobbyInfo || stage)) {
    e.preventDefault();
    setChat(!chatOpen);
    return;
  }
  if (isKey(e, "menu") && (lobbyInfo || stage)) {
    // Tab 메뉴: 로비·게임 어디서나
    e.preventDefault();
    toggleMenu();
    return;
  }
  if (e.target instanceof HTMLInputElement || isMenuOpen()) {
    if (e.key === "Escape" && isMenuOpen()) toggleMenu(false);
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= 4) {
    if (visible("cards")) pickCard(n - 1);
    else if (visible("vote")) castVote(n - 1);
  }
  if (isKey(e, "market")) interact();
  if (e.key === "Escape" && (visible("market") || visible("gamble"))) closeMarket();
  if (isKey(e, "ready") && stage?.kind === "rest" && visible("hud")) setRestReady(!restReady);
});

function renderHelp() {
  const k = settings.keys;
  const skill = settings.castMode === "instant" ? "누르면 시전" : "누른 채 클릭";
  $("hud-help").textContent = `WASD 이동 · 좌클릭 공격 · ${displayKey(k.dash)} 대시 · ${[k.skill1, k.skill2, k.skill3, k.skill4, k.skill5].map(displayKey).join("/")} ${skill} = 스킬 · ${displayKey(k.market)} 가판대 · ${displayKey(k.menu)} 메뉴`;
}
renderHelp();
onSettingsChange(renderHelp);

initModeSelect();
// v1.6 모바일 조작
initTouch({
  move: (mx, my) => { if (scene) { scene.touch.mx = mx; scene.touch.my = my; } },
  attack: (on) => { if (scene) scene.touch.atk = on; },
  dash: () => scene?.dashNow(),
  cast: (slot) => scene?.castAuto(slot),
  interact: () => interact(),
  ready: () => { if (stage?.kind === "rest" && visible("hud")) setRestReady(!restReady); },
  chat: () => setChat(!chatOpen),
  menu: () => { if (lobbyInfo || stage) toggleMenu(); },
  me: () => lastSnap?.players.find((p) => p.id === myId) ?? null,
});
// 개발자 도구 감지: 게임 중이면 로비로 튕기고, 로비·타이틀이면 게임에서 나감
initGuard(() => {
  if (stage) {
    net.send({ t: "leaveGame" });
    stopGame();
    stage = null;
    reconnectUntil = 0;
    showTitle("개발자 메뉴를 사용하지 마세요!", "게임에서 로비로 나왔어요", "#ff3a3a");
    toast("개발자 메뉴를 사용하지 마세요!");
    return;
  }
  // 로비·타이틀: 연결을 끊고 게임 화면을 닫음
  try { localStorage.removeItem("osin-session"); } catch { /* 무시 */ }
  roomCode = "";
  document.body.innerHTML = '<div class="devtools-guard"><b>개발자 메뉴를 사용하지 마세요!</b><span>게임이 종료되었어요. 개발자 도구를 닫고 새로고침하면 다시 할 수 있어요.</span></div>';
  net.close();
});
initMenu({
  net,
  getSnap: () => lastSnap,
  getMyId: () => myId,
  getWorld: () => stage?.world ?? 1,
  toast,
  onToggle: refreshUiOpen,
  onPause: (on) => { if (stage) net.send({ t: "menuPause", on }); },
});

// ---------- 이벤트 타이틀 (이름 + 설명, 스르륵 사라짐) ----------
let titleTimer: number | undefined;
function showTitle(name: string, desc: string, color = "#f8d040") {
  const el = $("event-title");
  el.innerHTML = `<div class="et-name"></div><div class="et-desc"></div>`;
  (el.firstElementChild as HTMLElement).textContent = name;
  (el.lastElementChild as HTMLElement).textContent = desc;
  el.style.setProperty("--et", color);
  el.classList.remove("hidden", "play");
  void el.offsetWidth;
  el.classList.add("play");
  clearTimeout(titleTimer);
  titleTimer = window.setTimeout(() => el.classList.add("hidden"), 3200);
}

// ---------- 결과 ----------
/** PANIC 결과: PANIC CLEAR / TIME OVER */
function showPanicResult(r: Extract<ServerMsg, { t: "result" }>) {
  const title = $("result-title");
  const zone = r.zone ?? 1;
  title.textContent = r.win ? "PANIC CLEAR" : r.timeUp ? "TIME OVER" : "ALL DOWN";
  title.className = r.win ? "panic-clear" : "panic-over";
  const info: string[] = [];
  if (r.win) {
    info.push(`최종 클리어 시간 <span class="t">${fmtTime(r.time ?? 0)}</span>${r.panicRank ? ` · ${diffName(r.mode.diff)} 순위 <span class="t">${r.panicRank}위</span>` : ""}`);
  } else {
    info.push(`<span style="color:#ff5a4a">ZONE ${zone} 「${WORLDS[Math.ceil(zone / 2) - 1]?.name ?? ""}」에서 ${r.timeUp ? "시간이 다 됐어요" : "모두 쓰러졌어요"}</span> · ${zone - 1}/${PANIC_ZONES}구역 돌파`);
    info.push(zone >= PANIC_ZONES - 2 ? "거의 다 왔어요! 한 번만 더!" : "다음엔 더 멀리 갈 수 있어요. 바로 재도전!");
  }
  info.push(`난이도 ${diffName(r.mode.diff)}`);
  if (r.cmd) info.push('<span style="color:var(--danger)">커맨드 사용 — 순위·업적이 남지 않았어요</span>');
  // 구역별 기록
  const times = r.zoneTimes ?? [];
  let grid = '<div class="zone-times">';
  for (let i = 1; i <= PANIC_ZONES; i++) {
    const t = times[i - 1];
    const cls = !r.win && i === zone ? "fail" : i === PANIC_ZONES ? "boss" : "";
    grid += `<span class="${cls}">Z${i}<br>${t !== undefined ? `${t.toFixed(1)}s` : !r.win && i === zone ? "✕" : "-"}</span>`;
  }
  info.push(grid + "</div>");
  // 보상 / 파티원 상태
  if (r.win || r.rewards?.length) {
    const rw = (r.rewards ?? []).map((id) => ACH_BY_ID[id]).filter(Boolean);
    info.push(rw.length
      ? `획득 보상: ${rw.map((a) => `<span class="t">${escapeHtml(a.name)}</span> (${a.rewards.map((x) => escapeHtml(x.name)).join(", ")})`).join(" · ")}`
      : "획득 보상: 이미 받은 업적뿐이에요 — 더 빨리 깨 보세요!");
  }
  if (!r.win) {
    let party = '<div class="party-state">';
    for (const x of r.rows) {
      const ratio = x.ghost || !x.mhp ? 0 : Math.max(0, (x.hp ?? 0) / x.mhp);
      party += `<div class="ps"><span style="color:${PLAYER_COLORS[x.color]}">${x.ghost ? "💀 " : ""}${escapeHtml(x.name)}</span> <span class="muted">${x.ghost ? "쓰러짐" : `HP ${x.hp}/${x.mhp}`}</span><div class="bar"><i style="width:${ratio * 100}%"></i></div></div>`;
    }
    info.push(party + "</div>");
  }
  $("result-info").innerHTML = info.join("<br>");
  $("race-result").classList.add("hidden");
  const box = $("result-rows");
  box.innerHTML = `<div class="result-row result-head"><span></span><span>용사</span><span>칭호</span><span>레벨</span><span>처치</span><span>피해량</span><span>부활</span><span>사망</span></div>`;
  for (const x of r.rows) {
    const el = document.createElement("div");
    el.className = "result-row";
    el.append(heroCanvas(x.cls, x.color));
    for (const [i, text] of [x.name, x.title, String(x.level), String(x.kills), String(x.dmgDealt), String(x.revives), String(x.deaths)].entries()) {
      const sp = document.createElement("span");
      sp.textContent = text;
      if (i === 0) sp.style.color = PLAYER_COLORS[x.color];
      if (i === 1) sp.className = "ttl";
      el.append(sp);
    }
    box.append(el);
  }
  show("result");
}

function showResult(r: Extract<ServerMsg, { t: "result" }>) {
  const { win, rows } = r;
  clearInterval(countdown);
  const title = $("result-title");
  title.textContent = r.mode.gem
    ? `보석의 주인: ${rows[0]?.name ?? "?"}!`
    : r.floor !== undefined ? `무한 하강 종료 — 지하 ${r.floor}층까지 내려갔다!`
    : win ? "원정 성공! 장난꾸러기 신을 물리쳤다!" : `용사단 전멸... (월드 ${r.world} ${WORLDS[r.world - 1]?.name ?? ""})`;
  title.className = win ? "win" : "lose";
  if (r.zone !== undefined) {
    showPanicResult(r);
    return;
  }
  const info: string[] = [];
  if (r.mode.gem) info.push(rows.map((x) => `${escapeHtml(x.name)} <span class="t">${x.score ?? 0}점</span>`).join(" · "));
  if (!r.mode.gem) info.push(`난이도 ${diffName(r.mode.diff)}`);
  if (r.cmd) info.push('<span style="color:var(--danger)">커맨드 사용 — 순위·저장·해금·도감 기록이 남지 않았어요</span>');
  if (r.floorRank) info.push(`최고 층수 순위 <span class="t">${r.floorRank}위</span> (${diffName(r.mode.diff)})`);
  if (r.time !== undefined) info.push(`기록 <span class="t">${fmtTime(r.time)}</span>${r.rank ? ` · 완주 ${r.rank}위!` : ""}`);
  if (r.splits?.length) info.push(`구간: ${r.splits.map((t, i) => `W${i + 1} ${fmtTime(t)}`).join(" · ")}`);
  if (win && !r.mode.gem && !r.cmd) info.push("하드코어 난이도가 해금됐어요!");
  if (!r.mode.speedrun) $("race-result").classList.add("hidden");
  if (r.saved) info.push(`저장됨 — 방장이 로비에서 '이어하기'로 월드 ${r.world}부터 다시 도전할 수 있어요`);
  $("result-info").innerHTML = info.join("<br>");
  const box = $("result-rows");
  box.innerHTML = `<div class="result-row result-head"><span></span><span>용사</span><span>칭호</span><span>레벨</span><span>처치</span><span>피해량</span><span>부활</span><span>사망</span></div>`;
  for (const r of rows) {
    const el = document.createElement("div");
    el.className = "result-row";
    el.append(heroCanvas(r.cls, r.color));
    const cells = [
      [r.name, PLAYER_COLORS[r.color]], [r.title, ""], [String(r.level), ""], [String(r.kills), ""],
      [String(r.dmgDealt), ""], [String(r.revives), ""], [String(r.deaths), ""],
    ];
    cells.forEach(([text, color], i) => {
      const s = document.createElement("span");
      s.textContent = text;
      if (color) s.style.color = color;
      if (i === 1) s.className = "ttl";
      el.append(s);
    });
    box.append(el);
  }
  // 시상식
  const aw = $("result-awards");
  aw.innerHTML = "";
  for (const a of r.awards ?? []) {
    const who = rows.find((x) => x.id === a.id);
    if (!who) continue;
    const el = document.createElement("div");
    el.className = "award";
    el.innerHTML = `<div class="an">🏅 ${escapeHtml(a.name)}</div><div class="aw" style="color:${PLAYER_COLORS[who.color]}">${escapeHtml(who.name)}</div><div class="av">${escapeHtml(a.value)}</div><div class="ad">${escapeHtml(a.desc)}</div>`;
    aw.append(el);
  }
  show("result");
}

// ---------- v1.7 판 끝 직업 숙련도 ----------
function showMastery(m: Extract<ServerMsg, { t: "mastery" }>) {
  const box = document.createElement("div");
  box.className = "mastery-box";
  const next = MASTERY_TIERS[m.after];
  const prev = m.after > 0 ? MASTERY_TIERS[m.after - 1] : 0;
  const pct = next ? Math.round(((m.total - prev) / (next - prev)) * 100) : 100;
  box.innerHTML = `<div><b>${CLASSES[m.cls].name} 숙련도 +${m.gained}</b> <span class="muted">마일스톤 ${m.after}/5${next ? ` · 다음까지 ${next - m.total}` : " · 전부 해금!"}</span></div>
    <div class="skin-bar"><i style="width:${pct}%"></i></div>`;
  if (m.after > m.before) {
    const got = document.createElement("div");
    got.className = "mastery-new";
    for (let t = m.before; t < m.after; t++) {
      const sp = document.createElement("span");
      sp.append(heroSkinCanvas(m.cls, 0, t), document.createTextNode(` 새 스킨 「${SKINS[m.cls][t].name}」!`));
      got.append(sp);
    }
    box.append(got);
    sfx.fanfare();
    setTimeout(() => toast("새 스킨이 열렸어요! 메뉴 → 옷장에서 입을 수 있어요"), 600);
  }
  // 결과창이 이미 떠 있으면 안에, 아니면 잠깐 뒤에
  const put = () => { const info = $("result-info"); info.querySelector(".mastery-box")?.remove(); info.append(box); };
  if (visible("result")) put();
  else setTimeout(put, 400);
}

// ---------- v1.5 보스 유물 고르기 ----------
function showRelics(options: string[] | null) {
  const box = $("relic-pick");
  if (!options) { box.classList.add("hidden"); refreshUiOpen(); return; }
  const list = $("relic-list");
  list.innerHTML = "";
  options.forEach((id, i) => {
    const el = cardEl(id, i + 1);
    el.classList.add("deal");
    el.style.animationDelay = `${i * 140}ms`;
    el.onclick = () => {
      [...list.children].forEach((c, j) => c.classList.toggle("picked", j === i));
      const r = el.getBoundingClientRect();
      if (!settings.potato) cardBurst(r.left + r.width / 2, r.top + r.height / 2, "#ff8040");
      sfx.magic();
      net.send({ t: "relic", idx: i });
    };
    list.append(el);
  });
  box.classList.remove("hidden");
  sfx.fanfare();
}

// ---------- v1.4 보스 등장 컷씬 (VS) ----------
let bossIntroTimer: number | undefined;
function showBossIntro(boss: string, world: number, time: number) {
  const def = MONSTERS[boss];
  if (!def) return;
  const box = $("boss-intro");
  const party = $("bi-party");
  party.innerHTML = "";
  // 게임 시작 직후라 아직 화면 정보가 없으면 로비 정보로
  const heroes = lastSnap?.players.length
    ? lastSnap.players.map((p) => ({ cls: p.cls, c: p.c, n: p.n, sk: p.cos?.sk }))
    : (lobbyInfo?.players ?? []).map((p) => ({ cls: p.cls, c: p.color, n: p.name, sk: p.cos?.sk }));
  heroes.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "bi-hero";
    row.style.setProperty("--i", String(i));
    row.append(heroCanvas(p.cls, p.c, p.sk));
    const n = document.createElement("span");
    n.textContent = p.n;
    n.style.color = PLAYER_COLORS[p.c];
    row.append(n);
    party.append(row);
  });
  const bossBox = $("bi-boss");
  bossBox.innerHTML = "";
  bossBox.append(paint(BODIES[def.base][0], monsterPalette(def.pal), 1));
  // 이름은 한 글자씩 튀어나옴
  const nameEl = $("bi-name");
  nameEl.innerHTML = "";
  [...def.name].forEach((ch, i) => {
    const sp = document.createElement("span");
    sp.className = "ch";
    sp.style.setProperty("--i", String(i));
    sp.textContent = ch === " " ? "\u00a0" : ch;
    nameEl.append(sp);
  });
  // 앞부분은 게임 화면에서 카메라가 보스에게 다가감
  scene?.startIntroCam(boss);
  $("bi-sub").textContent = `${WORLDS[world - 1]?.name ?? ""}의 주인`;
  box.classList.remove("hidden", "play");
  void box.offsetWidth;
  box.classList.add("play");
  sfx.bossRoar();
  clearTimeout(bossIntroTimer);
  bossIntroTimer = window.setTimeout(() => box.classList.add("hidden"), time * 1000);
}

// ---------- 로비 미니게임: 양배추 축구 ----------
const LP_OX = 16;
const LP_OY = 10;
const lp = {
  players: new Map<number, { x: number; y: number; tx: number; ty: number; dash: boolean; team: number }>(),
  ball: { x: LOBBY_FIELD_W / 2, y: LOBBY_FIELD_H / 2, tx: LOBBY_FIELD_W / 2, ty: LOBBY_FIELD_H / 2 },
  goal: -1,
  goalAt: 0,
};
const lpInput = { up: false, down: false, left: false, right: false, dash: 0 };
let lpSent = "";
const heroCache = new Map<string, HTMLCanvasElement>();
function heroSprite(cls: ClassId, color: number) {
  const k = `${cls}_${color}`;
  let c = heroCache.get(k);
  if (!c) { c = heroCanvas(cls, color); heroCache.set(k, c); }
  return c;
}
/** 양배추 공 (픽셀) */
const cabbage = (() => {
  const rows = [
    "...oooo...",
    "..oGGgGo..",
    ".oGgGGgGo.",
    "oGGgllgGGo",
    "oGgllllgGo",
    "oGgllllgGo",
    "oGGgllgGGo",
    ".oGgGGgGo.",
    "..oGGgGo..",
    "...oooo...",
  ];
  return paint(rows, { o: "#1a3a14", G: "#4caf3a", g: "#2e7d24", l: "#b8e890" });
})();

function onLobbyPlay(m: Extract<ServerMsg, { t: "lobbyPlay" }>) {
  const seen = new Set<number>();
  for (const [id, x, y, dash, team] of m.p) {
    seen.add(id);
    const p = lp.players.get(id);
    if (p) { p.tx = x; p.ty = y; p.dash = !!dash; p.team = team; }
    else lp.players.set(id, { x, y, tx: x, ty: y, dash: !!dash, team });
  }
  for (const id of [...lp.players.keys()]) if (!seen.has(id)) lp.players.delete(id);
  lp.ball.tx = m.b[0];
  lp.ball.ty = m.b[1];
  if (m.g >= 0 && lp.goal < 0) { lp.goalAt = performance.now(); sfx.fanfare(); }
  lp.goal = m.g;
  $("lp-s0").textContent = String(m.s[0]);
  $("lp-s1").textContent = String(m.s[1]);
}

function drawLobbyField() {
  requestAnimationFrame(drawLobbyField);
  if (!visible("lobby")) return;
  const cv = $("lobby-field") as HTMLCanvasElement;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const W = LOBBY_FIELD_W, H = LOBBY_FIELD_H;
  // 잔디 줄무늬
  ctx.fillStyle = "#0b0a10";
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? "#3e9a3a" : "#46a842";
    ctx.fillRect(LP_OX + (W / 12) * i, LP_OY, W / 12 + 1, H);
  }
  // 선
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(LP_OX + W / 2 - 1, LP_OY, 2, H);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(LP_OX + 1, LP_OY + 1, W - 2, H - 2);
  ctx.beginPath();
  ctx.arc(LP_OX + W / 2, LP_OY + H / 2, 24, 0, Math.PI * 2);
  ctx.stroke();
  // 골대
  const gy = LP_OY + H / 2 - LOBBY_GOAL_HALF;
  ctx.fillStyle = "rgba(90,168,255,0.35)";
  ctx.fillRect(LP_OX - 14, gy, 14, LOBBY_GOAL_HALF * 2);
  ctx.fillStyle = "rgba(255,106,90,0.35)";
  ctx.fillRect(LP_OX + W, gy, 14, LOBBY_GOAL_HALF * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(LP_OX - 14, gy, 14, LOBBY_GOAL_HALF * 2);
  ctx.strokeRect(LP_OX + W, gy, 14, LOBBY_GOAL_HALF * 2);
  // 부드럽게 따라가기
  const ease = 0.35;
  lp.ball.x += (lp.ball.tx - lp.ball.x) * ease;
  lp.ball.y += (lp.ball.ty - lp.ball.y) * ease;
  const who = new Map((lobbyInfo?.players ?? []).map((p) => [p.id, p]));
  const list = [...lp.players.entries()].sort((a, b) => a[1].y - b[1].y);
  for (const [id, p] of list) {
    p.x += (p.tx - p.x) * ease;
    p.y += (p.ty - p.y) * ease;
    const info = who.get(id);
    const sx = Math.round(LP_OX + p.x), sy = Math.round(LP_OY + p.y);
    // 팀 고리
    ctx.fillStyle = p.team === 0 ? "rgba(90,168,255,0.85)" : "rgba(255,106,90,0.85)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + 5, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (info) {
      const spr = heroSprite(info.cls, info.color);
      ctx.globalAlpha = p.dash ? 0.65 : 1;
      ctx.drawImage(spr, sx - Math.floor(spr.width / 2), sy + 6 - spr.height);
      ctx.globalAlpha = 1;
      if (id === myId) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(sx - 1, sy + 3 - spr.height - 4, 3, 3);
      }
    }
  }
  ctx.drawImage(cabbage, Math.round(LP_OX + lp.ball.x - 5), Math.round(LP_OY + lp.ball.y - 5));
  // 골!
  if (lp.goal >= 0) {
    const t = (performance.now() - lp.goalAt) / 1000;
    ctx.fillStyle = lp.goal === 0 ? "#5aa8ff" : "#ff6a5a";
    ctx.font = "16px Galmuri11, monospace";
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.max(0, 1 - t / 1.5);
    ctx.fillText(lp.goal === 0 ? "왼쪽 팀 골!" : "오른쪽 팀 골!", cv.width / 2, LP_OY + 24);
    ctx.globalAlpha = 1;
  }
}
requestAnimationFrame(drawLobbyField);

function lobbyKeyAllowed(e: KeyboardEvent) {
  return visible("lobby") && !chatOpen && !isMenuOpen() && !isModeSelectOpen() && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement);
}
function sendLobbyInput() {
  const sig = JSON.stringify(lpInput);
  if (sig === lpSent) return;
  lpSent = sig;
  net.send({ t: "lobbyInput", ...lpInput });
}
function lobbyKey(e: KeyboardEvent, down: boolean) {
  if (down && !lobbyKeyAllowed(e)) return;
  const k = e.key.toLowerCase();
  const map: Record<string, keyof typeof lpInput> = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
  const code: Record<string, keyof typeof lpInput> = { KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right" };
  const dir = map[k] ?? code[e.code];
  if (dir && dir !== "dash") {
    (lpInput as Record<string, boolean | number>)[dir] = down;
    if (down) e.preventDefault();
    sendLobbyInput();
  } else if (down && isKey(e, "dash") && !e.repeat) {
    e.preventDefault();
    lpInput.dash++;
    sendLobbyInput();
  }
}
window.addEventListener("keydown", (e) => lobbyKey(e, true));
window.addEventListener("keyup", (e) => lobbyKey(e, false));
window.addEventListener("blur", () => {
  lpInput.up = lpInput.down = lpInput.left = lpInput.right = false;
  sendLobbyInput();
});

// ---------- 스피드런 경주 현황 ----------
let raceOver = true;
function renderRace(entries: RaceEntry[], over: boolean) {
  raceOver = over;
  const sorted = [...entries].sort((a, b) => {
    const rank = (e: RaceEntry) => (e.state === "win" ? 0 : e.state === "run" ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.state === "win") return a.time - b.time;
    return b.world * 10 + b.round - (a.world * 10 + a.round) || a.time - b.time;
  });
  const html = [`<div class="ttl">경주 현황${over ? " (종료)" : ""}</div>`];
  sorted.forEach((e, i) => {
    const st = e.state === "win" ? `완주 ${fmtTime(e.time)}` : e.state === "dead" ? `탈락 W${e.world}-${e.round}` : `W${e.world}-${e.round > ROUNDS_PER_WORLD ? "보스" : e.round} · ${fmtTime(e.time)}`;
    html.push(`<div class="ent ${e.state}"><span>${i + 1}</span><span style="color:${PLAYER_COLORS[e.color]}">${escapeHtml(e.name)}${e.id === myId ? " (나)" : ""}</span><span class="st">${st}</span></div>`);
  });
  for (const id of ["side-board", "race-result"]) {
    $(id).innerHTML = html.join("");
    $(id).classList.remove("hidden");
  }
  const btn = $<HTMLButtonElement>("btn-lobby");
  btn.disabled = !over;
  $<HTMLButtonElement>("btn-retry").disabled = !over;
  btn.textContent = over ? "나가기 (로비로)" : "다른 용사들이 경주 중...";
}

function stageLabel(st: StageInfo) {
  if (st.kind === "arena") return st.name;
  if (st.floor !== undefined && st.kind !== "rest") {
    return `지하 ${st.floor}층 · ${WORLDS[st.world - 1]?.name ?? ""}${st.kind === "boss" ? " (보스)" : ""}${st.mod ? ` <span style="color:var(--danger)">${MOD_NAME[st.mod]}</span>` : ""}`;
  }
  if (st.kind === "trial") return `${st.world}-${st.round} 시련의 방`;
  if (st.kind === "treasure") return `${st.world}-${st.round} 보물방`;
  if (st.kind === "goldrush") return `${st.world}-${st.round} <span class="gold">황금 러시</span>`;
  if (st.kind === "altar") return `${st.world}-${st.round} <span style="color:#c060f0">저주받은 제단</span>`;
  if (st.kind === "rest") return `휴게소 · ${st.stall === "gambler" ? "도박꾼" : "암시장"} <span class="muted">(월드 ${st.world})</span>`;
  if (st.kind === "boss") return `${st.world}-보스 ${st.name}`;
  return `${st.world}-${st.round} ${st.name} <span class="muted">(${st.round}/${ROUNDS_PER_WORLD})</span>`;
}

let lastWorld = 0;

// ---------- 서버 메시지 ----------
// v1.3 핑: 2초마다 왕복 지연을 재서 내 캐릭터 위치 보정에 씀
let rtt = 100;
setInterval(() => net.send({ t: "ping", c: performance.now() }), 2000);

net.onMessage = async (m: ServerMsg) => {
  if (m.t === "pong") {
    const r = performance.now() - m.c;
    if (r >= 0 && r < 3000) rtt = rtt * 0.7 + r * 0.3;
    if (scene) scene.rtt = rtt;
    return;
  }
  switch (m.t) {
    case "error":
      // 다시 연결하려 했는데 이미 자리가 없어진 경우
      if (stage) { stopGame(); stage = null; reconnectUntil = 0; show("title"); }
      // 새로고침 자동 복귀가 실패한 건 조용히 넘어감 (방이 이미 없어짐)
      if (autoJoin) { autoJoin = false; break; }
      $("title-error").textContent = m.msg;
      break;
    case "joined":
      myId = m.id;
      autoJoin = false;
      roomCode = m.code;
      reconnectUntil = 0;
      if (scene) scene.myId = myId;
      saveSession();
      history.replaceState(null, "", `?room=${m.code}`);
      break;
    case "lobby":
      panicReset();
      bgm.play("lobby");
      lobby = m.players;
      lobbyInfo = m;
      raceOver = true;
      $("side-board").classList.add("hidden");
      $("race-result").classList.add("hidden");
      $<HTMLButtonElement>("btn-lobby").disabled = false;
      $<HTMLButtonElement>("btn-retry").disabled = false;
      $("btn-lobby").textContent = "나가기 (로비로)";
      roomCode = m.code;
      stopGame();
      stage = null;
      renderLobby();
      show("lobby");
      break;
    case "stage": {
      clearInterval(countdown);
      if (isModeSelectOpen()) closeModeSelect();
      stage = m.stage;
      restReady = false;
      $("hud-stage").dataset.label = stageLabel(m.stage);
      $("rest-bar").classList.toggle("hidden", m.stage.kind !== "rest");
      const sc = await ensureGame();
      sc.setStage(m.stage);
      // 배경음악: 상황·월드별
      const st = m.stage;
      bgm.play(st.zone !== undefined && st.kind !== "rest" ? "panic"
        : st.kind === "rest" ? "rest"
        : st.kind === "treasure" || st.kind === "goldrush" || st.kind === "altar" ? "treasure"
        : st.kind === "boss" || st.kind === "trial" || st.kind === "arena" ? "boss"
        : `w${st.world}`);
      if (st.kind === "boss") sfx.bossRoar();
      chestOpened = new Set();
      chestBusted = false;
      if (st.kind !== "rest") showRelics(null);
      show("hud");
      panicStage(m.stage);
      // 새 월드 진입 알림
      if (m.stage.zone !== undefined) {
        // PANIC은 구역 배너로 알림
      } else if (m.stage.floor !== undefined) {
        if (m.stage.kind !== "rest") toast(`지하 ${m.stage.floor}층${m.stage.kind === "boss" ? " — 보스!" : ""}${m.stage.mod ? ` · 변형: ${MOD_NAME[m.stage.mod]}` : ""}`);
      } else if (m.stage.kind !== "rest" && m.stage.kind !== "arena" && m.stage.world !== lastWorld) {
        lastWorld = m.stage.world;
        const wd = WORLDS[m.stage.world - 1];
        if (wd) toast(`월드 ${wd.id} 「${wd.name}」 — ${wd.desc}`);
      }
      break;
    }
    case "snap": {
      // v1.2: 압축된 몬스터·투사체를 풀어서 원래 모양으로
      const snap = decodeSnap(m);
      handleSnap(snap);
      break;
    }
    case "trialVote":
      $("trial-status").textContent = "";
      show("hud", "trial");
      startCountdown("trial-status", m.time);
      break;
    case "trialStatus":
      clearInterval(countdown);
      $("trial-status").textContent = `도전 ${m.yes.length} · 지나감 ${m.no.length} · 투표 ${m.yes.length + m.no.length}/${m.total} (과반이면 도전)`;
      break;
    case "trialEnd":
      if (visible("trial")) show("hud");
      break;
    case "gambleResult":
      showGambleResult(m);
      break;
    case "codex":
      onCodex(m);
      break;
    case "profile":
      onProfile(m);
      break;
    case "achievement": {
      const a = ACH_BY_ID[m.id];
      if (a) toast(`🏆 업적 달성: ${a.name} — 보상 ${a.rewards.map((r) => `「${r.name}」`).join(", ")} (Tab → 꾸미기)`);
      break;
    }
    case "cards":
      showCards(m.options, m.time, m.left);
      break;
    case "talents":
      myTal = m.tal;
      myTalPts = m.pts;
      if (visible("cards")) renderTalents();
      break;
    case "cardStatus": {
      const total = m.picked.length + m.waiting.length;
      const waitingNames = m.waiting.map((id) => lobby.find((p) => p.id === id)?.name ?? "?");
      $("cards-status").textContent = `선택 완료 ${m.picked.length}/${total}` + (waitingNames.length ? ` · 기다리는 중: ${waitingNames.join(", ")}` : "");
      if (!m.waiting.includes(myId) && visible("cards")) {
        $("card-list").innerHTML = '<div class="muted">다른 용사들이 고르는 중...</div>';
      }
      break;
    }
    case "vote":
      showVote(m.options, m.time);
      break;
    case "voteStatus":
      renderVotes(m.votes);
      break;
    case "voteResult":
      show("hud");
      toast(`팀카드 「${CARD_BY_ID[m.card]?.name}」 획득! ${CARD_BY_ID[m.card]?.desc}`);
      break;
    case "restStatus": {
      const ready = m.ready.length;
      restReady = m.ready.includes(myId);
      $("rest-text").textContent = `준비 ${ready}/${m.total} · 남은 시간 ${m.time}초`;
      $("btn-rest-ready").textContent = `${restReady ? "준비 취소" : "준비 완료"} (${displayKey(settings.keys.ready)})`;
      $("btn-rest-ready").classList.toggle("on", restReady);
      break;
    }
    case "gacha": {
      $("market-gold").textContent = `${m.gold}원`;
      const res = $("market-result");
      res.innerHTML = "";
      if (m.card) res.append(cardEl(m.card));
      else res.innerHTML = '<div class="muted">이 등급에서 더 받을 수 있는 카드가 없어요</div>';
      renderMarket();
      break;
    }
    case "toast":
      toast(m.msg);
      break;
    case "chat":
      addChat(m.name, m.color, m.text, m.id);
      break;
    case "lobbyPlay":
      onLobbyPlay(m);
      break;
    case "bossIntro":
      showBossIntro(m.boss, m.world, m.time);
      break;
    case "relics":
      showRelics(m.options);
      break;
    case "mastery":
      showMastery(m);
      break;
    case "forged":
      myUpgraded = new Set(m.upgraded);
      sfx.fanfare();
      toast(`「${CARD_BY_ID[m.id]?.name ?? m.id}」 강화 완료! (지금 ${m.gold}원)`);
      if (visible("market")) {
        $("market-gold").textContent = `${m.gold}원`;
        renderForge(m.gold);
      }
      break;
    case "altarResult":
      sfx.fanfare();
      toast(`제단이 응답했다! 「${CARD_BY_ID[m.card]?.name ?? m.card}」 획득`);
      break;
    case "race":
      renderRace(m.entries, m.over);
      break;
    case "admin":
      setAdmin(m.ok);
      break;
    case "title":
      showTitle(m.name, m.desc, m.color);
      break;
    case "chestResult":
      chestOpened.add(m.idx);
      scene?.openChest(m.idx, m.mimic);
      if (m.mimic) {
        chestBusted = true;
        sfx.mimic();
        toast(`미믹이다!! 가진 돈 ${m.lost}원을 전부 잃었어요`);
      } else {
        sfx.coin();
        toast(`+${m.gold}원! (지금 ${m.total}원)`);
      }
      break;
    case "panicComplete":
      panicComplete(m.zone, m.time);
      break;
    case "result":
      lastWorld = 0;
      myUpgraded = new Set();
      bgm.play(null);
      if (m.zone !== undefined) panicEnd(m.win);
      else if (m.win) sfx.fanfare();
      else sfx.defeat();
      showResult(m);
      break;
  }
};

// ---------- 연결 끊김 / 재접속 ----------
// 게임 중 끊기면 60초 동안 자동으로 다시 연결 (서버는 그동안 캐릭터를 무적으로 남겨 둠)
let reconnectUntil = 0;
let autoJoin = false;
const SESSION_KEY = "osin-session";
function saveSession() {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code: roomCode, name: myName(), at: Date.now() })); } catch { /* 무시 */ }
}
window.addEventListener("pagehide", () => { if (roomCode) saveSession(); });

net.onClose = () => {
  if (roomCode && stage && (!reconnectUntil || Date.now() < reconnectUntil)) {
    reconnectUntil ||= Date.now() + 60_000;
    toast("서버와 연결이 끊겼어요... 다시 연결하는 중");
    window.setTimeout(() => net.reconnect(), 1500);
    return;
  }
  reconnectUntil = 0;
  stopGame();
  show("title");
  $("title-error").textContent = "서버와 연결이 끊겼어요. 새로고침해 주세요.";
};
net.onReopen = () => {
  if (roomCode) net.send({ t: "join", code: roomCode, name: myName() });
};

// 새로고침했을 때: 1분 안에 같은 방에 있었으면 자동으로 다시 들어감
try {
  const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as { code: string; name: string; at: number } | null;
  if (saved && saved.code === params.get("room") && Date.now() - saved.at < 70_000) {
    $<HTMLInputElement>("name").value = saved.name;
    autoJoin = true;
    net.send({ t: "join", code: saved.code, name: saved.name });
  }
} catch { /* 무시 */ }

show("title");

// 개발 모드 전용 디버그 핸들 (자동 테스트에서 사용)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dbg = {
    net,
    get scene() { return scene; },
    get snap() { return lastSnap; },
    get myId() { return myId; },
    get stage() { return stage; },
  };
}

// 버튼 누르는 소리
document.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest?.(".btn, .card, .class-card, .ms-card")) sfx.click();
}, true);
