// 개발자 도구 방어 (배포 화면에서만)
// - F12 / Ctrl+Shift+I·J·C / Ctrl+U / 우클릭 '검사' 를 막고, 누르기만 해도 경고
// - 개발자 도구가 열린 걸 여러 방법으로 감지하면: 게임 중이면 로비로 튕기고, 로비면 게임에서 나감
// (비밀번호·커맨드 권한은 서버만 확인하므로 화면 코드에는 비밀 정보가 없음)

let onDetect: () => void = () => {};
let fired = false;
let lastFire = 0;

function trip() {
  const now = Date.now();
  if (fired && now - lastFire < 3000) return;
  fired = true;
  lastFire = now;
  onDetect();
}

const BLOCK = (e: KeyboardEvent) => {
  const k = e.key.toLowerCase();
  const devKeys = e.key === "F12"
    || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c", "k"].includes(k))
    || ((e.ctrlKey || e.metaKey) && e.altKey && ["i", "j", "c"].includes(k))
    || ((e.ctrlKey || e.metaKey) && k === "u");
  if (devKeys) {
    e.preventDefault();
    e.stopPropagation();
    trip();
  }
};

/** 1) 창 크기 차이: 옆이나 아래에 붙은 개발자 도구
 *  (확대/축소·윈도우 배율 때문에 잘못 걸리지 않게, 처음 크기 차이와 배율을 기준으로 비교) */
let baseDpr = window.devicePixelRatio || 1;
let baseGapW = -1;
let baseGapH = -1;
function gaps() {
  const z = (window.devicePixelRatio || 1) / baseDpr;
  return [window.outerWidth - window.innerWidth * z, window.outerHeight - window.innerHeight * z];
}
function sizeCheck() {
  if (window.outerWidth === 0 || document.hidden) return false;
  const [w, h] = gaps();
  if (baseGapW < 0) { baseGapW = w; baseGapH = h; return false; }
  return w - baseGapW > 180 || h - baseGapH > 180;
}

/** 2) debugger 멈춤 시간: 개발자 도구가 열려 있을 때만 debugger 에서 멈춤 */
function debuggerCheck() {
  const t = performance.now();
  (function () { /* 감지용 */ }).constructor("debugger")();
  return performance.now() - t > 300;
}

/** v1.5 잘못 걸림 방지: 한 번 렉으로 멈춘 건 무시하고, 연달아 2번 걸릴 때만 튕김 */
let sizeStrikes = 0;
let dbgStrikes = 0;

export function initGuard(handler: () => void) {
  // 개발 중(vite dev)에는 끔
  if (import.meta.env.DEV) return;
  onDetect = handler;
  window.addEventListener("keydown", BLOCK, true);
  window.addEventListener("contextmenu", (e) => e.preventDefault(), true);
  baseDpr = window.devicePixelRatio || 1;
  const run = () => {
    sizeStrikes = sizeCheck() ? sizeStrikes + 1 : 0;
    if (sizeStrikes >= 2) trip();
  };
  window.addEventListener("resize", run);
  setInterval(run, 700);
  // debugger 검사는 조금 느리게 (멈춤이 길면 열린 것)
  setInterval(() => {
    if (document.hidden) return;
    dbgStrikes = debuggerCheck() ? dbgStrikes + 1 : 0;
    if (dbgStrikes >= 2) trip();
  }, 1500);
  run();
}
