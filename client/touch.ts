// v1.6 모바일(터치) 조작: 왼쪽 가상 조이스틱 + 오른쪽 공격·대시·스킬 버튼
// 조준은 자동 (가장 가까운 적), 스킬도 가까운 적 위치에 바로 시전
import { CLASSES, SKILL_UNLOCK } from "../shared/classes";
import type { SnapPlayer } from "../shared/protocol";

export const isTouchDevice = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);

export interface TouchActions {
  /** 조이스틱 방향 (-1~1) · 공격 버튼 */
  move(mx: number, my: number): void;
  attack(on: boolean): void;
  dash(): void;
  cast(slot: number): void;
  interact(): void;
  ready(): void;
  chat(): void;
  menu(): void;
  /** 내 상태 (쿨타임·레벨 표시용) */
  me(): SnapPlayer | null;
}

export function initTouch(a: TouchActions) {
  if (!isTouchDevice()) return;
  document.body.classList.add("touch");
  const ui = document.createElement("div");
  ui.id = "touch-ui";
  ui.innerHTML = `
    <div class="tc-stick"><div class="tc-knob"></div></div>
    <div class="tc-right">
      <div class="tc-skills"></div>
      <button class="tc-btn tc-dash">대시</button>
      <button class="tc-btn tc-atk">공격</button>
    </div>
    <div class="tc-top">
      <button class="tc-small tc-e">E</button>
      <button class="tc-small tc-ready">준비</button>
      <button class="tc-small tc-chat">💬</button>
      <button class="tc-small tc-menu">☰</button>
    </div>`;
  document.body.append(ui);

  // ---------- 조이스틱 ----------
  const stick = ui.querySelector(".tc-stick") as HTMLElement;
  const knob = ui.querySelector(".tc-knob") as HTMLElement;
  let stickId: number | null = null;
  const R = 46;
  const setStick = (dx: number, dy: number) => {
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    a.move(d < 8 ? 0 : (dx * k) / R, d < 8 ? 0 : (dy * k) / R);
  };
  stick.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId;
    try { stick.setPointerCapture(e.pointerId); } catch { /* 일부 기기는 지원 안 함 */ }
    const r = stick.getBoundingClientRect();
    setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    e.preventDefault();
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    const r = stick.getBoundingClientRect();
    setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  });
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = "";
    a.move(0, 0);
  };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  // ---------- 버튼 ----------
  const hold = (el: HTMLElement, on: (v: boolean) => void) => {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.classList.add("on"); on(true); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, () => { el.classList.remove("on"); on(false); });
  };
  const tap = (el: HTMLElement, fn: () => void) => {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.classList.add("on"); fn(); });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, () => el.classList.remove("on"));
  };
  hold(ui.querySelector(".tc-atk") as HTMLElement, (v) => a.attack(v));
  tap(ui.querySelector(".tc-dash") as HTMLElement, () => a.dash());
  tap(ui.querySelector(".tc-e") as HTMLElement, () => a.interact());
  tap(ui.querySelector(".tc-ready") as HTMLElement, () => a.ready());
  tap(ui.querySelector(".tc-chat") as HTMLElement, () => a.chat());
  tap(ui.querySelector(".tc-menu") as HTMLElement, () => a.menu());

  // 스킬 버튼 5개 (해금 레벨·쿨타임 표시)
  const skills = ui.querySelector(".tc-skills") as HTMLElement;
  const btns: HTMLButtonElement[] = [];
  for (let i = 0; i < 5; i++) {
    const b = document.createElement("button");
    b.className = "tc-btn tc-skill";
    b.innerHTML = `<b>${i + 1}</b><span></span><i></i>`;
    tap(b, () => a.cast(i));
    skills.append(b);
    btns.push(b);
  }
  setInterval(() => {
    const me = a.me();
    if (!me) return;
    const def = CLASSES[me.cls];
    btns.forEach((b, i) => {
      const sk = def.skills[i];
      const locked = me.lv < SKILL_UNLOCK[i];
      const passive = sk.aim === "passive";
      b.classList.toggle("locked", locked);
      b.classList.toggle("passive", passive);
      (b.querySelector("span") as HTMLElement).textContent = locked ? `Lv${SKILL_UNLOCK[i]}` : sk.name.replace("각성: ", "");
      const cd = me.cds?.[i] ?? 0;
      (b.querySelector("i") as HTMLElement).textContent = !locked && !passive && cd > 0 ? (cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1)) : "";
    });
  }, 150);
}
