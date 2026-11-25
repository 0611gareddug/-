import type { ClassId } from "../shared/classes";
import type { TeamFlag } from "../shared/cards";
import type { DescentEntry, Leaderboards, RecordEntry, Records, SaveSummary } from "../shared/protocol";
import { ownedCosmetics, type CosSlot, type Equip } from "../shared/achievements";
import { tierOf } from "../shared/skins";

// v1.9: 서버 없이 브라우저 안에서 돌아감. 데이터는 메모리에 두고, 바뀌면 persist 핸들러(→ localStorage)로 넘김
// 저장, 8월드 클리어 명단, 순위, 도감, 프로필 (닉네임별)
const MAX_RECORDS = 20;

export interface SavedPlayer {
  name: string;
  cls: ClassId;
  level: number;
  xp: number;
  gold: number;
  cards: string[];
  /** v1.0 특성 트리 */
  tal?: Record<string, number>;
  /** v1.6 대장간 강화 카드 */
  up?: string[];
}

export interface SaveData {
  id: string;
  hostName: string;
  /** 이어서 시작할 월드 */
  world: number;
  diff: number;
  players: SavedPlayer[];
  team: Record<TeamFlag, number>;
  savedAt: number;
}

export interface Codex {
  cards: string[];
  kills: Record<string, number>;
}

export interface Profile {
  ach: string[];
  counters: Record<string, number>;
  /** 월드 1을 깬 직업들 (만능 용사 업적) */
  w1Classes: string[];
  equip: Equip;
  /** v1.7 직업별 숙련도 · 고른 스킨 번호 */
  mastery: Record<string, number>;
  skins: Record<string, number>;
}

export interface StoreData {
  saves: SaveData[];
  clears: string[];
  records: Leaderboards;
  codex: Record<string, Codex>;
  profiles: Record<string, Profile>;
}

const emptyRecords = (): Records => ({ total: [], total8: [], worlds: {}, descent: [], panic: [] });

let data: StoreData = { saves: [], clears: [], records: {}, codex: {}, profiles: {} };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): StoreData {
  const records: Leaderboards = {};
  for (const [k, v] of Object.entries(raw.records ?? {})) {
    // 예전 형식(normal = 지금의 쉬움)을 옮겨 옴. 예전 하드코어(×1.7)는 기준이 달라 버림
    if (k === "normal") records["1"] = v as Records;
    else if (/^[1-4]$/.test(k)) records[k] = v as Records;
  }
  // v1.8: 원정이 9월드가 되어, 예전 8월드 완주 기록은 total8로 옮겨 보존
  for (const r of Object.values(records)) {
    if (r.total8 === undefined) { r.total8 = r.total ?? []; r.total = []; }
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saves: (raw.saves ?? []).map((s: any) => ({ ...s, diff: s.diff ?? (s.hardcore ? 4 : 1) })),
    clears: raw.clears ?? [],
    records,
    codex: raw.codex ?? {},
    profiles: raw.profiles ?? {},
  };
}

/** 저장된 JSON(문자열·객체)으로 시작 */
export function loadStore(raw: unknown) {
  try {
    data = normalize(typeof raw === "string" ? JSON.parse(raw) : raw ?? {});
  } catch {
    data = normalize({});
  }
  dirty.clear();
}

/** 지금 데이터 전체 (localStorage 저장용) */
export function exportStore(): StoreData {
  return data;
}

let persistFn: ((d: StoreData) => void) | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
/** 데이터가 바뀌면 (0.5초 모아서) 호출될 함수 */
export function onPersist(fn: (d: StoreData) => void) {
  persistFn = fn;
}
function persist() {
  if (!persistFn || writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    persistFn?.(data);
  }, 500);
}

// ---------- v1.9 같이 하기: 참가자 기록 동기화 ----------
/** 닉네임 한 사람 몫의 기록 (참가자 브라우저에 저장) */
export interface Slice {
  profile?: Profile;
  codex?: Codex;
  clear?: boolean;
  records?: Leaderboards;
}
/** 기록이 바뀐 닉네임들 (방장이 참가자에게 보내 줌) */
const dirty = new Set<string>();
function mark(name: string) {
  dirty.add(norm(name));
}
export function takeDirty(): string[] {
  const out = [...dirty];
  dirty.clear();
  return out;
}

/** 이 사람이 들어간 순위 기록만 */
function recordsOf(name: string): Leaderboards {
  const n = norm(name);
  const has = (e: { names: string[] }) => e.names.some((x) => norm(x) === n);
  const out: Leaderboards = {};
  for (const [d, r] of Object.entries(data.records)) {
    out[d] = {
      total: r.total.filter(has),
      total8: (r.total8 ?? []).filter(has),
      worlds: Object.fromEntries(Object.entries(r.worlds).map(([w, l]) => [w, l.filter(has)])),
      descent: (r.descent ?? []).filter(has),
      panic: (r.panic ?? []).filter(has),
    };
  }
  return out;
}

export function sliceFor(name: string): Slice {
  return { profile: getProfile(name), codex: getCodex(name), clear: canHardcore(name), records: recordsOf(name) };
}

/** 다른 브라우저에서 온 한 사람 몫을 합침 (프로필·도감은 그쪽 것이 기준, 순위는 합침) */
export function mergeSlice(name: string, sl: Slice) {
  const n = norm(name);
  if (sl.profile && typeof sl.profile === "object") data.profiles[n] = sl.profile;
  getProfile(name);
  if (sl.codex && typeof sl.codex === "object") data.codex[n] = { cards: Array.isArray(sl.codex.cards) ? sl.codex.cards : [], kills: sl.codex.kills ?? {} };
  if (sl.clear && !data.clears.includes(n)) data.clears.push(n);
  for (const [d, r] of Object.entries(sl.records ?? {})) {
    if (!/^[1-4]$/.test(d)) continue;
    const board = (data.records[d] ??= emptyRecords());
    const same = (a: { at: number; names: string[] }, b: { at: number; names: string[] }) => a.at === b.at && a.names.join() === b.names.join();
    const merge = <T extends { at: number; names: string[] }>(list: T[], add: T[] | undefined, sort: (a: T, b: T) => number) => {
      for (const e of add ?? []) if (!list.some((o) => same(o, e))) list.push(e);
      list.sort(sort);
      list.splice(MAX_RECORDS);
    };
    const byTime = (a: RecordEntry, b: RecordEntry) => a.time - b.time;
    merge(board.total, r.total, byTime);
    merge((board.total8 ??= []), r.total8, byTime);
    merge((board.panic ??= []), r.panic, byTime);
    merge((board.descent ??= []), r.descent, (a, b) => b.floor - a.floor || a.at - b.at);
    for (const [w, l] of Object.entries(r.worlds ?? {})) merge((board.worlds[Number(w)] ??= []), l, byTime);
  }
  persist();
}

const norm = (n: string) => n.trim().toLowerCase();

// ---------- 저장 ----------
export function savesFor(name: string): SaveSummary[] {
  return data.saves
    .filter((s) => norm(s.hostName) === norm(name))
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((s) => ({ id: s.id, world: s.world, diff: s.diff, names: s.players.map((p) => p.name), savedAt: s.savedAt }));
}

export function getSave(id: string): SaveData | undefined {
  return data.saves.find((s) => s.id === id);
}

export function putSave(save: SaveData) {
  data.saves = data.saves.filter((s) => s.id !== save.id);
  data.saves.push(save);
  // 한 사람당 최근 저장 5개까지만
  const mine = data.saves.filter((s) => norm(s.hostName) === norm(save.hostName)).sort((a, b) => b.savedAt - a.savedAt);
  const drop = new Set(mine.slice(5).map((s) => s.id));
  data.saves = data.saves.filter((s) => !drop.has(s.id));
  persist();
}

export function deleteSave(id: string) {
  data.saves = data.saves.filter((s) => s.id !== id);
  persist();
}

// ---------- 하드코어 해금 ----------
export function addClears(names: string[]) {
  for (const n of names) { if (!data.clears.includes(norm(n))) data.clears.push(norm(n)); mark(n); }
  persist();
}

export function canHardcore(name: string) {
  return data.clears.includes(norm(name));
}

// ---------- 순위 (난이도별) ----------
export function getRecords(): Leaderboards {
  const out: Leaderboards = {};
  for (const d of ["1", "2", "3", "4"]) out[d] = data.records[d] ?? emptyRecords();
  return out;
}

/** 기록을 넣고 순위(1부터)를 돌려줌. world 가 0이면 완주 기록 */
export function addRecord(diff: number, world: number, names: string[], time: number): number {
  const board = (data.records[String(diff)] ??= emptyRecords());
  const list = world === 0 ? board.total : (board.worlds[world] ??= []);
  const entry: RecordEntry = { names, time: Math.round(time * 100) / 100, at: Date.now() };
  list.push(entry);
  list.sort((a, b) => a.time - b.time);
  const rank = list.indexOf(entry) + 1;
  list.splice(MAX_RECORDS);
  for (const n of names) mark(n);
  persist();
  return rank;
}

/** 무한 하강 최고 층수 기록. 순위(1부터)를 돌려줌 */
export function addDescent(diff: number, names: string[], floor: number): number {
  const board = (data.records[String(diff)] ??= emptyRecords());
  const list = (board.descent ??= []);
  const entry: DescentEntry = { names, floor, at: Date.now() };
  list.push(entry);
  list.sort((a, b) => b.floor - a.floor || a.at - b.at);
  const rank = list.indexOf(entry) + 1;
  list.splice(MAX_RECORDS);
  for (const n of names) mark(n);
  persist();
  return rank;
}

/** PANIC 클리어 시간 기록. 순위(1부터)를 돌려줌 */
export function addPanic(diff: number, names: string[], time: number): number {
  const board = (data.records[String(diff)] ??= emptyRecords());
  const list = (board.panic ??= []);
  const entry: RecordEntry = { names, time: Math.round(time * 100) / 100, at: Date.now() };
  list.push(entry);
  list.sort((a, b) => a.time - b.time);
  const rank = list.indexOf(entry) + 1;
  list.splice(MAX_RECORDS);
  for (const n of names) mark(n);
  persist();
  return rank;
}

// ---------- 도감 (닉네임별 수집 기록) ----------
function codexOf(name: string) {
  return (data.codex[norm(name)] ??= { cards: [], kills: {} });
}

export function getCodex(name: string): Codex {
  return codexOf(name);
}

export function codexCard(name: string, cardId: string) {
  const c = codexOf(name);
  if (c.cards.includes(cardId)) return;
  c.cards.push(cardId);
  mark(name);
  persist();
}

export function codexKill(name: string, kind: string) {
  const c = codexOf(name);
  c.kills[kind] = (c.kills[kind] ?? 0) + 1;
  mark(name);
  persist();
}

// ---------- 프로필: 업적 · 누적 기록 · 코스튬 ----------
export function getProfile(name: string): Profile {
  const p = (data.profiles[norm(name)] ??= { ach: [], counters: {}, w1Classes: [], equip: {}, mastery: {}, skins: {} });
  p.mastery ??= {};
  p.skins ??= {};
  p.ach ??= [];
  p.counters ??= {};
  p.w1Classes ??= [];
  p.equip ??= {};
  return p;
}

/** 새로 달성했으면 true */
export function unlockAch(name: string, id: string): boolean {
  const p = getProfile(name);
  if (p.ach.includes(id)) return false;
  p.ach.push(id);
  mark(name);
  persist();
  return true;
}

export function bumpCounter(name: string, key: string, n = 1): number {
  const p = getProfile(name);
  p.counters[key] = (p.counters[key] ?? 0) + n;
  mark(name);
  persist();
  return p.counters[key];
}

export function addW1Class(name: string, cls: string): number {
  const p = getProfile(name);
  if (!p.w1Classes.includes(cls)) {
    p.w1Classes.push(cls);
    mark(name);
    persist();
  }
  return p.w1Classes.length;
}

/** 가진 코스튬만 장착 가능. id 가 null 이면 벗기 */
/** v1.7 숙련도 더하기 → 이전·이후 마일스톤 */
export function addMastery(name: string, cls: string, n: number) {
  const p = getProfile(name);
  const before = p.mastery[cls] ?? 0;
  p.mastery[cls] = before + Math.max(0, Math.round(n));
  mark(name);
  persist();
  return { total: p.mastery[cls], before: tierOf(before), after: tierOf(p.mastery[cls]) };
}

/** v1.7 직업 스킨 고르기 (열린 단계까지만, -1 = 기본) */
export function setSkin(name: string, cls: string, idx: number) {
  const p = getProfile(name);
  if (idx < 0) delete p.skins[cls];
  else if (idx < tierOf(p.mastery[cls] ?? 0) && idx < 5) p.skins[cls] = idx;
  mark(name);
  persist();
}

/** 지금 직업에 맞는 스킨까지 붙인 코스튬 */
export function cosFor(name: string, cls: string): Equip {
  const p = getProfile(name);
  const sk = p.skins[cls];
  return sk === undefined ? { ...p.equip } : { ...p.equip, sk };
}

export function setEquip(name: string, slot: CosSlot, id: string | null): Equip {
  const p = getProfile(name);
  if (id === null) delete p.equip[slot];
  else if (ownedCosmetics(p.ach).some((r) => r.slot === slot && r.id === id)) p.equip[slot] = id;
  mark(name);
  persist();
  return { ...p.equip };
}
