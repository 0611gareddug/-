import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClassId } from "../shared/classes";
import type { TeamFlag } from "../shared/cards";
import type { DescentEntry, Leaderboards, RecordEntry, Records, SaveSummary } from "../shared/protocol";
import { ownedCosmetics, type CosSlot, type Equip } from "../shared/achievements";
import { tierOf } from "../shared/skins";

// 서버 전체 공용 데이터: 저장, 8월드 클리어 명단, 스피드런 순위, 도감
const FILE = process.env.STORE_FILE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/store.json");
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

interface Codex {
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

interface StoreData {
  saves: SaveData[];
  clears: string[];
  records: Leaderboards;
  codex: Record<string, Codex>;
  profiles: Record<string, Profile>;
}

const emptyRecords = (): Records => ({ total: [], worlds: {}, descent: [], panic: [] });

let data: StoreData = { saves: [], clears: [], records: {}, codex: {}, profiles: {} };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): StoreData {
  const records: Leaderboards = {};
  for (const [k, v] of Object.entries(raw.records ?? {})) {
    // 예전 형식(normal = 지금의 쉬움)을 옮겨 옴. 예전 하드코어(×1.7)는 기준이 달라 버림
    if (k === "normal") records["1"] = v as Records;
    else if (/^[1-4]$/.test(k)) records[k] = v as Records;
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

try {
  data = normalize(JSON.parse(fs.readFileSync(FILE, "utf8")));
} catch {
  // 첫 실행이면 파일이 없음
}

// ---------- v1.6 기록 영구 저장 (Upstash Redis, 무료) ----------
// Render 무료 서버는 재시작·업데이트 때 파일이 지워지므로, 환경변수가 있으면 클라우드에도 저장
const CLOUD_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const CLOUD_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CLOUD_KEY = process.env.STORE_KEY ?? "yangbaechu-store";
export const cloudOn = !!(CLOUD_URL && CLOUD_TOKEN);

/** 서버 시작 때 클라우드에서 기록을 불러옴 (없으면 파일 그대로) */
export async function initStore() {
  if (!cloudOn) return;
  try {
    const r = await fetch(`${CLOUD_URL}/get/${CLOUD_KEY}`, { headers: { Authorization: `Bearer ${CLOUD_TOKEN}` } });
    const j = (await r.json()) as { result?: string | null };
    if (j.result) {
      data = normalize(JSON.parse(j.result));
      console.log("클라우드에서 기록을 불러왔어요");
    } else {
      console.log("클라우드에 기록이 아직 없어요 (처음 시작)");
    }
  } catch (e) {
    console.log("클라우드 기록 불러오기 실패, 파일 기록으로 시작:", (e as Error).message);
  }
}

let cloudTimer: NodeJS.Timeout | null = null;
async function pushCloud() {
  if (!cloudOn) return;
  try {
    await fetch(`${CLOUD_URL}/set/${CLOUD_KEY}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CLOUD_TOKEN}` },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.log("클라우드 저장 실패 (다음에 다시 시도):", (e as Error).message);
  }
}

/** 종료 직전(업데이트·재시작) 바로 저장 */
export async function flushStore() {
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  await pushCloud();
}

let writeTimer: NodeJS.Timeout | null = null;
function persist() {
  if (!writeTimer) {
    writeTimer = setTimeout(() => {
      writeTimer = null;
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(data, null, 1));
      } catch {
        // 파일을 못 써도 클라우드엔 저장
      }
    }, 200);
  }
  // 클라우드는 20초에 한 번만 (무료 사용량 아끼기)
  if (cloudOn && !cloudTimer) {
    cloudTimer = setTimeout(() => { cloudTimer = null; void pushCloud(); }, 20_000);
  }
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
  for (const n of names) if (!data.clears.includes(norm(n))) data.clears.push(norm(n));
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
  persist();
}

export function codexKill(name: string, kind: string) {
  const c = codexOf(name);
  c.kills[kind] = (c.kills[kind] ?? 0) + 1;
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
  persist();
  return true;
}

export function bumpCounter(name: string, key: string, n = 1): number {
  const p = getProfile(name);
  p.counters[key] = (p.counters[key] ?? 0) + n;
  persist();
  return p.counters[key];
}

export function addW1Class(name: string, cls: string): number {
  const p = getProfile(name);
  if (!p.w1Classes.includes(cls)) {
    p.w1Classes.push(cls);
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
  persist();
  return { total: p.mastery[cls], before: tierOf(before), after: tierOf(p.mastery[cls]) };
}

/** v1.7 직업 스킨 고르기 (열린 단계까지만, -1 = 기본) */
export function setSkin(name: string, cls: string, idx: number) {
  const p = getProfile(name);
  if (idx < 0) delete p.skins[cls];
  else if (idx < tierOf(p.mastery[cls] ?? 0) && idx < 5) p.skins[cls] = idx;
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
  persist();
  return { ...p.equip };
}
