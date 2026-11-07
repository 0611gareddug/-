// PANIC 모드 화면: 큰 타이머 · 구역 진행 · 임무 · COMPLETE! · 구역 전환 · 붉은 경고
import { MISSION_NAME, PANIC_TIME, PANIC_ZONES, type Snapshot, type StageInfo } from "../shared/protocol";
import { WORLDS } from "../shared/worlds";
import { settings } from "./settings";
import { bgm, sfx } from "./sound";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let active = false;
let lastSec = -1;
let alarmed = false;
let lastZone = 0;
let doneShown = false;
let bannerTimer: number | undefined;

const MISSION_HELP: Record<string, string> = {
  kill: "모든 몬스터를 처치하세요",
  exit: "몬스터를 다 잡고, 살아있는 모두가 탈출구(포탈)로!",
  collect: "흩어진 열쇠를 모으고 몬스터도 전부 처치",
  boss: "장난꾸러기 신을 쓰러뜨리세요",
};

export function panicActive() {
  return active;
}

/** 구역 이름: 월드 이름 + 앞/뒤 */
function zoneName(zone: number) {
  const w = WORLDS[Math.ceil(zone / 2) - 1];
  if (zone >= PANIC_ZONES) return `${w?.name ?? ""} — 최종 구역`;
  return `${w?.name ?? ""} ${zone % 2 === 1 ? "입구" : "깊은 곳"}`;
}

export function panicReset() {
  active = false;
  lastZone = 0;
  $("hud").classList.remove("panic");
  for (const id of ["panic-timer", "panic-prog", "panic-mission", "panic-edge", "panic-complete", "panic-banner"]) $(id).classList.add("hidden");
}

/** 새 구역 시작: 화면 전환 + 구역 이름 */
export function panicStage(st: StageInfo) {
  if (st.zone === undefined) {
    panicReset();
    return;
  }
  active = true;
  $("hud").classList.add("panic");
  for (const id of ["panic-timer", "panic-prog", "panic-mission"]) $(id).classList.remove("hidden");
  $("panic-complete").classList.add("hidden");
  lastSec = -1;
  alarmed = false;
  doneShown = false;
  if (st.zone !== lastZone) {
    lastZone = st.zone;
    const b = $("panic-banner");
    b.innerHTML = `<div class="pz">ZONE ${String(st.zone).padStart(2, "0")} / ${PANIC_ZONES}</div><div class="pn">${zoneName(st.zone)}</div><div class="pm">임무: ${MISSION_NAME[st.mission ?? "kill"]}</div>`;
    b.classList.remove("hidden", "play");
    void b.offsetWidth;
    b.classList.add("play");
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => b.classList.add("hidden"), 1900);
    sfx.go();
  }
}

function fmt(t: number) {
  return t >= 10 ? t.toFixed(1) : t.toFixed(2).slice(0, 4);
}

export function panicSnap(s: Snapshot) {
  const p = s.panic;
  if (!p || !active) return;
  const t = p.t;
  const ratio = Math.max(0, Math.min(1, t / PANIC_TIME));
  // 45초부터 노랑, 20초부터 빨간 점멸, 10초부터 더 빠르게
  const state = p.done ? "done" : t <= 10 ? "final" : t <= 20 ? "danger" : t <= 45 ? "warn" : "safe";

  // 타이머
  const tm = $("panic-timer");
  tm.dataset.state = state;
  $("pt-num").textContent = p.done ? "CLEAR" : fmt(t);
  ($("pt-bar").firstElementChild as HTMLElement).style.width = `${ratio * 100}%`;
  $("pt-zone").textContent = `ZONE ${String(p.z).padStart(2, "0")}`;

  // 진행 상황 (16칸)
  const prog = $("panic-prog");
  prog.innerHTML = `<div class="pp-t">구역 <b>${p.z}</b> / ${PANIC_ZONES}</div>`;
  const pips = document.createElement("div");
  pips.className = "pp-pips";
  for (let i = 1; i <= PANIC_ZONES; i++) {
    const d = document.createElement("i");
    d.className = i < p.z || (i === p.z && p.done) ? "ok" : i === p.z ? "now" : i === PANIC_ZONES ? "boss" : "";
    pips.append(d);
  }
  prog.append(pips);

  // 임무
  const ms = $("panic-mission");
  const pct = p.goal ? Math.min(1, p.got / p.goal) : 0;
  ms.innerHTML = `<div class="pm-t">임무 · ${MISSION_NAME[p.m]}</div><div class="pm-d">${MISSION_HELP[p.m]}</div>
    <div class="pm-c"><span>${p.got} / ${p.goal}</span><div class="pm-bar"><i style="width:${pct * 100}%"></i></div></div>
    ${p.m === "exit" || p.m === "collect" ? `<div class="pm-c"><span>남은 몬스터 ${s.remaining}</span><div class="pm-bar"><i style="width:${s.remaining ? 0 : 100}%;background:#3cff6a"></i></div></div>` : ""}`;

  // 가장자리 붉은 경고 (마지막 20초)
  const edge = $("panic-edge");
  const showEdge = settings.panicFx && !p.done && t <= 20 && t > 0;
  edge.classList.toggle("hidden", !showEdge);
  edge.classList.toggle("fast", t <= 10);
  document.body.classList.toggle("panic-shake", settings.panicFx && !p.done && t <= 3 && t > 0);

  // 배경음악은 남은 시간이 줄수록 빨라짐
  if (!p.done) bgm.tempoMul = 1 + (1 - ratio) * 0.45;

  // 효과음: 20초에 경고 사이렌, 그 뒤 1초마다 째깍
  if (!p.done && t > 0) {
    const sec = Math.ceil(t);
    if (t <= 20 && !alarmed) {
      alarmed = true;
      sfx.alarm();
    } else if (sec !== lastSec && sec <= 19 && alarmed) {
      sfx.tick(sec <= 10);
    }
    lastSec = sec;
  }
}

/** 구역 돌파: COMPLETE! (최종 구역 제외 — 서버가 최종 구역엔 안 보냄) */
export function panicComplete(zone: number, time: number) {
  if (doneShown) return;
  doneShown = true;
  document.body.classList.remove("panic-shake");
  $("panic-edge").classList.add("hidden");
  const c = $("panic-complete");
  c.innerHTML = `<div class="pc-word">COMPLETE!</div><div class="pc-sub">ZONE ${zone} 돌파 · ${time.toFixed(1)}초</div>`;
  c.classList.remove("hidden", "play");
  void c.offsetWidth;
  c.classList.add("play");
  sfx.complete();
  setTimeout(() => c.classList.add("hidden"), 2300);
}

/** 게임 끝 */
export function panicEnd(win: boolean) {
  // 재도전하면 구역 1 배너가 다시 나오게
  lastZone = 0;
  $("panic-banner").classList.add("hidden");
  document.body.classList.remove("panic-shake");
  $("panic-edge").classList.add("hidden");
  if (win) sfx.fanfare();
  else sfx.timeOver();
}
