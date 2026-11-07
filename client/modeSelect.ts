// 모드 선택 창: 큰 배너를 좌우로 넘겨 고르고, 배너 아래에서 난이도까지 함께 선택
import type { ClientMsg, RoomMode } from "../shared/protocol";
import { DIFFS, diffDmgMul, diffHpMul } from "../shared/worlds";
import type { ClassId } from "../shared/classes";
import {
  GEM, GEM_PAL, PORTAL, PORTAL_PAL, SKELETON, SKELETON_PAL, SLIME, SLIME_PAL, BOSS_PAL, heroPalette, heroRows, paint, shade,
} from "./sprites";

export type ModeId = "normal" | "panic" | "descent" | "speedrun" | "gem";

export interface ModeDef {
  id: ModeId;
  name: string;
  /** 배너 위 작은 문구 */
  tag: string;
  desc: string;
  play: string;
  players: string;
  noDiff?: boolean;
}

export const MODES: ModeDef[] = [
  {
    id: "normal", name: "원정", tag: "STORY",
    desc: "8개 월드 × (6라운드 + 보스)를 다 같이 돌파해요. 월드를 깰 때마다 자동 저장되고 이어할 수 있어요.",
    play: "협동", players: "1~8명",
  },
  {
    id: "panic", name: "PANIC", tag: "TIME ATTACK",
    desc: "16구역을 구역마다 1분 30초 안에 돌파! 임무(탈출구 도달·열쇠 수집 등)와 몬스터 전멸을 둘 다 끝내야 해요. 못 하면 바로 TIME OVER. 구역 사이에 카드 1장.",
    play: "협동 타임어택", players: "1~8명",
  },
  {
    id: "descent", name: "무한 하강", tag: "ENDLESS",
    desc: "1층부터 끝없이 내려가요. 층마다 테마와 변형 규칙이 바뀌고 10층마다 보스, 5층마다 이벤트. 최고 층수로 순위를 매겨요.",
    play: "협동", players: "1~8명",
  },
  {
    id: "speedrun", name: "스피드런", tag: "RACE",
    desc: "각자 자기 맵에서 솔로로 동시에 달려요. 카드·투표·휴게소 시간은 빼고 재요. 월드별 구간 기록과 완주 순위.",
    play: "솔로 경주 (각자 다른 맵)", players: "1~8명",
  },
  {
    id: "gem", name: "보석 쟁탈전", tag: "VERSUS",
    desc: "레벨 10 + 카드 5장 드래프트 뒤 아레나에서 대결. 보석을 든 사람만 공격하고 공격받아요. 100점을 먼저 모으면 우승!",
    play: "대전 (서로 경쟁)", players: "2~8명", noDiff: true,
  },
];

export function modeIdOf(m: RoomMode): ModeId {
  if (m.gem) return "gem";
  if (m.panic) return "panic";
  if (m.descent) return "descent";
  if (m.speedrun) return "speedrun";
  return "normal";
}

export function modeMsg(id: ModeId, diff: number): ClientMsg {
  return { t: "mode", speedrun: id === "speedrun", gem: id === "gem", descent: id === "descent", panic: id === "panic", diff };
}

// ---------- 배너 그림 (160×72 도트, 화면에서 3배로) ----------
const BW = 160;
const BH = 72;

function sprite(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, x: number, y: number, scale = 1) {
  ctx.drawImage(paint(rows, pal, scale), Math.round(x), Math.round(y));
}

function hero(ctx: CanvasRenderingContext2D, cls: ClassId, color: number, x: number, y: number, frame = 0) {
  sprite(ctx, heroRows(cls, frame), heroPalette(cls, color), x, y);
}

function stripes(ctx: CanvasRenderingContext2D, y: number, h: number, a: string, b: string, step = 8) {
  for (let x = -h; x < BW + h; x += step) {
    ctx.fillStyle = (x / step) % 2 === 0 ? a : b;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + h, y);
    ctx.lineTo(x + h + step, y);
    ctx.lineTo(x + step, y + h);
    ctx.fill();
  }
}

/** 3×5 블록 숫자 (PANIC 타이머) */
const DIGITS: Record<string, string[]> = {
  "0": ["xxx", "x.x", "x.x", "x.x", "xxx"], "4": ["x.x", "x.x", "xxx", "..x", "..x"], "5": ["xxx", "x..", "xxx", "..x", "xxx"],
  ":": [".", "x", ".", "x", "."],
};
function digits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, col: string) {
  ctx.fillStyle = col;
  for (const ch of text) {
    const g = DIGITS[ch];
    if (!g) { x += 2 * s; continue; }
    g.forEach((row, ry) => [...row].forEach((c, rx) => { if (c === "x") ctx.fillRect(x + rx * s, y + ry * s, s, s); }));
    x += (g[0].length + 1) * s;
  }
}

function drawBanner(id: ModeId): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = BW;
  c.height = BH;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const band = (y: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(0, y, BW, h); };
  switch (id) {
    case "normal": {
      ["#5a9ae8", "#6aa8f0", "#80b8f4", "#98c8f8"].forEach((col, i) => band(i * 10, 10, col));
      // 구름
      ctx.fillStyle = "#ffffff";
      for (const [x, y] of [[18, 8], [100, 14], [130, 5]]) { ctx.fillRect(x, y, 16, 4); ctx.fillRect(x + 4, y - 3, 8, 3); }
      // 먼 산과 성
      ctx.fillStyle = "#6a7ab0";
      for (let x = 0; x < BW; x += 2) ctx.fillRect(x, 34 - Math.abs(((x * 3) % 60) - 30) / 3, 2, 20);
      ctx.fillStyle = "#4a4e70";
      ctx.fillRect(118, 18, 22, 22);
      ctx.fillRect(114, 12, 6, 28); ctx.fillRect(138, 12, 6, 28);
      ctx.fillStyle = "#e84a4a"; ctx.fillRect(116, 6, 1, 6); ctx.fillRect(117, 6, 4, 3);
      band(44, 28, "#4fa04a");
      band(44, 2, "#78c860");
      ctx.fillStyle = "#3a8038";
      for (let x = 3; x < BW; x += 9) ctx.fillRect(x, 50 + (x % 5) * 3, 2, 1);
      hero(ctx, "warrior", 0, 30, 34);
      hero(ctx, "mage", 1, 46, 36, 1);
      hero(ctx, "archer", 2, 62, 34);
      hero(ctx, "cleric", 3, 78, 36, 1);
      sprite(ctx, SLIME[0], SLIME_PAL, 106, 50);
      sprite(ctx, SLIME[0], BOSS_PAL, 124, 44, 2);
      break;
    }
    case "panic": {
      band(0, BH, "#0e0d12");
      // 경고 줄무늬 (위·아래)
      stripes(ctx, 0, 7, "#f08030", "#141218");
      stripes(ctx, BH - 7, 7, "#e84a4a", "#141218");
      // 붉은 빛
      for (let r = 40; r > 0; r -= 6) {
        ctx.fillStyle = `rgba(232, 40, 40, ${0.05 + (40 - r) * 0.004})`;
        ctx.fillRect(80 - r * 1.4, 36 - r * 0.6, r * 2.8, r * 1.2);
      }
      // 거대한 타이머 00:45
      ctx.fillStyle = "#2a0a0e";
      ctx.fillRect(34, 14, 92, 40);
      ctx.fillStyle = "#4a1018";
      ctx.fillRect(34, 14, 92, 2);
      digits(ctx, "00:45", 41, 19, 6, "#5a0a10");
      digits(ctx, "00:45", 40, 18, 6, "#ff3030");
      // 경고 삼각형
      const tri = (x: number, y: number) => {
        ctx.fillStyle = "#f8c030";
        for (let i = 0; i < 9; i++) ctx.fillRect(x + 8 - i, y + i * 2, i * 2 + 1, 2);
        ctx.fillStyle = "#141218";
        ctx.fillRect(x + 8, y + 5, 1, 7);
        ctx.fillRect(x + 8, y + 14, 1, 2);
      };
      tri(6, 26);
      tri(137, 26);
      // 쫓기는 용사들
      hero(ctx, "warrior", 0, 20, 50, 1);
      hero(ctx, "bard", 4, 132, 50);
      break;
    }
    case "descent": {
      for (let i = 0; i < 8; i++) band(i * 9, 9, shade("#3a2a5a", -i * 0.09));
      // 아래로 이어지는 계단
      for (let i = 0; i < 8; i++) {
        const x = 20 + i * 15;
        const y = 20 + i * 6;
        ctx.fillStyle = shade("#8a7ab0", -i * 0.08);
        ctx.fillRect(x, y, 22, 4);
        ctx.fillStyle = shade("#4a3a6a", -i * 0.08);
        ctx.fillRect(x, y + 4, 22, 3);
      }
      sprite(ctx, PORTAL, PORTAL_PAL, 134, 52);
      // 층수 표시
      ctx.fillStyle = "#c090f0";
      for (const [x, y] of [[8, 8], [30, 4], [150, 10]]) ctx.fillRect(x, y, 1, 1);
      hero(ctx, "mage", 1, 34, 6, 1);
      sprite(ctx, SKELETON[0], SKELETON_PAL, 92, 26);
      break;
    }
    case "speedrun": {
      band(0, BH, "#1a2a48");
      // 속도선
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = i % 3 === 0 ? "#f0c040" : "#5a7ab8";
        const y = (i * 11) % BH;
        const x = (i * 37) % BW;
        ctx.fillRect(x, y, 20 + (i % 4) * 6, 1);
      }
      band(54, 18, "#2a3a5a");
      band(54, 1, "#f0c040");
      // 스톱워치
      ctx.fillStyle = "#e8e8f0";
      ctx.fillRect(112, 14, 28, 28);
      ctx.fillStyle = "#141218";
      ctx.fillRect(114, 16, 24, 24);
      ctx.fillStyle = "#e8e8f0";
      ctx.fillRect(122, 8, 8, 4);
      ctx.fillRect(125, 12, 2, 2);
      ctx.fillStyle = "#f0c040";
      ctx.fillRect(125, 20, 2, 9);
      ctx.fillRect(127, 27, 6, 2);
      hero(ctx, "archer", 2, 30, 36, 1);
      hero(ctx, "engineer", 5, 58, 38, 0);
      ctx.fillStyle = "#f0c040";
      for (let i = 0; i < 3; i++) ctx.fillRect(14 - i * 4, 42 + i * 4, 10, 1);
      break;
    }
    case "gem": {
      band(0, BH, "#2a1a2a");
      // 원형 경기장
      ctx.fillStyle = "#4a3040";
      ctx.fillRect(10, 40, 140, 30);
      ctx.fillStyle = "#6a4858";
      ctx.fillRect(14, 42, 132, 26);
      ctx.fillStyle = "#3a2030";
      for (let x = 0; x < BW; x += 6) ctx.fillRect(x, 26 + (x % 12 === 0 ? 0 : 2), 4, 10);
      // 빛나는 보석
      for (let r = 22; r > 0; r -= 5) {
        ctx.fillStyle = `rgba(240, 90, 138, ${0.06 + (22 - r) * 0.01})`;
        ctx.fillRect(80 - r, 30 - r, r * 2, r * 2);
      }
      sprite(ctx, GEM, GEM_PAL, 72, 20, 2);
      hero(ctx, "warrior", 0, 30, 42);
      hero(ctx, "cook", 6, 114, 42, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(50, 48, 8, 1); ctx.fillRect(102, 48, 8, 1);
      break;
    }
  }
  return c;
}

// ---------- 창 ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

interface Opts {
  mode: RoomMode;
  isHost: boolean;
  canHardcore: boolean;
  /** 이어하기를 골랐으면 난이도 고정 */
  diffLocked: boolean;
  send: (m: ClientMsg) => void;
}

let opts: Opts | null = null;
let sel = 0;
let selDiff = 2;
const banners = new Map<ModeId, HTMLCanvasElement>();

function bannerFor(id: ModeId) {
  let b = banners.get(id);
  if (!b) {
    b = drawBanner(id);
    banners.set(id, b);
  }
  return b;
}

/** 로비 모드 칸에 들어가는 작은 배너 (현재 모드) */
export function miniBanner(id: ModeId): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `ms-mini m-${id}`;
  const cv = document.createElement("canvas");
  cv.width = BW;
  cv.height = BH;
  cv.getContext("2d")!.drawImage(bannerFor(id), 0, 0);
  const def = MODES.find((m) => m.id === id)!;
  const name = document.createElement("div");
  name.className = "ms-name";
  name.textContent = def.name;
  wrap.append(cv, name);
  return wrap;
}

export function isModeSelectOpen() {
  return !$("modesel").classList.contains("hidden");
}

export function closeModeSelect() {
  $("modesel").classList.add("hidden");
  opts = null;
}

export function openModeSelect(o: Opts) {
  opts = o;
  sel = Math.max(0, MODES.findIndex((m) => m.id === modeIdOf(o.mode)));
  selDiff = o.mode.diff;
  const track = $("ms-track");
  track.innerHTML = "";
  MODES.forEach((m, i) => {
    const card = document.createElement("div");
    card.className = `ms-card m-${m.id}`;
    const cv = document.createElement("canvas");
    cv.width = BW;
    cv.height = BH;
    cv.getContext("2d")!.drawImage(bannerFor(m.id), 0, 0);
    const tag = document.createElement("div");
    tag.className = "ms-tag";
    tag.textContent = m.tag;
    const name = document.createElement("div");
    name.className = "ms-name";
    name.textContent = m.name;
    card.append(cv, tag, name);
    card.onclick = () => { if (i === sel) confirm(); else go(i); };
    track.append(card);
  });
  const dots = $("ms-dots");
  dots.innerHTML = "";
  MODES.forEach((_, i) => {
    const d = document.createElement("i");
    d.onclick = () => go(i);
    dots.append(d);
  });
  $("modesel").classList.remove("hidden");
  render();
}

function go(i: number) {
  sel = (i + MODES.length) % MODES.length;
  render();
}

function confirm() {
  if (!opts) return;
  if (opts.isHost) opts.send(modeMsg(MODES[sel].id, selDiff));
  closeModeSelect();
}

function render() {
  if (!opts) return;
  const def = MODES[sel];
  const cards = [...$("ms-track").children] as HTMLElement[];
  cards.forEach((el, i) => {
    // 가운데가 선택된 배너, 양옆은 작게 (끝과 처음이 이어짐)
    let off = i - sel;
    if (off > MODES.length / 2) off -= MODES.length;
    if (off < -MODES.length / 2) off += MODES.length;
    const abs = Math.abs(off);
    el.style.transform = `translateX(calc(-50% + ${off * 74}%)) scale(${off === 0 ? 1 : 0.72})`;
    el.style.opacity = abs === 0 ? "1" : abs === 1 ? "0.55" : "0";
    el.style.zIndex = String(10 - abs);
    el.style.pointerEvents = abs > 1 ? "none" : "auto";
    el.classList.toggle("on", off === 0);
  });
  [...$("ms-dots").children].forEach((d, i) => d.classList.toggle("on", i === sel));
  const current = modeIdOf(opts.mode) === def.id;
  $("ms-info").innerHTML = `
    <div class="ms-iname m-${def.id}">${def.name}${current ? ' <span class="ms-cur">현재 모드</span>' : ""}</div>
    <div class="ms-desc">${def.desc}</div>
    <div class="ms-meta"><span>권장 플레이 <b>${def.play}</b></span><span>참여 인원 <b>${def.players}</b></span></div>`;

  const dr = $("ms-diff");
  dr.innerHTML = "";
  if (def.noDiff) {
    dr.innerHTML = '<span class="muted">이 모드는 난이도가 없어요</span>';
  } else {
    for (const d of DIFFS) {
      const b = document.createElement("button");
      const locked = d.id === 4 && !opts.canHardcore;
      b.className = "btn" + (selDiff === d.id ? " on" : "");
      b.textContent = `${d.name} ×${d.id}${locked ? " 🔒" : ""}`;
      b.disabled = !opts.isHost || locked || opts.diffLocked;
      b.title = `적 체력 ×${diffHpMul(d.id)} · 적 피해 ×${diffDmgMul(d.id)}`;
      b.onclick = () => { selDiff = d.id; render(); };
      dr.append(b);
    }
  }
  const ok = $<HTMLButtonElement>("ms-ok");
  ok.disabled = !opts.isHost;
  ok.textContent = opts.isHost ? "이 모드로 결정 (Enter)" : "방장만 고를 수 있어요";
}

export function initModeSelect() {
  $("ms-prev").onclick = () => go(sel - 1);
  $("ms-next").onclick = () => go(sel + 1);
  $("ms-ok").onclick = () => confirm();
  $("ms-close").onclick = () => closeModeSelect();
  let wheelT = 0;
  $("modesel").addEventListener("wheel", (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - wheelT < 180) return;
    wheelT = now;
    go(sel + (e.deltaY + e.deltaX > 0 ? 1 : -1));
  }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (!isModeSelectOpen()) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") go(sel - 1);
    else if (k === "arrowright" || k === "d") go(sel + 1);
    else if (k === "enter") confirm();
    else if (k === "escape") closeModeSelect();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
