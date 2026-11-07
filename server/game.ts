import {
  CARD_PICK_TIME, DASH_COOLDOWN, DASH_SPEED, DASH_TIME, DT, GHOST_SPEED, HIT_INVULN, MARKET_RANGE,
  PLAYER_RADIUS, PORTAL_RANGE, REST_MAX_TIME, REVIVE_HP, REVIVE_RANGE, REVIVE_TIME, ROUND_HEAL, ROUNDS_PER_WORLD,
  VOTE_TIME, xpToNext,
} from "../shared/constants";
import { CLASSES, CLASS_IDS, SKILL_UNLOCK, type ClassId, type ProjKind } from "../shared/classes";
import {
  CARDS, CARD_BY_ID, GACHA_PRICE, baseStats, type CardCtx, type Rarity, type Stats, type TeamFlag,
} from "../shared/cards";
import { isWallAt, moveCircle, tileAt } from "../shared/collide";
import type {
  Award, CmdAction, DescentMod, EliteAbility, PanicMission, Fx, GachaTier, GambleGame, InputState, ResultRow, RoomMode, ServerMsg, SnapZone,
  StageInfo, StageKind, ZoneKind,
} from "../shared/protocol";
import {
  MONSTERS, WORLDS, WORLD_COUNT, diffDmgMul, diffHpMul, specialMonsters, worldDmgMul, worldHpMul, worldRewardMul,
  type BossAbility, type MonsterDef, type StatusEffect,
} from "../shared/worlds";
import { GEM_GOAL, PANIC_TIME, PANIC_ZONES } from "../shared/protocol";
import { TALENTS, TALENT_TIERS, talentPoints, tier } from "../shared/talents";
import { generateMap, generateRestMap, generateTreasureMap, randomFloorPoint, type GenMap } from "./mapgen";
import { castSkill } from "./skills";
import {
  addClears, addDescent, addPanic, addRecord, addW1Class, bumpCounter, codexCard, codexKill, deleteSave, getCodex, getProfile, putSave,
  unlockAch, type SaveData,
} from "./store";
import type { Equip } from "../shared/achievements";

export interface Participant {
  id: number;
  name: string;
  color: number;
  cls: ClassId;
  cos?: Equip;
}

/** 도감 100% 판정에 쓰는 몬스터 목록 */
const CODEX_MONSTERS = Object.keys(MONSTERS).filter((k) => !["pvp", "dummy", "chest"].includes(k));

export interface Player extends Participant {
  /** 구멍 낙하 피해 쿨타임 */
  fallCd?: number;
  /** 커맨드 관전·투명 모드 */
  spec?: boolean;
  /** 엔지니어 거대 로봇 / 수리 드론 */
  robotT?: number;
  droneT?: number;
  /** 닌자 천벌 돌진 (무적 + 보스 빼고 즉사) */
  lethalDash?: boolean;
  /** 연속 처치 콤보 (2.5초 안에 다음 처치) */
  combo?: number;
  comboT?: number;
  /** 시상식 기록: 유령으로 있던 시간 / 채팅 수 */
  ghostTime?: number;
  chats?: number;
  /** v1.0 특성: 갈래 id → 찍은 단계 수 / 찍은 총 개수 */
  tal: Record<string, number>;
  talN?: number;
  /** 특성 효과용 상태 */
  feastFast?: boolean;
  regenT?: number;
  blink2?: boolean;
  shieldBy?: number;
  songFastT?: number;
  /** 닌자 은신 / 다음 공격 2배 */
  stealthT?: number;
  nextDouble?: boolean;
  /** 바드 용기의 노래 버프 (평타 피해 +20%) */
  songBuffT?: number;
  /** 연결이 끊긴 상태 (무적 · 몬스터가 무시 · 진행 조건에서 빠짐) */
  dc?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  safeX: number;
  safeY: number;
  hp: number;
  stats: Stats;
  cards: string[];
  ghost: boolean;
  reviveProg: number;
  input: InputState;
  lastDashSeq: number;
  aim: number;
  atkCd: number;
  dashLeft: number;
  dashRecharge: number;
  dashT: number;
  dashDx: number;
  dashDy: number;
  dashSpeed: number;
  charging: boolean;
  chargeHit: Set<number>;
  fireDropT: number;
  invulnT: number;
  flashT: number;
  atkAnimT: number;
  tauntT: number;
  tauntR: number;
  giantT: number;
  shield: number;
  shieldT: number;
  buffAtkT: number;
  castHasteT: number;
  /** 요리사: 매운 요리(공속) / 대잔치(받는 피해 감소), 바드: 노래 켜짐 */
  spicyT: number;
  feastT: number;
  songOn: boolean;
  surgeT: number;
  atkCount: number;
  revClock: number;
  idleT: number;
  slowT: number;
  poisonT: number;
  burnT: number;
  /** 커맨드: 무적 / 쿨타임 없음 */
  god: boolean;
  nocd: boolean;
  cds: number[];
  level: number;
  xp: number;
  gold: number;
  options: string[] | null;
  pendingPicks: number;
  skipPicks: number;
  vote: number;
  restReady: boolean;
  kills: number;
  dmgDealt: number;
  dmgTaken: number;
  revives: number;
  deaths: number;
  /** 보석 쟁탈전: 부활 대기 / 점수 */
  respawnT: number;
  score: number;
  /** 이번 월드에서 쓰러진 횟수 (무사고 업적) */
  worldDeaths: number;
}

export interface Monster {
  /** 네크로맨서 저주: 받는 피해 +30% (사신의 손길이면 +50%) */
  curseT?: number;
  curseBoost?: boolean;
  /** v1.0 새 패턴: 자폭 심지 · 바라보는 방향 · 연속 사격 · 나선 탄막 · 소환한 주인 · 광폭화 연출 */
  fuseT?: number;
  faceA?: number;
  burstN?: number;
  burstT?: number;
  spiralT?: number;
  spiralA?: number;
  summonBy?: number;
  enrageDone?: boolean;
  /** 저주를 건 네크로 (특성 '전염') / 자장가 '악몽' */
  curseBy?: number;
  nightmare?: number;
  id: number;
  kind: string;
  def: MonsterDef;
  /** 보석 쟁탈전 판정용: 이 몬스터가 대신하는 플레이어 */
  owner?: number;
  /** 엘리트 특수 능력 */
  elite?: EliteAbility;
  blinkCd: number;
  /** 바드 자장가: 잠든 상태 (맞으면 깸) */
  sleep?: boolean;
  x: number;
  y: number;
  r: number;
  hp: number;
  mhp: number;
  speed: number;
  dmg: number;
  gold: number;
  xp: number;
  atkCd: number;
  spawnT: number;
  flashT: number;
  busyT: number;
  strafe: number;
  dmgBy: Map<number, number>;
  stunT: number;
  frozenT: number;
  rootT: number;
  slowT: number;
  poisonT: number;
  poisonDps: number;
  poisonOwner: number;
  poisonTick: number;
  /** 돌진 준비(예고) 남은 시간 */
  windT: number;
  /** 돌진 중 남은 시간 */
  rushT: number;
  rushA: number;
  rushSpeed: number;
  abilityCd: number;
  abilityIdx: number;
  log: { t: number; d: number }[];
  total: number;
}

export interface Proj {
  id: number;
  kind: ProjKind;
  fromPlayer: boolean;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  pierce: number;
  bounce: number;
  explode: number;
  hitR: number;
  skill: boolean;
  onHit: boolean;
  traveled: number;
  effect?: StatusEffect;
  /** 바드 음표: 맞으면 다른 적에게 튕기는 남은 횟수 */
  hops?: number;
  /** 닌자 특성 '부메랑': 끝에서 되돌아옴 */
  boomer?: boolean;
  hit: Set<number>;
}

export interface Zone {
  id: number;
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
  ownerId: number;
  dmg: number;
  elapsed: number;
  dur: number;
  tickT: number;
  stun: number;
  /** 터져서 없어진 장판 (기름 점화 등) */
  gone?: boolean;
}

interface Pet {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  cd: number;
  /** clone: 꼬마 분신 카드 / spider: 엔지니어 거미 포탑 / turret: 설치 포탑 / drone: 수리 드론 / shadow: 닌자 분신 / ghost: 네크로 유령 */
  kind: "clone" | "spider" | "turret" | "drone" | "shadow" | "ghost";
  aim: number;
  /** 남은 시간 (없으면 영구) */
  life?: number;
}

export interface DmgOpts {
  skill?: boolean;
  onHit?: boolean;
  raw?: boolean;
  noCrit?: boolean;
  /** 반드시 치명타 */
  crit?: boolean;
}

export interface GameOptions {
  mode: RoomMode;
  save?: SaveData;
  saveId: string;
  hostName: string;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
/** 직업 기본 능력치 (직업 밸런스 배율 포함) */
function classStats(cls: ClassId): Stats {
  const def = CLASSES[cls];
  const s = baseStats(def.hp);
  s.skillDmgMul *= def.skillDmg ?? 1;
  s.dmgTakenMul *= def.dmgTaken ?? 1;
  // 고정값 카드 환산용 기준
  s.baseAtk = def.attack.dmg;
  s.baseSpeed = def.speed;
  s.baseAtkCd = def.attack.cd;
  return s;
}

/** 스킬 쿨타임: 배율 + 고정 감소 (최소 원래의 40%) */
export function skillCd(base: number, s: Stats, slot = -1) {
  if (base <= 0) return 0;
  return Math.max(base * 0.4, base * s.skillCdMul - s.skillCdFlat - (s.slotCd[slot] ?? 0));
}

/** v1.0: 특성 트리가 있는 모드의 기본 피해 너프 (평타 -10%, 스킬 합계 -15%) */
const BASIC_NERF = 0.9;
const SKILL_NERF = 0.85;
/** 특성을 1개 찍을 때마다 피해 ×0.95 (밸런스용 · 화면·패치노트엔 안 보임) */
const TALENT_TAX = 0.95;

/** v0.9.2: 몬스터 체력 배율 */
const MONSTER_HP_MUL = 1.6;
/** 스냅샷은 2틱에 한 번 (15Hz) — 화면은 보간으로 부드럽게 */
const SNAP_EVERY = 2;

/** 보물방 제한 시간 / 상자를 열 수 있는 거리 */
const TREASURE_TIME = 40;
const CHEST_RANGE = 26;

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const PRANKS = [
  { id: "fast", msg: "신의 장난: 모두 빨라져라!" },
  { id: "reverse", msg: "신의 장난: 거꾸로!" },
  { id: "gold", msg: "신의 장난: 황금비! 모두 돈 획득" },
  { id: "heal", msg: "신의 장난: 몬스터 회복!" },
] as const;

export class Game {
  players = new Map<number, Player>();
  monsters: Monster[] = [];
  projs: Proj[] = [];
  zones: Zone[] = [];
  fx: Fx[] = [];
  private pets: Pet[] = [];
  private nextIdN = 1;
  world = 1;
  round = 0;
  map!: GenMap;
  private stageKind: StageKind = "battle";
  private market: { x: number; y: number } | null = null;
  private phase: "play" | "cards" | "vote" | "trialvote" | "rest" | "complete" | "end" | "done" = "play";
  private stall: "market" | "gambler" = "market";
  /** 시련의 방 */
  private trialT = 0;
  private trialWaveT = 0;
  private trialVotes = new Map<number, boolean>();
  /** 이 판에서 커맨드를 썼으면 기록·저장·해금·도감에 안 남김 */
  cmdUsed = false;
  private cmdNotified = new Set<number>();
  private portalOpen = false;
  private timer = 0;
  private won = false;
  private time = 0;
  private voteOptions: string[] = [];
  private team: Record<TeamFlag, number> = { monsterMul: 1, rarityUp: 0, treasure: 0, extraOption: 0 };
  /** 보스를 잡고 들어온 휴게소면 끝나고 다음 월드로 */
  private worldCleared = false;
  private runTime = 0;
  private splits: number[] = [];
  private stormClock = 0;
  private prankClock = 0;
  private prankFastT = 0;
  private prankRevT = 0;
  private mode: RoomMode;
  private gemMode = false;
  /** 무한 하강 */
  private descent = false;
  /** v1.0 특성 트리 사용 여부 */
  talentsOn = false;
  private shattering = false;
  floor = 0;
  private mod: DescentMod | null = null;
  // PANIC: 16구역 × 90초 협동 타임어택
  private panic = false;
  zone = 0;
  private panicT = 0;
  private mission: PanicMission = "kill";
  private keys: { x: number; y: number }[] = [];
  private keyGoal = 0;
  private keyGot = 0;
  private panicGoal = 0;
  private panicHazardT = 0;
  private timeUp = false;
  private zoneTimes: number[] = [];
  /** 이번 판에 새로 얻은 업적 (결과 화면 보상 표시) */
  private runAch = new Set<string>();
  private lastStage: StageInfo | null = null;
  // 보물방: 상자 위치 + 사람마다 따로 섞인 내용물 (-1 = 미믹)
  private chests: { x: number; y: number }[] = [];
  private chestLoot = new Map<number, { loot: number[]; opened: number[]; busted: boolean }>();
  private treasureT = 0;
  private gem: { x: number; y: number; holder: number | null } = { x: 0, y: 0, holder: null };
  private gemWinner = 0;
  private saveId: string;
  private hostName: string;
  private lastSaved = false;

  constructor(
    participants: Participant[],
    private broadcast: (m: ServerMsg) => void,
    private sendTo: (id: number, m: ServerMsg) => void,
    private onEnd: () => void,
    opts: GameOptions = { mode: { speedrun: false, diff: 1 }, saveId: "test", hostName: "" },
  ) {
    this.mode = opts.mode;
    this.saveId = opts.saveId;
    this.hostName = opts.hostName;
    for (const p of participants) {
      const def = CLASSES[p.cls];
      this.players.set(p.id, {
        ...p,
        x: 0, y: 0, vx: 0, vy: 0, safeX: 0, safeY: 0, hp: def.hp, stats: classStats(p.cls), cards: [],
        ghost: false, reviveProg: 0,
        input: { up: false, down: false, left: false, right: false, ax: 0, ay: 0, atk: false, dashSeq: 0 },
        lastDashSeq: 0, aim: 0, atkCd: 0, dashLeft: 1, dashRecharge: 0,
        dashT: 0, dashDx: 0, dashDy: 0, dashSpeed: DASH_SPEED, charging: false, chargeHit: new Set(),
        fireDropT: 0, invulnT: 0, flashT: 0, atkAnimT: 0, tauntT: 0, tauntR: 90, giantT: 0,
        shield: 0, shieldT: 0, buffAtkT: 0, castHasteT: 0, spicyT: 0, feastT: 0, songOn: false,
        surgeT: 0, atkCount: 0, revClock: 0, idleT: 0,
        slowT: 0, poisonT: 0, burnT: 0, god: false, nocd: false,
        cds: [0, 0, 0, 0], level: 1, xp: 0, gold: 0,
        options: null, pendingPicks: 0, skipPicks: 0, vote: -1, restReady: false,
        kills: 0, dmgDealt: 0, dmgTaken: 0, revives: 0, deaths: 0,
        respawnT: 0, score: 0, worldDeaths: 0, tal: {},
      });
    }
    // 특성 트리는 원정·무한 하강에서만 (보석 쟁탈전·PANIC·스피드런 제외)
    this.talentsOn = !opts.mode.gem && !opts.mode.panic && !opts.mode.speedrun;
    if (this.talentsOn) for (const p of this.players.values()) { p.stats = this.levelStats(p); p.hp = p.stats.maxHp; }
    if (opts.mode.gem) {
      this.startGemDraft();
      return;
    }
    if (opts.mode.panic) {
      this.panic = true;
      // 테스트용: START_ZONE=15 처럼 시작 구역 지정
      this.zone = Math.max(0, Math.min(PANIC_ZONES - 1, Number(process.env.START_ZONE ?? 1) - 1));
      this.nextRound();
      return;
    }
    if (opts.mode.descent) {
      this.descent = true;
      // 테스트용: START_FLOOR=29 처럼 시작 층 지정
      this.floor = Math.max(0, Number(process.env.START_FLOOR ?? 1) - 1);
      this.nextRound();
      return;
    }
    if (opts.save) this.restore(opts.save);
    // 테스트용: START_WORLD=5, START_ROUND=3 처럼 시작 지점 지정
    if (process.env.START_WORLD) this.world = Math.max(1, Math.min(WORLD_COUNT, Number(process.env.START_WORLD)));
    this.round = Math.max(0, Number(process.env.START_ROUND ?? 1) - 1);
    this.nextRound();
  }

  nextId() {
    return this.nextIdN++;
  }

  get isRest() {
    return this.phase === "rest";
  }

  private get worldDef() {
    return WORLDS[this.world - 1];
  }

  /** 적 강도 계산용 월드 값. 무한 하강은 층이 오를수록 끝없이 커짐 */
  private get powerWorld() {
    return this.descent ? 1 + this.floor * 0.3 : this.world;
  }

  private noopCtx(): CardCtx {
    return { healFull() {}, halfHp() {}, addXp() {}, grantRandom() {}, extraPicks() {}, skipPicks() {}, reroll() {}, team() {} };
  }

  /** 저장된 캐릭터 복구 (같은 닉네임) — 새로 온 사람은 팀 평균 레벨로 시작 */
  private restore(save: SaveData) {
    this.world = save.world;
    this.team = { ...save.team };
    const avg = Math.max(1, Math.round(save.players.reduce((a, s) => a + s.level, 0) / Math.max(1, save.players.length)));
    for (const p of this.players.values()) {
      const s = save.players.find((q) => q.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (s) {
        p.cls = s.cls;
        p.level = s.level;
        p.xp = s.xp;
        p.gold = s.gold;
        p.tal = { ...(s.tal ?? {}) };
        p.talN = Object.values(p.tal).reduce((a, b) => a + b, 0);
        p.stats = this.levelStats(p);
        for (const id of s.cards) {
          const c = CARD_BY_ID[id];
          if (!c) continue;
          c.apply(p.stats, this.noopCtx());
          p.cards.push(id);
        }
      } else {
        p.level = avg;
        p.stats = this.levelStats(p);
      }
      p.hp = p.stats.maxHp;
    }
  }

  // ---------- 업적 ----------
  /** 커맨드를 쓴 판은 업적이 안 남음 */
  private ach(p: Player, id: string) {
    if (this.cmdUsed || !unlockAch(p.name, id)) return;
    this.runAch.add(id);
    this.sendTo(p.id, { t: "achievement", id });
    if (getProfile(p.name).ach.length >= 25) this.ach(p, "ach25");
  }

  private achAll(id: string) {
    for (const p of this.players.values()) this.ach(p, id);
  }

  private checkRich(p: Player) {
    if (p.gold >= 1000) this.ach(p, "rich");
  }

  /** 코스튬 바꾸기 (게임 중이면 바로 보임) */
  setCos(id: number, cos: Equip) {
    const p = this.players.get(id);
    if (p) p.cos = { ...cos };
  }

  // ---------- 보석 쟁탈전 ----------
  /** 레벨 10으로 시작해 카드 5장을 드래프트 */
  private startGemDraft() {
    this.gemMode = true;
    this.world = 1 + Math.floor(Math.random() * WORLD_COUNT);
    for (const p of this.players.values()) {
      p.level = 10;
      p.stats = this.levelStats(p);
      p.hp = p.stats.maxHp;
    }
    this.phase = "cards";
    this.timer = CARD_PICK_TIME * 3;
    for (const p of this.players.values()) {
      p.pendingPicks = 5;
      this.offerNext(p);
    }
    this.sendCardStatus();
  }

  private startArena() {
    this.stageKind = "arena";
    this.phase = "play";
    this.map = generateMap(true);
    this.monsters = [];
    this.projs = [];
    this.zones = [];
    const cx = (this.map.w / 2) * 16;
    const cy = (this.map.h / 2) * 16;
    this.gem = { x: cx, y: cy, holder: null };
    const list = [...this.players.values()];
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2;
      p.x = cx + Math.cos(a) * 130;
      p.y = cy + Math.sin(a) * 90;
      p.hp = p.stats.maxHp;
      p.ghost = false;
      p.invulnT = 2;
      p.score = 0;
      p.cds = [0, 0, 0, 0];
      this.monsters.push(this.proxyFor(p));
    });
    this.broadcast({
      t: "stage",
      stage: {
        kind: "arena", world: this.world, round: 1, name: `보석 쟁탈전 · ${this.worldDef.name}`,
        w: this.map.w, h: this.map.h, tiles: this.map.tiles,
      },
    });
    this.broadcast({ t: "toast", msg: "가운데 보석을 먼저 주워라! 보석을 든 사람만 공격할 수 있어요" });
  }

  private proxyFor(p: Player): Monster {
    return {
      id: this.nextId(), kind: "pvp", def: MONSTERS.pvp, owner: p.id, x: p.x, y: p.y, r: PLAYER_RADIUS, hp: 1, mhp: 1,
      speed: 0, dmg: 0, gold: 0, xp: 0, atkCd: 0, spawnT: 0, flashT: 0, busyT: 0, strafe: 1, dmgBy: new Map(),
      stunT: 0, frozenT: 0, rootT: 0, slowT: 0, poisonT: 0, poisonDps: 0, poisonOwner: 0, poisonTick: 0,
      windT: 0, rushT: 0, rushA: 0, rushSpeed: 0, abilityCd: 0, abilityIdx: 0, log: [], total: 0, blinkCd: 0,
    };
  }

  /** 판정용 몬스터를 플레이어 위치에 맞추고, 걸린 제어 효과는 플레이어 둔화로 옮김 */
  private syncProxies() {
    for (const m of this.monsters) {
      if (m.kind !== "pvp") continue;
      const p = this.players.get(m.owner ?? -1);
      if (!p) continue;
      m.x = p.x;
      m.y = p.y;
      m.r = this.hitRadius(p);
      m.hp = p.ghost ? 0 : 1;
      if (m.stunT > 0 || m.frozenT > 0 || m.rootT > 0 || m.slowT > 0) p.slowT = Math.max(p.slowT, 0.5);
      m.stunT = m.frozenT = m.rootT = m.slowT = m.poisonT = 0;
    }
    this.monsters = this.monsters.filter((m) => m.kind !== "pvp" || this.players.has(m.owner ?? -1));
  }

  /** 보석을 든 사람이 끼어 있는 공격만 통함 */
  private canPvp(attacker: number, target: number) {
    return attacker !== target && (attacker === this.gem.holder || target === this.gem.holder);
  }

  private pvpDamage(m: Monster, base: number, p: Player, o: DmgOpts) {
    const target = this.players.get(m.owner ?? -1);
    if (!target || target.ghost || !this.canPvp(p.id, target.id)) return;
    let dmg = base;
    if (!o.raw) {
      dmg *= p.stats.atkMul;
      if (p.giantT > 0) dmg *= 1.5;
      if (p.buffAtkT > 0) dmg *= 1.2;
      if (p.stats.lowHpAtk && p.hp < p.stats.maxHp * 0.25 && !o.skill) dmg += p.stats.lowHpAtk;
      if (o.skill) dmg = dmg * p.stats.skillDmgMul + p.stats.skillFlat;
      if (this.moodyDown(p)) dmg *= 0.5;
    }
    const crit = !o.noCrit && Math.random() < p.stats.critChance;
    if (crit) dmg *= p.stats.critMul;
    const before = target.hp + target.shield;
    if (!this.hurtPlayer(target, dmg, true)) return;
    const dealt = Math.max(0, before - Math.max(0, target.hp) - target.shield);
    p.dmgDealt += dealt;
    if (p.stats.lifesteal > 0) p.hp = Math.min(p.stats.maxHp, p.hp + dealt * p.stats.lifesteal);
    this.fx.push({ k: crit ? "crit" : "hit", x: Math.round(target.x), y: Math.round(target.y), r: crit ? Math.round(dmg) : undefined });
    if (target.ghost) {
      p.kills++;
      target.respawnT = 3;
      if (this.gem.holder === target.id) {
        this.gem = { x: target.x, y: target.y, holder: null };
        this.broadcast({ t: "toast", msg: `${p.name}이(가) ${target.name}을(를) 쓰러뜨렸다! 보석이 떨어졌어요` });
        if (!this.cmdUsed && bumpCounter(p.name, "gemhunt") >= 10) this.ach(p, "gem_hunter");
      }
    }
  }

  private updateGem() {
    for (const p of this.players.values()) {
      if (!p.ghost || p.respawnT <= 0) continue;
      p.respawnT -= DT;
      if (p.respawnT > 0) continue;
      const holder = this.gem.holder ? this.players.get(this.gem.holder) : undefined;
      const at = randomFloorPoint(this.map, holder ?? { x: this.gem.x, y: this.gem.y }, 110);
      p.x = at.x;
      p.y = at.y;
      p.ghost = false;
      p.hp = p.stats.maxHp;
      p.invulnT = 1.5;
      this.fx.push({ k: "revive", x: p.x, y: p.y });
    }
    if (this.gem.holder === null) {
      for (const p of this.players.values()) {
        if (p.ghost || Math.hypot(p.x - this.gem.x, p.y - this.gem.y) > 12) continue;
        this.gem.holder = p.id;
        this.broadcast({ t: "toast", msg: `${p.name}이(가) 보석을 주웠다!` });
        break;
      }
    }
    const h = this.gem.holder ? this.players.get(this.gem.holder) : undefined;
    if (this.gem.holder !== null && (!h || h.ghost)) {
      this.gem.holder = null;
    } else if (h) {
      this.gem.x = h.x;
      this.gem.y = h.y;
      h.score += DT;
      if (h.score >= GEM_GOAL) {
        h.score = GEM_GOAL;
        this.gemWinner = h.id;
        this.ach(h, "gem_win");
        this.broadcast({ t: "toast", msg: `${h.name} 우승! 보석의 주인이 되었다` });
        this.finish(true);
      }
    }
  }

  // ---------- 외부 입력 ----------
  handleInput(id: number, input: InputState) {
    const p = this.players.get(id);
    if (p) p.input = input;
  }

  handleCast(id: number, slot: number, x: number, y: number) {
    const p = this.players.get(id);
    if (!p || p.ghost || (this.phase !== "play" && this.phase !== "rest")) return;
    if (slot < 0 || slot > 3 || p.level < SKILL_UNLOCK[slot] || p.cds[slot] > 0) return;
    const def = CLASSES[p.cls].skills[slot];
    if (def.aim === "passive") return;
    p.cds[slot] = p.nocd ? 0 : this.isRest ? 0.3 : skillCd(def.cd, p.stats, slot);
    castSkill(this, p, slot, Number(x) || p.x, Number(y) || p.y);
    if (p.stats.castHaste) p.castHasteT = 3;
    if (p.stats.manaSurge) p.surgeT = 3;
  }

  handlePick(id: number, idx: number) {
    const p = this.players.get(id);
    if (this.phase !== "cards" || !p || !p.options) return;
    const cardId = p.options[Math.max(0, Math.min(p.options.length - 1, idx))];
    p.options = null;
    p.pendingPicks--;
    this.giveCard(p, cardId);
    this.offerNext(p);
    this.sendCardStatus();
    this.checkCardsDone();
  }

  handleVote(id: number, idx: number) {
    const p = this.players.get(id);
    if (this.phase !== "vote" || !p || idx < 0 || idx >= this.voteOptions.length) return;
    p.vote = idx;
    this.sendVoteStatus();
    if ([...this.players.values()].every((q) => q.vote >= 0 || q.dc)) this.resolveVote();
  }

  handleBuy(id: number, tier: GachaTier) {
    const p = this.players.get(id);
    if (this.phase !== "rest" || this.stall !== "market" || !p || !this.market || !(tier in GACHA_PRICE)) return;
    if (Math.hypot(p.x - this.market.x, p.y - this.market.y) > MARKET_RANGE + 8) return;
    const price = GACHA_PRICE[tier];
    if (p.gold < price) {
      this.sendTo(id, { t: "toast", msg: "돈이 부족해요" });
      return;
    }
    const cardId = this.randomCard(p, [tier]);
    if (!cardId) {
      this.sendTo(id, { t: "gacha", card: null, tier, gold: p.gold });
      return;
    }
    p.gold -= price;
    this.giveCard(p, cardId);
    this.sendTo(id, { t: "gacha", card: cardId, tier, gold: p.gold });
  }

  handleRestReady(id: number, ready: boolean) {
    const p = this.players.get(id);
    if (this.phase !== "rest" || !p) return;
    p.restReady = !!ready;
    this.sendRestStatus();
    if ([...this.players.values()].every((q) => q.restReady || q.dc)) this.leaveRest();
  }

  /** 연결 끊김 / 다시 연결 */
  setDisconnected(id: number, dc: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.dc = dc;
    p.input = { ...p.input, up: false, down: false, left: false, right: false, atk: false };
    if (dc) {
      this.broadcast({ t: "toast", msg: `${p.name} 님 연결 끊김! 60초 안에 돌아오면 이어서 해요` });
      // 진행 조건에서 빠지므로 다시 확인
      if (this.phase === "cards") this.checkCardsDone();
      if (this.phase === "vote" && [...this.players.values()].every((q) => q.vote >= 0 || q.dc)) this.resolveVote();
      if (this.phase === "rest" && [...this.players.values()].every((q) => q.restReady || q.dc)) this.leaveRest();
    } else {
      this.broadcast({ t: "toast", msg: `${p.name} 님이 돌아왔어요!` });
    }
  }

  /** 다시 연결한 사람에게 지금 상황을 다시 보내 줌 */
  resync(id: number) {
    const p = this.players.get(id);
    if (!p) return;
    const st = this.lastStage;
    if (st) this.sendTo(id, { t: "stage", stage: st });
    if (this.phase === "cards" && p.options) this.sendTo(id, { t: "cards", options: p.options, time: Math.ceil(this.timer), left: p.pendingPicks });
    this.sendTalents(p);
    if (this.phase === "vote") this.sendTo(id, { t: "vote", options: this.voteOptions, time: Math.ceil(this.timer) });
    if (this.phase === "rest") this.sendRestStatus();
  }

  removePlayer(id: number) {
    this.players.delete(id);
    this.pets = this.pets.filter((pt) => pt.ownerId !== id);
    if (this.players.size === 0) return;
    if (this.phase === "cards") { this.sendCardStatus(); this.checkCardsDone(); }
    if (this.phase === "vote" && [...this.players.values()].every((q) => q.vote >= 0 || q.dc)) this.resolveVote();
    if (this.phase === "rest" && [...this.players.values()].every((q) => q.restReady || q.dc)) this.leaveRest();
  }

  // ---------- 라운드 / 월드 진행 ----------
  private nextRound() {
    if (this.panic) {
      // PANIC: 월드마다 2구역, 마지막 16구역은 신들의 정원 최종 보스
      this.zone++;
      this.world = Math.min(WORLD_COUNT, Math.ceil(this.zone / 2));
      this.round = this.zone % 2 === 1 ? 2 : 4;
      const boss = this.zone >= PANIC_ZONES;
      this.mission = boss ? "boss" : pick(["kill", "exit", "collect"] as PanicMission[]);
      this.startStage(boss ? "boss" : "battle");
      return;
    }
    if (this.descent) {
      // 무한 하강: 층마다 무작위 월드 테마 + 변형 규칙, 10층마다 보스
      this.floor++;
      this.world = 1 + Math.floor(Math.random() * WORLD_COUNT);
      this.round = ((this.floor - 1) % ROUNDS_PER_WORLD) + 1;
      const boss = this.floor % 10 === 0;
      this.mod = boss ? null : pick(["dark", "double", "elite", "noheal", "fast"] as DescentMod[]);
      if (this.floor >= 30) this.achAll("abyss30");
      if (this.floor >= 60) this.achAll("abyss60");
      this.startStage(boss ? "boss" : "battle");
      return;
    }
    this.round++;
    if (this.round > ROUNDS_PER_WORLD) this.startStage("boss");
    else this.startStage("battle");
  }

  private leaveRest() {
    if (this.worldCleared) {
      this.worldCleared = false;
      this.world++;
      this.round = 0;
      this.team.monsterMul = 1;
    }
    this.nextRound();
  }

  private startStage(kind: StageKind, stall: "market" | "gambler" = "market") {
    this.stageKind = kind;
    this.stall = stall;
    this.monsters = [];
    this.projs = [];
    this.zones = [];
    this.portalOpen = false;
    this.market = null;
    this.phase = kind === "rest" ? "rest" : "play";
    this.stormClock = 0;
    this.prankClock = 0;
    this.prankFastT = 0;
    this.prankRevT = 0;
    const wd = this.worldDef;

    let mapName = wd.name;
    if (kind === "rest") {
      const rm = generateRestMap();
      this.map = rm;
      this.market = rm.market;
      mapName = "휴게소";
      for (const d of rm.dummies) this.spawnMonster("dummy", d);
      this.timer = REST_MAX_TIME;
      for (const p of this.players.values()) p.restReady = false;
    } else if (kind === "treasure") {
      const tm = generateTreasureMap();
      this.map = tm;
      mapName = "보물방";
      this.chests = tm.chests;
      this.chestLoot.clear();
      for (const p of this.players.values()) {
        const loot = [20, 50, 60, -1];
        for (let i = loot.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [loot[i], loot[j]] = [loot[j], loot[i]];
        }
        this.chestLoot.set(p.id, { loot, opened: [], busted: false });
      }
      this.treasureT = TREASURE_TIME;
      this.portalOpen = true;
    } else if (kind === "trial") {
      this.map = generateMap(true);
      mapName = "시련의 방";
      this.trialT = 30;
      this.trialWaveT = 0;
    } else {
      this.map = generateMap(kind === "boss", wd.special);
      if (kind === "boss") mapName = wd.bossRoom;
    }

    let i = 0;
    for (const p of this.players.values()) {
      const ang = (i / Math.max(1, this.players.size)) * Math.PI * 2;
      p.x = this.map.spawn.x + Math.cos(ang) * 10;
      p.y = this.map.spawn.y + Math.sin(ang) * 10;
      p.safeX = p.x;
      p.safeY = p.y;
      p.vx = 0;
      p.vy = 0;
      if (this.worldCleared && kind === "rest") {
        // 월드 클리어: 전원 부활 + 체력 전부 회복
        p.ghost = false;
        p.hp = p.stats.maxHp;
      } else if (p.ghost) {
        p.ghost = false;
        p.hp = Math.ceil(p.stats.maxHp * REVIVE_HP);
      } else if (kind !== "rest" && (this.round > 1 || this.descent || this.panic) && this.mod !== "noheal") {
        // 라운드 사이 휴식: 조금만 회복
        p.hp = Math.min(p.stats.maxHp, p.hp + Math.ceil(p.stats.maxHp * ROUND_HEAL));
      }
      if (kind !== "rest" && p.stats.hunger) {
        p.stats.maxHp += 15;
        p.hp += 15;
      }
      if (kind === "battle" && this.round === 1) p.worldDeaths = 0;
      p.reviveProg = 0;
      p.dashT = 0;
      p.charging = false;
      p.invulnT = 1;
      p.tauntT = 0;
      p.giantT = 0;
      p.slowT = 0;
      p.poisonT = 0;
      p.burnT = 0;
      i++;
    }
    this.pets = [];

    if (kind === "battle" || kind === "boss") {
      const n = this.players.size;
      // v0.9.2: 몬스터 수 = 인원수 배 (4명이면 4배)
      const countMul = n * this.team.monsterMul * (this.mod === "double" ? 2 : 1);
      const r = Math.min(this.round, ROUNDS_PER_WORLD);
      if (kind === "battle") {
        const main = 6 + r;
        const second = r >= 2 ? Math.round((r - 1) * 1.5) : 0;
        for (let k = 0; k < Math.round(main * countMul); k++) this.spawnMonster(wd.monsters[0]);
        for (let k = 0; k < Math.round(second * countMul); k++) this.spawnMonster(wd.monsters[1]);
        // v1.0 특수 몬스터 (자폭 · 방패 · 소환 · 탄막)
        const specials = specialMonsters(this.world);
        for (let k = 0; k < Math.round((0.5 + r * 0.25) * countMul); k++) this.spawnMonster(pick(specials));
        // 엘리트: 15% (3라운드부터 25%)
        if (Math.random() < (r >= 3 ? 0.25 : 0.15)) this.spawnMonster(pick([...wd.monsters]), undefined, this.randomElite());
        // 변형 규칙 '엘리트 대량 출몰': 엘리트 3마리 추가
        if (this.mod === "elite") for (let k = 0; k < 3; k++) this.spawnMonster(pick([...wd.monsters]), undefined, this.randomElite());
      } else {
        const boss = this.spawnMonster(wd.boss);
        if (boss) this.title(boss.def.name, kind === "boss" && this.panic ? "최종 구역 — 시간 안에 쓰러뜨려요!" : `${wd.name}의 주인이 나타났다!`, "#ff7040");
      }
      if (this.team.treasure) this.spawnMonster("chest");
      if (this.panic) this.setupPanicZone();
    }

    const info: StageInfo = {
      kind, world: this.world, round: Math.min(this.round, ROUNDS_PER_WORLD + 1), name: mapName,
      w: this.map.w, h: this.map.h, tiles: this.map.tiles, market: this.market ?? undefined,
      stall: kind === "rest" ? stall : undefined,
      chests: kind === "treasure" ? this.chests : undefined,
      floor: this.descent ? this.floor : undefined,
      zone: this.panic ? this.zone : undefined,
      mission: this.panic ? this.mission : undefined,
      mod: this.descent && (kind === "battle" || kind === "boss") ? this.mod ?? undefined : undefined,
    };
    this.lastStage = info;
    this.sentCards.clear();
    this.sentCos.clear();
    this.broadcast({ t: "stage", stage: info });
    if (kind === "rest") this.sendRestStatus();
  }

  spawnMonster(kind: string, at?: { x: number; y: number }, elite?: EliteAbility): Monster | undefined {
    const def = MONSTERS[kind];
    if (!def) return;
    const n = this.players.size;
    const special = kind === "dummy" || kind === "chest";
    const dHp = special ? 1 : diffHpMul(this.mode.diff);
    const dDmg = special ? 1 : diffDmgMul(this.mode.diff);
    let hpMul = 1;
    const pw = this.powerWorld;
    // PANIC 최종 보스는 90초 안에 잡을 수 있게 체력을 조금 줄임
    // v1.0: 보스 체력은 인원수에 비례 (4명이면 4배)
    if (def.boss) hpMul = n * worldHpMul(pw) * dHp * (this.panic ? 0.7 : 1);
    else if (!special) hpMul = (0.7 + 0.3 * n) * (1 + (Math.max(1, this.round) - 1) * 0.08) * worldHpMul(pw) * dHp;
    const pos = at ?? (def.boss
      ? { x: (this.map.w / 2) * 16 + 40, y: (this.map.h / 2) * 16 }
      : randomFloorPoint(this.map, this.map.spawn, 140));
    // 엘리트: 체력 5배, 피해 1.5배, 보상 크게
    const em = elite ? { hp: 5, dmg: 1.5, gold: 10, xp: 5 } : { hp: 1, dmg: 1, gold: 1, xp: 1 };
    // v0.9.2: 모든 몬스터 체력 ×1.6 (허수아비·상자 제외)
    const hp = Math.round(def.hp * hpMul * em.hp * (special ? 1 : MONSTER_HP_MUL));
    const reward = special ? 1 : worldRewardMul(pw);
    const m: Monster = {
      id: this.nextId(), kind, def, x: pos.x, y: pos.y, r: elite ? Math.round(def.r * 1.4) : def.r, hp, mhp: hp,
      speed: def.speed * (0.9 + Math.random() * 0.2), dmg: def.dmg * worldDmgMul(pw) * dDmg * em.dmg * (def.boss ? 1.2 : 1),
      gold: Math.round(def.gold * reward * em.gold), xp: def.xp * reward * em.xp,
      atkCd: 1 + Math.random() * 1.5, spawnT: special ? 0 : 0.7, flashT: 0,
      busyT: 0, strafe: Math.random() < 0.5 ? 1 : -1,
      dmgBy: new Map(), stunT: 0, frozenT: 0, rootT: 0, slowT: 0,
      poisonT: 0, poisonDps: 0, poisonOwner: 0, poisonTick: 0,
      windT: 0, rushT: 0, rushA: 0, rushSpeed: 0, abilityCd: 3, abilityIdx: 0,
      log: [], total: 0, elite, blinkCd: 4,
    };
    this.monsters.push(m);
    return m;
  }

  private randomElite(): EliteAbility {
    return pick(["rage", "split", "guard", "vamp", "blink"] as EliteAbility[]);
  }

  // ---------- 카드 ----------
  private openCards() {
    this.phase = "cards";
    this.timer = CARD_PICK_TIME;
    this.projs = [];
    this.zones = [];
    for (const p of this.players.values()) {
      if (p.skipPicks > 0) {
        p.skipPicks--;
        p.pendingPicks = 0;
        this.sendTo(p.id, { t: "toast", msg: "빚쟁이: 이번 카드는 건너뛰어요" });
      } else {
        p.pendingPicks = 1;
      }
      this.offerNext(p);
    }
    this.sendCardStatus();
    this.checkCardsDone();
  }

  private offerNext(p: Player) {
    if (this.phase !== "cards" || p.pendingPicks <= 0 || p.options) return;
    p.options = this.rollCards(p);
    if (!p.options.length) {
      p.options = null;
      p.pendingPicks = 0;
      return;
    }
    this.sendTo(p.id, { t: "cards", options: p.options, time: Math.ceil(this.timer), left: p.pendingPicks });
    this.sendTalents(p);
  }

  private checkCardsDone() {
    if (this.phase !== "cards") return;
    if (![...this.players.values()].every((q) => (!q.options && q.pendingPicks <= 0) || q.dc)) return;
    // 연결이 끊긴 사람은 첫 번째 카드를 자동으로 받음
    for (const q of this.players.values()) {
      if (q.dc && q.options) { this.giveCard(q, q.options[0]); q.options = null; q.pendingPicks = 0; }
    }
    if (this.gemMode) {
      this.startArena();
      return;
    }
    if (this.team.extraOption > 0) this.team.extraOption--;

    if (this.panic) {
      this.nextRound();
      return;
    }
    if (this.descent) {
      // 무한 하강: 10층 보스 뒤엔 휴게소, 5층마다 이벤트
      if (this.stageKind === "boss") {
        this.broadcast({ t: "toast", msg: `지하 ${this.floor}층 보스 처치! 잠깐 쉬어 가요` });
        this.startStage("rest", "market");
      } else if (this.floor % 5 === 0) {
        this.openEvent();
      } else {
        this.nextRound();
      }
      return;
    }

    if (this.stageKind === "boss") {
      this.clearWorld();
      return;
    }
    // 테스트용: FORCE_EVENT=vote|rest|gambler 면 매 라운드 그 이벤트
    const forced = process.env.FORCE_EVENT;
    if ((this.round % 3 === 0 || forced) && this.round <= ROUNDS_PER_WORLD) this.openEvent();
    else this.nextRound();
  }

  /** 이벤트: 팀카드 투표 55% / 암시장 45% (도박꾼은 v0.9에서 삭제) */
  private openEvent() {
    const forced = process.env.FORCE_EVENT;
    const ev = forced === "vote" || forced === "rest" ? forced : Math.random() < 0.55 ? "vote" : "rest";
    if (ev === "vote") this.openVote();
    else {
      this.title("암시장", "천막 근처에서 E — 돈으로 카드 상자를 사요", "#c090f0");
      this.startStage("rest", "market");
    }
  }

  /** 화면 가운데 큰 타이틀 (이름 + 설명, 잠깐 뒤 사라짐) */
  title(name: string, desc: string, color?: string) {
    this.broadcast({ t: "title", name, desc, color });
  }

  /** 월드 보스 처치 후: 기록·저장 → 휴게소 (마지막 월드면 원정 성공) */
  private clearWorld() {
    const names = [...this.players.values()].map((p) => p.name);
    this.splits.push(Math.round(this.runTime * 100) / 100);
    if (this.mode.speedrun && !this.cmdUsed) addRecord(this.mode.diff, this.world, names, this.runTime);

    // 업적: 월드 클리어 / 무사고 / 만능 용사 / 번개처럼
    const worldAch: Record<number, string> = { 2: "w2", 3: "w3", 4: "w4", 5: "w5", 6: "w6", 7: "w7" };
    if (worldAch[this.world]) this.achAll(worldAch[this.world]);
    for (const p of this.players.values()) {
      if (p.worldDeaths === 0) this.ach(p, "flawless");
      if (this.world === 1 && !this.cmdUsed && addW1Class(p.name, p.cls) >= CLASS_IDS.length) this.ach(p, "all_classes");
    }
    if (this.world === 1 && this.mode.speedrun && this.runTime < 180) this.achAll("speed_w1");

    if (this.world >= WORLD_COUNT) {
      if (!this.cmdUsed) addClears(names);
      this.achAll("win");
      if (this.mode.diff >= 2) this.achAll("win_normal");
      if (this.mode.diff >= 3) this.achAll("win_hard");
      if (this.mode.diff >= 4) this.achAll("win_hc");
      this.finish(true);
      return;
    }
    if (!this.mode.speedrun && !this.cmdUsed) {
      putSave({
        id: this.saveId,
        hostName: this.hostName,
        world: this.world + 1,
        diff: this.mode.diff,
        team: { ...this.team, monsterMul: 1 },
        savedAt: Date.now(),
        players: [...this.players.values()].map((p) => ({
          name: p.name, cls: p.cls, level: p.level, xp: Math.floor(p.xp), gold: p.gold,
          cards: [...p.cards],
          tal: { ...p.tal },
        })),
      });
      this.lastSaved = true;
      this.broadcast({ t: "toast", msg: `월드 ${this.world} 클리어! 자동 저장했어요` });
    } else if (this.cmdUsed) {
      this.broadcast({ t: "toast", msg: `월드 ${this.world} 클리어! (커맨드 사용 — 저장·기록 안 됨)` });
    } else {
      this.broadcast({ t: "toast", msg: `월드 ${this.world} 클리어! ${this.runTime.toFixed(1)}초` });
    }
    this.worldCleared = true;
    this.startStage("rest", "market");
  }

  private usable(p: Player, rarities: Rarity[]) {
    return CARDS.filter((c) => {
      if (!rarities.includes(c.rarity)) return false;
      if (c.cls && c.cls !== p.cls) return false;
      const owned = p.cards.filter((id) => id === c.id).length;
      return c.stack ? owned < 3 : owned === 0;
    });
  }

  randomCard(p: Player, rarities: Rarity[]): string | null {
    const pool = this.usable(p, rarities);
    return pool.length ? pick(pool).id : null;
  }

  private rollCards(p: Player): string[] {
    const count = 3 + (this.team.extraOption > 0 ? 1 : 0);
    const out: string[] = [];
    if (Math.random() < 0.25) {
      const c = this.usable(p, ["curse"]);
      if (c.length) out.push(pick(c).id);
    }
    // 월드가 오를수록 좋은 카드가 잘 나옴
    const wBonus = (this.world - 1) * 0.02;
    const legend = (this.team.rarityUp ? 0.25 : 0.1) + wBonus;
    const rare = (this.team.rarityUp ? 0.55 : 0.4) + wBonus * 2;
    let guard = 0;
    while (out.length < count && guard++ < 60) {
      const r = Math.random();
      const rarity: Rarity = r < legend ? "legend" : r < rare ? "rare" : "common";
      let pool = this.usable(p, [rarity]).filter((c) => !out.includes(c.id));
      if (!pool.length) pool = this.usable(p, ["common", "rare", "legend"]).filter((c) => !out.includes(c.id));
      if (!pool.length) break;
      out.push(pick(pool).id);
    }
    return out.sort(() => Math.random() - 0.5);
  }

  private levelStats(p: Player): Stats {
    const s = classStats(p.cls);
    s.maxHp += 8 * (p.level - 1);
    s.atkMul *= Math.pow(this.lvlAtk(), p.level - 1);
    if (this.talentsOn) {
      s.atkMul *= BASIC_NERF;
      s.skillDmgMul *= SKILL_NERF / BASIC_NERF;
      for (const b of TALENTS[p.cls]) {
        const n = Math.min(TALENT_TIERS, p.tal[b.id] ?? 0);
        for (let i = 0; i < n; i++) b.tiers[i].apply?.(s);
      }
    }
    return s;
  }

  /** 레벨당 공격력 증가 (특성 모드는 살짝 낮춤) */
  private lvlAtk() {
    return this.talentsOn ? 1.035 : 1.04;
  }

  noteChat(id: number) {
    const p = this.players.get(id);
    if (p) p.chats = (p.chats ?? 0) + 1;
  }

  /** 판 끝 시상식: 각 부문 1등 (0이면 없음) */
  private awards(list: Player[]): Award[] {
    const out: Award[] = [];
    const add = (name: string, desc: string, key: (p: Player) => number, fmt: (v: number) => string) => {
      const best = list.reduce<Player | null>((a, b) => (!a || key(b) > key(a) ? b : a), null);
      if (best && key(best) > 0) out.push({ name, desc, id: best.id, value: fmt(key(best)) });
    };
    add("인간 방패", "가장 많은 피해를 받아낸 용사", (p) => p.dmgTaken, (v) => `받은 피해 ${Math.round(v)}`);
    add("저승 체류자", "유령으로 가장 오래 머문 용사", (p) => p.ghostTime ?? 0, (v) => `${Math.round(v)}초`);
    add("야전 의무관", "동료를 가장 많이 일으킨 용사", (p) => p.revives, (v) => `부활 ${v}회`);
    add("작전 통신병", "채팅을 가장 많이 한 용사", (p) => p.chats ?? 0, (v) => `채팅 ${v}번`);
    return out;
  }

  /** 남은 특성 포인트 */
  talentLeft(p: Player) {
    if (!this.talentsOn) return 0;
    const used = Object.values(p.tal).reduce((a, b) => a + b, 0);
    return Math.max(0, talentPoints(p.level) - used);
  }

  sendTalents(p: Player) {
    if (!this.talentsOn) return;
    this.sendTo(p.id, { t: "talents", tal: { ...p.tal }, pts: this.talentLeft(p) });
  }

  /** 특성 찍기: 카드 고르는 시간에만, 갈래 안에서 순서대로, 되돌리기 없음 */
  handleTalent(id: number, branch: number) {
    const p = this.players.get(id);
    if (!p || !this.talentsOn || this.phase !== "cards") return;
    const b = TALENTS[p.cls][branch];
    if (!b || this.talentLeft(p) <= 0) return;
    const now = p.tal[b.id] ?? 0;
    if (now >= TALENT_TIERS) return;
    p.tal[b.id] = now + 1;
    p.talN = (p.talN ?? 0) + 1;
    const before = p.stats.maxHp;
    b.tiers[now].apply?.(p.stats);
    const delta = p.stats.maxHp - before;
    if (delta > 0) p.hp += delta;
    if (now + 1 === TALENT_TIERS) this.sendTo(p.id, { t: "toast", msg: `비기 「${b.tiers[now].name.replace("★ ", "")}」 습득!` });
    this.sendTalents(p);
  }

  giveCard(p: Player, cardId: string, depth = 0) {
    const card = CARD_BY_ID[cardId];
    if (!card || depth > 3) return;
    const before = p.stats.maxHp;
    const hpBefore = p.hp;
    const ctx: CardCtx = {
      healFull: () => { p.hp = p.stats.maxHp; },
      halfHp: () => { p.hp = Math.max(1, Math.floor(p.hp / 2)); },
      addXp: (n) => this.addXp(p, n),
      grantRandom: (r) => {
        const id = this.randomCard(p, [r]);
        if (id) {
          this.giveCard(p, id, depth + 1);
          this.sendTo(p.id, { t: "toast", msg: `${CARD_BY_ID[id].name} 획득!` });
        }
      },
      extraPicks: (n) => { p.pendingPicks += n; },
      skipPicks: (n) => { p.skipPicks += n; },
      reroll: () => this.reroll(p),
      team: (flag, v) => { this.team[flag] = v; },
    };
    card.apply(p.stats, ctx);
    p.cards.push(cardId);
    if (!this.cmdUsed) {
      codexCard(p.name, cardId);
      const have = getCodex(p.name).cards.length;
      if (have >= CARDS.length / 2) this.ach(p, "codex50");
      if (have >= CARDS.length) this.ach(p, "codex100");
    }
    const delta = p.stats.maxHp - before;
    if (delta > 0 && p.hp === hpBefore) p.hp += delta;
    p.hp = Math.min(p.hp, p.stats.maxHp);
  }

  private reroll(p: Player) {
    const teamCards = p.cards.filter((id) => CARD_BY_ID[id]?.rarity === "team");
    const n = p.cards.filter((id) => CARD_BY_ID[id]?.rarity !== "team").length;
    p.stats = this.levelStats(p);
    p.cards = [];
    for (const id of teamCards) {
      CARD_BY_ID[id].apply(p.stats, this.noopCtx());
      p.cards.push(id);
    }
    for (let i = 0; i < n; i++) {
      const id = this.randomCard(p, ["common", "rare", "legend"]);
      if (id) this.giveCard(p, id, 3);
    }
  }

  private sendCardStatus() {
    const picked: number[] = [];
    const waiting: number[] = [];
    for (const p of this.players.values()) (p.options || p.pendingPicks > 0 ? waiting : picked).push(p.id);
    this.broadcast({ t: "cardStatus", picked, waiting });
  }

  // ---------- 팀카드 투표 ----------
  private openVote() {
    this.title("팀카드 투표", "팀 전원에게 적용될 카드 1장을 다 같이 골라요", "#40e0f0");
    this.phase = "vote";
    this.timer = VOTE_TIME;
    const pool = CARDS.filter((c) => c.rarity === "team").sort(() => Math.random() - 0.5);
    this.voteOptions = pool.slice(0, 3).map((c) => c.id);
    for (const p of this.players.values()) p.vote = -1;
    this.broadcast({ t: "vote", options: this.voteOptions, time: VOTE_TIME });
    this.sendVoteStatus();
  }

  private sendVoteStatus() {
    const votes: Record<number, number> = {};
    for (const p of this.players.values()) if (p.vote >= 0) votes[p.id] = p.vote;
    this.broadcast({ t: "voteStatus", votes });
  }

  private resolveVote() {
    if (this.phase !== "vote") return;
    const counts = this.voteOptions.map(() => 0);
    for (const p of this.players.values()) if (p.vote >= 0) counts[p.vote]++;
    const max = Math.max(...counts);
    const tied = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
    const chosen = this.voteOptions[pick(tied)];
    for (const p of this.players.values()) this.giveCard(p, chosen);
    this.broadcast({ t: "voteResult", card: chosen });
    this.nextRound();
  }

  private sendRestStatus() {
    const ready = [...this.players.values()].filter((p) => p.restReady).map((p) => p.id);
    this.broadcast({ t: "restStatus", ready, total: this.players.size, time: Math.ceil(this.timer) });
  }

  // ---------- 성장 ----------
  addXp(p: Player, n: number) {
    p.xp += n;
    while (p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      p.stats.maxHp += 8;
      p.stats.atkMul *= this.lvlAtk();
      if (this.talentsOn && p.level % 2 === 0) this.sendTo(p.id, { t: "toast", msg: `특성 포인트 +1 (카드 고를 때 찍을 수 있어요)` });
      if (!p.ghost) p.hp = Math.min(p.stats.maxHp, p.hp + 8 + p.stats.maxHp * 0.2);
      this.fx.push({ k: "lvl", x: p.x, y: p.y, r: p.level });
      const unlocked = SKILL_UNLOCK.indexOf(p.level);
      if (unlocked > 0) {
        this.sendTo(p.id, { t: "toast", msg: `레벨 ${p.level}! ${unlocked + 1}번 스킬 「${CLASSES[p.cls].skills[unlocked].name}」 해금` });
      }
    }
  }

  private finish(win: boolean) {
    this.phase = "end";
    this.won = win;
    this.timer = 2;
  }

  /** 스피드런 경주 현황용 */
  progress() {
    const state: "run" | "win" | "dead" = this.phase === "end" || this.phase === "done" ? (this.won ? "win" : "dead") : "run";
    return { world: this.world, round: Math.min(this.round, ROUNDS_PER_WORLD + 1), time: Math.round(this.runTime * 10) / 10, state };
  }

  private sendResults() {
    const list = [...this.players.values()];
    if (this.gemMode) {
      const rows: ResultRow[] = list
        .sort((a, b) => b.score - a.score)
        .map((p) => ({
          id: p.id, name: p.name, color: p.color, cls: p.cls, level: p.level,
          kills: p.kills, dmgDealt: Math.round(p.dmgDealt), dmgTaken: Math.round(p.dmgTaken),
          revives: 0, deaths: p.deaths, score: Math.floor(p.score),
          title: p.id === this.gemWinner ? "보석의 주인" : p.kills === Math.max(...list.map((q) => q.kills)) && p.kills > 0 ? "보석 사냥꾼" : "구경꾼",
        }));
      this.broadcast({ t: "result", win: true, rows, world: this.world, mode: this.mode });
      this.onEnd();
      return;
    }
    const titles = new Map<number, string>();
    const award = (key: (p: Player) => number, title: string) => {
      const best = list.reduce<Player | null>((a, b) => (!a || key(b) > key(a) ? b : a), null);
      if (best && key(best) > 0 && !titles.has(best.id)) titles.set(best.id, title);
    };
    award((p) => p.deaths, "신의 실수");
    award((p) => p.revives, "부활 장인");
    award((p) => p.kills, "학살자");
    award((p) => p.dmgTaken, "인간 샌드백");
    award((p) => p.dmgDealt, "딜 머신");
    award((p) => p.gold, "구두쇠");
    const rows: ResultRow[] = list.map((p) => ({
      id: p.id, name: p.name, color: p.color, cls: p.cls, level: p.level,
      kills: p.kills, dmgDealt: Math.round(p.dmgDealt), dmgTaken: Math.round(p.dmgTaken),
      revives: p.revives, deaths: p.deaths, title: titles.get(p.id) ?? "평범한 용사",
      hp: Math.max(0, Math.ceil(p.hp)), mhp: p.stats.maxHp, ghost: p.ghost,
    }));
    let rank: number | undefined;
    let floorRank: number | undefined;
    let panicRank: number | undefined;
    if (this.panic && this.won && !this.cmdUsed) panicRank = addPanic(this.mode.diff, list.map((p) => p.name), this.runTime);
    if (this.descent && !this.cmdUsed) floorRank = addDescent(this.mode.diff, list.map((p) => p.name), this.floor);
    if (this.won) {
      if (this.mode.speedrun && !this.cmdUsed) rank = addRecord(this.mode.diff, 0, list.map((p) => p.name), this.runTime);
      if (!this.cmdUsed) deleteSave(this.saveId);
    }
    this.broadcast({
      t: "result", win: this.won, rows, world: this.world, mode: this.mode, awards: this.awards(list),
      time: this.mode.speedrun || this.panic ? Math.round(this.runTime * 100) / 100 : undefined,
      splits: this.splits, rank, saved: !this.won && this.lastSaved, cmd: this.cmdUsed,
      floor: this.descent ? this.floor : undefined, floorRank,
      zone: this.panic ? this.zone : undefined,
      zoneTimes: this.panic ? this.zoneTimes : undefined,
      panicRank,
      rewards: [...this.runAch],
      timeUp: this.timeUp || undefined,
    });
    this.onEnd();
  }

  /** 값이 바뀌었으면 (또는 full) true 를 돌려주고 기억 */
  private changed(memo: Map<number, string>, id: number, key: string, full: boolean) {
    if (!full && memo.get(id) === key) return false;
    memo.set(id, key);
    return true;
  }

  // ---------- 보물방 ----------
  private startTreasure() {
    this.title("보물방", "상자 4개 중 1개는 미믹! 열면 가진 돈을 전부 잃어요", "#f8d040");
    this.startStage("treasure");
  }

  /** 가까운 상자 열기: 20 / 50 / 60원, 미믹이면 가진 돈 전부 잃고 더는 못 엶 */
  handleChest(id: number) {
    const p = this.players.get(id);
    const st = this.chestLoot.get(id);
    if (!p || !st || p.ghost || this.phase !== "play" || this.stageKind !== "treasure" || st.busted) return;
    let best = -1;
    let bestD = CHEST_RANGE;
    this.chests.forEach((c, i) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= bestD && !st.opened.includes(i)) { best = i; bestD = d; }
    });
    if (best < 0) return;
    st.opened.push(best);
    const v = st.loot[best];
    if (v < 0) {
      const lost = p.gold;
      p.gold = 0;
      st.busted = true;
      this.sendTo(id, { t: "chestResult", idx: best, mimic: true, gold: 0, lost, total: p.gold });
    } else {
      p.gold += v;
      this.checkRich(p);
      this.sendTo(id, { t: "chestResult", idx: best, mimic: false, gold: v, lost: 0, total: p.gold });
      // 업적 '대박': 미믹을 피해 상자 3개를 다 엶
      if (st.opened.length === 3) this.ach(p, "jackpot");
    }
  }

  /** 시간이 다 되거나 살아있는 모두가 출구에 모이면 카드 선택 */
  private updateTreasure(): boolean {
    this.treasureT -= DT;
    const alive = [...this.players.values()].filter((p) => !p.ghost && !p.dc);
    const atExit = alive.length > 0 && alive.every((p) => Math.hypot(p.x - this.map.portal.x, p.y - this.map.portal.y) < PORTAL_RANGE);
    if (this.treasureT <= 0 || atExit) {
      this.chests = [];
      this.chestLoot.clear();
      this.openCards();
      return true;
    }
    return false;
  }

  // ---------- PANIC ----------
  private aliveCount() {
    return [...this.players.values()].filter((p) => !p.ghost).length;
  }

  private atExit() {
    return [...this.players.values()].filter((p) => !p.ghost && Math.hypot(p.x - this.map.portal.x, p.y - this.map.portal.y) < PORTAL_RANGE).length;
  }

  private panicKilled() {
    return Math.max(0, this.panicGoal - this.monsters.filter((m) => m.kind !== "chest").length);
  }

  /** 구역 시작: 타이머 90초 + 임무 준비 + 월드별 PANIC 장애물 */
  private setupPanicZone() {
    this.panicT = PANIC_TIME;
    this.keys = [];
    this.keyGot = 0;
    this.keyGoal = 0;
    const wd = this.worldDef;
    // 유령선 묘지: 순간이동하는 유령 엘리트
    if (this.world === 7 && this.mission !== "boss") {
      for (let k = 0; k < 2; k++) this.spawnMonster(wd.monsters[1], undefined, "blink");
    }
    if (this.mission === "exit") {
      // 탈출구는 처음부터 열려 있고, 가는 길목에 몬스터가 더 있음
      this.portalOpen = true;
      for (let k = 0; k < 2 + this.players.size; k++) {
        const t = 0.4 + Math.random() * 0.5;
        const x = this.map.spawn.x + (this.map.portal.x - this.map.spawn.x) * t;
        const y = this.map.spawn.y + (Math.random() - 0.5) * 120;
        const ch = tileAt(this.map, x, y);
        this.spawnMonster(wd.monsters[0], ch === "#" || ch === "v" ? undefined : { x, y });
      }
    }
    if (this.mission === "collect") {
      this.keyGoal = 4 + Math.ceil(this.players.size / 2);
      for (let k = 0; k < this.keyGoal; k++) this.keys.push(randomFloorPoint(this.map, this.map.spawn, 110));
    }
    this.panicGoal = this.monsters.filter((m) => m.kind !== "chest").length;
    this.panicHazardT = 4;
  }

  /** 월드별 PANIC 장애물: 설원·늪지·마왕성은 내려찍기, 구름섬·신들의 정원은 낙뢰가 계속 떨어짐 */
  private panicHazards() {
    const kind: ZoneKind | null = this.world === 3 || this.world === 4 || this.world === 6 ? "slam"
      : this.world === 5 || this.world === 8 ? "strike" : null;
    if (!kind) return;
    this.panicHazardT -= DT;
    if (this.panicHazardT > 0) return;
    this.panicHazardT = this.world === 6 ? 2.2 : 3.5;
    const alive = [...this.players.values()].filter((p) => !p.ghost);
    if (!alive.length) return;
    const target = pick(alive);
    const dmg = 8 * worldDmgMul(this.powerWorld) * diffDmgMul(this.mode.diff);
    this.addZone(kind, target.x + (Math.random() - 0.5) * 50, target.y + (Math.random() - 0.5) * 50, 30, -1, dmg, 1.3);
  }

  private updatePanic() {
    const alive = [...this.players.values()].filter((p) => !p.ghost && !p.dc);
    if (alive.length === 0) {
      this.finish(false);
      return;
    }
    this.panicT -= DT;
    if (this.panicT <= 0) {
      // TIME OVER: 그 즉시 실패
      this.panicT = 0;
      this.timeUp = true;
      this.finish(false);
      return;
    }
    this.panicHazards();
    if (this.mission === "collect") {
      this.keys = this.keys.filter((k) => {
        const p = alive.find((q) => Math.hypot(q.x - k.x, q.y - k.y) < 16);
        if (!p) return true;
        this.keyGot++;
        this.fx.push({ k: "coin", x: Math.round(k.x), y: Math.round(k.y), to: p.id });
        return false;
      });
    }
    // 임무 + 몬스터 전멸을 둘 다 해야 돌파
    const cleared = this.monsters.every((m) => m.kind === "chest");
    const missionDone = this.mission === "collect" ? this.keyGot >= this.keyGoal
      : this.mission === "exit" ? alive.every((p) => Math.hypot(p.x - this.map.portal.x, p.y - this.map.portal.y) < PORTAL_RANGE)
      : true;
    const done = cleared && missionDone;
    if (done) this.completeZone();
  }

  private completeZone() {
    const used = Math.round((PANIC_TIME - this.panicT) * 100) / 100;
    this.zoneTimes.push(used);
    if (this.zone >= 8) this.achAll("panic_z8");
    this.projs = [];
    this.zones = [];
    this.keys = [];
    if (this.zone >= PANIC_ZONES) {
      // 최종 구역: COMPLETE! 없이 바로 PANIC CLEAR
      this.achAll("panic_clear");
      if (this.runTime <= 720) this.achAll("panic_fast");
      this.monsters = [];
      this.finish(true);
      return;
    }
    for (const p of this.players.values()) {
      if (p.ghost) { p.ghost = false; p.hp = Math.ceil(p.stats.maxHp * REVIVE_HP); }
    }
    this.monsters = this.monsters.filter((m) => m.kind === "chest");
    this.portalOpen = false;
    this.phase = "complete";
    this.timer = 2.2;
    this.broadcast({ t: "panicComplete", zone: this.zone, time: used });
  }

  // ---------- 시련의 방 ----------
  private openTrialVote() {
    this.title("시련의 방", "30초 동안 몰려오는 적을 버티면 돈 + 희귀 이상 카드", "#ff5a4a");
    this.phase = "trialvote";
    this.timer = 15;
    this.trialVotes.clear();
    this.projs = [];
    this.zones = [];
    this.broadcast({ t: "trialVote", time: 15 });
    this.sendTrialStatus();
  }

  handleTrial(id: number, yes: boolean) {
    if (this.phase !== "trialvote" || !this.players.has(id)) return;
    this.trialVotes.set(id, !!yes);
    this.sendTrialStatus();
    if (this.trialVotes.size >= [...this.players.values()].filter((q) => !q.dc).length) this.resolveTrialVote();
  }

  private sendTrialStatus() {
    const yes: number[] = [];
    const no: number[] = [];
    for (const [id, v] of this.trialVotes) (v ? yes : no).push(id);
    this.broadcast({ t: "trialStatus", yes, no, total: this.players.size });
  }

  private resolveTrialVote() {
    if (this.phase !== "trialvote") return;
    const yes = [...this.trialVotes.values()].filter(Boolean).length;
    const go = yes > this.players.size / 2;
    this.broadcast({ t: "trialEnd", success: false, go });
    if (go) {
      this.broadcast({ t: "toast", msg: "시련의 방! 30초 동안 버티세요" });
      this.startStage("trial");
    } else {
      this.openCards();
    }
  }

  /** 30초 동안 웨이브. 끝나면 true (다음 단계로 넘어감) */
  private updateTrial(): boolean {
    this.trialT -= DT;
    this.trialWaveT -= DT;
    const alive = [...this.players.values()].filter((p) => !p.ghost);
    if (alive.length === 0) {
      this.endTrial(false);
      return true;
    }
    if (this.trialT <= 0) {
      this.endTrial(true);
      return true;
    }
    if (this.trialWaveT <= 0 && this.trialT > 3) {
      this.trialWaveT = 6;
      const wd = this.worldDef;
      const count = 3 + this.players.size * 2;
      const center = alive[0];
      for (let k = 0; k < count; k++) {
        this.spawnMonster(k % 3 === 2 ? wd.monsters[1] : wd.monsters[0], randomFloorPoint(this.map, center, 90));
      }
    }
    return false;
  }

  private endTrial(success: boolean) {
    this.monsters = [];
    this.projs = [];
    this.zones = [];
    for (const p of this.players.values()) {
      if (p.ghost) {
        p.ghost = false;
        p.hp = Math.ceil(p.stats.maxHp * REVIVE_HP);
      }
      if (!success) continue;
      const gold = Math.round(30 * worldRewardMul(this.world));
      p.gold += gold;
      this.checkRich(p);
      if (!this.cmdUsed && bumpCounter(p.name, "trial") >= 5) this.ach(p, "trial5");
      const id = this.randomCard(p, ["rare", "legend"]);
      if (id) {
        this.giveCard(p, id);
        this.sendTo(p.id, { t: "toast", msg: `시련 성공! +${gold}원, ${CARD_BY_ID[id].name} 획득` });
      }
    }
    if (!success) this.broadcast({ t: "toast", msg: "시련 실패... 보상 없이 계속 진행해요" });
    this.broadcast({ t: "trialEnd", success });
    this.openCards();
  }

  // ---------- 도박꾼 ----------
  handleGamble(id: number, game: GambleGame, bet: number, pickSide?: "odd" | "even") {
    const p = this.players.get(id);
    if (this.phase !== "rest" || this.stall !== "gambler" || !p || !this.market) return;
    if (Math.hypot(p.x - this.market.x, p.y - this.market.y) > MARKET_RANGE + 8) return;
    const amount = game === "card" ? 50 : Math.floor(Number(bet) / 10) * 10;
    if (!(amount >= 10) || p.gold < amount) {
      this.sendTo(id, { t: "toast", msg: "돈이 부족해요" });
      return;
    }
    let delta = 0;
    let outcome = "";
    let card: string | undefined;
    if (game === "oddeven") {
      const roll = Math.random() < 0.5 ? "odd" : "even";
      outcome = roll === "odd" ? "홀" : "짝";
      delta = roll === (pickSide ?? "odd") ? amount : -amount;
    } else if (game === "roulette") {
      // 1 꽝 · 2~4 본전 · 5 두 배 · 6 다섯 배
      const slot = 1 + Math.floor(Math.random() * 6);
      outcome = String(slot);
      delta = slot === 1 ? -amount : slot <= 4 ? 0 : slot === 5 ? amount : amount * 4;
      if (slot === 6) this.ach(p, "jackpot");
    } else {
      // 카드 도박: 전설 / 저주 / 꽝 중 하나
      delta = -amount;
      const r = Math.random();
      outcome = r < 1 / 3 ? "legend" : r < 2 / 3 ? "curse" : "none";
      if (outcome !== "none") {
        card = this.randomCard(p, [outcome === "legend" ? "legend" : "curse"]) ?? undefined;
        if (card) this.giveCard(p, card);
        else outcome = "none";
      }
    }
    p.gold += delta;
    this.checkRich(p);
    this.sendTo(id, { t: "gambleResult", game, bet: amount, outcome, delta, gold: p.gold, card });
  }

  // ---------- 커맨드 패널 ----------
  handleCmd(id: number, cmd: CmdAction) {
    const p = this.players.get(id);
    if (!p || !cmd || typeof cmd !== "object") return;
    this.cmdUsed = true;
    if (!this.cmdNotified.has(id)) {
      this.cmdNotified.add(id);
      this.broadcast({ t: "toast", msg: `${p.name}이(가) 커맨드를 사용했어요 (이 판은 기록이 남지 않아요)` });
    }
    const n = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
    const inStage = this.phase === "play" || this.phase === "rest";
    switch (cmd.a) {
      case "goto":
        if (this.gemMode) return;
        for (const q of this.players.values()) { q.options = null; q.pendingPicks = 0; }
        this.world = n(cmd.world, 1, WORLD_COUNT);
        this.round = n(cmd.round, 1, ROUNDS_PER_WORLD + 1) - 1;
        this.worldCleared = false;
        this.phase = "play";
        // PANIC: 그 월드의 앞 구역(라운드 1~3) / 뒤 구역(4~)으로
        if (this.panic) this.zone = (this.world - 1) * 2 + (n(cmd.round, 1, 7) >= 4 ? 1 : 0);
        this.nextRound();
        break;
      case "rest":
        if (this.gemMode) return;
        this.startStage("rest", "market");
        break;
      case "treasure":
        if (this.gemMode || this.panic) return;
        for (const q of this.players.values()) { q.options = null; q.pendingPicks = 0; }
        this.phase = "play";
        this.startTreasure();
        break;
      case "next":
        if (this.gemMode) return;
        for (const q of this.players.values()) { q.options = null; q.pendingPicks = 0; }
        if (this.phase === "rest") this.leaveRest();
        else { this.phase = "play"; this.nextRound(); }
        break;
      case "gold":
        p.gold += n(cmd.n, 0, 100000);
        break;
      case "level":
        p.level = n(cmd.n, 1, 99);
        p.xp = 0;
        p.stats = this.levelStats(p);
        for (const cid of p.cards) CARD_BY_ID[cid]?.apply(p.stats, this.noopCtx());
        p.hp = p.stats.maxHp;
        break;
      case "card":
        if (CARD_BY_ID[cmd.id] && CARD_BY_ID[cmd.id].rarity !== "team") this.giveCard(p, cmd.id);
        break;
      case "teamcard":
        if (CARD_BY_ID[cmd.id]?.rarity === "team") for (const q of this.players.values()) this.giveCard(q, cmd.id);
        break;
      case "god":
        p.god = !p.god;
        this.sendTo(id, { t: "toast", msg: p.god ? "무적 켜짐" : "무적 꺼짐" });
        break;
      case "nocd":
        p.nocd = !p.nocd;
        p.cds = [0, 0, 0, 0];
        this.sendTo(id, { t: "toast", msg: p.nocd ? "쿨타임 없음 켜짐" : "쿨타임 없음 꺼짐" });
        break;
      case "heal":
        if (p.ghost) this.revive(p, 1);
        p.hp = p.stats.maxHp;
        break;
      case "killall":
        if (!inStage) return;
        // 분열 엘리트가 남긴 작은 몹까지 다 없어질 때까지 반복
        for (let pass = 0; pass < 5; pass++) {
          const targets = this.monsters.filter((m) => m.kind !== "dummy" && m.kind !== "pvp" && m.kind !== "chest");
          if (!targets.length) break;
          for (const m of targets) {
            if (!this.monsters.includes(m)) continue;
            m.hp = 0;
            this.killMonster(m, p);
          }
        }
        break;
      case "player": {
        const q = this.players.get(Number(cmd.target));
        if (!q) return;
        if (cmd.op === "revive" && q.ghost) this.revive(q, 1);
        else if (cmd.op === "heal") { if (q.ghost) this.revive(q, 1); q.hp = q.stats.maxHp; }
        else if (cmd.op === "gold") q.gold += n(cmd.n, 0, 100000);
        else if (cmd.op === "card" && cmd.id && CARD_BY_ID[cmd.id] && CARD_BY_ID[cmd.id].rarity !== "team") this.giveCard(q, cmd.id);
        else if (cmd.op === "bring") { q.x = p.x + 12; q.y = p.y; }
        else if (cmd.op === "goto") { p.x = q.x + 12; p.y = q.y; }
        break;
      }
      case "speed": {
        const v = Number(cmd.mul);
        this.timeScale = [0, 0.5, 1, 1.5, 2].includes(v) ? v : 1;
        this.broadcast({ t: "toast", msg: this.timeScale === 0 ? "게임 일시정지" : `게임 속도 ×${this.timeScale}` });
        break;
      }
      case "zone":
        if (!this.panic) return;
        for (const q of this.players.values()) { q.options = null; q.pendingPicks = 0; }
        this.zone = n(cmd.n, 1, PANIC_ZONES) - 1;
        this.phase = "play";
        this.nextRound();
        break;
      case "ptime":
        if (!this.panic) return;
        this.panicT = Math.max(1, this.panicT + n(cmd.n, -120, 600));
        break;
      case "floor":
        if (!this.descent) return;
        for (const q of this.players.values()) { q.options = null; q.pendingPicks = 0; }
        this.floor = n(cmd.n, 1, 999) - 1;
        this.phase = "play";
        this.nextRound();
        break;
      case "trial":
        if (this.gemMode || this.panic) return;
        for (const q of this.players.values()) { q.options = null; q.pendingPicks = 0; }
        this.phase = "play";
        this.startStage("trial");
        break;
      case "stat": {
        const v = Number(cmd.v);
        if (!Number.isFinite(v)) return;
        if (cmd.key === "atk") p.stats.atkMul = Math.max(0.1, Math.min(100, v));
        else if (cmd.key === "hp") { p.stats.maxHp = Math.max(1, Math.min(99999, Math.round(v))); p.hp = p.stats.maxHp; }
        else if (cmd.key === "speed") p.stats.speedMul = Math.max(0.2, Math.min(5, v));
        else if (cmd.key === "atkspd") p.stats.atkSpdMul = Math.max(0.2, Math.min(10, v));
        break;
      }
      case "class":
        if (!(cmd.cls in CLASSES)) return;
        p.cls = cmd.cls as ClassId;
        p.cds = [0, 0, 0, 0];
        this.pets = this.pets.filter((pt) => pt.ownerId !== p.id);
        p.stats = this.levelStats(p);
        for (const cid of p.cards) CARD_BY_ID[cid]?.apply(p.stats, this.noopCtx());
        p.hp = p.stats.maxHp;
        break;
      case "spectate":
        p.spec = !p.spec;
        this.sendTo(id, { t: "toast", msg: p.spec ? "관전·투명 모드 켜짐 (몬스터가 못 보고 벽 통과)" : "관전·투명 모드 꺼짐" });
        break;
      case "notice": {
        const text = String(cmd.text ?? "").slice(0, 80).trim();
        if (text) this.broadcast({ t: "title", name: "공지", desc: text, color: "#40e0f0" });
        break;
      }
      case "spawn": {
        if (!inStage || !MONSTERS[cmd.kind] || cmd.kind === "pvp") return;
        const count = n(cmd.n, 1, 30);
        for (let k = 0; k < count; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = 40 + Math.random() * 40;
          let pos = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
          if (isWallAt(this.map, pos.x, pos.y)) pos = randomFloorPoint(this.map, p, 30);
          this.spawnMonster(cmd.kind, pos, cmd.elite ? this.randomElite() : undefined);
        }
        break;
      }
    }
  }

  // ---------- 메인 루프 ----------
  /** 커맨드 게임 속도 (0 = 일시정지) */
  timeScale = 1;
  /** 혼자 할 때 메뉴를 열면 멈춤 (스피드런·보석 쟁탈전 제외) */
  private menuPaused = false;
  setMenuPause(on: boolean) {
    this.menuPaused = !!on && this.players.size === 1 && !this.mode.speedrun && !this.gemMode;
  }
  private timeAcc = 0;

  /** 방에서 30Hz로 부름: 게임 속도에 맞춰 tick 을 0~2번 */
  step() {
    if (this.timeScale === 0 || this.menuPaused) {
      if ((this.phase === "play" || this.phase === "rest") && ++this.snapTick % 10 === 0) this.sendSnapshot(true);
      return;
    }
    this.timeAcc += this.timeScale;
    while (this.timeAcc >= 1) {
      this.timeAcc -= 1;
      this.tick();
    }
  }

  tick() {
    this.time += DT;
    if (this.players.size === 0 || this.phase === "done") return;
    // 모두 연결이 끊겼으면 잠깐 멈춤 (60초 안에 돌아오면 이어서)
    if ([...this.players.values()].every((p) => p.dc)) return;

    if (this.phase === "cards" || this.phase === "vote" || this.phase === "trialvote") {
      this.timer -= DT;
      if (this.timer > 0) return;
      if (this.phase === "vote") {
        this.resolveVote();
      } else if (this.phase === "trialvote") {
        this.resolveTrialVote();
      } else {
        for (const p of this.players.values()) {
          if (p.options) this.giveCard(p, p.options[0]);
          p.options = null;
          p.pendingPicks = 0;
        }
        this.checkCardsDone();
      }
      return;
    }

    if (this.phase === "complete") {
      // COMPLETE! 연출 동안 잠깐 멈춤 → 카드 선택
      this.timer -= DT;
      this.sendSnapshot();
      if (this.timer <= 0) this.openCards();
      return;
    }

    if (this.phase === "end") {
      this.timer -= DT;
      this.sendSnapshot();
      if (this.timer <= 0) {
        this.phase = "done";
        this.sendResults();
      }
      return;
    }

    if (this.phase === "rest") {
      this.timer -= DT;
      if (Math.floor(this.timer + DT) !== Math.floor(this.timer)) this.sendRestStatus();
      if (this.timer <= 0) { this.leaveRest(); return; }
    } else if (!this.gemMode) {
      // 스피드런 타이머는 전투 중에만 흐름 (카드·투표·휴게소 제외)
      this.runTime += DT;
      this.updateGimmick();
    }

    for (const p of this.players.values()) this.updatePlayer(p);
    if (this.gemMode) this.syncProxies();
    this.updatePets();
    if (!this.gemMode) this.updateRevives();
    for (const m of [...this.monsters]) this.updateMonster(m);
    this.separateMonsters();
    this.updateProjs();
    this.updateZones();

    if (this.gemMode) {
      if (this.phase === "play") this.updateGem();
    } else if (this.phase === "play" && this.stageKind === "trial") {
      if (this.updateTrial()) return;
    } else if (this.phase === "play" && this.stageKind === "treasure") {
      if (this.updateTreasure()) return;
    } else if (this.phase === "play" && this.panic) {
      this.updatePanic();
    } else if (this.phase === "play") {
      const alive = [...this.players.values()].filter((p) => !p.ghost && !p.dc);
      const fighters = this.monsters.filter((m) => m.kind !== "chest");
      if (alive.length === 0) {
        this.finish(false);
      } else if (fighters.length === 0 && !this.portalOpen) {
        this.portalOpen = true;
      } else if (this.portalOpen && alive.every((p) => Math.hypot(p.x - this.map.portal.x, p.y - this.map.portal.y) < PORTAL_RANGE)) {
        for (const p of this.players.values()) {
          if (p.ghost) { p.ghost = false; p.hp = Math.ceil(p.stats.maxHp * REVIVE_HP); }
        }
        // 일반 라운드를 깨면 20% 확률로 시련의 방 제안 (테스트용 FORCE_TRIAL=1 이면 항상)
        if (this.stageKind === "battle" && this.world === 1 && this.round === 1 && !this.descent) this.achAll("first_step");
        // 랜덤방: 시련의 방 15% / 보물방 15% (테스트용 FORCE_TRIAL=1, FORCE_TREASURE=1)
        const roll = Math.random();
        if (this.stageKind === "battle" && process.env.FORCE_TREASURE === "1") this.startTreasure();
        else if (this.stageKind === "battle" && (process.env.FORCE_TRIAL === "1" || roll < 0.15)) this.openTrialVote();
        else if (this.stageKind === "battle" && roll < 0.3) this.startTreasure();
        else this.openCards();
        return;
      }
    }

    this.sendSnapshot();
  }

  /** 월드 기믹: 모래폭풍 주기, 신의 장난 */
  private updateGimmick() {
    const g = this.worldDef.gimmick;
    this.prankFastT -= DT;
    this.prankRevT -= DT;
    if (g === "sandstorm") this.stormClock += DT;
    if (g === "prank") {
      this.prankClock += DT;
      if (this.prankClock >= 25) {
        this.prankClock = 0;
        const pr = pick([...PRANKS]);
        this.broadcast({ t: "toast", msg: pr.msg });
        if (pr.id === "fast") this.prankFastT = 8;
        if (pr.id === "reverse") this.prankRevT = 5;
        if (pr.id === "gold") {
          for (const p of this.players.values()) if (!p.ghost) {
            const amount = Math.round(10 * worldRewardMul(this.world));
            p.gold += amount;
            this.fx.push({ k: "coin", x: Math.round(p.x), y: Math.round(p.y - 20), to: p.id, r: amount });
          }
        }
        if (pr.id === "heal") for (const m of this.monsters) m.hp = Math.min(m.mhp, m.hp + m.mhp * 0.2);
      }
    }
  }

  private stormLevel() {
    if (this.worldDef.gimmick !== "sandstorm" || this.phase === "rest") return 0;
    // 22초 주기 중 마지막 7초가 폭풍 (앞뒤 1초는 서서히)
    const t = this.stormClock % 22;
    if (t < 14) return 0;
    if (t < 15) return t - 14;
    if (t > 21) return 22 - t;
    return 1;
  }

  hitRadius(p: Player) {
    return PLAYER_RADIUS * p.stats.hitboxMul * p.stats.sizeMul * (p.giantT > 0 ? 2 : 1);
  }

  /** 상태이상·지형으로 받는 피해 (무적 무시, 경직 없음) */
  private tickDamage(p: Player, dmg: number) {
    if (p.ghost || this.phase === "rest" || dmg <= 0 || p.god || p.dc || p.spec) return;
    p.hp -= dmg;
    p.dmgTaken += dmg;
    if (p.hp <= 0) this.knockOut(p);
  }

  private knockOut(p: Player) {
    p.hp = 0;
    p.ghost = true;
    p.deaths++;
    p.reviveProg = 0;
    p.tauntT = 0;
    p.giantT = 0;
    p.shield = 0;
    p.dashT = 0;
    p.slowT = 0;
    p.poisonT = 0;
    p.burnT = 0;
    this.fx.push({ k: "pdie", x: p.x, y: p.y });
    p.worldDeaths++;
  }

  private applyStatus(p: Player, e: StatusEffect | undefined) {
    if (!e || p.ghost) return;
    if (e === "slow") p.slowT = Math.max(p.slowT, 2);
    if (e === "poison") p.poisonT = Math.max(p.poisonT, 3);
    if (e === "burn") p.burnT = Math.max(p.burnT, 3);
  }

  private updatePlayer(p: Player) {
    const def = CLASSES[p.cls];
    p.atkCd -= DT;
    for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - DT);
    p.invulnT -= DT;
    if (p.fallCd) p.fallCd = Math.max(0, p.fallCd - DT);
    if (p.robotT) p.robotT = Math.max(0, p.robotT - DT);
    if (p.stealthT) p.stealthT = Math.max(0, p.stealthT - DT);
    if (p.songBuffT) p.songBuffT = Math.max(0, p.songBuffT - DT);
    if (p.songFastT) p.songFastT = Math.max(0, p.songFastT - DT);
    if (p.ghost && this.phase === "play") p.ghostTime = (p.ghostTime ?? 0) + DT;
    if (p.comboT) { p.comboT = Math.max(0, p.comboT - DT); if (!p.comboT) p.combo = 0; }
    if (p.regenT) {
      // 성직자 특성 '은총': 초당 체력 5% 회복
      p.regenT = Math.max(0, p.regenT - DT);
      if (!p.ghost) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.05 * DT);
    }
    if (p.cls === "engineer" && tier(p.tal, "e_repair") >= 5 && !p.ghost) {
      // 엔지니어 특성 '상주 드론': 주변 동료 초당 체력 1%
      if (!this.pets.some((pt) => pt.ownerId === p.id && pt.kind === "drone")) this.summon(p, "drone", 99999);
      for (const q of this.players.values()) {
        if (!q.ghost && Math.hypot(q.x - p.x, q.y - p.y) < 70) q.hp = Math.min(q.stats.maxHp, q.hp + q.stats.maxHp * 0.01 * DT);
      }
    }
    if (p.droneT) {
      // 수리 드론: 주변 동료 초당 체력 4% 회복
      p.droneT = Math.max(0, p.droneT - DT);
      for (const q of this.players.values()) {
        if (!q.ghost && Math.hypot(q.x - p.x, q.y - p.y) < 80 * p.stats.skillAreaMul + p.stats.areaFlat) q.hp = Math.min(q.stats.maxHp, q.hp + q.stats.maxHp * 0.04 * DT);
      }
    }
    p.flashT -= DT;
    p.atkAnimT -= DT;
    p.tauntT -= DT;
    p.giantT -= DT;
    p.buffAtkT -= DT;
    p.castHasteT -= DT;
    p.spicyT -= DT;
    p.feastT -= DT;
    p.surgeT -= DT;
    p.shieldT -= DT;
    p.slowT -= DT;
    if (p.shieldT <= 0) p.shield = 0;
    p.revClock += DT;
    p.aim = Math.atan2(p.input.ay - p.y, p.input.ax - p.x);

    // 독·화상
    const wd = worldDmgMul(this.world);
    if (p.poisonT > 0) { p.poisonT -= DT; this.tickDamage(p, 4 * wd * DT); }
    if (p.burnT > 0) { p.burnT -= DT; this.tickDamage(p, 7 * wd * DT); }

    // 대시 충전
    if (p.dashLeft < p.stats.dashCharges) {
      p.dashRecharge -= DT;
      if (p.dashRecharge <= 0) {
        p.dashLeft++;
        p.dashRecharge = DASH_COOLDOWN * p.stats.dashCdMul;
      }
    }

    let mx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let my = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    if (this.reversed(p)) { mx = -mx; my = -my; }
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }

    if (p.ghost && this.gemMode) return;
    if (p.ghost) {
      const pos = moveCircle(this.map, p.x, p.y, PLAYER_RADIUS, mx * GHOST_SPEED * DT, my * GHOST_SPEED * DT);
      p.x = pos.x; p.y = pos.y;
      p.lastDashSeq = p.input.dashSeq;
      if (p.stats.ghostAttack && p.input.atk && p.atkCd <= 0) {
        p.atkCd = 0.7;
        this.fireProj(p, "bolt", p.aim, 180, 0.8, def.attack.dmg * 0.6, { onHit: false });
      }
      return;
    }

    // 배고픔: 안 싸우면 체력이 줄어듦
    p.idleT += DT;
    if (p.stats.hunger && p.idleT > 2 && this.phase === "play") p.hp = Math.max(1, p.hp - 2 * DT);

    // 발밑 지형
    const tile = tileAt(this.map, p.x, p.y);
    if (p.dashT <= 0 && !p.spec) {
      if (tile === "v") {
        // 구멍에 빠짐 → 피해는 한 번만 (1.5초 동안 다시 안 받음) + 안전한 곳에서 구멍 반대쪽으로 튕겨 나감
        if ((p.fallCd ?? 0) <= 0) {
          this.tickDamage(p, p.stats.maxHp * 0.06);
          p.fallCd = 1.5;
        }
        this.fx.push({ k: "fall", x: Math.round(p.x), y: Math.round(p.y) });
        const hx = p.x;
        const hy = p.y;
        p.x = p.safeX;
        p.y = p.safeY;
        // 구멍 반대쪽으로 짧게 미끄러지듯 튕겨 나감
        const d = Math.hypot(p.x - hx, p.y - hy) || 1;
        p.vx = 0;
        p.vy = 0;
        this.startDash(p, (p.x - hx) / d, (p.y - hy) / d, 0.2, 150, false);
        p.invulnT = 1;
        if (p.ghost) return;
      } else if (!this.nearHole(p.x, p.y)) {
        // 구멍 바로 옆은 '안전한 곳'으로 치지 않음
        p.safeX = p.x;
        p.safeY = p.y;
      }
      if (tile === "%") p.poisonT = Math.max(p.poisonT, 1);
      if (tile === "=") p.burnT = Math.max(p.burnT, 1.5);
    }

    // 대시
    if (p.input.dashSeq !== p.lastDashSeq) {
      p.lastDashSeq = p.input.dashSeq;
      if (p.dashLeft > 0 && p.dashT <= 0) {
        if (p.dashLeft === p.stats.dashCharges) p.dashRecharge = DASH_COOLDOWN * p.stats.dashCdMul;
        p.dashLeft--;
        this.startDash(p, len > 0 ? mx : Math.cos(p.aim), len > 0 ? my : Math.sin(p.aim), DASH_TIME, DASH_SPEED, false);
      }
    }

    if (p.dashT > 0) {
      p.dashT -= DT;
      const pos = moveCircle(this.map, p.x, p.y, PLAYER_RADIUS, p.dashDx * p.dashSpeed * DT, p.dashDy * p.dashSpeed * DT);
      p.x = pos.x; p.y = pos.y;
      p.vx = p.dashDx * p.dashSpeed * 0.3;
      p.vy = p.dashDy * p.dashSpeed * 0.3;
      if (p.stats.fireDash && !p.charging) {
        p.fireDropT -= DT;
        if (p.fireDropT <= 0) {
          p.fireDropT = 0.035;
          this.addZone("fire", p.x, p.y, 8, p.id, 4, 2);
        }
      }
      if (p.charging) {
        for (const m of [...this.monsters]) {
          if (p.chargeHit.has(m.id) || m.spawnT > 0) continue;
          if (Math.hypot(m.x - p.x, m.y - p.y) > m.r + 10) continue;
          p.chargeHit.add(m.id);
          if (p.lethalDash) {
            // 닌자 천벌: 보스는 큰 피해, 나머지는 즉사 (보석 쟁탈전 대결 상대는 일반 피해)
            if (m.kind === "dummy" || m.kind === "chest") continue;
            if (m.def.boss || m.kind === "pvp") this.dealDamage(m, m.kind === "pvp" ? 30 : 60, p, { skill: true });
            else this.dealDamage(m, m.hp + 9999, p, { raw: true, noCrit: true });
            this.fx.push({ k: "crit", x: Math.round(m.x), y: Math.round(m.y) });
            continue;
          }
          m.stunT = Math.max(m.stunT, p.stats.chargeBoost ? 2 : 1);
          this.dealDamage(m, 20, p, { skill: true });
        }
      }
      if (p.dashT <= 0) { p.charging = false; p.lethalDash = false; }
    } else {
      let speed = def.speed * p.stats.speedMul;
      if (p.feastT > 0 && p.feastFast) speed *= 1.2;
      if (p.slowT > 0) speed *= 0.6;
      if (tile === "~") speed *= 0.6;
      if (tile === "%") speed *= 0.8;
      if (this.prankFastT > 0) speed *= 1.4;
      if (this.gem.holder === p.id) speed *= 0.85;
      const tx = mx * speed;
      const ty = my * speed;
      if (tile === "_") {
        // 빙판: 관성 때문에 미끄러짐
        const k = Math.min(1, DT * 2.5);
        p.vx += (tx - p.vx) * k;
        p.vy += (ty - p.vy) * k;
      } else {
        p.vx = tx;
        p.vy = ty;
      }
      // 관전·투명 모드는 벽 통과 (맵 밖으로는 못 나감)
      const pos = p.spec
        ? { x: Math.max(8, Math.min(this.map.w * 16 - 8, p.x + p.vx * DT)), y: Math.max(8, Math.min(this.map.h * 16 - 8, p.y + p.vy * DT)) }
        : moveCircle(this.map, p.x, p.y, PLAYER_RADIUS, p.vx * DT, p.vy * DT);
      if (pos.x === p.x) p.vx = 0;
      if (pos.y === p.y) p.vy = 0;
      p.x = pos.x; p.y = pos.y;
    }

    // 바드 용기의 노래 (Lv10 패시브, 항상 켜짐): 주변 동료 평타 피해 +20%
    p.songOn = p.cls === "bard" && p.level >= SKILL_UNLOCK[3];
    if (p.songOn) {
      const r = ((105 + (tier(p.tal, "b_cheer") >= 3 ? 15 : 0)) * p.stats.skillAreaMul + p.stats.areaFlat) * (p.stats.loud ? 1.5 : 1);
      const march = tier(p.tal, "b_cheer") >= 5;
      for (const q of this.players.values()) {
        if (!q.ghost && Math.hypot(q.x - p.x, q.y - p.y) < r) {
          q.songBuffT = 0.3;
          if (march) q.songFastT = 0.3;
        }
      }
    }

    // 기본 공격
    if (p.input.atk && p.atkCd <= 0) {
      // 연속 시전: 초당 공격 +0.8회 (고정값)
      const mul = p.stats.atkSpdMul + (p.castHasteT > 0 ? 0.8 * def.attack.cd : 0);
      p.atkCd = def.attack.cd / (mul * (p.spicyT > 0 ? 1.3 : 1) * ((p.songFastT ?? 0) > 0 ? 1.15 : 1));
      // 검사 특성 '폭주': 체력 30% 이하면 공격 속도 2배
      if (tier(p.tal, "w_berserk") >= 5 && p.hp <= p.stats.maxHp * 0.3) p.atkCd /= 1.6;
      p.atkAnimT = 0.15;
      p.idleT = 0;
      p.atkCount++;
      let aim = p.aim;
      if (p.stats.aimShake) aim += (Math.random() - 0.5) * 0.7;
      let base = def.attack.dmg * (p.cls === "cook" && p.stats.chef ? 1.4 : 1);
      // 닌자 연막탄 뒤 첫 공격 2배
      let forceCrit = false;
      if (p.nextDouble) {
        base *= p.stats.assassin ? 3 : 2;
        p.nextDouble = false;
        p.stealthT = 0;
        forceCrit = tier(p.tal, "n_assn") >= 5;
      }
      const size = p.stats.sizeMul * (p.giantT > 0 ? 2 : 1);
      if ((p.robotT ?? 0) > 0) {
        // 엔지니어 거대 로봇: 평타가 폭발 미사일
        p.atkCd = 0.42 / p.stats.atkSpdMul;
        const pr = this.fireProj(p, "missile", aim, 240, 0.9, 13, { onHit: true });
        pr.explode = 22;
      } else if (def.attack.kind === "flame") {
        // 화염방사: 짧은 부채꼴, 맞은 적은 화상(지속 피해). 평타 효과는 3번에 1번만
        const range = (def.attack.range ?? 42) * (p.stats.napalm ? 1.5 : 1) * Math.sqrt(size);
        const arc = p.stats.multishot ? 1.6 : 1;
        if (p.atkCount % 2 === 0) this.fx.push({ k: "flame", x: Math.round(p.x), y: Math.round(p.y), a: aim, r: Math.round(range) });
        for (const m of [...this.monsters]) {
          if (m.spawnT > 0) continue;
          const d = Math.hypot(m.x - p.x, m.y - p.y);
          if (d > range + m.r) continue;
          let diff = Math.atan2(m.y - p.y, m.x - p.x) - aim;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (Math.abs(diff) > arc / 2) continue;
          this.dealDamage(m, base, p, { onHit: p.atkCount % 3 === 0, noCrit: p.atkCount % 3 !== 0 });
          if (m.kind !== "pvp" && m.kind !== "dummy") {
            m.poisonT = Math.max(m.poisonT, 2);
            m.poisonDps = Math.max(m.poisonDps, 3 * p.stats.atkMul * (p.stats.napalm ? 2 : 1));
            m.poisonOwner = p.id;
          }
        }
        // 기름 장판에 불이 닿으면 폭발
        for (const z of [...this.zones]) {
          if (z.kind !== "oil") continue;
          const d = Math.hypot(z.x - p.x, z.y - p.y);
          let diff = Math.atan2(z.y - p.y, z.x - p.x) - aim;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (d < range + z.r && Math.abs(diff) < arc) this.igniteOil(z, p);
        }
      } else if (def.attack.kind === "melee") {
        const range = ((def.attack.range ?? 24) + p.stats.pierce * 6) * Math.sqrt(size) + (p.giantT > 0 ? 16 : 0);
        const arc = p.stats.multishot ? (200 * Math.PI) / 180 : (110 * Math.PI) / 180;
        this.fx.push({ k: "swing", x: p.x, y: p.y, a: aim, r: range });
        for (const m of [...this.monsters]) {
          if (m.spawnT > 0) continue;
          const d = Math.hypot(m.x - p.x, m.y - p.y);
          if (d > range + m.r) continue;
          let diff = Math.atan2(m.y - p.y, m.x - p.x) - aim;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          if (Math.abs(diff) > arc / 2) continue;
          this.dealDamage(m, base, p, { onHit: true, crit: forceCrit });
          // 타격감: 일반 몹은 살짝 밀려남
          if (m.hp > 0 && !m.def.boss && m.kind !== "dummy" && m.kind !== "chest" && m.kind !== "pvp" && m.def.ai !== "turret" && m.def.ai !== "shield") {
            const dd = Math.hypot(m.x - p.x, m.y - p.y) || 1;
            this.moveMonster(m, ((m.x - p.x) / dd) * 3, ((m.y - p.y) / dd) * 3);
          }
          // 요리사 프라이팬: 가끔 기절
          if (p.cls === "cook" && m.kind !== "pvp" && Math.random() < (p.stats.chef ? 0.3 : 0.1)) m.stunT = Math.max(m.stunT, 0.6);
        }
      } else {
        // 궁수 특성 '삼연발': 3번째 평타마다 3갈래
        const triple = !p.stats.multishot && tier(p.tal, "a_rapid") >= 5 && p.atkCount % 3 === 0;
        const angles = p.stats.multishot || triple ? [aim - 0.25, aim, aim + 0.25] : [aim];
        const each = p.stats.multishot ? base * 0.5 : base;
        const life = (def.attack.projLife ?? 1) * (tier(p.tal, "a_snipe") >= 3 ? 1.2 : 1);
        for (const a of angles) {
          const pr = this.fireProj(p, def.attack.projKind ?? "arrow", a, def.attack.projSpeed ?? 200, life, each, { onHit: true });
          if (def.attack.explode) pr.explode = def.attack.explode;
          if (pr.kind === "note") pr.hops = 1 + (p.stats.echo ? 2 : 0);
          if (p.surgeT > 0) pr.explode = Math.max(pr.explode, 24);
        }
      }
      if (p.stats.spinEvery && p.atkCount % p.stats.spinEvery === 0) {
        const r = 28 * Math.sqrt(size);
        this.fx.push({ k: "spin", x: p.x, y: p.y, r });
        for (const m of [...this.monsters]) {
          if (m.spawnT <= 0 && Math.hypot(m.x - p.x, m.y - p.y) < r + m.r) this.dealDamage(m, base, p, {});
        }
      }
    }
  }

  reversed(p: Player) {
    return (!!p.stats.reverseCtrl && p.revClock % 20 > 17) || this.prankRevT > 0;
  }

  startDash(p: Player, dx: number, dy: number, time: number, speed: number, charging: boolean) {
    p.dashT = time;
    p.dashDx = dx;
    p.dashDy = dy;
    p.dashSpeed = speed;
    p.charging = charging;
    p.chargeHit = new Set();
  }

  fireProj(p: Player, kind: ProjKind, a: number, speed: number, life: number, dmg: number, opts: { skill?: boolean; onHit?: boolean }) {
    const pr: Proj = {
      id: this.nextId(), kind, fromPlayer: true, ownerId: p.id,
      x: p.x + Math.cos(a) * 6, y: p.y + Math.sin(a) * 6,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life, dmg, pierce: p.stats.pierce, bounce: p.stats.bounce, explode: 0, hitR: 3,
      skill: !!opts.skill, onHit: !!opts.onHit, traveled: 0, hit: new Set(),
    };
    this.projs.push(pr);
    return pr;
  }

  private monsterShot(m: Monster, a: number, kind: ProjKind, speed: number, effect?: StatusEffect) {
    this.projs.push({
      id: this.nextId(), kind, fromPlayer: false, ownerId: m.id,
      x: m.x, y: m.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 2.2, dmg: m.dmg, pierce: 0, bounce: 0, explode: 0, hitR: 2,
      skill: false, onHit: false, traveled: 0, effect, hit: new Set(),
    });
  }

  /** 엔지니어 거미 포탑 수: 레벨 1/3/6 에 1/2/3대 + 추가 포탑 카드 */
  /** v0.9: 따라다니는 거미 포탑은 1대 고정 (+ 추가 포탑 카드 1장) */
  private spiderCount(p: Player) {
    if (p.cls !== "engineer") return 0;
    return 1 + Math.min(1, p.stats.turretBonus);
  }

  petsOf(ownerId: number, kind: Pet["kind"]) {
    return this.pets.filter((pt) => pt.ownerId === ownerId && pt.kind === kind);
  }

  removePet(id: number) {
    this.pets = this.pets.filter((pt) => pt.id !== id);
  }

  /** 시간제 소환물 (포탑 설치 · 드론 · 분신 · 유령) */
  summon(p: Player, kind: Pet["kind"], life: number, at?: { x: number; y: number }) {
    this.pets.push({ id: this.nextId(), ownerId: p.id, x: at?.x ?? p.x, y: at?.y ?? p.y, cd: 0.5, kind, aim: 0, life });
  }

  private updatePets() {
    for (const p of this.players.values()) {
      for (const kind of ["clone", "spider"] as const) {
        const want = kind === "clone" ? p.stats.clones : this.spiderCount(p);
        const have = this.pets.filter((pt) => pt.ownerId === p.id && pt.kind === kind).length;
        for (let i = have; i < want; i++) {
          this.pets.push({ id: this.nextId(), ownerId: p.id, x: p.x, y: p.y, cd: 1, kind, aim: 0 });
        }
      }
    }
    // 시간제 소환물 정리
    for (const pt of this.pets) if (pt.life !== undefined) pt.life -= DT;
    this.pets = this.pets.filter((pt) => pt.life === undefined || pt.life > 0);
    for (const pt of this.pets) {
      const o = this.players.get(pt.ownerId);
      if (!o) continue;
      if (pt.kind !== "turret") {
        const mine = this.pets.filter((q) => q.ownerId === o.id && q.kind !== "turret");
        const idx = mine.indexOf(pt);
        // 주인 뒤쪽에 반원으로 졸졸 따라다님 (드론은 머리 위)
        const ang = Math.PI / 2 + (idx - (mine.length - 1) / 2) * 0.7;
        const tx = pt.kind === "drone" ? o.x : o.x + Math.cos(ang) * 16;
        const ty = pt.kind === "drone" ? o.y - 22 : o.y + Math.sin(ang) * 10;
        pt.x += (tx - pt.x) * Math.min(1, DT * 5);
        pt.y += (ty - pt.y) * Math.min(1, DT * 5);
      }
      if (pt.kind === "drone") continue;
      pt.cd -= DT;
      if (pt.cd > 0 || o.ghost) continue;
      let best: Monster | null = null;
      let bd = pt.kind === "spider" ? 150 : pt.kind === "turret" ? 200 : 160;
      for (const m of this.monsters) {
        if (m.spawnT > 0 || m.kind === "chest") continue;
        if (m.kind === "pvp" && !this.canPvp(o.id, m.owner ?? -1)) continue;
        const d = Math.hypot(m.x - pt.x, m.y - pt.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (!best) continue;
      const a = Math.atan2(best.y - pt.y, best.x - pt.x);
      pt.aim = a;
      let pr: Proj;
      if (pt.kind === "spider") {
        // v0.9: 보조 느낌만 (느리고 약하게)
        pt.cd = 1.4;
        pr = this.fireProj(o, "turret", a, 220, 0.8, 3, {});
        pr.pierce = 0;
      } else if (pt.kind === "turret") {
        pt.cd = tier(o.tal, "e_turret") >= 4 ? 0.45 / 1.4 : 0.45;
        pr = this.fireProj(o, "turret", a, 260, 0.9, 6, { skill: true });
        pr.pierce = 0;
      } else if (pt.kind === "shadow") {
        pt.cd = 0.5;
        pr = this.fireProj(o, "shuriken", a, 260, 0.6, 6, {});
        pr.pierce = 0;
      } else if (pt.kind === "ghost") {
        pt.cd = 0.8;
        pr = this.fireProj(o, "dark", a, 190, 1, 7, { skill: true });
        pr.pierce = 0;
      } else {
        pt.cd = 0.8;
        pr = this.fireProj(o, "bolt", a, 190, 0.9, 6, {});
        pr.pierce = 0;
      }
      pr.x = pt.x;
      pr.y = pt.y;
      pr.bounce = 0;
    }
  }

  /** 요리사 기름 장판이 불에 닿으면 폭발 */
  igniteOil(z: Zone, p: Player) {
    if (z.gone) return;
    z.gone = true;
    this.zones = this.zones.filter((o) => o !== z);
    this.explode(z.x, z.y, z.r, 50, p, true);
  }

  private updateRevives() {
    const alive = [...this.players.values()].filter((p) => !p.ghost);
    for (const g of this.players.values()) {
      if (!g.ghost) continue;
      const helpers = alive.filter((a) => Math.hypot(a.x - g.x, a.y - g.y) < REVIVE_RANGE);
      if (helpers.length) {
        const mul = Math.max(...helpers.map((h) => h.stats.reviveMul), g.stats.reviveMul > 1 ? g.stats.reviveMul : 1);
        g.reviveProg += (DT * mul) / REVIVE_TIME;
        if (g.reviveProg >= 1) {
          this.revive(g);
          helpers[0].revives++;
          if (helpers[0].revives >= 10) this.ach(helpers[0], "medic");
        }
      } else {
        g.reviveProg = Math.max(0, g.reviveProg - DT * 0.5);
      }
    }
  }

  revive(g: Player, hpRatio = REVIVE_HP) {
    g.ghost = false;
    g.hp = Math.ceil(g.stats.maxHp * hpRatio);
    g.invulnT = 1.5;
    g.reviveProg = 0;
    this.fx.push({ k: "revive", x: g.x, y: g.y });
  }

  private targetFor(m: Monster): Player | null {
    let best: Player | null = null;
    let bestScore = Infinity;
    for (const p of this.players.values()) {
      if (p.ghost || p.dc || p.spec || (p.stealthT ?? 0) > 0) continue;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (p.tauntT > 0 && d < p.tauntR * 1.5) return p;
      // 어그로 카드: 멀리 있어도 나를 노림
      const score = d - (p.stats.aggro > 0 && d < 260 ? 150 * p.stats.aggro : 0);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  moveMonster(m: Monster, dx: number, dy: number) {
    if (m.def.phase) {
      // 벽 통과 (맵 밖으로만 안 나가게)
      m.x = Math.max(20, Math.min(this.map.w * 16 - 20, m.x + dx));
      m.y = Math.max(20, Math.min(this.map.h * 16 - 20, m.y + dy));
      return;
    }
    // 날아다니는 몬스터(하피·정령·번개 구름 등)는 구멍 위로도 다님. 걷는 몬스터만 구멍을 피함
    const flies = m.def.base === "flyer" || m.kind === "thunder_cloud";
    const pos = moveCircle(this.map, m.x, m.y, Math.min(m.r, 7), dx, dy, !flies);
    m.x = pos.x; m.y = pos.y;
  }

  private updateMonster(m: Monster) {
    if (m.kind === "pvp") return;
    m.flashT -= DT;
    if (m.kind === "dummy") {
      m.hp = m.mhp;
      m.log = m.log.filter((e) => this.time - e.t < 5);
      return;
    }
    if (m.kind === "chest") return;
    if (m.spawnT > 0) { m.spawnT -= DT; return; }
    m.stunT -= DT;
    m.frozenT -= DT;
    m.rootT -= DT;
    m.slowT -= DT;
    if (m.curseT) m.curseT = Math.max(0, m.curseT - DT);
    if (m.poisonT > 0) {
      m.poisonT -= DT;
      m.poisonTick -= DT;
      if (m.poisonTick <= 0) {
        m.poisonTick = 0.5;
        const owner = this.players.get(m.poisonOwner);
        if (owner) this.dealDamage(m, m.poisonDps * 0.5, owner, { raw: true, noCrit: true });
        if (m.hp <= 0) return;
      }
    }
    if (m.stunT > 0 || m.frozenT > 0) { m.windT = 0; m.rushT = 0; return; }
    m.atkCd -= DT;
    const def = m.def;
    const target = this.targetFor(m);
    if (!target) return;
    const dx = target.x - m.x;
    const dy = target.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const canMove = m.rootT <= 0;
    const enraged = (!!def.boss || m.elite === "rage") && m.hp < m.mhp / 2;
    const spd = m.speed * (m.slowT > 0 ? 0.5 : 1) * (enraged ? (m.elite === "rage" ? 1.7 : 1.3) : 1) * (this.mod === "fast" ? 1.4 : 1);
    // 엘리트 순간이동: 가끔 대상 뒤로
    if (m.elite === "blink") {
      m.blinkCd -= DT;
      if (m.blinkCd <= 0 && dist < 200) {
        m.blinkCd = 4 + Math.random() * 2;
        const bx = target.x + ux * 24, by = target.y + uy * 24;
        if (!isWallAt(this.map, bx, by)) {
          this.fx.push({ k: "blink", x: Math.round(m.x), y: Math.round(m.y), pts: [Math.round(bx), Math.round(by)] });
          m.x = bx;
          m.y = by;
          m.busyT = 0.4;
        }
      }
    }

    m.faceA = Math.atan2(dy, dx);
    this.updateVolleys(m, target);

    // 돌진 (준비 → 돌진)
    if (m.windT > 0) {
      m.windT -= DT;
      if (m.windT <= 0) m.rushT = def.boss ? 0.6 : 0.45;
    } else if (m.rushT > 0) {
      m.rushT -= DT;
      if (canMove) this.moveMonster(m, Math.cos(m.rushA) * m.rushSpeed * DT, Math.sin(m.rushA) * m.rushSpeed * DT);
    } else if (m.busyT > 0) {
      m.busyT -= DT;
    } else if (def.boss) {
      if (canMove) this.moveMonster(m, ux * spd * DT, uy * spd * DT);
      m.abilityCd -= DT;
      if (enraged && !m.enrageDone) {
        // 광폭화 순간: 경고 + 나선 탄막 + 지진
        m.enrageDone = true;
        this.title("광폭화!", `${def.name}이(가) 화났어요`, "#ff4a4a");
        this.bossAbility(m, "spiral", target, true);
        this.bossAbility(m, "quake", target, true);
        m.abilityCd = 3;
      }
      if (m.abilityCd <= 0) {
        // v1.0: 모든 보스에 지진 파동 · 연속 사격 추가, 광폭화 후엔 나선 탄막까지
        const abilities: BossAbility[] = [...def.boss.abilities, "quake", "barrage", ...(enraged ? ["spiral" as const] : [])];
        const ab = abilities[m.abilityIdx % abilities.length];
        m.abilityIdx++;
        m.abilityCd = (enraged ? 2 : 2.9) + Math.random() * 0.7;
        this.bossAbility(m, ab, target, enraged);
      }
    } else {
      switch (def.ai) {
        case "chaser":
          if (canMove) this.moveMonster(m, ux * spd * DT, uy * spd * DT);
          break;
        case "shooter": {
          let vx = 0, vy = 0;
          if (dist < 70) { vx = -ux; vy = -uy; }
          else if (dist > 120) { vx = ux; vy = uy; }
          else { vx = -uy * m.strafe * 0.6; vy = ux * m.strafe * 0.6; }
          if (Math.random() < 0.01) m.strafe *= -1;
          if (canMove) this.moveMonster(m, vx * spd * DT, vy * spd * DT);
          this.tryShoot(m, target, dist);
          break;
        }
        case "turret":
          this.tryShoot(m, target, dist);
          break;
        case "charger":
          if (dist < 110 && m.atkCd <= 0) {
            m.atkCd = 2.4 + Math.random();
            m.windT = 0.6;
            m.rushA = Math.atan2(dy, dx);
            m.rushSpeed = 190;
          } else if (canMove) {
            this.moveMonster(m, ux * spd * 0.8 * DT, uy * spd * 0.8 * DT);
          }
          break;
        case "bomber":
          // 자폭: 가까이 오면 심지(0.8초, 깜빡임) 후 폭발
          if (m.fuseT !== undefined) {
            m.fuseT -= DT;
            m.flashT = Math.floor(m.fuseT * 10) % 2 ? 0.05 : 0;
            if (m.fuseT <= 0) { this.selfDestruct(m); return; }
          } else {
            if (canMove) this.moveMonster(m, ux * spd * DT, uy * spd * DT);
            if (dist < 22) m.fuseT = 0.8;
          }
          return;
        case "shield":
          // 방패병: 정면 피해 75% 감소, 느리게 다가옴
          if (canMove) this.moveMonster(m, ux * spd * 0.85 * DT, uy * spd * 0.85 * DT);
          break;
        case "summoner": {
          // 주술사: 거리 유지하며 6초마다 졸개 2마리 (최대 6)
          let vx = 0, vy = 0;
          if (dist < 90) { vx = -ux; vy = -uy; } else if (dist > 150) { vx = ux; vy = uy; }
          if (canMove) this.moveMonster(m, vx * spd * DT, vy * spd * DT);
          if (m.atkCd <= 0 && dist < 220) {
            m.atkCd = 6;
            m.busyT = 0.8;
            const mine = this.monsters.filter((o) => o.summonBy === m.id).length;
            const kind = WORLDS[(this.powerWorld || this.world) - 1]?.monsters[0] ?? "slime";
            for (let k = 0; k < Math.min(2, 6 - mine); k++) {
              const a = Math.random() * Math.PI * 2;
              const pos = { x: m.x + Math.cos(a) * 18, y: m.y + Math.sin(a) * 18 };
              if (isWallAt(this.map, pos.x, pos.y)) continue;
              const s = this.spawnMonster(kind, pos);
              if (s) { s.summonBy = m.id; s.xp *= 0.3; s.gold = 0; }
            }
            this.fx.push({ k: "blink", x: Math.round(m.x), y: Math.round(m.y) });
          }
          break;
        }
        case "barrage": {
          // 탄막 술사: 거리 유지, 원형 탄막 + 짧은 나선
          let vx = 0, vy = 0;
          if (dist < 80) { vx = -ux; vy = -uy; } else if (dist > 140) { vx = ux; vy = uy; }
          else { vx = -uy * m.strafe * 0.5; vy = ux * m.strafe * 0.5; }
          if (canMove) this.moveMonster(m, vx * spd * DT, vy * spd * DT);
          if (m.atkCd <= 0 && dist < 200) {
            m.atkCd = (def.proj?.cd ?? 3.6) + Math.random() * 0.8;
            m.busyT = 0.5;
            const pj = def.proj!;
            const base = Math.random() * Math.PI * 2;
            for (let i = 0; i < pj.count; i++) this.monsterShot(m, base + (i / pj.count) * Math.PI * 2, pj.kind, pj.speed, pj.effect);
            m.spiralT = 0.6;
            m.spiralA = base;
          }
          break;
        }
        case "caster":
          if (dist > 100 && canMove) this.moveMonster(m, ux * spd * DT, uy * spd * DT);
          if (m.atkCd <= 0 && dist < 180) {
            m.atkCd = 3 + Math.random();
            m.busyT = 0.5;
            const golem = def.base === "golem";
            this.addZone(golem ? "slam" : "strike", target.x, target.y, golem ? 30 : 22, m.id, m.dmg, golem ? 1 : 1.1);
          }
          break;
      }
    }

    // 몸통 박치기
    if (m.dmg <= 0) return;
    for (const p of this.players.values()) {
      if (p.ghost) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) < m.r + this.hitRadius(p)) {
        const dmg = m.rushT > 0 ? m.dmg * 1.5 : m.dmg;
        if (this.hurtPlayer(p, dmg, false, m)) this.applyStatus(p, def.onHit);
      }
    }
  }

  private tryShoot(m: Monster, target: Player, dist: number) {
    const pj = m.def.proj;
    if (!pj || m.atkCd > 0 || dist > 190) return;
    m.atkCd = pj.cd + Math.random() * 0.6;
    const a = Math.atan2(target.y - m.y, target.x - m.x);
    for (let i = 0; i < pj.count; i++) {
      const off = (i - (pj.count - 1) / 2) * pj.spread;
      this.monsterShot(m, a + off, pj.kind, pj.speed, pj.effect);
    }
  }

  private bossAbility(m: Monster, ab: BossAbility, target: Player, enraged: boolean) {
    const def = m.def;
    switch (ab) {
      case "slam":
        m.busyT = 0.9;
        this.addZone("slam", target.x, target.y, 46, m.id, m.dmg * 1.4, 0.9);
        break;
      case "summon": {
        const kind = def.boss?.summon ?? "slime";
        const minions = this.monsters.filter((o) => o.kind === kind).length;
        if (minions >= 12) break;
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + Math.random();
          const pos = { x: m.x + Math.cos(a) * 30, y: m.y + Math.sin(a) * 30 };
          if (!isWallAt(this.map, pos.x, pos.y)) this.spawnMonster(kind, pos);
        }
        break;
      }
      case "ring": {
        const pj = def.proj;
        if (!pj) break;
        m.busyT = 0.5;
        const waves = enraged ? 2 : 1;
        for (let w = 0; w < waves; w++) {
          const base = Math.random() * Math.PI * 2 + w * (Math.PI / pj.count);
          for (let i = 0; i < pj.count; i++) this.monsterShot(m, base + (i / pj.count) * Math.PI * 2, pj.kind, pj.speed * (1 - w * 0.25), pj.effect);
        }
        break;
      }
      case "charge":
        m.windT = 0.75;
        m.rushA = Math.atan2(target.y - m.y, target.x - m.x);
        m.rushSpeed = 230;
        break;
      case "strikes": {
        const alive = [...this.players.values()].filter((p) => !p.ghost);
        for (const p of alive) {
          for (let k = 0; k < (enraged ? 2 : 1); k++) {
            this.addZone("strike", p.x + (Math.random() - 0.5) * 40, p.y + (Math.random() - 0.5) * 40, 26, m.id, m.dmg * 1.2, 1.1);
          }
        }
        break;
      }
      case "quake": {
        // 지진 파동: 보스 주위로 두 겹의 충격파 (안쪽 먼저, 바깥쪽 나중)
        m.busyT = 1.1;
        for (const [rad, count, delay] of [[48, 8, 0.9], [96, 14, 1.35]] as const) {
          const off = Math.random() * Math.PI;
          for (let i = 0; i < count; i++) {
            const a = off + (i / count) * Math.PI * 2;
            const x = m.x + Math.cos(a) * rad, y = m.y + Math.sin(a) * rad;
            if (!isWallAt(this.map, x, y)) this.addZone("slam", x, y, 22, m.id, m.dmg * 1.2, delay);
          }
        }
        this.addZone("slam", m.x, m.y, 30, m.id, m.dmg * 1.2, 0.9);
        break;
      }
      case "barrage":
        // 연속 사격: 대상에게 부채꼴 5발씩 3번 (광폭화 5번)
        m.burstN = enraged ? 5 : 3;
        m.burstT = 0.3;
        break;
      case "spiral":
        // 나선 탄막 2.5초
        m.spiralT = 2.5;
        m.spiralA = Math.random() * Math.PI * 2;
        m.busyT = 1;
        break;
      case "teleport": {
        const to = randomFloorPoint(this.map, target, 60);
        const near = Math.hypot(to.x - target.x, to.y - target.y) < 160 ? to : { x: target.x + 80, y: target.y };
        if (isWallAt(this.map, near.x, near.y)) break;
        this.fx.push({ k: "blink", x: Math.round(m.x), y: Math.round(m.y), pts: [Math.round(near.x), Math.round(near.y)] });
        m.x = near.x;
        m.y = near.y;
        m.busyT = 0.4;
        break;
      }
    }
  }

  /** 보스 연속 사격 · 나선 탄막 진행 */
  private updateVolleys(m: Monster, target: Player) {
    const pk = m.def.proj?.kind ?? "spirit";
    const eff = m.def.proj?.effect;
    if (m.burstN && m.burstN > 0) {
      m.burstT = (m.burstT ?? 0) - DT;
      if (m.burstT <= 0) {
        m.burstT = 0.28;
        m.burstN--;
        const a = Math.atan2(target.y - m.y, target.x - m.x);
        for (let i = -2; i <= 2; i++) this.monsterShot(m, a + i * 0.16, pk, 135, eff);
      }
    }
    if (m.spiralT && m.spiralT > 0) {
      m.spiralT -= DT;
      m.burstT = (m.burstT ?? 0);
      // 2틱마다 반대 방향 2발씩, 각도는 계속 돌아감
      if (Math.round(m.spiralT / DT) % 2 === 0) {
        const a = m.spiralA ?? 0;
        this.monsterShot(m, a, pk, 95, eff);
        this.monsterShot(m, a + Math.PI, pk, 95, eff);
        if (m.def.boss) this.monsterShot(m, a + Math.PI / 2, pk, 95, eff), this.monsterShot(m, a - Math.PI / 2, pk, 95, eff);
        m.spiralA = a + 0.32;
      }
    }
  }

  /** 폭탄 버섯 자폭 (보상 없음) */
  private selfDestruct(m: Monster) {
    this.monsters = this.monsters.filter((o) => o !== m);
    this.fx.push({ k: "boom", x: Math.round(m.x), y: Math.round(m.y), r: 34 });
    for (const p of this.players.values()) {
      if (!p.ghost && Math.hypot(p.x - m.x, p.y - m.y) < 34 + this.hitRadius(p)) this.hurtPlayer(p, m.dmg * 2.2, false, m);
    }
  }

  private separateMonsters() {
    const ms = this.monsters;
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        const a = ms[i], b = ms[j];
        if (a.kind === "pvp" || b.kind === "pvp") continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        // 빠른 거르기: 상자 범위 밖이면 거리 계산 안 함
        if (dx > min || dx < -min || dy > min || dy < -min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= min) continue;
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        const fixed = (m: Monster) => !!m.def.boss || m.def.ai === "turret";
        if (!fixed(a)) this.moveMonster(a, -ux * push, -uy * push);
        if (!fixed(b)) this.moveMonster(b, ux * push, uy * push);
      }
    }
  }

  private updateProjs() {
    const keep: Proj[] = [];
    for (const pr of this.projs) {
      pr.life -= DT;
      const sx = pr.vx * DT, sy = pr.vy * DT;
      pr.traveled += Math.hypot(sx, sy);
      let dead = pr.life <= 0;
      if (dead && pr.boomer) {
        // 닌자 특성 '부메랑': 끝까지 날아간 뒤 되돌아옴 (한 번)
        pr.boomer = false;
        pr.vx = -pr.vx;
        pr.vy = -pr.vy;
        pr.life = 0.7;
        pr.hit.clear();
        pr.pierce = Math.max(pr.pierce, 1);
        dead = false;
      }
      if (isWallAt(this.map, pr.x + sx, pr.y + sy)) {
        if (pr.bounce > 0) {
          pr.bounce--;
          if (isWallAt(this.map, pr.x + sx, pr.y)) pr.vx = -pr.vx;
          if (isWallAt(this.map, pr.x, pr.y + sy)) pr.vy = -pr.vy;
        } else {
          pr.x += sx; pr.y += sy;
          dead = true;
        }
      } else {
        pr.x += sx; pr.y += sy;
      }
      const owner = pr.fromPlayer ? this.players.get(pr.ownerId) : undefined;
      if (!dead && pr.fromPlayer) {
        // (몬스터가 죽으면 this.monsters 는 새 배열로 바뀌므로 복사 없이 순회해도 안전)
        for (const m of this.monsters) {
          if (m.spawnT > 0 || pr.hit.has(m.id)) continue;
          const reach = m.r + pr.hitR;
          const ddx = m.x - pr.x, ddy = m.y - pr.y;
          if (ddx > reach || ddx < -reach || ddy > reach || ddy < -reach) continue;
          if (Math.hypot(ddx, ddy) > reach) continue;
          pr.hit.add(m.id);
          if (!owner) { dead = true; break; }
          const sniper = owner.stats.sniper ? 1 + Math.min(1, pr.traveled / 200)
            : tier(owner.tal, "a_snipe") >= 5 ? 1 + Math.min(0.5, pr.traveled / 400) : 1;
          if (pr.explode > 0) {
            this.dealDamage(m, pr.dmg * sniper, owner, { skill: pr.skill, onHit: pr.onHit });
            this.explode(pr.x, pr.y, pr.explode, pr.dmg * 0.7, owner, pr.skill, m.id);
            dead = true;
            break;
          }
          this.dealDamage(m, pr.dmg * sniper, owner, { skill: pr.skill, onHit: pr.onHit });
          // 바드 음표: 근처 다른 적에게 튕김
          if (pr.hops && pr.hops > 0) {
            const next = this.monsters
              .filter((o) => o !== m && !pr.hit.has(o.id) && o.spawnT <= 0 && o.kind !== "chest" && (o.kind !== "pvp" || this.canPvp(owner.id, o.owner ?? -1)))
              .sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
            if (next && Math.hypot(next.x - m.x, next.y - m.y) < 80) {
              pr.hops--;
              const sp = Math.hypot(pr.vx, pr.vy);
              const a = Math.atan2(next.y - pr.y, next.x - pr.x);
              pr.vx = Math.cos(a) * sp;
              pr.vy = Math.sin(a) * sp;
              pr.life = Math.max(pr.life, 0.6);
              break;
            }
          }
          if (pr.pierce-- <= 0) { dead = true; break; }
        }
      } else if (dead && pr.fromPlayer && pr.explode > 0 && owner) {
        // 마법탄은 벽이나 사거리 끝에서도 터짐
        this.explode(pr.x, pr.y, pr.explode, pr.dmg * 0.7, owner, pr.skill);
      } else if (!dead && !pr.fromPlayer) {
        for (const p of this.players.values()) {
          if (p.ghost || Math.hypot(p.x - pr.x, p.y - pr.y) > this.hitRadius(p) + pr.hitR) continue;
          if (this.hurtPlayer(p, pr.dmg)) this.applyStatus(p, pr.effect);
          dead = true;
          break;
        }
      }
      if (!dead) keep.push(pr);
    }
    this.projs = keep;
  }

  explode(x: number, y: number, r: number, dmg: number, owner: Player | undefined, skill: boolean, skipId = -1) {
    this.fx.push({ k: "boom", x, y, r });
    if (!owner) return;
    // 폭발이 기름 장판에 닿으면 연쇄 폭발
    for (const z of [...this.zones]) {
      if (z.kind === "oil" && this.zones.includes(z) && Math.hypot(z.x - x, z.y - y) < z.r + r) this.igniteOil(z, owner);
    }
    for (const m of [...this.monsters]) {
      if (m.id === skipId || m.spawnT > 0) continue;
      if (Math.hypot(m.x - x, m.y - y) < r + m.r) this.dealDamage(m, dmg, owner, { skill });
    }
  }

  addZone(kind: ZoneKind, x: number, y: number, r: number, ownerId: number, dmg: number, dur: number, stun = 0) {
    const z: Zone = { id: this.nextId(), kind, x, y, r, ownerId, dmg, elapsed: 0, dur, tickT: 0, stun };
    this.zones.push(z);
    return z;
  }

  private updateZones() {
    const keep: Zone[] = [];
    /** 엔지니어 특성 '연쇄 폭발'로 같이 터진 지뢰 */
    const boomed = new Set<Zone>();
    const orig = this.zones;
    for (const z of orig) {
      if (boomed.has(z) || z.gone) continue;
      z.elapsed += DT;
      const owner = this.players.get(z.ownerId);
      const inside = () => this.monsters.filter((m) => m.spawnT <= 0 && Math.hypot(m.x - z.x, m.y - z.y) < z.r + m.r);
      if (z.kind === "fire" || z.kind === "rain" || z.kind === "blackhole") {
        z.tickT -= DT;
        if (z.tickT <= 0 && owner) {
          z.tickT = z.kind === "fire" ? 0.25 : z.kind === "rain" ? 0.4 : 0.25;
          for (const m of inside()) this.dealDamage(m, z.dmg, owner, { skill: z.kind !== "fire", noCrit: z.kind === "fire" });
        }
      }
      if (z.kind === "blackhole") {
        for (const m of inside()) {
          if (m.kind === "dummy" || m.kind === "chest") continue;
          const d = Math.hypot(z.x - m.x, z.y - m.y) || 1;
          const pull = (m.def.boss ? 25 : 80) * DT;
          this.moveMonster(m, ((z.x - m.x) / d) * Math.min(pull, d), ((z.y - m.y) / d) * Math.min(pull, d));
        }
      }
      if (z.kind === "ice" || z.kind === "oil") for (const m of inside()) m.slowT = Math.max(m.slowT, 0.2);
      if (z.kind === "discord") {
        // 불협화음: 바드를 따라다니며 둔화 + 지속 피해
        if (owner && !owner.ghost) { z.x = owner.x; z.y = owner.y; }
        for (const m of inside()) m.slowT = Math.max(m.slowT, 0.2);
        z.tickT -= DT;
        if (z.tickT <= 0 && owner) {
          z.tickT = 0.5;
          for (const m of inside()) this.dealDamage(m, z.dmg, owner, { skill: true });
        }
      }
      if (z.kind === "fire" && owner) {
        for (const o of [...this.zones]) {
          if (o.kind === "oil" && this.zones.includes(o) && Math.hypot(o.x - z.x, o.y - z.y) < o.r) this.igniteOil(o, owner);
        }
      }
      if (z.kind === "mine") {
        // 엔지니어 지뢰: 밟으면 폭발
        const victim = inside().find((m) => m.kind !== "chest" && m.kind !== "dummy");
        if (victim && owner) {
          this.explode(z.x, z.y, 34, z.dmg, owner, true);
          if (tier(owner.tal, "e_mine") >= 5) {
            // 근처 지뢰도 차례로 연쇄 폭발
            const queue = [z];
            while (queue.length) {
              const c = queue.pop()!;
              for (const o of this.zones) {
                if (o === z || boomed.has(o) || o.kind !== "mine" || o.ownerId !== z.ownerId) continue;
                if (Math.hypot(o.x - c.x, o.y - c.y) > 60) continue;
                boomed.add(o);
                this.explode(o.x, o.y, 34, o.dmg, owner, true);
                queue.push(o);
              }
            }
          }
          continue;
        }
      }
      if (z.kind === "trap") {
        const victim = inside().find((m) => m.kind !== "chest");
        if (victim && owner) {
          const root = 2 + (tier(owner.tal, "a_trap") >= 4 ? 1 : 0);
          victim.rootT = root;
          if (tier(owner.tal, "a_trap") >= 5) {
            // 궁수 특성 '폭발 덫': 주변까지 피해 + 속박
            this.explode(z.x, z.y, 45, z.dmg * 0.8, owner, true, victim.id);
            for (const m of this.monsters) if (m !== victim && m.spawnT <= 0 && m.kind !== "chest" && Math.hypot(m.x - z.x, m.y - z.y) < 45 + m.r) m.rootT = Math.max(m.rootT, root);
          }
          this.dealDamage(victim, z.dmg, owner, { skill: true });
          this.fx.push({ k: "hit", x: z.x, y: z.y });
          continue;
        }
      }
      if (z.elapsed >= z.dur) {
        if (z.kind === "meteor") {
          this.explode(z.x, z.y, z.r, z.dmg, owner, true);
        } else if (z.kind === "blackhole") {
          this.explode(z.x, z.y, z.r, z.dmg * 18, owner, true);
        } else if (z.kind === "hammer") {
          this.fx.push({ k: "boom", x: z.x, y: z.y, r: z.r });
          if (owner) for (const m of inside()) { m.stunT = Math.max(m.stunT, z.stun); this.dealDamage(m, z.dmg, owner, { skill: true }); }
        } else if (z.kind === "ice") {
          for (const m of inside()) m.frozenT = Math.max(m.frozenT, 1);
        } else if (z.kind === "slam" || z.kind === "strike") {
          this.fx.push({ k: z.kind === "strike" ? "bolt" : "boom", x: z.x, y: z.y, r: z.r });
          for (const p of this.players.values()) {
            if (!p.ghost && Math.hypot(p.x - z.x, p.y - z.y) < z.r + this.hitRadius(p)) this.hurtPlayer(p, z.dmg, true);
          }
        }
        continue;
      }
      keep.push(z);
    }
    // 돌면서 터진 장판은 빼고, 도는 중에 새로 생긴 장판은 살림
    const added = this.zones.filter((z) => !orig.includes(z));
    this.zones = keep.filter((z) => !z.gone && !boomed.has(z)).concat(added);
  }

  /** 플레이어 → 몬스터 피해. 공격력·치명타·카드 효과를 여기서 한 번에 계산 */
  /** 저주 '기분파': 10초 중 3초는 기분이 나빠 공격력 절반 */
  moodyDown(p: Player) {
    return !!p.stats.moody && this.time % 10 < 3;
  }

  /** 주변(반 칸)에 구멍이 있는지 */
  private nearHole(x: number, y: number) {
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10], [8, 8], [-8, 8], [8, -8], [-8, -8]]) {
      if (tileAt(this.map, x + dx, y + dy) === "v") return true;
    }
    return false;
  }

  dealDamage(m: Monster, base: number, p: Player, o: DmgOpts) {
    if (m.kind === "pvp") {
      this.pvpDamage(m, base, p, o);
      return;
    }
    if (m.hp <= 0 && m.kind !== "dummy") return;
    let dmg = base;
    // 바드 용기의 노래 (평타만) / 네크로 약화 저주
    if (!o.skill && !o.raw && (p.songBuffT ?? 0) > 0) dmg *= 1.2;
    // 검사 특성 '궁지': 체력 50% 이하 평타 +15%
    if (!o.skill && !o.raw && tier(p.tal, "w_berserk") >= 2 && p.hp < p.stats.maxHp * 0.5) dmg *= 1.15;
    if ((m.curseT ?? 0) > 0) dmg *= m.curseBoost ? 1.5 : 1.3;
    if (!o.raw) {
      dmg *= p.stats.atkMul;
      if (p.talN) dmg *= Math.pow(TALENT_TAX, p.talN);
      if (p.giantT > 0) dmg *= 1.5;
      if (p.buffAtkT > 0) dmg *= 1.2;
      if (p.stats.lowHpAtk && p.hp < p.stats.maxHp * 0.25 && !o.skill) dmg += p.stats.lowHpAtk;
      if (o.skill) dmg = dmg * p.stats.skillDmgMul + p.stats.skillFlat;
      if (this.moodyDown(p)) dmg *= 0.5;
    }
    let crit = false;
    if (o.crit || (!o.noCrit && Math.random() < p.stats.critChance)) {
      dmg *= p.stats.critMul;
      crit = true;
    }
    // 방패병: 정면(바라보는 쪽 ±63°)에서 맞으면 피해 75% 감소 → 뒤를 노려야 함
    if (m.def.ai === "shield" && m.faceA !== undefined && m.stunT <= 0 && m.frozenT <= 0) {
      let diff = Math.atan2(p.y - m.y, p.x - m.x) - m.faceA;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 1.1) {
        dmg *= 0.25;
        if (Math.random() < 0.25) this.fx.push({ k: "shield", x: Math.round(m.x), y: Math.round(m.y) });
      }
    }
    const frozen = m.frozenT > 0;
    const cursed = (m.curseT ?? 0) > 0;
    this.hurtMonster(m, dmg, p, crit);
    // 네크로 특성 '피의 계약': 저주받은 적을 때리면 8% 회복
    if (cursed && !p.ghost && tier(p.tal, "x_leech") >= 5) p.hp = Math.min(p.stats.maxHp, p.hp + dmg * 0.08);
    // 마법사 특성 '얼음 파편': 빙결된 적이 깨지며 주변 폭발
    if (frozen && !this.shattering && m.kind !== "dummy" && tier(p.tal, "m_frost") >= 5) {
      // (파편 폭발이 또 파편을 터뜨리는 연쇄는 막음)
      m.frozenT = 0;
      this.shattering = true;
      this.explode(m.x, m.y, 32, 8, p, true, m.id);
      this.shattering = false;
    }
    if (!o.onHit) return;
    // 평타 적중 효과 (넉백·빙결·독·번개)
    if (m.hp > 0 || m.kind === "dummy") {
      if (p.stats.knockback && !m.def.boss && m.kind !== "dummy" && m.kind !== "chest" && m.def.ai !== "turret") {
        const d = Math.hypot(m.x - p.x, m.y - p.y) || 1;
        this.moveMonster(m, ((m.x - p.x) / d) * 10, ((m.y - p.y) / d) * 10);
      }
      if (p.stats.freezeChance && Math.random() < p.stats.freezeChance) m.frozenT = 1;
      if (p.stats.poison) {
        m.poisonT = 3;
        m.poisonDps = 4 * p.stats.atkMul;
        m.poisonOwner = p.id;
      }
    }
    this.chain(m, base, p);
  }

  private chain(m: Monster, base: number, p: Player) {
    if (!p.stats.chainChance || Math.random() >= p.stats.chainChance) return;
    const near = this.monsters
      .filter((o) => o !== m && o.spawnT <= 0 && o.kind !== "chest" && o.kind !== "pvp" && Math.hypot(o.x - m.x, o.y - m.y) < 70)
      .slice(0, 3);
    if (!near.length) return;
    const pts: number[] = [];
    for (const o of near) {
      pts.push(Math.round(o.x), Math.round(o.y));
      this.dealDamage(o, base * 0.5, p, {});
    }
    this.fx.push({ k: "zap", x: Math.round(m.x), y: Math.round(m.y), pts });
  }

  private hurtMonster(m: Monster, dmg: number, p: Player, crit: boolean) {
    m.flashT = 0.1;
    if (m.kind === "dummy") {
      m.log.push({ t: this.time, d: dmg });
      m.total += dmg;
      this.fx.push({ k: crit ? "crit" : "num", x: Math.round(m.x), y: Math.round(m.y - 12), r: Math.round(dmg) });
      return;
    }
    // 바드 자장가로 잠든 적은 맞으면 깸
    if (m.sleep) {
      m.sleep = false;
      m.stunT = 0;
      // 바드 특성 '악몽': 깰 때 큰 피해
      const bard = m.nightmare !== undefined ? this.players.get(m.nightmare) : undefined;
      m.nightmare = undefined;
      if (bard) {
        dmg += 8 * bard.stats.atkMul * bard.stats.skillDmgMul;
        this.fx.push({ k: "crit", x: Math.round(m.x), y: Math.round(m.y) });
      }
    }
    // 엘리트 보호막: 근처(60) 다른 몹은 받는 피해 절반
    if (this.monsters.some((o) => o !== m && o.elite === "guard" && Math.hypot(o.x - m.x, o.y - m.y) < 60)) dmg *= 0.5;
    const dealt = Math.min(m.hp, dmg);
    m.hp -= dmg;
    m.dmgBy.set(p.id, (m.dmgBy.get(p.id) ?? 0) + dealt);
    p.dmgDealt += dealt;
    p.idleT = 0;
    if (p.stats.lifesteal > 0 && !p.ghost) p.hp = Math.min(p.stats.maxHp, p.hp + dealt * p.stats.lifesteal);
    this.fx.push({ k: crit ? "crit" : "hit", x: Math.round(m.x), y: Math.round(m.y), r: crit ? Math.round(dmg) : undefined });
    if (m.hp <= 0) this.killMonster(m, p);
  }

  private killMonster(m: Monster, killer: Player) {
    this.monsters = this.monsters.filter((o) => o !== m);
    killer.combo = (killer.comboT ?? 0) > 0 ? (killer.combo ?? 0) + 1 : 1;
    killer.comboT = 2.5;
    const necro = (m.curseT ?? 0) > 0 && m.curseBy !== undefined ? this.players.get(m.curseBy) : undefined;
    if (necro && tier(necro.tal, "x_curse") >= 5) {
      // 네크로 특성 '전염': 주변 적에게 저주가 옮겨붙음
      this.fx.push({ k: "boom", x: Math.round(m.x), y: Math.round(m.y), r: 60 });
      for (const o of this.monsters) {
        if (o.spawnT > 0 || o.kind === "dummy" || o.kind === "chest" || o.kind === "pvp") continue;
        if (Math.hypot(o.x - m.x, o.y - m.y) > 60 + o.r) continue;
        o.curseT = Math.max(o.curseT ?? 0, 4 + necro.stats.curseExt);
        o.curseBy = necro.id;
        if (necro.stats.curseBoost) o.curseBoost = true;
      }
    }
    killer.kills++;
    this.fx.push({ k: "die", x: Math.round(m.x), y: Math.round(m.y), r: m.r });

    // 경험치: 넣은 피해 비율만큼 / 돈: 기여도 1위가 전부 (보스는 생존자 균등)
    const total = [...m.dmgBy.values()].reduce((a, b) => a + b, 0) || 1;
    let top: Player | null = null;
    let topDmg = -1;
    for (const [id, d] of m.dmgBy) {
      const p = this.players.get(id);
      if (!p) continue;
      if (!p.ghost && m.xp) this.addXp(p, (m.xp * d) / total);
      if (d > topDmg) { topDmg = d; top = p; }
    }
    if (m.def.boss) {
      const alive = [...this.players.values()].filter((p) => !p.ghost);
      for (const p of alive) this.giveGold(p, m.gold / alive.length, m);
      // 보스가 쓰러지면 소환된 졸개도 함께 사라짐
      this.monsters = this.monsters.filter((o) => o.kind === "chest");
    } else if (top && m.gold) {
      this.giveGold(top, m.gold, m);
    }

    for (const p of this.players.values()) {
      if (p.stats.cdOnKill && m.dmgBy.has(p.id)) for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - p.stats.cdOnKill);
      // 도감: 이 몬스터에게 피해를 준 사람 모두 처치 기록
      if (!this.cmdUsed && m.dmgBy.has(p.id) && m.kind !== "chest") {
        codexKill(p.name, m.kind);
        const kills = getCodex(p.name).kills;
        if ((kills.slime ?? 0) >= 500) this.ach(p, "slime500");
        if (CODEX_MONSTERS.every((k) => (kills[k] ?? 0) > 0)) this.ach(p, "mon100");
        if (m.elite && bumpCounter(p.name, "elite") >= 30) this.ach(p, "elite30");
      }
      if (m.def.boss) {
        if (m.kind === "king_slime") this.ach(p, "king");
        if (p.cards.filter((id) => CARD_BY_ID[id]?.rarity === "curse").length >= 5) this.ach(p, "cursed");
      }
    }

    if (m.elite) {
      // 엘리트 보상: 기여도 1위가 25% 확률로 희귀 이상 카드
      if (top && Math.random() < 0.25) {
        const id = this.randomCard(top, ["rare", "legend"]);
        if (id) {
          this.giveCard(top, id);
          this.sendTo(top.id, { t: "toast", msg: `엘리트 처치 보상: ${CARD_BY_ID[id].name}!` });
        }
      }
      // 분열: 작은 몹 3마리
      if (m.elite === "split") {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          let pos = { x: m.x + Math.cos(a) * 16, y: m.y + Math.sin(a) * 16 };
          if (isWallAt(this.map, pos.x, pos.y)) pos = { x: m.x, y: m.y };
          const s = this.spawnMonster(m.kind, pos);
          if (s) { s.hp = s.mhp = Math.ceil(s.mhp * 0.4); s.spawnT = 0.2; }
        }
      }
    }
    if (killer.stats.corpseExplode && m.kind !== "chest") this.explode(m.x, m.y, 22, 15, killer, false);
  }

  private giveGold(p: Player, amount: number, from: Monster) {
    const g = Math.max(1, Math.round(amount * p.stats.goldMul + p.stats.goldFlat));
    p.gold += g;
    this.checkRich(p);
    this.fx.push({ k: "coin", x: Math.round(from.x), y: Math.round(from.y), to: p.id, r: g });
  }

  /** 피해를 실제로 입혔으면 true */
  hurtPlayer(p: Player, dmg: number, ignoreInvuln = false, src?: Monster): boolean {
    if (p.ghost || this.phase === "rest" || p.god || p.dc || p.spec) return false;
    if (p.dashT > 0 && (!p.charging || p.lethalDash)) return false;
    if (!ignoreInvuln && p.invulnT > 0) return false;
    let mul = p.stats.dmgTakenMul * (p.tauntT > 0 ? 0.5 : 1) * (p.giantT > 0 ? 0.5 : 1) * (p.feastT > 0 ? 0.7 : 1);
    // 검사 특성 '수호의 거인': 거인화한 검사 주변 동료 받는 피해 -30%
    for (const q of this.players.values()) {
      if (q !== p && q.giantT > 0 && !q.ghost && tier(q.tal, "w_guard") >= 5 && Math.hypot(q.x - p.x, q.y - p.y) < 90) { mul *= 0.7; break; }
    }
    if (p.stats.nearAllyDR) {
      const near = [...this.players.values()].some((q) => q !== p && !q.ghost && Math.hypot(q.x - p.x, q.y - p.y) < 48);
      if (near) dmg -= p.stats.nearAllyDR;
    }
    // 고정 피해 감소 (카드), 최소 1
    dmg = Math.max(1, dmg - p.stats.dmgFlatReduce);
    let dealt = dmg * mul;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dealt);
      p.shield -= absorbed;
      dealt -= absorbed;
      // 성직자 특성 '빛의 파편': 보호막이 깨지면 폭발
      const cleric = p.shield <= 0 && p.shieldBy !== undefined ? this.players.get(p.shieldBy) : undefined;
      if (p.shield <= 0) p.shieldBy = undefined;
      if (cleric) this.explode(p.x, p.y, 50, 20, cleric, true);
    }
    p.hp -= dealt;
    p.dmgTaken += dealt;
    p.invulnT = HIT_INVULN;
    // 엘리트 흡혈: 때리면 회복
    if (src?.elite === "vamp") src.hp = Math.min(src.mhp, src.hp + dealt * 3);
    p.flashT = 0.12;
    if (src && p.stats.thorns) this.dealDamage(src, dmg * p.stats.thorns, p, { raw: true, noCrit: true });
    if (p.hp <= 0) this.knockOut(p);
    return true;
  }

  private snapTick = 0;
  /** 플레이어별로 마지막에 보낸 카드·코스튬 (바뀔 때만 다시 보냄) */
  private sentCards = new Map<number, string>();
  private sentCos = new Map<number, string>();

  private sendSnapshot(force = false) {
    // 매 틱이 아니라 2틱에 한 번만 보냄 (네트워크 절반). 이펙트는 그동안 모였다가 같이 감
    if (!force && ++this.snapTick % SNAP_EVERY !== 0) return;
    // 1초마다는 카드·코스튬을 전부 다시 보냄 (늦게 들어온 사람·놓친 패킷 대비)
    const full = this.snapTick % 30 === 0;
    const zones: SnapZone[] = this.zones.map((z) => ({
      id: z.id, k: z.kind, x: round1(z.x), y: round1(z.y), r: Math.round(z.r), t: Math.min(1, z.elapsed / z.dur),
    }));
    this.broadcast({
      t: "snap",
      time: this.time,
      players: [...this.players.values()].map((p) => {
        let ps = "";
        if (p.slowT > 0) ps += "s";
        if (p.poisonT > 0) ps += "p";
        if (p.burnT > 0) ps += "b";
        if ((p.stealthT ?? 0) > 0) ps += "h";
        if ((p.robotT ?? 0) > 0) ps += "R";
        return {
          id: p.id, n: p.name, c: p.color, cls: p.cls,
          x: round1(p.x), y: round1(p.y),
          hp: Math.ceil(p.hp), mhp: p.stats.maxHp,
          ghost: p.ghost, rv: Math.round(p.reviveProg * 100) / 100,
          a: Math.round(p.aim * 100) / 100,
          dash: p.dashT > 0, dc: p.dashLeft, f: p.flashT > 0, at: p.atkAnimT > 0,
          spd: CLASSES[p.cls].speed * p.stats.speedMul * (p.slowT > 0 ? 0.6 : 1) * (this.prankFastT > 0 ? 1.4 : 1) * (this.gem.holder === p.id ? 0.85 : 1),
          cds: p.cds.map((c) => Math.round(c * 10) / 10),
          cdm: CLASSES[p.cls].skills.map((s, i) => (this.isRest ? 0.3 : Math.round(skillCd(s.cd, p.stats, i) * 10) / 10)),
          lv: p.level, xp: Math.floor(p.xp), xpn: xpToNext(p.level), gold: p.gold,
          shield: Math.ceil(p.shield), giant: p.giantT > 0,
          size: Math.round(p.stats.sizeMul * (p.giantT > 0 ? 2 : 1) * 100) / 100,
          rev: this.reversed(p), shake: !!p.stats.aimShake, ps, god: p.god || undefined, song: p.songOn || undefined, cb: (p.combo ?? 0) >= 3 ? p.combo : undefined, off: p.dc || undefined, spec: p.spec || undefined,
          cos: this.changed(this.sentCos, p.id, JSON.stringify(p.cos ?? {}), full) ? (p.cos ?? {}) : undefined,
          cards: this.changed(this.sentCards, p.id, p.cards.join(","), full) ? p.cards : undefined,
        };
      }),
      monsters: this.monsters.filter((m) => m.kind !== "pvp").map((m) => {
        let st = "";
        if (m.stunT > 0) st += "s";
        if (m.frozenT > 0) st += "z";
        if (m.rootT > 0) st += "r";
        if (m.slowT > 0) st += "w";
        if (m.poisonT > 0) st += "p";
        if ((m.curseT ?? 0) > 0) st += "c";
        const base = {
          // 데이터 절약: 좌표는 정수, 기본값(false·0·"")은 아예 안 보냄 (클라이언트가 채움)
          id: m.id, k: m.kind, x: Math.round(m.x), y: Math.round(m.y), hp: Math.ceil(m.hp), mhp: m.mhp,
          f: m.flashT > 0 || undefined, sp: m.spawnT > 0 ? Math.round(m.spawnT * 10) / 10 : undefined, st: st || undefined,
          ca: m.windT > 0 ? Math.round(m.rushA * 100) / 100 : undefined,
          el: m.elite,
        };
        if (m.kind !== "dummy") return base;
        const recent = m.log.reduce((a, e) => a + e.d, 0);
        return { ...base, dps: Math.round(recent / 5), tot: Math.round(m.total) };
      }),
      projs: this.projs.map((pr) => ({
        id: pr.id, k: pr.kind, x: round1(pr.x), y: round1(pr.y), a: Math.round(Math.atan2(pr.vy, pr.vx) * 100) / 100,
      })),
      pets: this.pets.map((pt) => ({
        id: pt.id, owner: pt.ownerId, x: round1(pt.x), y: round1(pt.y),
        k: pt.kind,
        a: Math.round(pt.aim * 100) / 100,
      })),
      zones,
      fx: this.fx,
      portal: this.portalOpen ? this.map.portal : null,
      remaining: this.monsters.filter((m) => m.kind !== "chest" && m.kind !== "dummy" && m.kind !== "pvp").length,
      gem: this.gemMode && this.stageKind === "arena" ? { x: round1(this.gem.x), y: round1(this.gem.y), holder: this.gem.holder } : undefined,
      scores: this.gemMode ? Object.fromEntries([...this.players.values()].map((p) => [p.id, Math.floor(p.score)])) : undefined,
      timer: this.mode.speedrun ? Math.round(this.runTime * 10) / 10 : undefined,
      storm: this.stormLevel() || undefined,
      trialT: this.stageKind === "trial" && this.phase === "play" ? Math.max(0, Math.ceil(this.trialT)) : undefined,
      treasureT: this.stageKind === "treasure" && this.phase === "play" ? Math.max(0, Math.ceil(this.treasureT)) : undefined,
      panic: this.panic ? {
        z: this.zone, m: this.mission, t: Math.max(0, Math.round(this.panicT * 10) / 10),
        got: this.mission === "collect" ? this.keyGot : this.mission === "exit" ? this.atExit() : this.panicKilled(),
        goal: this.mission === "collect" ? this.keyGoal : this.mission === "exit" ? this.aliveCount() : this.panicGoal,
        keys: this.keys.flatMap((k) => [round1(k.x), round1(k.y)]),
        done: this.phase === "complete" || undefined,
      } : undefined,
      cmd: this.cmdUsed || undefined,
    });
    this.fx = [];
  }
}
