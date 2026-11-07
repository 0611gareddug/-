// Tab 메뉴: 아이콘 메뉴 → 설정 · 옷장 · 도감 · 업적 · 패치노트 (+ GRD 커맨드 패널)
import { MASTERY_TIERS, SKINS, tierOf } from "../shared/skins";
import { CLASSES, CLASS_IDS } from "../shared/classes";
import { CARDS, RARITY_NAME, type Rarity } from "../shared/cards";
import type { CmdAction, ServerMsg, Snapshot } from "../shared/protocol";
import { MONSTERS, WORLDS, type MonsterDef } from "../shared/worlds";
import type { Net } from "./net";
import { KEY_LABEL, displayKey, keyName, resetKeys, saveSettings, settings, type KeyAction } from "./settings";
import { BODIES, CAPES, HATS, RAINBOW, TRAILS, heroSkinCanvas, monsterPalette, paint } from "./sprites";
import { paintCard } from "./cardArt";
import { PATCH_NOTES } from "./patchNotes";
import { ACHIEVEMENTS, SLOT_NAME, ownedCosmetics, type CosSlot, type Equip, type Reward } from "../shared/achievements";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Tab = "home" | "codex" | "ach" | "cos" | "settings" | "patch" | "cmd";
type CodexTab = "cards" | "monsters" | "classes";

let net: Net;
let getSnap: () => Snapshot | null = () => null;
let getMyId: () => number = () => 0;
let getWorld: () => number = () => 1;
let toast: (msg: string) => void = () => {};
let onToggle: () => void = () => {};
let tab: Tab = "home";
/** 커맨드 패널 권한: 서버가 허락했을 때만 (저장하지 않음, 접속할 때마다 다시 입력) */
let adminOk = false;
let onPause: (on: boolean) => void = () => {};

export function setAdmin(ok: boolean) {
  adminOk = ok;
  if (ok) {
    toast("커맨드 패널이 열렸어요! 메뉴의 '커맨드'");
    tab = "cmd";
  }
  if (isMenuOpen()) render();
}
let codexTab: CodexTab = "cards";
let codex: { cards: string[]; kills: Record<string, number> } = { cards: [], kills: {} };
let profile: { ach: string[]; equip: Equip; counters: Record<string, number>; mastery?: Record<string, number>; skins?: Record<string, number> } = { ach: [], equip: {}, counters: {} };
/** v1.7 내가 고른 직업 스킨 (로비 미리보기용) */
export function mySkin(cls: string): number | undefined {
  return profile.skins?.[cls];
}
let cmdCat = "이동";
/** 키 바꾸기 대기 중인 동작 */
let capturing: KeyAction | null = null;

export function isMenuOpen() {
  return !$("menu").classList.contains("hidden");
}

export function isCapturingKey() {
  return capturing !== null;
}

export function initMenu(opts: {
  net: Net;
  getSnap: () => Snapshot | null;
  getMyId: () => number;
  getWorld: () => number;
  toast: (m: string) => void;
  onToggle: () => void;
  onPause: (on: boolean) => void;
}) {
  onPause = opts.onPause;
  net = opts.net;
  getSnap = opts.getSnap;
  getMyId = opts.getMyId;
  getWorld = opts.getWorld;
  toast = opts.toast;
  onToggle = opts.onToggle;
  $("menu-close").onclick = () => toggleMenu(false);
  $("menu-back").onclick = () => { tab = "home"; render(); };
  // 키 바꾸기: 다음에 누른 키를 저장
  window.addEventListener("keydown", (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key !== "Escape") {
      settings.keys[capturing] = keyName(e);
      saveSettings();
    }
    capturing = null;
    render();
  }, true);
}

export function toggleMenu(open = !isMenuOpen()) {
  $("menu").classList.toggle("hidden", !open);
  capturing = null;
  if (open) {
    tab = "home";
    net.send({ t: "codex" });
    net.send({ t: "profile" });
    render();
  }
  onPause(open);
  onToggle();
}

export function onCodex(m: Extract<ServerMsg, { t: "codex" }>) {
  codex = { cards: m.cards, kills: m.kills };
  if (isMenuOpen() && tab === "codex") render();
}

export function onProfile(m: Extract<ServerMsg, { t: "profile" }>) {
  profile = { ach: m.ach, equip: m.equip, counters: m.counters, mastery: m.mastery ?? {}, skins: m.skins ?? {} };
  if (isMenuOpen() && (tab === "ach" || tab === "cos")) render();
}

const TAB_NAME: Record<Tab, string> = {
  home: "메뉴", settings: "설정", cos: "옷장", codex: "도감", ach: "업적", patch: "패치노트", cmd: "커맨드",
};

// 메뉴 아이콘 (12×12 도트)
const ICON_PAL: Record<string, string> = {
  o: "#141218", w: "#f4f4f8", l: "#c8ccd8", g: "#8a90a8", d: "#4a4e60", y: "#f8d040", Y: "#c89020",
  r: "#e04050", n: "#8a5a30", N: "#c89050", b: "#4a90e0", B: "#2a5aa0", e: "#50d060", p: "#a070e0", c: "#70e0ff",
};
const MENU_ICONS: Record<Exclude<Tab, "home">, { rows: string[]; color: string }> = {
  settings: { color: "#5a6078", rows: [
    "....oooo....", "..o.ollo.o..", ".oloollooloo", "..ollllllo..", ".olllooollo.", "ollloddolllo",
    "ollloddolllo", ".olllooollo.", "..ollllllo..", ".oloollooloo", "..o.ollo.o..", "....oooo....",
  ] },
  cos: { color: "#8a4a8a", rows: [
    ".....oo.....", "....o..o....", ".......o....", "......o.....", "...oooooo...", "..oppppppo..",
    ".opppppppppo", "oppoppppoppo", "ooooppppoooo", "...oppppo...", "...oppppo...", "...oooooo...",
  ] },
  codex: { color: "#2a6a8a", rows: [
    "............", ".oooo..oooo.", "obbbboobbbbo", "obwwbobwwbbo", "obbbboobbbbo", "obwwbobwwbbo",
    "obbbboobbbbo", "obwwbobwwbbo", "obbbboobbbbo", "oooooooooooo", ".....oo.....", "............",
  ] },
  ach: { color: "#8a6a20", rows: [
    "..oooooooo..", "oooyyyyyyooo", "oyoyyyyyyoyo", "oyoyywyyyoyo", ".ooyyyyyyoo.", "...oyyyyo...",
    "....oyyo....", ".....oo.....", "....oYYo....", "...oYYYYo...", "..oooooooo..", "............",
  ] },
  patch: { color: "#8a5a30", rows: [
    "..oooooooo..", ".oNnnnnnnNo.", "..oNNNNNNo..", "..owwwwwwo..", "..owggggwo..", "..owwwwwwo..",
    "..owggggwo..", "..owwwwwwo..", "..owgggwwo..", "..oNNNNNNo..", ".oNnnnnnnNo.", "..oooooooo..",
  ] },
  cmd: { color: "#1a3a2a", rows: [
    "oooooooooooo", "orooyoeooooo", "oooooooooooo", "odddddddddo.", "odeddddddddo", "oddedddddddo",
    "odeddddddddo", "oddddeeeeddo", "oddddddddddo", "oddddddddddo", "oooooooooooo", "............",
  ] },
};

function render() {
  if (tab === "cmd" && !adminOk) tab = "home";
  $("menu-back").classList.toggle("hidden", tab === "home");
  $("menu-title").textContent = TAB_NAME[tab];
  const body = $("menu-body");
  body.innerHTML = "";
  if (tab === "home") renderHome(body);
  else if (tab === "codex") renderCodex(body);
  else if (tab === "ach") renderAch(body);
  else if (tab === "cos") renderCos(body);
  else if (tab === "settings") renderSettings(body);
  else if (tab === "patch") renderPatch(body);
  else renderCmd(body);
}

/** 메뉴 첫 화면: 정사각형 아이콘 버튼 (마우스 올리면 살짝 커짐) */
function renderHome(body: HTMLElement) {
  const grid = document.createElement("div");
  grid.className = "menu-grid";
  const order: Exclude<Tab, "home">[] = ["settings", "cos", "codex", "ach", "patch"];
  if (adminOk) order.push("cmd");
  for (const t of order) {
    const b = document.createElement("button");
    b.className = `menu-tile t-${t}`;
    b.style.setProperty("--tile", MENU_ICONS[t].color);
    const cv = paint(MENU_ICONS[t].rows, ICON_PAL, 5);
    const name = document.createElement("span");
    name.textContent = TAB_NAME[t];
    b.append(cv, name);
    b.onclick = () => { tab = t; render(); };
    grid.append(b);
  }
  body.append(grid);
  const hint = document.createElement("div");
  hint.className = "muted center";
  hint.textContent = "Tab · Esc 로 닫기";
  body.append(hint);
}

/** 패치노트: 버전 + 주된 목적 + 내역 */
function renderPatch(body: HTMLElement) {
  for (const [i, n] of PATCH_NOTES.entries()) {
    const box = document.createElement("div");
    box.className = "patch" + (i === 0 ? " latest" : "");
    const head = document.createElement("div");
    head.className = "patch-head";
    head.innerHTML = `<b class="pv">${esc(n.ver)}</b> ${n.tags.map((t) => `<span class="ptag">${esc(t)}</span>`).join("")}${i === 0 ? '<span class="pnew">NEW</span>' : ""}`;
    const title = document.createElement("div");
    title.className = "patch-title";
    title.textContent = n.title;
    const ul = document.createElement("ul");
    for (const it of n.items) {
      const li = document.createElement("li");
      li.textContent = it;
      ul.append(li);
    }
    box.append(head, title, ul);
    body.append(box);
  }
}

// ---------- 업적 ----------
/** 누적형 업적의 진행도 (현재 / 목표) */
function progressOf(id: string): [number, number] | null {
  const c = profile.counters;
  switch (id) {
    case "slime500": return [codex.kills.slime ?? 0, 500];
    case "trial5": return [c.trial ?? 0, 5];
    case "elite30": return [c.elite ?? 0, 30];
    case "gem_hunter": return [c.gemhunt ?? 0, 10];
    case "codex50": return [codex.cards.length, Math.ceil(CARDS.length / 2)];
    case "codex100": return [codex.cards.length, CARDS.length];
    case "ach25": return [profile.ach.length, 25];
    default: return null;
  }
}

function renderAch(body: HTMLElement) {
  const head = document.createElement("div");
  head.className = "muted";
  head.textContent = `달성 ${profile.ach.length} / ${ACHIEVEMENTS.length} — 보상은 '꾸미기'에서 장착 (커맨드를 쓴 판은 업적이 안 남아요)`;
  body.append(head);
  const grid = document.createElement("div");
  grid.className = "codex-grid";
  for (const a of ACHIEVEMENTS) {
    const done = profile.ach.includes(a.id);
    const el = document.createElement("div");
    el.className = "codex-card ach" + (done ? " r-legend" : " unknown");
    const prog = !done ? progressOf(a.id) : null;
    el.innerHTML = `<div class="ci">${done ? "🏆" : "🔒"}</div><div><b>${esc(a.name)}</b><br>${esc(a.desc)}${prog ? ` <span class="muted">(${Math.min(prog[0], prog[1])}/${prog[1]})</span>` : ""}<br><span class="gold">보상: ${a.rewards.map((r) => `${SLOT_NAME[r.slot]} 「${esc(r.name)}」`).join(", ")}</span></div>`;
    grid.append(el);
  }
  body.append(grid);
}

// ---------- 꾸미기 ----------
function cosPreview(r: Reward): HTMLElement {
  const box = document.createElement("span");
  box.className = "cos-prev";
  if (r.slot === "hat" && HATS[r.id]) {
    const cv = paint(HATS[r.id].rows, HATS[r.id].pal, 3);
    cv.style.imageRendering = "pixelated";
    box.append(cv);
  } else if (r.slot === "cape") {
    box.style.background = r.id === "rainbow" ? `linear-gradient(90deg, ${RAINBOW.join(",")})` : CAPES[r.id];
  } else if (r.slot === "trail" && TRAILS[r.id]) {
    box.style.background = `linear-gradient(90deg, ${TRAILS[r.id].map((c) => "#" + c.toString(16).padStart(6, "0")).join(",")})`;
  } else {
    box.textContent = r.slot === "title" ? "[ ]" : "✦";
  }
  return box;
}

function renderCos(body: HTMLElement) {
  renderSkins(body);
  const head = document.createElement("div");
  head.className = "muted";
  head.textContent = "업적으로 얻은 코스튬을 장착해요. 능력치는 없고 모두에게 보여요.";
  body.append(head);
  const owned = ownedCosmetics(profile.ach);
  for (const slot of Object.keys(SLOT_NAME) as CosSlot[]) {
    const sec = document.createElement("div");
    sec.className = "codex-sec";
    sec.textContent = SLOT_NAME[slot];
    body.append(sec);
    const row = document.createElement("div");
    row.className = "cos-row";
    const none = document.createElement("button");
    none.className = "btn tiny" + (!profile.equip[slot] ? " on" : "");
    none.textContent = "없음";
    none.onclick = () => net.send({ t: "equip", slot, id: null });
    row.append(none);
    const all = ACHIEVEMENTS.flatMap((a) => a.rewards.filter((r) => r.slot === slot).map((r) => ({ r, a })));
    for (const { r, a } of all) {
      const has = owned.some((o) => o.slot === slot && o.id === r.id);
      const b = document.createElement("button");
      b.className = "btn tiny cos-btn" + (profile.equip[slot] === r.id ? " on" : "") + (has ? "" : " locked");
      b.append(cosPreview(r), document.createTextNode(has ? r.name : `🔒 ${r.name}`));
      b.title = has ? r.name : `업적 「${a.name}」: ${a.desc}`;
      b.disabled = !has;
      b.onclick = () => net.send({ t: "equip", slot, id: r.id });
      row.append(b);
    }
    body.append(row);
  }
}

// ---------- v1.7 직업 스킨 (마일스톤) ----------
function renderSkins(body: HTMLElement) {
  const sec = document.createElement("div");
  sec.className = "codex-sec";
  sec.textContent = "직업 스킨 — 그 직업으로 플레이하면 숙련도가 쌓여 마일스톤마다 스킨이 열려요";
  body.append(sec);
  for (const cls of CLASS_IDS) {
    const pts = profile.mastery?.[cls] ?? 0;
    const tier = tierOf(pts);
    const next = MASTERY_TIERS[tier];
    const prev = tier > 0 ? MASTERY_TIERS[tier - 1] : 0;
    const row = document.createElement("div");
    row.className = "skin-row";
    const info = document.createElement("div");
    info.className = "skin-info";
    info.innerHTML = `<b>${CLASSES[cls].name}</b><span class="muted">마일스톤 ${tier}/5</span>
      <div class="skin-bar"><i style="width:${next ? Math.round(((pts - prev) / (next - prev)) * 100) : 100}%"></i></div>
      <span class="muted">${next ? `숙련도 ${pts} / ${next}` : `숙련도 ${pts} · 전부 해금!`}</span>`;
    row.append(info);
    const list = document.createElement("div");
    list.className = "skin-list";
    const cur = profile.skins?.[cls];
    const mk = (idx: number) => {
      const b = document.createElement("button");
      const has = idx < tier;
      const legend = idx === 4;
      b.className = "skin-btn" + (cur === idx || (idx < 0 && cur === undefined) ? " on" : "") + (idx >= 0 && !has ? " locked" : "") + (legend ? " legend" : "");
      if (legend) b.style.setProperty("--glow", SKINS[cls][4].glow ?? "#ffd040");
      b.append(heroSkinCanvas(cls, 0, idx < 0 ? undefined : idx));
      const label = document.createElement("span");
      label.textContent = idx < 0 ? "기본" : has ? SKINS[cls][idx].name.replace("전설: ", "") : `🔒 ${MASTERY_TIERS[idx]}`;
      b.append(label);
      b.title = idx < 0 ? "기본 모습" : `${idx + 1}단계 · ${SKINS[cls][idx].name}${has ? "" : ` (숙련도 ${MASTERY_TIERS[idx]} 필요)`}`;
      b.disabled = idx >= 0 && !has;
      b.onclick = () => net.send({ t: "skin", cls, idx });
      return b;
    };
    list.append(mk(-1));
    for (let i = 0; i < 5; i++) list.append(mk(i));
    row.append(list);
    body.append(row);
  }
}

// ---------- 도감 ----------
function renderCodex(body: HTMLElement) {
  const sub = document.createElement("div");
  sub.className = "subtabs";
  for (const [id, label] of [["cards", "카드"], ["monsters", "몬스터·보스"], ["classes", "직업·스킬"]] as const) {
    const b = document.createElement("button");
    b.className = "btn tiny" + (codexTab === id ? " on" : "");
    b.textContent = label;
    b.onclick = () => { codexTab = id; render(); };
    sub.append(b);
  }
  body.append(sub);
  if (codexTab === "cards") codexCards(body);
  else if (codexTab === "monsters") codexMonsters(body);
  else codexClasses(body);
}

function codexCards(body: HTMLElement) {
  const owned = new Set(codex.cards);
  const total = CARDS.length;
  const have = CARDS.filter((c) => owned.has(c.id)).length;
  const head = document.createElement("div");
  head.className = "muted";
  head.textContent = `수집 ${have} / ${total} (${Math.round((have / total) * 100)}%) — 커맨드를 쓴 판에서 얻은 카드는 기록되지 않아요`;
  body.append(head);
  const order: Rarity[] = ["common", "rare", "legend", "curse", "team"];
  for (const r of order) {
    const title = document.createElement("div");
    title.className = "codex-sec";
    title.textContent = RARITY_NAME[r];
    body.append(title);
    const grid = document.createElement("div");
    grid.className = "codex-grid";
    for (const c of CARDS.filter((x) => x.rarity === r)) {
      const el = document.createElement("div");
      const known = owned.has(c.id);
      el.className = `codex-card r-${c.rarity}` + (known ? "" : " unknown");
      const icon = document.createElement("div");
      icon.className = "ci";
      const cv = known ? paintCard(c.id, 2) : null;
      if (cv) {
        cv.style.imageRendering = "pixelated";
        icon.append(cv);
      } else {
        icon.textContent = known ? c.name[0] : "?";
      }
      const txt = document.createElement("div");
      txt.innerHTML = known
        ? `<b>${esc(c.name)}</b>${c.cls ? ` <span class="muted">(${CLASSES[c.cls].name})</span>` : ""}<br><span>${esc(c.desc)}</span>`
        : `<b>???</b><br><span class="muted">아직 얻지 못한 카드</span>`;
      el.append(icon, txt);
      grid.append(el);
    }
    body.append(grid);
  }
}

const AI_DESC: Record<string, string> = {
  chaser: "쫓아와서 몸통 박치기",
  shooter: "거리를 두고 원거리 공격",
  charger: "빨간 예고선을 그린 뒤 돌진",
  caster: "바닥에 예고 장판을 깔아 공격",
  turret: "제자리에서 사격",
};
const BOSS_DESC: Record<string, string> = {
  slam: "내려찍기", summon: "졸개 소환", ring: "원형 탄막", charge: "돌진", strikes: "낙뢰", teleport: "순간이동",
};
const EFFECT_DESC: Record<string, string> = { slow: "둔화", poison: "독", burn: "화상" };

function worldsOf(def: MonsterDef) {
  return WORLDS.filter((w) => w.monsters.includes(def.id) || w.extra === def.id || w.boss === def.id).map((w) => `${w.id} ${w.name}`);
}

function codexMonsters(body: HTMLElement) {
  const list = Object.values(MONSTERS).filter((m) => !["pvp", "dummy", "chest"].includes(m.id));
  const seen = list.filter((m) => (codex.kills[m.id] ?? 0) > 0).length;
  const head = document.createElement("div");
  head.className = "muted";
  head.textContent = `발견 ${seen} / ${list.length} — 한 번이라도 피해를 줘서 쓰러뜨리면 공개돼요`;
  body.append(head);
  const grid = document.createElement("div");
  grid.className = "codex-grid mon";
  for (const def of list) {
    const kills = codex.kills[def.id] ?? 0;
    const known = kills > 0;
    const el = document.createElement("div");
    el.className = "codex-card" + (def.boss ? " r-legend" : " r-common") + (known ? "" : " unknown");
    const pal = known ? monsterPalette(def.pal) : { o: "#000000", a: "#2a2838", A: "#1e1c28", l: "#34324a", e: "#2a2838" };
    const cv = paint(BODIES[def.base][0], pal, 3);
    cv.style.imageRendering = "pixelated";
    const icon = document.createElement("div");
    icon.className = "ci mon";
    icon.append(cv);
    const lines: string[] = [];
    if (known) {
      lines.push(`<b>${esc(def.name)}</b>${def.boss ? ' <span class="boss">보스</span>' : ""}`);
      lines.push(`<span class="muted">등장: ${worldsOf(def).join(", ") || "-"}</span>`);
      if (def.boss) lines.push(`패턴: ${def.boss.abilities.map((a) => BOSS_DESC[a]).join(" · ")}`);
      else lines.push(AI_DESC[def.ai] ?? "");
      const fx = def.onHit ?? def.proj?.effect;
      if (fx) lines.push(`맞으면 ${EFFECT_DESC[fx]}`);
      if (def.phase) lines.push("벽을 통과함");
      lines.push(`<span class="muted">처치 ${kills}</span>`);
    } else {
      lines.push("<b>???</b>", `<span class="muted">등장: ${worldsOf(def).join(", ") || "-"}</span>`);
    }
    const txt = document.createElement("div");
    txt.innerHTML = lines.join("<br>");
    el.append(icon, txt);
    grid.append(el);
  }
  body.append(grid);
}

const AIM_DESC: Record<string, string> = { self: "내 주변", point: "지점", line: "직선", dir: "방향" };

function codexClasses(body: HTMLElement) {
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    const box = document.createElement("div");
    box.className = "codex-class";
    const atk = c.attack.kind === "melee"
      ? `근접 베기 · 피해 ${c.attack.dmg} · ${c.attack.cd}초마다`
      : `원거리 · 피해 ${c.attack.dmg} · ${c.attack.cd}초마다${c.attack.explode ? " · 폭발" : ""}`;
    box.innerHTML = `<div class="ch"><b>${c.name}</b> <span class="muted">${c.role} · 체력 ${c.hp} · 이동 ${c.speed}</span></div>
      <div class="muted">평타: ${atk}</div>
      ${c.skills.map((s, i) => `<div class="sk"><span class="k">${i + 1}</span><b>${esc(s.name)}</b> <span class="muted">Lv${s.unlock} · 쿨 ${s.cd}초 · ${AIM_DESC[s.aim]}${s.range ? ` · 사거리 ${s.range}` : ""}${s.radius ? ` · 범위 ${s.radius}` : ""}</span><br>${esc(s.desc)}</div>`).join("")}`;
    body.append(box);
  }
}

// ---------- 설정 ----------
function renderSettings(body: HTMLElement) {
  const sec = (title: string) => {
    const d = document.createElement("div");
    d.className = "codex-sec";
    d.textContent = title;
    body.append(d);
  };
  const toggle = (label: string, key: "aimBar" | "skillRange" | "chargeLine" | "sound" | "panicFx" | "bgmOn" | "potato") => {
    const l = document.createElement("label");
    l.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = settings[key];
    cb.onchange = () => { settings[key] = cb.checked; saveSettings(); };
    l.append(cb, document.createTextNode(" " + label));
    body.append(l);
  };

  sec("조준 표시");
  toggle("평타 방향 회색 막대", "aimBar");
  toggle("스킬 사거리·범위 표시", "skillRange");
  toggle("몬스터 돌진 예고선", "chargeLine");

  sec("소리 · 연출");
  toggle("소리 켜기 (효과음)", "sound");
  toggle("배경음악 켜기", "bgmOn");
  const slider = (label: string, key: "volume" | "sfxVolume" | "bgmVolume") => {
    const vl = document.createElement("label");
    vl.className = "check vol";
    const vr = document.createElement("input");
    vr.type = "range";
    vr.min = "0";
    vr.max = "100";
    vr.value = String(Math.round(settings[key] * 100));
    const num = document.createElement("span");
    num.className = "muted";
    num.textContent = ` ${vr.value}`;
    vr.oninput = () => { settings[key] = Number(vr.value) / 100; num.textContent = ` ${vr.value}`; saveSettings(); };
    vl.append(document.createTextNode(label + " "), vr, num);
    body.append(vl);
  };
  slider("전체 음량", "volume");
  slider("효과음", "sfxVolume");
  slider("배경음악", "bgmVolume");
  toggle("PANIC 화면 가장자리 붉은 경고·흔들림", "panicFx");

  sec("성능");
  toggle("🥔 감자 모드 — 파티클·화면 흔들림·잔상·날씨 등 이펙트 대부분 끄기 (저사양 컴퓨터용)", "potato");

  sec("스킬 조준 방식");
  for (const [v, label] of [["hold", "누른 채 클릭하면 시전 (키를 떼면 취소)"], ["instant", "누르면 바로 마우스 위치에 시전"]] as const) {
    const l = document.createElement("label");
    l.className = "check";
    const r = document.createElement("input");
    r.type = "radio";
    r.name = "castMode";
    r.checked = settings.castMode === v;
    r.onchange = () => { settings.castMode = v; saveSettings(); };
    l.append(r, document.createTextNode(" " + label));
    body.append(l);
  }

  sec("키 설정 (이동은 WASD·방향키 고정)");
  const keys = document.createElement("div");
  keys.className = "keys";
  for (const a of Object.keys(KEY_LABEL) as KeyAction[]) {
    const row = document.createElement("div");
    row.className = "keyrow";
    const btn = document.createElement("button");
    btn.className = "btn tiny" + (capturing === a ? " on" : "");
    btn.textContent = capturing === a ? "아무 키나 누르세요 (Esc 취소)" : displayKey(settings.keys[a]);
    btn.onclick = () => { capturing = a; render(); };
    const label = document.createElement("span");
    label.textContent = KEY_LABEL[a];
    row.append(label, btn);
    keys.append(row);
  }
  body.append(keys);
  const reset = document.createElement("button");
  reset.className = "btn tiny";
  reset.textContent = "키 기본값으로";
  reset.onclick = () => { resetKeys(); render(); };
  body.append(reset);

  sec("명령어 입력");
  const row = document.createElement("div");
  row.className = "row";
  const input = document.createElement("input");
  input.placeholder = "명령어";
  const go = document.createElement("button");
  go.className = "btn small";
  go.textContent = "입력";
  const submit = () => {
    // 확인은 서버가 함 (화면 코드에는 비밀번호가 없음)
    const v = input.value.trim();
    if (v) net.send({ t: "auth", code: v });
    input.value = "";
  };
  go.onclick = submit;
  input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") submit(); };
  row.append(input, go);
  body.append(row);

}

// ---------- 커맨드 패널 ----------
function send(cmd: CmdAction) {
  net.send({ t: "cmd", cmd });
}

function renderCmd(body: HTMLElement) {
  const warn = document.createElement("div");
  warn.className = "cmd-warn";
  warn.textContent = "커맨드를 한 번이라도 쓴 판은 순위·저장·해금·도감에 기록되지 않아요.";
  body.append(warn);

  const top = document.createElement("div");
  top.className = "cmd-top";
  const search = document.createElement("input");
  search.placeholder = "검색 (예: 보스, 돈, 무적)";
  search.onkeydown = (e) => e.stopPropagation();
  const cats = document.createElement("div");
  cats.className = "subtabs";
  for (const c of ["이동", "모드", "자원", "능력치", "대상", "무적·즉사", "소환", "기타"]) {
    const b = document.createElement("button");
    b.className = "btn tiny" + (cmdCat === c ? " on" : "");
    b.textContent = c;
    b.onclick = () => { cmdCat = c; render(); };
    cats.append(b);
  }
  top.append(cats, search);
  body.append(top);

  const list = document.createElement("div");
  list.className = "cmd-list";
  body.append(list);
  const rows: { cat: string; text: string; el: HTMLElement }[] = [];
  const row = (cat: string, text: string, ...parts: HTMLElement[]) => {
    const el = document.createElement("div");
    el.className = "cmd-row";
    const label = document.createElement("span");
    label.textContent = text;
    el.append(label, ...parts);
    rows.push({ cat, text, el });
  };
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.className = "btn tiny";
    b.textContent = label;
    b.onclick = fn;
    return b;
  };
  const select = (opts: [string, string][]) => {
    const s = document.createElement("select");
    for (const [v, l] of opts) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = l;
      s.append(o);
    }
    return s;
  };
  const num = (v: number, w = 60) => {
    const i = document.createElement("input");
    i.type = "number";
    i.value = String(v);
    i.style.width = `${w}px`;
    i.onkeydown = (e) => e.stopPropagation();
    return i;
  };
  const me = () => getSnap()?.players.find((p) => p.id === getMyId());

  // 이동
  const wSel = select(WORLDS.map((w) => [String(w.id), `월드 ${w.id} ${w.name}`]));
  const rSel = select([...[1, 2, 3, 4, 5, 6].map((r) => [String(r), `${r}라운드`] as [string, string]), ["7", "보스"]]);
  row("이동", "월드·라운드로 이동", wSel, rSel, btn("이동", () => send({ a: "goto", world: Number(wSel.value), round: Number(rSel.value) })));
  row("이동", "바로 보스", btn("이 월드 보스로", () => send({ a: "goto", world: getWorld(), round: 7 })));
  row("이동", "휴게소로 (암시장)", btn("이동", () => send({ a: "rest" })));
  row("이동", "시련의 방으로", btn("이동", () => send({ a: "trial" })));
  row("이동", "보물방으로 (상자 4개 중 1개 미믹)", btn("이동", () => send({ a: "treasure" })));
  row("이동", "다음 라운드로", btn("이동", () => send({ a: "next" })));

  // 자원
  row("자원", "돈 지급", btn("+100", () => send({ a: "gold", n: 100 })), btn("+1000", () => send({ a: "gold", n: 1000 })));
  const lv = num(10);
  row("자원", "레벨 (경험치)", btn("+1", () => send({ a: "level", n: (me()?.lv ?? 1) + 1 })), lv, btn("지정", () => send({ a: "level", n: Number(lv.value) })));
  const cSel = select(CARDS.filter((c) => c.rarity !== "team").map((c) => [c.id, `[${RARITY_NAME[c.rarity]}] ${c.name}${c.cls ? ` (${CLASSES[c.cls].name})` : ""}`]));
  row("자원", "카드 받기", cSel, btn("받기", () => send({ a: "card", id: cSel.value })));
  const tSel = select(CARDS.filter((c) => c.rarity === "team").map((c) => [c.id, c.name]));
  row("자원", "팀카드 받기 (팀 전체)", tSel, btn("받기", () => send({ a: "teamcard", id: tSel.value })));

  // 무적·즉사
  row("무적·즉사", "나 무적", btn("켜기/끄기", () => send({ a: "god" })));
  row("무적·즉사", "쿨타임 없음", btn("켜기/끄기", () => send({ a: "nocd" })));
  row("무적·즉사", "화면의 몬스터 전부 처치", btn("처치", () => send({ a: "killall" })));
  row("무적·즉사", "체력 전부 회복 (쓰러졌으면 부활)", btn("회복", () => send({ a: "heal" })));

  // 모드
  const zn = num(8);
  row("모드", "PANIC 구역 이동 (1~16)", zn, btn("이동", () => send({ a: "zone", n: Number(zn.value) })));
  row("모드", "PANIC 남은 시간", btn("+30초", () => send({ a: "ptime", n: 30 })), btn("+90초", () => send({ a: "ptime", n: 90 })), btn("-10초", () => send({ a: "ptime", n: -10 })));
  const fl = num(10);
  row("모드", "무한 하강 층 이동", fl, btn("이동", () => send({ a: "floor", n: Number(fl.value) })));
  row("모드", "게임 속도", ...[0, 0.5, 1, 1.5, 2].map((v) => btn(v === 0 ? "일시정지" : `×${v}`, () => send({ a: "speed", mul: v }))));

  // 능력치
  const statRow = (label: string, key: "atk" | "hp" | "speed" | "atkspd", v: number) => {
    const i = num(v);
    row("능력치", label, i, btn("설정", () => send({ a: "stat", key, v: Number(i.value) })));
  };
  statRow("공격력 배율 (1 = 기본)", "atk", 1);
  statRow("최대 체력", "hp", 200);
  statRow("이동 속도 배율", "speed", 1);
  statRow("공격 속도 배율", "atkspd", 1);
  const clsSel = select(CLASS_IDS.map((c) => [c, CLASSES[c].name]));
  row("능력치", "직업 바꾸기", clsSel, btn("바꾸기", () => send({ a: "class", cls: clsSel.value })));

  // 대상 (다른 플레이어)
  const ps = getSnap()?.players ?? [];
  const pSel = select(ps.map((p) => [String(p.id), p.n]));
  const target = () => Number(pSel.value);
  row("대상", "고른 사람 부활·회복", pSel, btn("부활", () => send({ a: "player", target: target(), op: "revive" })), btn("회복", () => send({ a: "player", target: target(), op: "heal" })));
  const pSel2 = select(ps.map((p) => [String(p.id), p.n]));
  row("대상", "고른 사람에게 돈 +100 / 순간이동", pSel2, btn("+100원", () => send({ a: "player", target: Number(pSel2.value), op: "gold", n: 100 })), btn("내 옆으로", () => send({ a: "player", target: Number(pSel2.value), op: "bring" })), btn("그 사람에게", () => send({ a: "player", target: Number(pSel2.value), op: "goto" })));
  const pSel3 = select(ps.map((p) => [String(p.id), p.n]));
  const cSel2 = select(CARDS.filter((c) => c.rarity !== "team").map((c) => [c.id, `[${RARITY_NAME[c.rarity]}] ${c.name}`]));
  row("대상", "고른 사람에게 카드 주기", pSel3, cSel2, btn("주기", () => send({ a: "player", target: Number(pSel3.value), op: "card", id: cSel2.value })));

  // 기타
  row("기타", "관전·투명 모드 (몬스터가 못 보고 벽 통과)", btn("켜기/끄기", () => send({ a: "spectate" })));
  const nt = document.createElement("input");
  nt.placeholder = "공지 내용";
  nt.onkeydown = (e) => e.stopPropagation();
  row("기타", "모두에게 공지 (큰 타이틀)", nt, btn("보내기", () => { send({ a: "notice", text: nt.value }); nt.value = ""; }));
  row("기타", "업적·코스튬 전부 해금", btn("해금", () => send({ a: "unlockall" })));

  // 소환
  const mons = Object.values(MONSTERS).filter((m) => !["pvp", "dummy"].includes(m.id));
  const mSel = select(mons.map((m) => [m.id, `${m.boss ? "[보스] " : ""}${m.name}`]));
  const cnt = num(1, 50);
  const el = document.createElement("label");
  el.className = "check";
  const elCb = document.createElement("input");
  elCb.type = "checkbox";
  el.append(elCb, document.createTextNode(" 엘리트"));
  row("소환", "몬스터·보스 소환 (내 앞)", mSel, cnt, el, btn("소환", () => send({ a: "spawn", kind: mSel.value, n: Number(cnt.value), elite: elCb.checked })));

  const apply = () => {
    const q = search.value.trim();
    list.innerHTML = "";
    for (const r of rows) {
      if (q ? r.text.includes(q) || r.cat.includes(q) : r.cat === cmdCat) list.append(r.el);
    }
    if (!list.children.length) list.innerHTML = '<div class="muted">찾는 커맨드가 없어요</div>';
  };
  search.oninput = apply;
  apply();
}
