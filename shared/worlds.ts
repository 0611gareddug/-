export type SpriteBase = "slime" | "skeleton" | "beast" | "flyer" | "golem";
/** chaser 추격 · shooter 거리 유지 사격 · charger 예고 후 돌진 · caster 예고 장판 · turret 고정 사격 */
export type MonsterAI = "chaser" | "shooter" | "charger" | "caster" | "turret"
  // v1.0 새 패턴: 자폭 · 정면 방패 · 소환 · 탄막
  | "bomber" | "shield" | "summoner" | "barrage"
  // v1.5 황금 러시: 도망다니는 황금 슬라임
  | "flee";
export type StatusEffect = "slow" | "poison" | "burn";
export type BossAbility = "slam" | "summon" | "ring" | "charge" | "strikes" | "teleport"
  // v1.0 모든 보스 공통: 지진 파동 · 연속 사격 · (광폭화 후) 나선 탄막
  | "quake" | "barrage" | "spiral"
  // v1.4 보스 고유 패턴 (보스마다 하나씩)
  | "bounce" | "sandwall" | "avalanche" | "garden" | "boltline" | "hellfire" | "phantom" | "judgment";
export type MProjKind = "bone" | "sand" | "ice" | "seed" | "fire" | "spirit" | "light";
export type Gimmick = "none" | "sandstorm" | "ice" | "swamp" | "void" | "lava" | "fog" | "prank";

export interface MonsterDef {
  id: string;
  name: string;
  base: SpriteBase;
  /** a 기본색 · A 그림자 · l 밝은 면 · e 눈 */
  pal: { a: string; A: string; l: string; e: string };
  ai: MonsterAI;
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  gold: number;
  xp: number;
  scale?: number;
  alpha?: number;
  proj?: { kind: MProjKind; speed: number; count: number; spread: number; cd: number; effect?: StatusEffect };
  onHit?: StatusEffect;
  /** 벽 통과 */
  phase?: boolean;
  boss?: { abilities: BossAbility[]; summon?: string; crown?: boolean };
}

export interface WorldDef {
  id: number;
  name: string;
  bossRoom: string;
  gimmick: Gimmick;
  desc: string;
  monsters: [string, string];
  /** v1.4 월드별 세 번째 잡몹 */
  extra: string;
  boss: string;
  floor: { base: string; groove: string; hi: string; speck: string; moss: string };
  wall: { top: string; topHi: string; front: string; mortar: string };
  /** 특수 지형 타일 문자 (~ 유사, _ 빙판, % 독 늪, v 구멍, = 용암) */
  special?: string;
}

const m = (d: MonsterDef) => d;

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries([
  // 월드 1
  m({ id: "slime", name: "슬라임", base: "slime", pal: { a: "#4fc06a", A: "#2f8a48", l: "#c8f8d0", e: "#141218" }, ai: "chaser", r: 6, hp: 30, speed: 40, dmg: 8, gold: 3, xp: 5 }),
  m({ id: "skel_archer", name: "해골 궁수", base: "skeleton", pal: { a: "#e8e4d0", A: "#a8a490", l: "#ffffff", e: "#ff4a4a" }, ai: "shooter", r: 5, hp: 22, speed: 36, dmg: 7, gold: 5, xp: 7, proj: { kind: "bone", speed: 120, count: 1, spread: 0, cd: 1.8 } }),
  m({ id: "king_slime", name: "왕 슬라임", base: "slime", pal: { a: "#e05a8a", A: "#9a2f5a", l: "#ffd0e0", e: "#141218" }, ai: "chaser", r: 16, hp: 900, speed: 26, dmg: 14, gold: 60, xp: 100, scale: 3, boss: { abilities: ["slam", "bounce", "summon"], summon: "slime", crown: true } }),
  // 월드 2
  m({ id: "scorpion", name: "모래 전갈", base: "beast", pal: { a: "#d89a40", A: "#8a5a20", l: "#f8d890", e: "#141218" }, ai: "charger", r: 6, hp: 32, speed: 42, dmg: 10, gold: 4, xp: 6 }),
  m({ id: "sand_mage", name: "모래 마법사", base: "skeleton", pal: { a: "#e8c878", A: "#a88838", l: "#fff0c0", e: "#40a0f0" }, ai: "shooter", r: 5, hp: 24, speed: 34, dmg: 7, gold: 5, xp: 7, proj: { kind: "sand", speed: 110, count: 3, spread: 0.25, cd: 2.2 } }),
  m({ id: "pharaoh", name: "모래 파라오", base: "golem", pal: { a: "#f0c040", A: "#a07018", l: "#fff4b0", e: "#40e0f0" }, ai: "chaser", r: 16, hp: 900, speed: 24, dmg: 14, gold: 60, xp: 100, scale: 2.6, proj: { kind: "sand", speed: 100, count: 16, spread: 0, cd: 0 }, boss: { abilities: ["ring", "sandwall", "summon"], summon: "scorpion", crown: true } }),
  // 월드 3
  m({ id: "snow_slime", name: "눈덩이 슬라임", base: "slime", pal: { a: "#e0f0ff", A: "#90b0d0", l: "#ffffff", e: "#203050" }, ai: "chaser", r: 6, hp: 34, speed: 40, dmg: 8, gold: 4, xp: 6, onHit: "slow" }),
  m({ id: "ice_spirit", name: "얼음 정령", base: "flyer", pal: { a: "#80d0ff", A: "#3080c0", l: "#e0f8ff", e: "#ffffff" }, ai: "shooter", r: 5, hp: 24, speed: 44, dmg: 7, gold: 5, xp: 7, proj: { kind: "ice", speed: 130, count: 1, spread: 0, cd: 1.8, effect: "slow" } }),
  m({ id: "yeti", name: "예티", base: "beast", pal: { a: "#f0f4ff", A: "#a0b0c8", l: "#ffffff", e: "#2040a0" }, ai: "chaser", r: 16, hp: 950, speed: 30, dmg: 16, gold: 60, xp: 100, scale: 3, boss: { abilities: ["charge", "avalanche", "slam"] } }),
  // 월드 4
  m({ id: "poison_frog", name: "독 개구리", base: "beast", pal: { a: "#70d040", A: "#3a8020", l: "#d0ff90", e: "#e03030" }, ai: "charger", r: 6, hp: 32, speed: 46, dmg: 9, gold: 4, xp: 6, onHit: "poison" }),
  m({ id: "vine", name: "덩굴 포탑", base: "slime", pal: { a: "#3a8a3a", A: "#1f5a24", l: "#90e070", e: "#f05a8a" }, ai: "turret", r: 7, hp: 50, speed: 0, dmg: 7, gold: 6, xp: 8, proj: { kind: "seed", speed: 120, count: 1, spread: 0, cd: 1.5, effect: "poison" } }),
  m({ id: "flower_queen", name: "식인꽃 여왕", base: "golem", pal: { a: "#f05a8a", A: "#9a2f5a", l: "#ffd0e0", e: "#50d870" }, ai: "chaser", r: 16, hp: 1000, speed: 20, dmg: 14, gold: 60, xp: 100, scale: 2.6, proj: { kind: "seed", speed: 95, count: 14, spread: 0, cd: 0, effect: "poison" }, boss: { abilities: ["ring", "garden", "summon"], summon: "vine", crown: true } }),
  // 월드 5
  m({ id: "harpy", name: "하피", base: "flyer", pal: { a: "#c890f0", A: "#7a50a8", l: "#f0d8ff", e: "#f0c040" }, ai: "chaser", r: 5, hp: 26, speed: 62, dmg: 8, gold: 4, xp: 6 }),
  m({ id: "thunder_cloud", name: "번개 구름", base: "slime", pal: { a: "#d8dce8", A: "#8890a8", l: "#ffffff", e: "#f0c040" }, ai: "caster", r: 6, hp: 30, speed: 30, dmg: 14, gold: 5, xp: 7 }),
  m({ id: "thunder_eagle", name: "천둥 독수리", base: "flyer", pal: { a: "#f0d040", A: "#a08018", l: "#fff8c0", e: "#141218" }, ai: "chaser", r: 16, hp: 1000, speed: 34, dmg: 15, gold: 60, xp: 100, scale: 3, boss: { abilities: ["charge", "boltline", "strikes"] } }),
  // 월드 6
  m({ id: "imp", name: "불도깨비", base: "flyer", pal: { a: "#e85030", A: "#902818", l: "#ffb080", e: "#fff060" }, ai: "shooter", r: 5, hp: 26, speed: 46, dmg: 8, gold: 5, xp: 7, proj: { kind: "fire", speed: 130, count: 1, spread: 0, cd: 1.7, effect: "burn" } }),
  m({ id: "demon_knight", name: "마왕 기사", base: "golem", pal: { a: "#504060", A: "#2a2030", l: "#8a70a0", e: "#ff4040" }, ai: "charger", r: 7, hp: 60, speed: 36, dmg: 13, gold: 7, xp: 9 }),
  m({ id: "demon_lord", name: "마왕", base: "golem", pal: { a: "#a02030", A: "#500c18", l: "#ff6070", e: "#fff060" }, ai: "chaser", r: 16, hp: 1100, speed: 28, dmg: 16, gold: 60, xp: 100, scale: 2.8, proj: { kind: "fire", speed: 110, count: 18, spread: 0, cd: 0, effect: "burn" }, boss: { abilities: ["ring", "hellfire", "charge", "summon"], summon: "imp", crown: true } }),
  // 월드 7
  m({ id: "ghost", name: "유령", base: "flyer", pal: { a: "#e0e8ff", A: "#8890b8", l: "#ffffff", e: "#40e0f0" }, ai: "chaser", r: 5, hp: 28, speed: 44, dmg: 9, gold: 5, xp: 7, phase: true, alpha: 0.7 }),
  m({ id: "pirate_skel", name: "해골 해적", base: "skeleton", pal: { a: "#d8d0b8", A: "#887860", l: "#ffffff", e: "#40e0f0" }, ai: "shooter", r: 5, hp: 30, speed: 36, dmg: 9, gold: 6, xp: 8, proj: { kind: "bone", speed: 140, count: 2, spread: 0.18, cd: 2 } }),
  m({ id: "ghost_captain", name: "유령 선장", base: "skeleton", pal: { a: "#90f0e0", A: "#309080", l: "#e0fff8", e: "#ff4040" }, ai: "chaser", r: 16, hp: 1150, speed: 28, dmg: 16, gold: 60, xp: 100, scale: 3, alpha: 0.85, proj: { kind: "spirit", speed: 100, count: 16, spread: 0, cd: 0 }, boss: { abilities: ["teleport", "phantom", "ring", "summon"], summon: "ghost", crown: true } }),
  // 월드 8
  m({ id: "angel", name: "천사 병정", base: "flyer", pal: { a: "#fff8e0", A: "#d0b060", l: "#ffffff", e: "#40a0f0" }, ai: "shooter", r: 5, hp: 32, speed: 46, dmg: 9, gold: 6, xp: 8, proj: { kind: "light", speed: 140, count: 3, spread: 0.22, cd: 2 } }),
  m({ id: "gold_golem", name: "황금 골렘", base: "golem", pal: { a: "#f0c040", A: "#a07018", l: "#fff4b0", e: "#e03030" }, ai: "caster", r: 8, hp: 80, speed: 28, dmg: 16, gold: 9, xp: 10 }),
  m({ id: "prank_god", name: "장난꾸러기 신", base: "golem", pal: { a: "#ffffff", A: "#c0b8e0", l: "#fff8c0", e: "#f05a8a" }, ai: "chaser", r: 16, hp: 1300, speed: 30, dmg: 17, gold: 60, xp: 100, scale: 3, proj: { kind: "light", speed: 115, count: 20, spread: 0, cd: 0 }, boss: { abilities: ["ring", "judgment", "strikes", "charge", "teleport", "summon"], summon: "angel", crown: true } }),
  // v1.4 월드별 세 번째 잡몹
  m({ id: "field_rat", name: "들쥐", base: "beast", pal: { a: "#a08060", A: "#604830", l: "#e0c8a8", e: "#ff4a4a" }, ai: "chaser", r: 4, hp: 14, speed: 72, dmg: 6, gold: 2, xp: 3, scale: 0.8 }),
  m({ id: "sand_worm", name: "모래 지렁이", base: "slime", pal: { a: "#c89060", A: "#805830", l: "#f0d0a0", e: "#141218" }, ai: "charger", r: 7, hp: 44, speed: 34, dmg: 12, gold: 5, xp: 7 }),
  m({ id: "frost_archer", name: "서리 궁수", base: "skeleton", pal: { a: "#b8d8f0", A: "#6890b0", l: "#ffffff", e: "#40a0f0" }, ai: "shooter", r: 5, hp: 28, speed: 36, dmg: 7, gold: 5, xp: 7, proj: { kind: "ice", speed: 135, count: 3, spread: 0.2, cd: 2.2, effect: "slow" } }),
  m({ id: "spore_shroom", name: "포자 버섯", base: "slime", pal: { a: "#a060c0", A: "#603080", l: "#e0b0ff", e: "#60ff80" }, ai: "caster", r: 6, hp: 36, speed: 28, dmg: 13, gold: 5, xp: 7, onHit: "poison" }),
  m({ id: "wind_spirit", name: "회오리 정령", base: "flyer", pal: { a: "#c0f0e0", A: "#60a090", l: "#ffffff", e: "#2080a0" }, ai: "barrage", r: 5, hp: 30, speed: 50, dmg: 8, gold: 5, xp: 7, proj: { kind: "spirit", speed: 115, count: 8, spread: 0, cd: 3 } }),
  m({ id: "lava_golem", name: "용암 골렘", base: "golem", pal: { a: "#e06020", A: "#802010", l: "#ffc060", e: "#fff060" }, ai: "chaser", r: 8, hp: 95, speed: 26, dmg: 16, gold: 8, xp: 10, onHit: "burn" }),
  m({ id: "wraith_knight", name: "망령 기사", base: "golem", pal: { a: "#7080a0", A: "#303850", l: "#c0d0f0", e: "#40e0f0" }, ai: "charger", r: 7, hp: 70, speed: 38, dmg: 14, gold: 7, xp: 9, phase: true, alpha: 0.8 }),
  m({ id: "archangel", name: "대천사", base: "flyer", pal: { a: "#fff0c0", A: "#e0b040", l: "#ffffff", e: "#f05a8a" }, ai: "shooter", r: 6, hp: 40, speed: 44, dmg: 10, gold: 7, xp: 9, proj: { kind: "light", speed: 150, count: 5, spread: 0.18, cd: 2.4 } }),
  // v1.5 황금 러시 이벤트 방
  m({ id: "gold_slime", name: "황금 슬라임", base: "slime", pal: { a: "#f8d040", A: "#b08018", l: "#fff8c0", e: "#141218" }, ai: "flee", r: 6, hp: 26, speed: 52, dmg: 0, gold: 14, xp: 6 }),
  // v1.0 특수 몬스터 (모든 월드에 섞여 나옴)
  m({ id: "bomb_shroom", name: "폭탄 버섯", base: "slime", pal: { a: "#e8603a", A: "#a03020", l: "#ffd0a0", e: "#141218" }, ai: "bomber", r: 6, hp: 20, speed: 58, dmg: 10, gold: 4, xp: 6 }),
  m({ id: "shield_knight", name: "방패병", base: "golem", pal: { a: "#8a90a8", A: "#4a5068", l: "#d8dce8", e: "#40e0f0" }, ai: "shield", r: 7, hp: 55, speed: 30, dmg: 10, gold: 6, xp: 8 }),
  m({ id: "summoner", name: "해골 주술사", base: "skeleton", pal: { a: "#9060d0", A: "#5a3090", l: "#e0c8ff", e: "#60ff80" }, ai: "summoner", r: 5, hp: 34, speed: 34, dmg: 6, gold: 7, xp: 9 }),
  m({ id: "orb_mage", name: "탄막 술사", base: "flyer", pal: { a: "#40c0d0", A: "#207080", l: "#c0f8ff", e: "#f05a8a" }, ai: "barrage", r: 5, hp: 30, speed: 40, dmg: 8, gold: 6, xp: 8, proj: { kind: "spirit", speed: 100, count: 12, spread: 0, cd: 3.6 } }),
  // 보물 상자 / 허수아비 (특수)
  m({ id: "chest", name: "보물 상자", base: "slime", pal: { a: "#f0c040", A: "#b08020", l: "#fff4b0", e: "#141218" }, ai: "turret", r: 6, hp: 1, speed: 0, dmg: 0, gold: 30, xp: 0 }),
  m({ id: "dummy", name: "허수아비", base: "slime", pal: { a: "#b08050", A: "#6a4a2a", l: "#d8c088", e: "#141218" }, ai: "turret", r: 7, hp: 99999, speed: 0, dmg: 0, gold: 0, xp: 0 }),
  // 보석 쟁탈전에서 다른 용사를 맞히기 위한 판정용 (화면에는 안 그림)
  m({ id: "pvp", name: "용사", base: "slime", pal: { a: "#ffffff", A: "#ffffff", l: "#ffffff", e: "#ffffff" }, ai: "turret", r: 5, hp: 1, speed: 0, dmg: 0, gold: 0, xp: 0 }),
].map((d) => [d.id, d]));

export const WORLDS: WorldDef[] = [
  {
    id: 1, name: "풀밭 평원", bossRoom: "왕 슬라임의 둥지", gimmick: "none", desc: "평화로운 시작",
    monsters: ["slime", "skel_archer"], extra: "field_rat", boss: "king_slime",
    // v0.9: 밝은 잔디밭 + 덤불 벽 (그림은 client/sprites.ts 의 grassTile / bushTile)
    floor: { base: "#5cb848", groove: "#4aa03a", hi: "#7ad060", speck: "#3f8f33", moss: "#f8e060" },
    wall: { top: "#3f8a3a", topHi: "#5aac4a", front: "#7a5232", mortar: "#5a3a22" },
  },
  {
    id: 2, name: "모래 사막", bossRoom: "파라오의 무덤", gimmick: "sandstorm", desc: "유사는 발을 붙잡고, 모래폭풍은 앞을 가려요",
    monsters: ["scorpion", "sand_mage"], extra: "sand_worm", boss: "pharaoh", special: "~",
    floor: { base: "#5a4a32", groove: "#433625", hi: "#6a583c", speck: "#4e4029", moss: "#7a6440" },
    wall: { top: "#8a7048", topHi: "#a88a5a", front: "#5e4a2e", mortar: "#3e301e" },
  },
  {
    id: 3, name: "얼음 설원", bossRoom: "예티의 동굴", gimmick: "ice", desc: "빙판에서는 미끄러져요",
    monsters: ["snow_slime", "ice_spirit"], extra: "frost_archer", boss: "yeti", special: "_",
    floor: { base: "#3a4a5e", groove: "#2a3646", hi: "#4a5c72", speck: "#334256", moss: "#6a8aa8" },
    wall: { top: "#7890b0", topHi: "#a0b8d8", front: "#4a5c78", mortar: "#2e3a50" },
  },
  {
    id: 4, name: "정글 늪지", bossRoom: "식인꽃 정원", gimmick: "swamp", desc: "독 늪을 밟으면 독에 걸려요",
    monsters: ["poison_frog", "vine"], extra: "spore_shroom", boss: "flower_queen", special: "%",
    floor: { base: "#2e3e2a", groove: "#22301f", hi: "#3a4c34", speck: "#283626", moss: "#4f8a3a" },
    wall: { top: "#3e5a32", topHi: "#507040", front: "#2a3e22", mortar: "#1a2a16" },
  },
  {
    id: 5, name: "하늘 구름섬", bossRoom: "천둥 둥지", gimmick: "void", desc: "구멍에 떨어지면 아파요",
    monsters: ["harpy", "thunder_cloud"], extra: "wind_spirit", boss: "thunder_eagle", special: "v",
    floor: { base: "#c8d0e0", groove: "#a8b0c8", hi: "#e0e6f0", speck: "#b8c0d4", moss: "#f0e8b0" },
    wall: { top: "#f0f2f8", topHi: "#ffffff", front: "#b0b8d0", mortar: "#8890a8" },
  },
  {
    id: 6, name: "용암 마왕성", bossRoom: "마왕의 옥좌", gimmick: "lava", desc: "용암을 밟으면 화상",
    monsters: ["imp", "demon_knight"], extra: "lava_golem", boss: "demon_lord", special: "=",
    floor: { base: "#2e2228", groove: "#20161c", hi: "#3a2c32", speck: "#281c22", moss: "#5a2a2a" },
    wall: { top: "#4a2a32", topHi: "#603840", front: "#301a20", mortar: "#1c0e12" },
  },
  {
    id: 7, name: "유령선 묘지", bossRoom: "유령선 갑판", gimmick: "fog", desc: "짙은 안개 속, 유령은 벽을 통과해요",
    monsters: ["ghost", "pirate_skel"], extra: "wraith_knight", boss: "ghost_captain",
    floor: { base: "#3a3028", groove: "#2a221c", hi: "#463a30", speck: "#332a22", moss: "#3a5a50" },
    wall: { top: "#4a4038", topHi: "#5c5046", front: "#2e2620", mortar: "#1c1612" },
  },
  {
    id: 8, name: "신들의 정원", bossRoom: "신의 놀이터", gimmick: "prank", desc: "신이 25초마다 장난을 쳐요",
    monsters: ["angel", "gold_golem"], extra: "archangel", boss: "prank_god",
    floor: { base: "#e8e0c8", groove: "#c8bc98", hi: "#f8f2e0", speck: "#d8ceb0", moss: "#a0d890" },
    wall: { top: "#f0d880", topHi: "#fff0b0", front: "#c0a050", mortar: "#907030" },
  },
];

export const WORLD_COUNT = WORLDS.length;

/** 월드에 따른 적 강화 배율 */
export const worldHpMul = (w: number) => 1 + 0.6 * (w - 1);
// v1.4: 챕터가 올라갈수록 확실히 아프게 (8월드 약 6배, 예전 3.45배)
export const worldDmgMul = (w: number) => 1 + 0.5 * (w - 1) + 0.03 * (w - 1) ** 2;
export const worldRewardMul = (w: number) => 1 + 0.4 * (w - 1);

/** 난이도: 적 체력은 배율 그대로, 피해는 배율의 절반만큼 증가 */
export const DIFFS = [
  { id: 1, name: "쉬움" },
  { id: 2, name: "보통" },
  { id: 3, name: "어려움" },
  { id: 4, name: "하드코어" },
] as const;
export const diffHpMul = (d: number) => d;
export const diffDmgMul = (d: number) => (1 + d) / 2;
export const diffName = (d: number) => DIFFS.find((x) => x.id === d)?.name ?? "쉬움";

/** v1.0 특수 몬스터: 월드가 올라갈수록 종류가 늘어남 */
export function specialMonsters(world: number): string[] {
  const out = ["bomb_shroom"];
  if (world >= 2) out.push("shield_knight");
  if (world >= 3) out.push("summoner");
  if (world >= 4) out.push("orb_mage");
  return out;
}
