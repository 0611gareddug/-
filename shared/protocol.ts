import type { CosSlot, Equip } from "./achievements";
import type { ClassId, ProjKind } from "./classes";

// ---------- 클라이언트 → 서버 ----------
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** 조준 지점 (월드 좌표) */
  ax: number;
  ay: number;
  atk: boolean;
  /** 누를 때마다 1씩 증가 — 패킷이 섞여도 입력이 사라지지 않게 */
  dashSeq: number;
}

export type GachaTier = "common" | "rare" | "legend";

/** 커맨드 패널 (닉네임 GRD + 서버 인증) */
export type CmdAction =
  | { a: "goto"; world: number; round: number }
  | { a: "rest" }
  | { a: "treasure" }
  | { a: "next" }
  | { a: "gold"; n: number }
  | { a: "level"; n: number }
  | { a: "card"; id: string }
  | { a: "teamcard"; id: string }
  | { a: "god" }
  | { a: "killall" }
  | { a: "nocd" }
  | { a: "heal" }
  | { a: "spawn"; kind: string; n: number; elite: boolean }
  /** 다른 플레이어 대상 */
  | { a: "player"; target: number; op: "revive" | "heal" | "gold" | "card" | "bring" | "goto"; n?: number; id?: string }
  /** 게임 속도 (0 = 일시정지) */
  | { a: "speed"; mul: number }
  /** PANIC 구역 이동 / 남은 시간 더하기 */
  | { a: "zone"; n: number }
  | { a: "ptime"; n: number }
  /** 무한 하강 층 이동 */
  | { a: "floor"; n: number }
  | { a: "trial" }
  /** 내 능력치 직접 조절 */
  | { a: "stat"; key: "atk" | "hp" | "speed" | "atkspd"; v: number }
  | { a: "class"; cls: string }
  /** 관전·투명 모드 (몬스터가 못 보고 벽 통과) */
  | { a: "spectate" }
  /** 모두에게 공지 (큰 타이틀) */
  | { a: "notice"; text: string }
  /** 업적·코스튬 전부 해금 */
  | { a: "unlockall" };

export type GambleGame = "oddeven" | "roulette" | "card";

export type ClientMsg =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  | { t: "class"; cls: ClassId }
  | { t: "ready"; ready: boolean }
  | { t: "mode"; speedrun: boolean; gem?: boolean; descent?: boolean; panic?: boolean; diff: number }
  | { t: "useSave"; id: string | null }
  | { t: "start" }
  | { t: "input"; input: InputState }
  | { t: "cast"; slot: number; x: number; y: number }
  | { t: "pick"; idx: number }
  /** 자유 채팅 */
  | { t: "chat"; text: string }
  /** 로비 축구 입력 */
  | { t: "lobbyInput"; up: boolean; down: boolean; left: boolean; right: boolean; dash: number }
  /** v1.0 특성 찍기 (갈래 0~2) */
  | { t: "talent"; branch: number }
  | { t: "vote"; idx: number }
  | { t: "buy"; tier: GachaTier }
  | { t: "gamble"; game: GambleGame; bet: number; pick?: "odd" | "even" }
  | { t: "trial"; yes: boolean }
  | { t: "restReady"; ready: boolean }
  | { t: "cmd"; cmd: CmdAction }
  | { t: "codex" }
  | { t: "profile" }
  | { t: "equip"; slot: CosSlot; id: string | null }
  | { t: "toLobby" }
  /** 결과 화면 재도전 (방장: 같은 모드로 바로 다시 시작) */
  | { t: "retry" }
  /** 설정의 명령어 칸 입력 (서버가 확인) */
  | { t: "auth"; code: string }
  /** 메뉴를 열면 (혼자일 때만) 일시정지 */
  | { t: "menuPause"; on: boolean }
  /** 게임에서 혼자 빠져 로비로 (개발자 도구 감지 시) */
  | { t: "leaveGame" }
  /** 보물방: 가까운 상자 열기 */
  | { t: "chest" };

// ---------- 서버 → 클라이언트 ----------
export interface LobbyPlayer {
  id: number;
  name: string;
  color: number;
  cls: ClassId;
  ready: boolean;
  host: boolean;
  cos: Equip;
}

export interface SnapPlayer {
  id: number;
  n: string;
  c: number;
  cls: ClassId;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  ghost: boolean;
  rv: number;
  a: number;
  dash: boolean;
  /** 남은 대시 횟수 */
  dc: number;
  f: boolean;
  at: boolean;
  spd: number;
  /** 스킬 1~4 남은 쿨타임 */
  cds: number[];
  /** 스킬 최대 쿨타임 — 바뀔 때만 옴 */
  cdm?: number[];
  lv: number;
  xp: number;
  xpn: number;
  gold: number;
  shield: number;
  giant: boolean;
  size: number;
  rev: boolean;
  shake: boolean;
  /** 상태이상: s 둔화, p 독, b 화상 */
  ps: string;
  /** 커맨드: 무적 */
  god?: boolean;
  /** 연결 끊김 */
  off?: boolean;
  /** 커맨드 관전·투명 모드 */
  spec?: boolean;
  /** 바드 용기의 노래 연주 중 */
  song?: boolean;
  /** 연속 처치 콤보 (3 이상일 때만) */
  cb?: number;
  /** 코스튬 (모자·망토·발자국·레벨업 이펙트·칭호) — 바뀔 때만 옴 */
  cos?: Equip;
  /** 카드 — 바뀔 때만 옴 (없으면 이전 값 그대로) */
  cards?: string[];
}

/** shared/worlds.ts 의 MONSTERS 키 */
export type MonsterKind = string;

export type EliteAbility = "rage" | "split" | "guard" | "vamp" | "blink";

export interface SnapMonster {
  id: number;
  k: MonsterKind;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  /** 기본값(false·0·"")이면 안 옴 → 클라이언트가 채움 */
  f?: boolean;
  sp?: number;
  /** 상태이상: s 기절, z 빙결, r 속박, w 둔화, p 독 */
  st?: string;
  /** 돌진 준비 중이면 돌진 방향 */
  ca?: number;
  /** 엘리트 특수 능력 */
  el?: EliteAbility;
  /** 허수아비: 최근 5초 DPS / 누적 피해 */
  dps?: number;
  tot?: number;
}

export interface SnapProj {
  id: number;
  k: ProjKind;
  x: number;
  y: number;
  a: number;
}

export interface SnapPet {
  id: number;
  owner: number;
  x: number;
  y: number;
  /** clone: 꼬마 분신 / spider: 엔지니어 거미 포탑 / laser: 레이저 포탑 */
  k: "clone" | "spider" | "laser" | "turret" | "drone" | "shadow" | "ghost";
  /** 조준 방향 */
  a: number;
}

export type ZoneKind = "fire" | "rain" | "meteor" | "slam" | "ice" | "trap" | "blackhole" | "hammer" | "strike" | "oil" | "discord" | "mine" | "curse";

export interface SnapZone {
  id: number;
  k: ZoneKind;
  x: number;
  y: number;
  r: number;
  /** 진행도 0~1 */
  t: number;
}

export type FxKind =
  | "hit" | "die" | "swing" | "boom" | "heal" | "taunt" | "revive" | "pdie"
  | "coin" | "lvl" | "num" | "zap" | "line" | "spin" | "shield" | "blink" | "crit" | "fall" | "bolt"
  | "flame" | "food" | "sleep" | "encore";

export interface Fx {
  k: FxKind;
  x: number;
  y: number;
  a?: number;
  r?: number;
  /** coin: 받는 플레이어 id */
  to?: number;
  /** zap/line/blink: 끝점들 [x1,y1,x2,y2...] */
  pts?: number[];
}

/**
 * 몬스터 전송 형식 (v1.2 최적화): [id, x, y, hp] 또는 [id, x, y, hp, 추가정보]
 * 추가정보(k·mhp·el)는 처음 보일 때 · 2초마다 전체 · 값이 있을 때만 (f·sp·st·ca·dps·tot)
 */
export type MonWire = [number, number, number, number] | [number, number, number, number, Partial<SnapMonster>];
/** 투사체 전송 형식: [id, x, y, 각도×100] 또는 [..., 종류] (종류는 처음 보일 때만) */
export type ProjWire = [number, number, number, number] | [number, number, number, number, ProjKind];
export interface SnapshotWire extends Omit<Snapshot, "monsters" | "projs"> {
  mz: MonWire[];
  pz: ProjWire[];
}

export interface Snapshot {
  t: "snap";
  time: number;
  players: SnapPlayer[];
  monsters: SnapMonster[];
  projs: SnapProj[];
  pets: SnapPet[];
  zones: SnapZone[];
  fx: Fx[];
  portal: { x: number; y: number } | null;
  remaining: number;
  /** 보석 쟁탈전: 보석 위치 / 든 사람 / 점수 */
  gem?: { x: number; y: number; holder: number | null };
  scores?: Record<number, number>;
  /** 스피드런 타이머 (초) */
  timer?: number;
  /** 모래폭풍 세기 0~1 */
  storm?: number;
  /** 시련의 방 남은 시간 (초) */
  trialT?: number;
  /** 보물방 남은 시간 (초) */
  treasureT?: number;
  /** 이 판에서 커맨드를 썼는지 */
  cmd?: boolean;
  /** PANIC 모드 상태 */
  panic?: PanicSnap;
}

export type PanicMission = "kill" | "exit" | "collect" | "boss";
export const PANIC_ZONES = 16;
export const PANIC_TIME = 90;
export const MISSION_NAME: Record<PanicMission, string> = {
  kill: "몬스터 전멸",
  exit: "탈출구 도달",
  collect: "열쇠 수집",
  boss: "최종 보스 처치",
};

export interface PanicSnap {
  /** 현재 구역 (1부터) */
  z: number;
  m: PanicMission;
  /** 남은 시간 (초) */
  t: number;
  /** 임무 진행도 / 목표 */
  got: number;
  goal: number;
  /** 열쇠 위치 [x, y, ...] */
  keys: number[];
  /** 구역 돌파 연출 중 */
  done?: boolean;
}

export type StageKind = "battle" | "boss" | "rest" | "arena" | "trial" | "treasure";

export interface StageInfo {
  kind: StageKind;
  world: number;
  round: number;
  name: string;
  w: number;
  h: number;
  tiles: string;
  /** 휴게소 가판대 위치 */
  market?: { x: number; y: number };
  /** 휴게소 가판대 종류 */
  stall?: "market" | "gambler";
  /** 무한 하강: 층 / 변형 규칙 */
  floor?: number;
  mod?: DescentMod;
  /** 보물방 상자 위치 (내용물은 사람마다 다름) */
  chests?: { x: number; y: number }[];
  /** PANIC: 구역 / 임무 */
  zone?: number;
  mission?: PanicMission;
}

export type DescentMod = "dark" | "double" | "elite" | "noheal" | "fast";
export const MOD_NAME: Record<DescentMod, string> = {
  dark: "어둠 (주변만 보임)",
  double: "몬스터 2배",
  elite: "엘리트 대량 출몰",
  noheal: "회복 없음",
  fast: "몬스터가 빠름",
};

export interface DescentEntry {
  names: string[];
  floor: number;
  at: number;
}

export interface RecordEntry {
  names: string[];
  /** 초 */
  time: number;
  at: number;
}

export interface Records {
  total: RecordEntry[];
  worlds: Record<number, RecordEntry[]>;
  /** 무한 하강 최고 층수 */
  descent?: DescentEntry[];
  /** PANIC 클리어 시간 */
  panic?: RecordEntry[];
}

/** 난이도("1"~"4")별 순위 */
export type Leaderboards = Record<string, Records>;

export interface SaveSummary {
  id: string;
  world: number;
  diff: number;
  names: string[];
  savedAt: number;
}

export interface RoomMode {
  speedrun: boolean;
  /** 보석 쟁탈전 (원정과 별개 모드) */
  gem?: boolean;
  /** 무한 하강 모드 */
  descent?: boolean;
  /** PANIC (협동 타임어택) */
  panic?: boolean;
  /** 난이도 1 쉬움 · 2 보통 · 3 어려움 · 4 하드코어 */
  diff: number;
}

/** 스피드런 각자 경주 현황 */
export interface RaceEntry {
  id: number;
  name: string;
  color: number;
  world: number;
  round: number;
  time: number;
  state: "run" | "win" | "dead";
}

export const GEM_GOAL = 100;

/** 로비 축구 마당 크기 / 골대 입구 반폭 */
export const LOBBY_FIELD_W = 360;
export const LOBBY_FIELD_H = 150;
export const LOBBY_GOAL_HALF = 28;

/** 판 끝 시상식 */
export interface Award {
  name: string;
  desc: string;
  id: number;
  value: string;
}

export interface ResultRow {
  id: number;
  name: string;
  color: number;
  cls: ClassId;
  level: number;
  kills: number;
  dmgDealt: number;
  dmgTaken: number;
  revives: number;
  deaths: number;
  title: string;
  /** 보석 쟁탈전 점수 */
  score?: number;
  /** 끝났을 때 체력 상태 (PANIC 결과 화면) */
  hp?: number;
  mhp?: number;
  ghost?: boolean;
}

export type ServerMsg =
  | { t: "joined"; id: number; code: string }
  | { t: "error"; msg: string }
  | {
      t: "lobby";
      code: string;
      players: LobbyPlayer[];
      mode: RoomMode;
      canHardcore: boolean;
      saves: SaveSummary[];
      saveId: string | null;
      records: Leaderboards;
    }
  | { t: "stage"; stage: StageInfo }
  | SnapshotWire
  | { t: "cards"; options: string[]; time: number; left: number }
  /** 자유 채팅 (같은 방 전원) */
  | { t: "chat"; id: number; name: string; color: number; text: string }
  /** 로비 축구: p = [id, x, y, 대시중, 팀], b = 공 위치, s = 점수, g = 방금 골 넣은 팀(-1 없음) */
  | { t: "lobbyPlay"; p: [number, number, number, number, number][]; b: [number, number]; s: [number, number]; g: number }
  /** v1.0 특성 트리 상태 (갈래 id → 단계, 남은 포인트) */
  | { t: "talents"; tal: Record<string, number>; pts: number }
  | { t: "cardStatus"; picked: number[]; waiting: number[] }
  | { t: "vote"; options: string[]; time: number }
  | { t: "voteStatus"; votes: Record<number, number> }
  | { t: "voteResult"; card: string }
  | { t: "trialVote"; time: number }
  | { t: "trialStatus"; yes: number[]; no: number[]; total: number }
  | { t: "trialEnd"; success: boolean; go?: boolean }
  | { t: "restStatus"; ready: number[]; total: number; time: number }
  | { t: "gacha"; card: string | null; tier: GachaTier; gold: number }
  | {
      t: "gambleResult";
      game: GambleGame;
      bet: number;
      /** 홀/짝, 룰렛 칸(1~6), 카드 결과 */
      outcome: string;
      /** 돈 변화량 */
      delta: number;
      gold: number;
      card?: string;
    }
  | { t: "codex"; cards: string[]; kills: Record<string, number> }
  | { t: "profile"; ach: string[]; equip: Equip; counters: Record<string, number> }
  | { t: "achievement"; id: string }
  | { t: "toast"; msg: string }
  /** 커맨드 패널 권한 (서버가 허락했을 때만) */
  | { t: "admin"; ok: boolean }
  /** 화면 가운데 큰 타이틀 (이벤트 이름 + 설명) */
  | { t: "title"; name: string; desc: string; color?: string }
  /** 보물방 상자 결과 (나에게만) — gold: 얻은 돈, mimic이면 lost: 잃은 돈 */
  | { t: "chestResult"; idx: number; mimic: boolean; gold: number; lost: number; total: number }
  /** PANIC 구역 돌파 (COMPLETE! 연출) */
  | { t: "panicComplete"; zone: number; time: number }
  | { t: "race"; entries: RaceEntry[]; over: boolean }
  | {
      t: "result";
      win: boolean;
      rows: ResultRow[];
      /** 판 끝 시상식 */
      awards?: Award[];
      world: number;
      mode: RoomMode;
      /** 스피드런 기록 (초) */
      time?: number;
      /** 월드별 구간 기록 (누적 초) */
      splits?: number[];
      /** 완주 기록 순위 (1부터) */
      rank?: number;
      saved?: boolean;
      /** 커맨드를 써서 기록이 남지 않음 */
      cmd?: boolean;
      /** 무한 하강: 도달한 층 / 층수 순위 */
      floor?: number;
      floorRank?: number;
      /** PANIC: 도달 구역 / 구역별 걸린 시간 / 클리어 시간 순위 / 이번 판에 얻은 업적 */
      zone?: number;
      zoneTimes?: number[];
      panicRank?: number;
      rewards?: string[];
      /** PANIC: 시간 초과로 실패 */
      timeUp?: boolean;
    };
