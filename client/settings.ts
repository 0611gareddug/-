// 이 브라우저에 저장되는 설정 (편의 기능 켜고 끄기, 키 설정)

export type KeyAction = "skill1" | "skill2" | "skill3" | "skill4" | "dash" | "market" | "ready" | "menu";

export interface Settings {
  aimBar: boolean;
  skillRange: boolean;
  chargeLine: boolean;
  /** hold: 누른 채 클릭 / instant: 누르면 바로 마우스 위치에 시전 */
  castMode: "hold" | "instant";
  keys: Record<KeyAction, string>;
  /** 소리 켜기 / 전체 · 효과음 · 배경음악 음량 0~1 */
  sound: boolean;
  volume: number;
  sfxVolume: number;
  bgmVolume: number;
  /** 배경음악 (기본 꺼짐) */
  bgmOn: boolean;
  /** PANIC 화면 가장자리 붉은 경고·흔들림 */
  panicFx: boolean;
}

export const KEY_LABEL: Record<KeyAction, string> = {
  skill1: "스킬 1",
  skill2: "스킬 2",
  skill3: "스킬 3",
  skill4: "스킬 4",
  dash: "대시",
  market: "암시장·도박꾼 열기",
  ready: "휴게소 준비 완료",
  menu: "메뉴",
};

const DEFAULTS: Settings = {
  aimBar: true,
  skillRange: true,
  chargeLine: true,
  castMode: "hold",
  keys: { skill1: "1", skill2: "2", skill3: "3", skill4: "4", dash: " ", market: "e", ready: "enter", menu: "tab" },
  sound: true,
  volume: 0.9,
  sfxVolume: 1,
  bgmVolume: 0.6,
  bgmOn: false,
  panicFx: true,
};

const STORAGE_KEY = "osin-settings";

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Settings>;
    return { ...DEFAULTS, ...raw, keys: { ...DEFAULTS.keys, ...(raw.keys ?? {}) } };
  } catch {
    return { ...DEFAULTS, keys: { ...DEFAULTS.keys } };
  }
}

export const settings: Settings = load();

const listeners: (() => void)[] = [];
export function onSettingsChange(fn: () => void) {
  listeners.push(fn);
}

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장이 막혀 있어도 이번 접속 동안은 적용됨
  }
  for (const fn of listeners) fn();
}

export function resetKeys() {
  settings.keys = { ...DEFAULTS.keys };
  saveSettings();
}

/** KeyboardEvent → 설정에 쓰는 키 이름 (소문자, 한글 자판이면 영문 위치로) */
export function keyName(e: KeyboardEvent): string {
  if (e.code?.startsWith("Key")) return e.code.slice(3).toLowerCase();
  if (e.code?.startsWith("Digit")) return e.code.slice(5);
  return e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
}

export function displayKey(k: string) {
  if (k === " ") return "Space";
  if (k === "enter") return "Enter";
  if (k === "tab") return "Tab";
  if (k === "shift") return "Shift";
  if (k === "escape") return "Esc";
  return k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1);
}

export function isKey(e: KeyboardEvent, action: KeyAction) {
  return keyName(e) === settings.keys[action];
}
