// v1.9 모바일(터치) 조작 개편
//  - 왼쪽 아무 곳이나 누르면 그 자리에 생기는 조이스틱
//  - 스킬: 설정에서 '끌어서 조준'(누른 채 끌면 범위가 보이고 떼면 시전, 그냥 탭은 자동) / '자동 조준'(탭하면 바로)
//  - 버튼마다 위치 · 크기 · 투명도를 '버튼 배치 편집'에서 바꿀 수 있음 (기기에 저장)
import { CLASSES, SKILL_UNLOCK } from "../shared/classes";
import type { SnapPlayer } from "../shared/protocol";
import { saveSettings, settings } from "./settings";

export const isTouchDevice = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);

export interface TouchActions {
  /** 조이스틱 방향 (-1~1) · 공격 버튼 */
  move(mx: number, my: number): void;
  attack(on: boolean): void;
  dash(): void;
  /** 자동 조준 시전 */
  cast(slot: number): void;
  /** 끌어서 조준: 시작 · 방향(dx,dy: 손가락이 움직인 화면 픽셀, 0이면 자동 대상) · 끝(취소면 false) */
  aimStart(slot: number): boolean;
  aimMove(slot: number, dx: number, dy: number, pull: number): void;
  aimEnd(slot: number, fire: boolean): void;
  interact(): void;
  ready(): void;
  chat(): void;
  menu(): void;
  /** 내 상태 (쿨타임·레벨 표시용) */
  me(): SnapPlayer | null;
}

/** 버튼 id → 이름 · 기본 지름(px) */
const CONTROLS: Record<string, { name: string; size: number }> = {
  stick: { name: "조이스틱", size: 124 },
  atk: { name: "공격", size: 86 },
  dash: { name: "대시", size: 58 },
  s1: { name: "스킬 1", size: 50 },
  s2: { name: "스킬 2", size: 50 },
  s3: { name: "스킬 3", size: 50 },
  s4: { name: "스킬 4", size: 50 },
  s5: { name: "각성기", size: 50 },
  e: { name: "E (상호작용)", size: 42 },
  ready: { name: "준비", size: 42 },
  chat: { name: "채팅", size: 42 },
  menu: { name: "메뉴", size: 42 },
};

/** 기본 배치: 화면 가장자리에서의 거리(px)로 정한 뒤 지금 화면 크기의 비율로 바꿈 */
function defaultPos(id: string, w: number, h: number): { x: number; y: number } {
  const fromBR = (r: number, b: number) => ({ x: (w - r) / w, y: (h - b) / h });
  const fromTR = (r: number, t: number) => ({ x: (w - r) / w, y: t / h });
  // 공격 버튼 둘레로 스킬이 반원 모양으로
  const ax = 74, ay = 80;
  const arc = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return fromBR(ax - Math.cos(a) * r, ay - Math.sin(a) * r);
  };
  switch (id) {
    case "stick": return { x: 96 / w, y: (h - 96) / h };
    case "atk": return fromBR(ax, ay);
    case "dash": return arc(162, 104);
    case "s1": return arc(198, 112);
    case "s2": return arc(228, 114);
    case "s3": return arc(258, 114);
    case "s4": return arc(288, 112);
    case "s5": return arc(243, 172);
    case "menu": return fromTR(30, 28);
    case "chat": return fromTR(80, 28);
    case "ready": return fromTR(130, 28);
    case "e": return fromTR(180, 28);
  }
  return { x: 0.5, y: 0.5 };
}

function layoutOf(id: string) {
  const w = window.innerWidth, h = window.innerHeight;
  const saved = settings.touchLayout[id];
  const def = defaultPos(id, w, h);
  return { x: saved?.x ?? def.x, y: saved?.y ?? def.y, s: saved?.s ?? 1, o: saved?.o ?? 0.85 };
}

let applyAll: () => void = () => {};
let editorOpen: () => void = () => {};

/** 설정 메뉴에서: 버튼 배치 편집 열기 / 기본값으로 */
export function openTouchEditor() {
  editorOpen();
}
export function resetTouchLayout() {
  settings.touchLayout = {};
  saveSettings();
  applyAll();
}

export function initTouch(a: TouchActions) {
  if (!isTouchDevice()) return;
  document.body.classList.add("touch");
  const ui = document.createElement("div");
  ui.id = "touch-ui";
  ui.innerHTML = `
    <div class="tc-zone"></div>
    <div class="tc-ctl tc-stick" data-id="stick"><div class="tc-knob"></div></div>
    <button class="tc-ctl tc-btn tc-atk" data-id="atk">공격</button>
    <button class="tc-ctl tc-btn tc-dash" data-id="dash">대시</button>
    ${[1, 2, 3, 4, 5].map((i) => `<button class="tc-ctl tc-btn tc-skill" data-id="s${i}"><svg viewBox="0 0 36 36"><circle class="ring" cx="18" cy="18" r="16" pathLength="100"/></svg><b>${i}</b><span></span><i></i></button>`).join("")}
    <button class="tc-ctl tc-small tc-e" data-id="e">E</button>
    <button class="tc-ctl tc-small tc-ready" data-id="ready">준비</button>
    <button class="tc-ctl tc-small tc-chat" data-id="chat">💬</button>
    <button class="tc-ctl tc-small tc-menu" data-id="menu">☰</button>
    <div class="tc-cancel">여기서 떼면 취소</div>`;
  document.body.append(ui);
  const ctl = (id: string) => ui.querySelector(`[data-id="${id}"]`) as HTMLElement;

  // ---------- 배치 적용 ----------
  const apply = (id: string) => {
    const el = ctl(id);
    const l = layoutOf(id);
    const size = CONTROLS[id].size * l.s;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${l.x * 100}%`;
    el.style.top = `${l.y * 100}%`;
    el.style.opacity = String(l.o);
  };
  applyAll = () => { for (const id of Object.keys(CONTROLS)) apply(id); };
  applyAll();
  window.addEventListener("resize", () => applyAll());

  let editing = false;

  // ---------- 조이스틱 (왼쪽 아무 곳이나) ----------
  const zone = ui.querySelector(".tc-zone") as HTMLElement;
  const stick = ctl("stick");
  const knob = stick.querySelector(".tc-knob") as HTMLElement;
  let stickId: number | null = null;
  let cx = 0, cy = 0;
  const stickR = () => (CONTROLS.stick.size * layoutOf("stick").s) / 2 - 10;
  const setStick = (dx: number, dy: number) => {
    const R = stickR();
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    a.move(d < 8 ? 0 : (dx * k) / R, d < 8 ? 0 : (dy * k) / R);
  };
  const stickDown = (e: PointerEvent) => {
    if (editing || stickId !== null) return;
    stickId = e.pointerId;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 일부 기기 */ }
    // 누른 자리에 조이스틱이 나타남
    cx = e.clientX; cy = e.clientY;
    stick.style.left = `${cx}px`;
    stick.style.top = `${cy}px`;
    stick.classList.add("live");
    setStick(0, 0);
    e.preventDefault();
  };
  const stickMove = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    setStick(e.clientX - cx, e.clientY - cy);
  };
  const stickUp = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = "";
    stick.classList.remove("live");
    apply("stick");
    a.move(0, 0);
  };
  for (const el of [zone, stick]) {
    el.addEventListener("pointerdown", stickDown);
    el.addEventListener("pointermove", stickMove);
    el.addEventListener("pointerup", stickUp);
    el.addEventListener("pointercancel", stickUp);
  }

  // ---------- 버튼 ----------
  const press = (el: HTMLElement, down: () => void, up?: () => void) => {
    el.addEventListener("pointerdown", (e) => {
      if (editing) return;
      e.preventDefault();
      el.classList.add("on");
      down();
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
      el.addEventListener(ev, () => {
        if (!el.classList.contains("on")) return;
        el.classList.remove("on");
        up?.();
      });
    }
  };
  press(ctl("atk"), () => a.attack(true), () => a.attack(false));
  press(ctl("dash"), () => a.dash());
  press(ctl("e"), () => a.interact());
  press(ctl("ready"), () => a.ready());
  press(ctl("chat"), () => a.chat());
  press(ctl("menu"), () => a.menu());

  // ---------- 스킬 (끌어서 조준 / 자동) ----------
  const cancel = ui.querySelector(".tc-cancel") as HTMLElement;
  const overCancel = (x: number, y: number) => {
    const r = cancel.getBoundingClientRect();
    return x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10;
  };
  for (let i = 0; i < 5; i++) {
    const b = ctl(`s${i + 1}`);
    let pid: number | null = null;
    let sx = 0, sy = 0;
    let dragging = false;
    b.addEventListener("pointerdown", (e) => {
      if (editing || pid !== null) return;
      e.preventDefault();
      const me = a.me();
      if (!me) return;
      const sk = CLASSES[me.cls].skills[i];
      // 자동 조준이거나, 내 주변·누르는 스킬이면 탭하자마자 시전
      if (settings.touchAim === "auto" || sk.aim === "self" || sk.aim === "passive") {
        b.classList.add("on");
        a.cast(i);
        setTimeout(() => b.classList.remove("on"), 120);
        return;
      }
      if (!a.aimStart(i)) return;
      pid = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* 일부 기기 */ }
      sx = e.clientX; sy = e.clientY;
      dragging = false;
      b.classList.add("on");
      ui.classList.add("aiming");
      a.aimMove(i, 0, 0, 0);
    });
    b.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d > 14) dragging = true;
      cancel.classList.toggle("hot", overCancel(e.clientX, e.clientY));
      a.aimMove(i, dragging ? dx : 0, dragging ? dy : 0, Math.min(1, d / 110));
    });
    const end = (e: PointerEvent, ok: boolean) => {
      if (e.pointerId !== pid) return;
      pid = null;
      b.classList.remove("on");
      ui.classList.remove("aiming");
      cancel.classList.remove("hot");
      a.aimEnd(i, ok && !overCancel(e.clientX, e.clientY));
    };
    b.addEventListener("pointerup", (e) => end(e, true));
    b.addEventListener("pointercancel", (e) => end(e, false));
  }

  // 스킬 버튼: 이름 · 잠김 · 쿨타임 링
  const maxCd: number[] = [1, 1, 1, 1, 1];
  setInterval(() => {
    const me = a.me();
    if (!me) return;
    const def = CLASSES[me.cls];
    if (me.cdm) me.cdm.forEach((v, i) => { if (v > 0) maxCd[i] = v; });
    for (let i = 0; i < 5; i++) {
      const b = ctl(`s${i + 1}`);
      const sk = def.skills[i];
      const locked = me.lv < SKILL_UNLOCK[i];
      const passive = sk.aim === "passive";
      b.classList.toggle("locked", locked);
      b.classList.toggle("passive", passive);
      (b.querySelector("span") as HTMLElement).textContent = locked ? `Lv${SKILL_UNLOCK[i]}` : sk.name.replace("각성: ", "").slice(0, 4);
      const cd = me.cds?.[i] ?? 0;
      const cooling = !locked && !passive && cd > 0;
      b.classList.toggle("cool", cooling);
      (b.querySelector("i") as HTMLElement).textContent = cooling ? (cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1)) : "";
      const ring = b.querySelector(".ring") as SVGCircleElement;
      ring.style.strokeDashoffset = String(cooling ? 100 * Math.min(1, cd / Math.max(0.1, maxCd[i])) : 0);
    }
  }, 120);

  // ---------- 버튼 배치 편집 ----------
  const panel = document.createElement("div");
  panel.className = "tc-editor";
  panel.innerHTML = `
    <div class="te-title">버튼 배치 편집 <span class="muted">— 버튼을 끌어서 옮기고, 눌러서 고른 뒤 크기·투명도 조절</span></div>
    <div class="te-sel">고른 버튼: <b>없음</b></div>
    <label>크기 <input type="range" class="te-size" min="50" max="170" step="5" value="100"><span class="te-sv">100%</span></label>
    <label>투명도 <input type="range" class="te-op" min="20" max="100" step="5" value="85"><span class="te-ov">85%</span></label>
    <div class="te-btns"><button class="btn small te-move">창 위/아래로</button><button class="btn small te-reset">기본값으로</button><button class="btn small primary te-done">완료</button></div>`;
  document.body.append(panel);
  let sel: string | null = null;
  const size = panel.querySelector(".te-size") as HTMLInputElement;
  const op = panel.querySelector(".te-op") as HTMLInputElement;
  const showSel = () => {
    for (const el of ui.querySelectorAll(".tc-ctl")) el.classList.toggle("sel", (el as HTMLElement).dataset.id === sel);
    (panel.querySelector(".te-sel b") as HTMLElement).textContent = sel ? CONTROLS[sel].name : "없음";
    const l = sel ? layoutOf(sel) : null;
    size.disabled = op.disabled = !l;
    size.value = String(Math.round((l?.s ?? 1) * 100));
    op.value = String(Math.round((l?.o ?? 0.85) * 100));
    (panel.querySelector(".te-sv") as HTMLElement).textContent = `${size.value}%`;
    (panel.querySelector(".te-ov") as HTMLElement).textContent = `${op.value}%`;
  };
  const store = (id: string, patch: Partial<{ x: number; y: number; s: number; o: number }>) => {
    settings.touchLayout[id] = { ...layoutOf(id), ...patch };
    saveSettings();
    apply(id);
  };
  size.oninput = () => { if (sel) store(sel, { s: Number(size.value) / 100 }); showSel(); };
  op.oninput = () => { if (sel) store(sel, { o: Number(op.value) / 100 }); showSel(); };
  (panel.querySelector(".te-move") as HTMLElement).onclick = () => document.body.classList.toggle("te-bottom");
  (panel.querySelector(".te-reset") as HTMLElement).onclick = () => { resetTouchLayout(); showSel(); };
  (panel.querySelector(".te-done") as HTMLElement).onclick = () => {
    editing = false;
    sel = null;
    document.body.classList.remove("tc-editing");
    showSel();
  };
  // 편집 중엔 버튼을 끌어서 옮김
  for (const el of ui.querySelectorAll<HTMLElement>(".tc-ctl")) {
    let pid: number | null = null;
    let ox = 0, oy = 0;
    el.addEventListener("pointerdown", (e) => {
      if (!editing) return;
      e.preventDefault();
      e.stopPropagation();
      pid = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* 일부 기기 */ }
      const r = el.getBoundingClientRect();
      ox = e.clientX - (r.left + r.width / 2);
      oy = e.clientY - (r.top + r.height / 2);
      sel = el.dataset.id ?? null;
      showSel();
    }, true);
    el.addEventListener("pointermove", (e) => {
      if (!editing || e.pointerId !== pid) return;
      const id = el.dataset.id!;
      const x = Math.max(0.02, Math.min(0.98, (e.clientX - ox) / window.innerWidth));
      const y = Math.max(0.03, Math.min(0.97, (e.clientY - oy) / window.innerHeight));
      store(id, { x, y });
    }, true);
    const up = (e: PointerEvent) => { if (e.pointerId === pid) pid = null; };
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
  }
  editorOpen = () => {
    editing = true;
    sel = null;
    document.body.classList.add("tc-editing");
    showSel();
  };
}
