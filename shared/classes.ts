export type ClassId = "warrior" | "archer" | "mage" | "cleric" | "engineer" | "cook" | "bard" | "ninja" | "necro";
export type ProjKind =
  | "arrow" | "orb" | "bolt" | "bigarrow" | "note" | "laser" | "turret" | "shuriken" | "dark" | "missile"
  // 몬스터 탄
  | "bone" | "sand" | "ice" | "seed" | "fire" | "spirit" | "light";

/** self: 내 주변 / point: 지점 원 / line: 직선 / dir: 방향 / passive: 누르는 스킬 아님 (엔지니어 포탑 강화) */
export type AimType = "self" | "point" | "line" | "dir" | "passive";

export interface SkillDef {
  name: string;
  desc: string;
  cd: number;
  aim: AimType;
  /** 사거리 (point/line 길이) */
  range: number;
  /** 효과 반경 (line은 폭의 절반) */
  radius: number;
  unlock: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  hp: number;
  speed: number;
  attack: {
    /** flame: 짧은 부채꼴로 계속 뿜는 화염방사 */
    kind: "melee" | "proj" | "flame";
    dmg: number;
    cd: number;
    range?: number;
    projKind?: ProjKind;
    projSpeed?: number;
    projLife?: number;
    explode?: number;
  };
  /** 1~4번 + v1.6 각성기(5번, Lv15) */
  skills: [SkillDef, SkillDef, SkillDef, SkillDef, SkillDef];
  /** 직업 밸런스: 스킬 피해 배율 (기본 1) */
  skillDmg?: number;
  /** 직업 밸런스: 받는 피해 배율 (근접 0.85) */
  dmgTaken?: number;
  /** 로비 묶음 */
  group: "melee" | "ranged" | "support";
}

/** 스킬이 열리는 레벨 (5번째 = v1.6 각성) */
export const SKILL_UNLOCK = [1, 3, 6, 10, 15];

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: "warrior",
    name: "검사",
    role: "탱커",
    group: "melee",
    // v0.9: 체력 140→170, 받는 피해 -15%
    hp: 170,
    speed: 72,
    // v0.7: 피해 소폭↑ · 베기 범위 대폭↑ · 이속 소폭↑
    attack: { kind: "melee", dmg: 16, cd: 0.45, range: 36 },
    skills: [
      { name: "도발 함성", desc: "주변 적 도발 + 4초간 받는 피해 50% 감소", cd: 10, aim: "self", range: 0, radius: 90, unlock: 1 },
      { name: "방패 돌진", desc: "지정 위치로 돌진, 부딪힌 적 1초 기절", cd: 8, aim: "point", range: 100, radius: 10, unlock: 3 },
      { name: "대지 가르기", desc: "전방 직선 충격파", cd: 9, aim: "line", range: 110, radius: 10, unlock: 6 },
      { name: "거인화", desc: "8초간 거대화: 공격력 +50%, 받는 피해 -50%", cd: 60, aim: "self", range: 0, radius: 20, unlock: 10 },
      { name: "각성: 천지개벽", desc: "전방 넓게 대검을 휘둘러 큰 피해 + 1초 기절", cd: 50, aim: "dir", range: 90, radius: 0, unlock: 15 },
    ],
  },
  archer: {
    id: "archer",
    name: "궁수",
    role: "원거리 딜러",
    group: "ranged",
    hp: 90,
    speed: 74,
    // v0.9: 평타 피해 -10%
    attack: { kind: "proj", dmg: 9, cd: 0.38, projKind: "arrow", projSpeed: 230, projLife: 0.9 },
    skills: [
      { name: "화살비", desc: "조준한 곳에 2초간 화살비", cd: 13.5, aim: "point", range: 140, radius: 40, unlock: 1 },
      { name: "올가미 덫", desc: "덫 설치, 밟은 적 2초 속박 (최대 3개)", cd: 9, aim: "point", range: 120, radius: 10, unlock: 3 },
      { name: "뒤구르기 사격", desc: "뒤로 구르며 부채꼴 화살 5발", cd: 12, aim: "dir", range: 90, radius: 0, unlock: 6 },
      { name: "폭풍 화살", desc: "모든 적을 꿰뚫는 거대 화살", cd: 75, aim: "line", range: 380, radius: 10, unlock: 10 },
      { name: "각성: 별빛 화살비", desc: "5초간 주변 적 3명에게 0.3초마다 화살", cd: 55, aim: "self", range: 0, radius: 180, unlock: 15 },
    ],
  },
  mage: {
    id: "mage",
    name: "마법사",
    role: "광역 딜러",
    group: "ranged",
    hp: 80,
    speed: 66,
    // v0.7: 평타·스킬 피해 25%↓, 스킬 쿨타임 ×1.4
    attack: { kind: "proj", dmg: 8.1, cd: 0.6, projKind: "orb", projSpeed: 150, projLife: 1.1, explode: 18 },
    skillDmg: 0.75,
    skills: [
      { name: "메테오", desc: "잠시 후 조준한 곳에 큰 폭발", cd: 15.4, aim: "point", range: 140, radius: 50, unlock: 1 },
      { name: "얼음 장판", desc: "3초간 적 둔화, 끝날 때 빙결", cd: 14, aim: "point", range: 140, radius: 45, unlock: 3 },
      { name: "순간이동", desc: "지정 위치로 순간이동, 떠난 자리 폭발", cd: 9.8, aim: "point", range: 110, radius: 35, unlock: 6 },
      { name: "블랙홀", desc: "3초간 적을 빨아들인 뒤 대폭발", cd: 84, aim: "point", range: 160, radius: 70, unlock: 10 },
      { name: "각성: 대유성우", desc: "조준한 곳 주변에 2초 동안 유성 8개", cd: 60, aim: "point", range: 150, radius: 70, unlock: 15 },
    ],
  },
  cleric: {
    id: "cleric",
    name: "성직자",
    role: "힐러",
    group: "support",
    hp: 110,
    speed: 70,
    // v0.7: 공격 속도 0.8배
    attack: { kind: "proj", dmg: 8.1, cd: 0.525, projKind: "bolt", projSpeed: 190, projLife: 0.9 },
    skills: [
      { name: "치유의 빛", desc: "주변 동료 체력 40% 회복", cd: 24, aim: "self", range: 0, radius: 60, unlock: 1 },
      { name: "축복의 방패", desc: "조준점에 가장 가까운 동료에게 보호막 40", cd: 18, aim: "point", range: 160, radius: 60, unlock: 3 },
      { name: "신성한 망치", desc: "망치를 내리쳐 피해 + 1.5초 기절", cd: 20, aim: "point", range: 130, radius: 35, unlock: 6 },
      { name: "부활의 기적", desc: "쓰러진 동료 전원 부활 + 모두 50% 회복", cd: 90, aim: "self", range: 0, radius: 30, unlock: 10 },
      { name: "각성: 성역", desc: "8초간 나를 따라오는 성역: 동료 받는 피해 -40%, 초당 체력 3% 회복", cd: 60, aim: "self", range: 0, radius: 90, unlock: 15 },
    ],
  },
  engineer: {
    id: "engineer",
    name: "엔지니어",
    role: "설치형 기계공",
    group: "ranged",
    hp: 110,
    speed: 68,
    // 화염방사기: 짧은 부채꼴에 연속 불길, 맞은 적은 화상 (v0.9: 피해 -10%)
    attack: { kind: "flame", dmg: 2.9, cd: 0.12, range: 42 },
    skills: [
      { name: "포탑 설치", desc: "조준한 곳에 고정 포탑 설치 (최대 2대, 12초)", cd: 10, aim: "point", range: 120, radius: 10, unlock: 1 },
      { name: "지뢰 지대", desc: "지뢰 5개를 뿌림, 적이 밟으면 폭발", cd: 12, aim: "point", range: 130, radius: 50, unlock: 3 },
      { name: "수리 드론", desc: "6초간 주변 동료 초당 체력 4% 회복", cd: 16, aim: "self", range: 0, radius: 80, unlock: 6 },
      { name: "거대 로봇", desc: "10초간 몸 2배 · 받는 피해 -50% · 평타가 미사일", cd: 70, aim: "self", range: 0, radius: 20, unlock: 10 },
      { name: "각성: 궤도 폭격", desc: "1.5초 뒤 조준한 곳에 거대한 폭발", cd: 55, aim: "point", range: 170, radius: 80, unlock: 15 },
    ],
  },
  cook: {
    id: "cook",
    name: "요리사",
    role: "서포트 딜러",
    group: "melee",
    // v0.9: 체력 120→150, 받는 피해 -15%
    hp: 150,
    speed: 70,
    // 프라이팬: 가끔 적을 기절시킴
    // v0.9.1: 평타 범위 22→30
    attack: { kind: "melee", dmg: 12, cd: 0.5, range: 30 },
    skills: [
      { name: "음식 던지기", desc: "떨어진 곳 주변 동료 체력 25% 회복", cd: 8, aim: "point", range: 150, radius: 32, unlock: 1 },
      { name: "매운 요리", desc: "조준한 곳에 매운 요리를 던져 광역 피해", cd: 12, aim: "point", range: 140, radius: 45, unlock: 3 },
      { name: "기름 붓기", desc: "미끄러운 기름: 적 둔화, 불이 닿으면 폭발", cd: 10, aim: "point", range: 130, radius: 36, unlock: 6 },
      { name: "대잔치", desc: "주변 동료 체력 전부 회복 + 10초간 받는 피해 -30%", cd: 70, aim: "self", range: 0, radius: 72, unlock: 10 },
      { name: "각성: 만한전석", desc: "6초간 주변 동료 초당 체력 5% 회복 + 공격 속도 +30%", cd: 60, aim: "self", range: 0, radius: 85, unlock: 15 },
    ],
  },
  bard: {
    id: "bard",
    name: "바드",
    role: "오라 서포터",
    group: "support",
    hp: 95,
    speed: 72,
    // 음표: 맞으면 근처 다른 적에게 튕김 (v0.9: 평타 피해 -10%)
    attack: { kind: "proj", dmg: 8.1, cd: 0.45, projKind: "note", projSpeed: 170, projLife: 1 },
    skills: [
      { name: "앙코르", desc: "주변 동료 모든 스킬 쿨타임 초기화", cd: 12, aim: "self", range: 0, radius: 100, unlock: 1 },
      { name: "자장가", desc: "범위 적이 2초 잠듦 (맞으면 깸)", cd: 12, aim: "point", range: 140, radius: 50, unlock: 3 },
      { name: "불협화음", desc: "4초간 내 주변 적 둔화 + 지속 피해", cd: 10, aim: "self", range: 0, radius: 70, unlock: 6 },
      { name: "용기의 노래", desc: "항상 켜짐: 주변(주황 원) 동료 평타 피해 +20%", cd: 0, aim: "passive", range: 0, radius: 105, unlock: 10 },
      { name: "각성: 피날레", desc: "주변 적에게 피해 + 2.5초 기절(보스 0.8초), 주변 동료 스킬 쿨타임 절반", cd: 60, aim: "self", range: 0, radius: 110, unlock: 15 },
    ],
  },
  ninja: {
    id: "ninja",
    name: "닌자",
    role: "근접 암살자",
    group: "melee",
    hp: 120,
    speed: 80,
    // 빠른 단검 베기
    attack: { kind: "melee", dmg: 8, cd: 0.28, range: 24 },
    skills: [
      { name: "표창", desc: "조준한 방향으로 표창 3개", cd: 9, aim: "dir", range: 160, radius: 0, unlock: 1 },
      { name: "연막탄", desc: "3초간 은신(적이 못 봄), 다음 공격 2배", cd: 21, aim: "self", range: 0, radius: 50, unlock: 3 },
      { name: "그림자 분신", desc: "8초간 나를 따라 싸우는 분신 2개", cd: 27, aim: "self", range: 0, radius: 20, unlock: 6 },
      { name: "천벌", desc: "지정 위치로 돌진 (돌진 중 무적), 부딪힌 적은 보스 빼고 즉사", cd: 75, aim: "point", range: 150, radius: 10, unlock: 10 },
      { name: "각성: 그림자 난무", desc: "1.6초 무적, 주변 적 최대 10명을 차례로 베기", cd: 50, aim: "self", range: 0, radius: 160, unlock: 15 },
    ],
  },
  necro: {
    id: "necro",
    name: "네크로맨서",
    role: "저주술사",
    group: "ranged",
    hp: 95,
    speed: 68,
    // 어둠 구체 (원거리 평타 -10% 적용)
    attack: { kind: "proj", dmg: 9, cd: 0.5, projKind: "dark", projSpeed: 170, projLife: 1 },
    skills: [
      { name: "유령 소환", desc: "15초간 따라다니며 공격하는 유령 1체", cd: 18, aim: "self", range: 0, radius: 20, unlock: 1 },
      { name: "약화 저주", desc: "범위 적이 6초간 받는 피해 +30%", cd: 9, aim: "point", range: 150, radius: 55, unlock: 3 },
      { name: "둔화 저주", desc: "범위 적 4초간 둔화 + 지속 피해", cd: 10, aim: "point", range: 150, radius: 50, unlock: 6 },
      { name: "죽음의 표식", desc: "화면 안의 저주받은 적 모두에게 높은 피해", cd: 70, aim: "self", range: 0, radius: 300, unlock: 10 },
      { name: "각성: 망자의 군대", desc: "10초간 유령 4체 소환 + 주변 적 모두 저주", cd: 60, aim: "self", range: 0, radius: 260, unlock: 15 },
    ],
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
