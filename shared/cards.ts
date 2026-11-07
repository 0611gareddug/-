import type { ClassId } from "./classes";

export type Rarity = "common" | "rare" | "legend" | "curse" | "team";

export interface Stats {
  atkMul: number;
  maxHp: number;
  speedMul: number;
  atkSpdMul: number;
  dmgTakenMul: number;
  critChance: number;
  critMul: number;
  multishot: number;
  pierce: number;
  bounce: number;
  knockback: number;
  freezeChance: number;
  poison: number;
  chainChance: number;
  fireDash: number;
  dashCharges: number;
  dashCdMul: number;
  spinEvery: number;
  thorns: number;
  corpseExplode: number;
  clones: number;
  lifesteal: number;
  reviveMul: number;
  ghostAttack: number;
  sizeMul: number;
  hitboxMul: number;
  skillDmgMul: number;
  skillAreaMul: number;
  skillCdMul: number;
  castHaste: number;
  cdOnKill: number;
  goldMul: number;
  aimShake: number;
  reverseCtrl: number;
  aggro: number;
  hunger: number;
  lowHpAtk: number;
  nearAllyDR: number;
  chargeBoost: number;
  tauntBoost: number;
  rainBoost: number;
  sniper: number;
  twinMeteor: number;
  manaSurge: number;
  blessLight: number;
  doubleShield: number;
  turretBonus: number;
  napalm: number;
  bigPot: number;
  chef: number;
  loud: number;
  echo: number;
  /** 저주 기분파: 10초마다 3초간 공격력 절반 */
  moody: number;
  /** v0.9 고정값 카드용: 직업 기본 평타 피해 · 이동 속도 · 공격 간격 */
  baseAtk: number;
  baseSpeed: number;
  baseAtkCd: number;
  /** 스킬 피해 +N (한 번 맞을 때마다) */
  skillFlat: number;
  /** 스킬 쿨타임 -N초 */
  skillCdFlat: number;
  /** 받는 피해 -N (최소 1) */
  dmgFlatReduce: number;
  /** 돈 +N (한 번 얻을 때마다) */
  goldFlat: number;
  /** 스킬 반경 +N */
  areaFlat: number;
  /** 닌자: 표창 +2개 / 연막 뒤 공격 3배 */
  shurikenPlus: number;
  assassin: number;
  /** 네크로: 저주 +2초 / 약화 저주 +50% */
  curseExt: number;
  curseBoost: number;
  /** v1.0 특성: 스킬 칸별 쿨타임 -N초 */
  slotCd: number[];
}

export function baseStats(maxHp: number): Stats {
  return {
    atkMul: 1, maxHp, speedMul: 1, atkSpdMul: 1, dmgTakenMul: 1,
    critChance: 0.05, critMul: 1.5,
    multishot: 0, pierce: 0, bounce: 0, knockback: 0, freezeChance: 0, poison: 0, chainChance: 0,
    fireDash: 0, dashCharges: 1, dashCdMul: 1,
    spinEvery: 0, thorns: 0, corpseExplode: 0, clones: 0,
    lifesteal: 0, reviveMul: 1, ghostAttack: 0, sizeMul: 1, hitboxMul: 1,
    skillDmgMul: 1, skillAreaMul: 1, skillCdMul: 1, castHaste: 0, cdOnKill: 0,
    goldMul: 1, aimShake: 0, reverseCtrl: 0, aggro: 0, hunger: 0, lowHpAtk: 0, nearAllyDR: 0,
    chargeBoost: 0, tauntBoost: 0, rainBoost: 0, sniper: 0, twinMeteor: 0, manaSurge: 0, blessLight: 0, doubleShield: 0,
    turretBonus: 0, napalm: 0, bigPot: 0, chef: 0, loud: 0, echo: 0, moody: 0,
    baseAtk: 10, baseSpeed: 70, baseAtkCd: 0.45, skillFlat: 0, skillCdFlat: 0, dmgFlatReduce: 0, goldFlat: 0, areaFlat: 0, shurikenPlus: 0, assassin: 0, curseExt: 0, curseBoost: 0, slotCd: [0, 0, 0, 0],
  };
}

export type TeamFlag = "monsterMul" | "rarityUp" | "treasure" | "extraOption";

/** 카드를 얻는 순간 일어나는 일 (서버가 구현) */
export interface CardCtx {
  healFull(): void;
  halfHp(): void;
  addXp(n: number): void;
  grantRandom(r: Rarity): void;
  extraPicks(n: number): void;
  skipPicks(n: number): void;
  reroll(): void;
  team(flag: TeamFlag, v: number): void;
}

export interface CardDef {
  id: string;
  name: string;
  rarity: Rarity;
  desc: string;
  quote: string;
  /** 같은 카드를 여러 번 고를 수 있는지 (최대 3번) */
  stack: boolean;
  cls?: ClassId;
  apply: (s: Stats, ctx: CardCtx) => void;
}

export const RARITY_NAME: Record<Rarity, string> = {
  common: "일반",
  rare: "희귀",
  legend: "전설",
  curse: "저주",
  team: "팀",
};

type C = Omit<CardDef, "stack" | "quote"> & { stack?: boolean; quote?: string };
const card = (c: C): CardDef => ({ stack: false, quote: "", ...c });

// 전체 목록과 설명은 ../../카드목록.md

// ---------- v0.9 고정값 도우미 (여러 장 모아도 곱해지지 않고 더해지기만 함) ----------
/** 평타 피해 +n (직업 기본 피해 기준으로 환산) */
export const addAtk = (s: Stats, n: number) => { s.atkMul += n / s.baseAtk; };
/** 이동 속도 +n */
export const addSpeed = (s: Stats, n: number) => { s.speedMul += n / s.baseSpeed; };
/** 초당 공격 횟수 +n */
export const addAps = (s: Stats, n: number) => { s.atkSpdMul += n * s.baseAtkCd; };
/** 대시 쿨타임 -n초 (기본 1.2초 기준) */
const dashCd = (s: Stats, n: number) => { s.dashCdMul = Math.max(0.3, s.dashCdMul - n / 1.2); };

export const CARDS: CardDef[] = [
  // ---------- 스탯 강화 (12) ----------
  card({ id: "muscle", name: "근육 자랑", rarity: "common", stack: true, desc: "평타 피해 +2", quote: "팔뚝 좀 봐줄래?", apply: (s) => { addAtk(s, 2); } }),
  card({ id: "skin", name: "두꺼운 피부", rarity: "common", stack: true, desc: "최대 체력 +25", quote: "원래 둔한 거 아님", apply: (s) => { s.maxHp += 25; } }),
  card({ id: "feather", name: "가벼운 발걸음", rarity: "common", stack: true, desc: "이동 속도 +7", quote: "도망은 자신 있다", apply: (s) => { addSpeed(s, 7); } }),
  card({ id: "quickhand", name: "빠른 손놀림", rarity: "common", stack: true, desc: "초당 공격 +0.25회", quote: "손이 먼저 나감", apply: (s) => { addAps(s, 0.25); } }),
  card({ id: "shin", name: "단단한 정강이", rarity: "common", stack: true, desc: "받는 피해 -2 (한 대 맞을 때마다)", quote: "테이블 모서리 단련", apply: (s) => { s.dmgFlatReduce += 2; } }),
  card({ id: "breakfast", name: "아침밥 든든", rarity: "common", stack: true, desc: "체력 전부 회복 + 최대 체력 +10", quote: "밥심이다", apply: (s, c) => { s.maxHp += 10; c.healFull(); } }),
  card({ id: "hawk", name: "매의 눈", rarity: "rare", stack: true, desc: "치명타 확률 +10%", quote: "저기 약점 보인다", apply: (s) => { s.critChance += 0.1; } }),
  card({ id: "vital", name: "급소 공략", rarity: "rare", stack: true, desc: "치명타 피해 +40%", quote: "아픈 데만 골라 때림", apply: (s) => { s.critMul += 0.4; } }),
  card({ id: "rollfast", name: "재빠른 구르기", rarity: "rare", stack: true, desc: "대시 쿨타임 -0.25초", quote: "구르는 게 걷는 것보다 빠름", apply: (s) => { dashCd(s, 0.25); } }),
  card({ id: "focus", name: "집중력", rarity: "rare", stack: true, desc: "스킬 쿨타임 -1초", quote: "오늘은 폰 안 봄", apply: (s) => { s.skillCdFlat += 1; } }),
  card({ id: "vampire", name: "흡혈 습관", rarity: "legend", desc: "입힌 피해의 4%만큼 회복", quote: "모기한테 배웠다", apply: (s) => { s.lifesteal += 0.04; } }),
  card({ id: "giantblood", name: "거인의 피", rarity: "legend", desc: "최대 체력 +80, 몸 1.3배", quote: "문에 머리 부딪힘 주의", apply: (s) => { s.maxHp += 80; s.sizeMul *= 1.3; } }),

  // ---------- 능력 변화 (16) ----------
  card({ id: "triple", name: "세 갈래 공격", rarity: "rare", desc: "공격이 3방향으로 (각 50%). 검사는 베기 범위 확장", quote: "셋 중 하나는 맞겠지", apply: (s) => { s.multishot = 1; } }),
  card({ id: "pierce", name: "관통", rarity: "common", stack: true, desc: "공격이 적 1명을 더 뚫음. 검사는 사거리 +6", quote: "앞사람 뒷사람 같이", apply: (s) => { s.pierce += 1; } }),
  card({ id: "bounce", name: "튕기는 공격", rarity: "rare", desc: "투사체가 벽에 1번 튕김", quote: "각도는 감으로", apply: (s) => { s.bounce += 1; } }),
  card({ id: "firedash", name: "발바닥 화상", rarity: "rare", desc: "대시 경로에 2초간 불길", quote: "뜨거워서 뛰는 거임", apply: (s) => { s.fireDash = 1; } }),
  card({ id: "knock", name: "넉백 펀치", rarity: "common", desc: "공격 시 적을 크게 밀어냄 + 평타 피해 +1", quote: "저리 가", apply: (s) => { s.knockback = 1; addAtk(s, 1); } }),
  card({ id: "icehand", name: "얼음 손", rarity: "rare", desc: "공격 시 20% 확률로 적 1초 빙결", quote: "손이 너무 차가움", apply: (s) => { s.freezeChance += 0.2; } }),
  card({ id: "poison", name: "독 묻은 무기", rarity: "common", desc: "공격 시 3초간 독 피해", quote: "안 씻은 거 아님", apply: (s) => { s.poison = 1; } }),
  card({ id: "chain", name: "연쇄 번개", rarity: "legend", desc: "공격 시 18% 확률로 주변 적 3명에게 번개", quote: "정전기 체질", apply: (s) => { s.chainChance += 0.18; } }),
  card({ id: "clone", name: "꼬마 분신", rarity: "legend", desc: "따라다니며 공격하는 미니 분신", quote: "동생 데려옴", apply: (s) => { s.clones += 1; } }),
  card({ id: "corpse", name: "폭발하는 시체", rarity: "rare", desc: "처치한 적이 터져서 주변에 피해", quote: "청소는 안 함", apply: (s) => { s.corpseExplode = 1; } }),
  card({ id: "magnet", name: "자석 손", rarity: "common", stack: true, desc: "돈을 얻을 때마다 +2원", quote: "돈이 알아서 옴", apply: (s) => { s.goldFlat += 2; } }),
  card({ id: "spin", name: "회전 베기", rarity: "rare", desc: "5번째 공격마다 주변 360도 공격", quote: "어지럽다", apply: (s) => { s.spinEvery = 5; } }),
  card({ id: "thorns", name: "가시 갑옷", rarity: "rare", desc: "받은 근접 피해의 20%를 반사", quote: "만지면 아파", apply: (s) => { s.thorns += 0.2; } }),
  card({ id: "doubledash", name: "두 번 대시", rarity: "rare", desc: "대시를 연속 2번 가능", quote: "한 번 더!", apply: (s) => { s.dashCharges = 2; } }),
  card({ id: "reviver", name: "부활 전문가", rarity: "common", desc: "동료 부활 속도 2배", quote: "일어나 이 친구야", apply: (s) => { s.reviveMul *= 2; } }),
  card({ id: "ghostprank", name: "유령 장난", rarity: "rare", desc: "유령 상태에서도 공격 가능 (평타 피해의 60%)", quote: "죽어서도 일함", apply: (s) => { s.ghostAttack = 1; } }),

  // ---------- 저주·도박 (10) ----------
  card({ id: "shaky", name: "떨리는 손", rarity: "curse", desc: "평타 피해 +7, 대신 조준이 덜덜 흔들림", quote: "커피를 너무 마심", apply: (s) => { addAtk(s, 7); s.aimShake = 1; } }),
  card({ id: "glass", name: "유리 대포", rarity: "curse", desc: "평타 피해 +6, 대신 최대 체력 절반", quote: "한 대만 맞으면 끝", apply: (s) => { addAtk(s, 6); s.maxHp = Math.round(s.maxHp / 2); } }),
  card({ id: "coin", name: "동전 던지기", rarity: "curse", desc: "50%: 전설 카드 획득 / 50%: 체력 절반", quote: "앞면이면 대박", apply: (_s, c) => { if (Math.random() < 0.5) c.grantRandom("legend"); else c.halfHp(); } }),
  card({ id: "backwards", name: "거꾸로 걷기", rarity: "curse", desc: "이동 속도 +25, 대신 가끔 방향키가 반대로", quote: "어디로 가는 거야", apply: (s) => { addSpeed(s, 25); s.reverseCtrl = 1; } }),
  card({ id: "bighead", name: "대왕 머리", rarity: "curse", desc: "치명타 확률 +30%, 대신 맞는 범위 증가", quote: "생각이 많아서", apply: (s) => { s.critChance += 0.3; s.hitboxMul *= 1.6; } }),
  card({ id: "noisy", name: "기분파", rarity: "curse", desc: "초당 공격 +0.6회, 대신 10초마다 3초간 공격력 절반", quote: "오늘은 그런 날", apply: (s) => { addAps(s, 0.6); s.moody = 1; } }),
  card({ id: "shiny", name: "유리 심장", rarity: "curse", desc: "평타 피해 +3 · 스킬 피해 +4, 대신 받는 피해 +25%", quote: "쨍그랑 조심", apply: (s) => { addAtk(s, 3); s.skillFlat += 4; s.dmgTakenMul *= 1.25; } }),
  card({ id: "hunger", name: "배고픔", rarity: "curse", desc: "매 라운드 최대 체력 +15, 대신 안 싸우면 체력 감소", quote: "밥 줘", apply: (s) => { s.hunger = 1; } }),
  card({ id: "debt", name: "빚쟁이", rarity: "curse", desc: "지금 카드 2장 더 선택, 다음 2번 카드 선택 없음", quote: "나중에 갚을게", apply: (_s, c) => { c.extraPicks(2); c.skipPicks(2); } }),
  card({ id: "dice", name: "신의 주사위", rarity: "curse", desc: "내 카드 전부 무작위 카드로 교체", quote: "인생 한 방", apply: (_s, c) => { c.reroll(); } }),

  // ---------- 직업 전용 (8) ----------
  card({ id: "w_charge", cls: "warrior", name: "멈추지 않는 돌진", rarity: "rare", desc: "방패 돌진 사거리 +50%, 기절 2배", quote: "브레이크 고장", apply: (s) => { s.chargeBoost = 1; } }),
  card({ id: "w_taunt", cls: "warrior", name: "끝없는 함성", rarity: "legend", desc: "도발 함성 범위 2배, 지속 +3초", quote: "목 안 쉼", apply: (s) => { s.tauntBoost = 1; } }),
  card({ id: "a_rain", cls: "archer", name: "화살 소나기 강화", rarity: "rare", desc: "화살비 범위 +50%, 지속 +2초", quote: "우산 챙겨", apply: (s) => { s.rainBoost = 1; } }),
  card({ id: "a_sniper", cls: "archer", name: "저격수", rarity: "legend", desc: "멀리 있는 적일수록 피해 증가 (최대 +100%)", quote: "숨 참고...", apply: (s) => { s.sniper = 1; } }),
  card({ id: "m_twin", cls: "mage", name: "쌍둥이 메테오", rarity: "rare", desc: "메테오가 2개 떨어짐", quote: "하나 더 주문함", apply: (s) => { s.twinMeteor = 1; } }),
  card({ id: "m_surge", cls: "mage", name: "마나 폭주", rarity: "legend", desc: "스킬 사용 후 3초간 기본 공격이 크게 폭발", quote: "참을 수 없어", apply: (s) => { s.manaSurge = 1; } }),
  card({ id: "c_bless", cls: "cleric", name: "축복의 빛", rarity: "rare", desc: "치유의 빛 받은 동료 공격력 +20% (5초)", quote: "힘내라 힘", apply: (s) => { s.blessLight = 1; } }),
  card({ id: "c_faith", cls: "cleric", name: "단단한 믿음", rarity: "legend", desc: "축복의 방패 보호막 2배, 동료 2명에게", quote: "믿습니까", apply: (s) => { s.doubleShield = 1; } }),
  card({ id: "e_turret", cls: "engineer", name: "추가 포탑", rarity: "rare", desc: "거미 포탑 +1대 (1장까지)", quote: "한 마리 더 키우자", apply: (s) => { s.turretBonus += 1; } }),
  card({ id: "e_napalm", cls: "engineer", name: "네이팜", rarity: "legend", desc: "화염방사 사거리 +50%, 화상 2배", quote: "바베큐 파티", apply: (s) => { s.napalm = 1; } }),
  card({ id: "k_bigpot", cls: "cook", name: "큰 냄비", rarity: "rare", desc: "음식 던지기 회복 2배, 범위 +30%", quote: "넉넉하게 했어", apply: (s) => { s.bigPot = 1; } }),
  card({ id: "k_chef", cls: "cook", name: "주방장의 손맛", rarity: "legend", desc: "프라이팬 피해 +40%, 기절 확률 30%", quote: "손목 스냅", apply: (s) => { s.chef = 1; } }),
  card({ id: "b_loud", cls: "bard", name: "확성기", rarity: "rare", desc: "용기의 노래·불협화음 범위 +50%", quote: "들리십니까", apply: (s) => { s.loud = 1; } }),
  card({ id: "n_shuriken", cls: "ninja", name: "표창 장인", rarity: "rare", desc: "표창이 5개로 늘어남", quote: "손목 스냅이 생명", apply: (s) => { s.shurikenPlus = 1; } }),
  card({ id: "n_assassin", cls: "ninja", name: "그림자 일격", rarity: "legend", desc: "연막탄 뒤 첫 공격이 2배 → 3배", quote: "보이지 않는 칼", apply: (s) => { s.assassin = 1; } }),
  card({ id: "x_plague", cls: "necro", name: "끈질긴 저주", rarity: "rare", desc: "저주 지속 시간 +2초", quote: "쉽게는 안 풀려", apply: (s) => { s.curseExt = 2; } }),
  card({ id: "x_reaper", cls: "necro", name: "사신의 손길", rarity: "legend", desc: "저주받은 적이 받는 피해 +30% → +50%", quote: "이름을 불렀다", apply: (s) => { s.curseBoost = 1; } }),
  card({ id: "b_echo", cls: "bard", name: "메아리", rarity: "legend", desc: "음표가 2번 더 튕김", quote: "메아리~ 아리~", apply: (s) => { s.echo = 1; } }),

  // ---------- 스킬 연동 (5) ----------
  card({ id: "skillmania", name: "스킬 마니아", rarity: "common", stack: true, desc: "스킬 피해 +3 (한 번 맞을 때마다)", quote: "평타는 촌스러워", apply: (s) => { s.skillFlat += 3; } }),
  card({ id: "bighand", name: "큰 손", rarity: "rare", stack: true, desc: "스킬 반경 +8", quote: "손이 커서 그래", apply: (s) => { s.areaFlat += 8; } }),
  card({ id: "chaincast", name: "연속 시전", rarity: "rare", desc: "스킬 사용 후 3초간 초당 공격 +0.8회", quote: "한 번 쓰면 멈출 수 없어", apply: (s) => { s.castHaste = 1; } }),
  card({ id: "cdthief", name: "쿨타임 도둑", rarity: "legend", desc: "적 처치 시 모든 스킬 쿨타임 0.3초 감소", quote: "남의 시간 훔치기", apply: (s) => { s.cdOnKill += 0.3; } }),
  card({ id: "earlyedu", name: "조기 교육", rarity: "rare", stack: true, desc: "즉시 경험치 +60", quote: "선행 학습", apply: (_s, c) => { c.addXp(60); } }),

  // ---------- 팀카드 (10, 투표 전용) ----------
  card({ id: "t_feast", name: "단체 회식", rarity: "team", desc: "전원 최대 체력 +40", quote: "고기 먹으러 가자", apply: (s, c) => { s.maxHp += 40; c.healFull(); } }),
  card({ id: "t_lightning", name: "번개 동맹", rarity: "team", desc: "전원 공격에 10% 확률 번개", quote: "우리 다 정전기", apply: (s) => { s.chainChance += 0.1; } }),
  card({ id: "t_rescue", name: "빠른 구조대", rarity: "team", desc: "부활 시간 절반", quote: "119보다 빠름", apply: (s) => { s.reviveMul *= 2; } }),
  card({ id: "t_allin", name: "대박 아니면 쪽박", rarity: "team", desc: "몬스터 수 2배, 카드 등급 확률 크게 상승", quote: "갈 데까지 가보자", apply: (_s, c) => { c.team("monsterMul", 2); c.team("rarityUp", 1); } }),
  card({ id: "t_oneteam", name: "원팀", rarity: "team", desc: "동료 근처(3칸)에 있으면 받는 피해 -3", quote: "뭉쳐야 산다", apply: (s) => { s.nearAllyDR = 3; } }),
  card({ id: "t_treasure", name: "보물 사냥꾼", rarity: "team", desc: "매 라운드 보물 상자 1개 등장 (돈 30)", quote: "지도 주웠다", apply: (_s, c) => { c.team("treasure", 1); } }),
  card({ id: "t_exercise", name: "단체 운동", rarity: "team", desc: "전원 이동 속도 +8, 대시 쿨타임 -0.2초", quote: "아침 조깅 효과", apply: (s) => { addSpeed(s, 8); dashCd(s, 0.2); } }),
  card({ id: "t_extracard", name: "카드 한 장 더", rarity: "team", desc: "다음 3라운드 카드 선택지 4장", quote: "고민이 늘었다", apply: (_s, c) => { c.team("extraOption", 3); } }),
  card({ id: "t_laststand", name: "마지막 발악", rarity: "team", desc: "체력 25% 이하일 때 평타 피해 +5", quote: "아직 안 끝났다", apply: (s) => { s.lowHpAtk = 5; } }),
  card({ id: "t_cursed", name: "저주 받은 용사단", rarity: "team", desc: "전원 저주 카드 1장 + 전설 카드 1장", quote: "같이 망하자", apply: (_s, c) => { c.grantRandom("curse"); c.grantRandom("legend"); } }),
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export const GACHA_PRICE: Record<"common" | "rare" | "legend", number> = { common: 30, rare: 80, legend: 200 };
