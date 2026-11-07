// v1.0 특성 트리: 직업마다 3갈래 × 5단계. 2레벨마다 1포인트, 카드 고를 때 찍음.
// 갈래 안에서는 1단계부터 순서대로만 찍을 수 있고, 5단계는 스킬 모양이 바뀌는 '비기'.
// 원정·무한 하강에서만 쓰고, 판이 끝나면 초기화(되돌리기 없음).
import type { ClassId } from "./classes";
import { addAps, addAtk, addSpeed, type Stats } from "./cards";

export interface TalentTier {
  name: string;
  desc: string;
  /** 능력치 변화 (없으면 서버 로직에서 단계를 직접 확인) */
  apply?: (s: Stats) => void;
}

export interface TalentBranch {
  id: string;
  name: string;
  icon: string;
  tiers: [TalentTier, TalentTier, TalentTier, TalentTier, TalentTier];
}

/** 2레벨마다 1포인트 */
export const TALENT_EVERY = 2;
export const TALENT_TIERS = 5;
export const talentPoints = (level: number) => Math.floor(level / TALENT_EVERY);
/** 갈래를 몇 단계 찍었는지 */
export const tier = (tal: Record<string, number> | undefined, id: string) => tal?.[id] ?? 0;

const hp = (n: number) => (s: Stats) => { s.maxHp += n; };
const atk = (n: number) => (s: Stats) => addAtk(s, n);
const aps = (n: number) => (s: Stats) => addAps(s, n);
const spd = (n: number) => (s: Stats) => addSpeed(s, n);
const crit = (n: number) => (s: Stats) => { s.critChance += n; };
const critDmg = (n: number) => (s: Stats) => { s.critMul += n; };
const guard = (n: number) => (s: Stats) => { s.dmgFlatReduce += n; };
const skill = (n: number) => (s: Stats) => { s.skillFlat += n; };
const area = (n: number) => (s: Stats) => { s.areaFlat += n; };
const steal = (n: number) => (s: Stats) => { s.lifesteal += n; };
/** 스킬 칸(0~3) 쿨타임 -n초 */
const cd = (slot: number, n: number) => (s: Stats) => { s.slotCd[slot] += n; };
const flag = (k: keyof Stats, v = 1) => (s: Stats) => { (s as unknown as Record<string, number>)[k as string] = Math.max(Number(s[k]) || 0, v); };

const T = (name: string, desc: string, apply?: (s: Stats) => void): TalentTier => ({ name, desc, apply });

export const TALENTS: Record<ClassId, [TalentBranch, TalentBranch, TalentBranch]> = {
  warrior: [
    { id: "w_berserk", name: "광전사", icon: "🔥", tiers: [
      T("분노", "평타 피해 +2", atk(2)),
      T("궁지", "체력 50% 이하일 때 평타 피해 +15%"),
      T("피의 맛", "흡혈 2%", steal(0.02)),
      T("광기", "초당 공격 +0.2", aps(0.2)),
      T("★ 폭주", "체력 30% 이하면 공격 속도 +60%"),
    ] },
    { id: "w_guard", name: "수호자", icon: "🛡", tiers: [
      T("두꺼운 갑옷", "최대 체력 +25", hp(25)),
      T("단련", "받는 피해 -1", guard(1)),
      T("어깨 나란히", "동료 근처에 있으면 받는 피해 -1", (s) => { s.nearAllyDR += 1; }),
      T("우렁찬 함성", "도발 함성 범위 2배, 지속 +3초", flag("tauntBoost")),
      T("★ 수호의 거인", "거인화 중 주변 동료도 받는 피해 -30%"),
    ] },
    { id: "w_blade", name: "검술", icon: "⚔", tiers: [
      T("날 세우기", "평타 피해 +2", atk(2)),
      T("급소 찌르기", "치명타 확률 +6%", crit(0.06)),
      T("묵직한 충격", "스킬 피해 +3", skill(3)),
      T("회전 베기", "5번째 평타마다 주변 회전 베기", (s) => { s.spinEvery = s.spinEvery ? Math.min(s.spinEvery, 5) : 5; }),
      T("★ 삼단 가르기", "대지 가르기가 3갈래로 나감 (양옆은 약하게)"),
    ] },
  ],
  cook: [
    { id: "k_nutri", name: "영양사", icon: "🥗", tiers: [
      T("건강식", "최대 체력 +20", hp(20)),
      T("빠른 배달", "음식 던지기 쿨타임 -1.5초", cd(0, 1.5)),
      T("든든한 배", "받는 피해 -1", guard(1)),
      T("큰 냄비", "음식 던지기 회복 2배, 범위 +30%", flag("bigPot")),
      T("★ 두 접시", "음식 던지기가 2개 동시에 날아감"),
    ] },
    { id: "k_fire", name: "불맛", icon: "🌶", tiers: [
      T("센 불", "평타 피해 +2", atk(2)),
      T("빠른 조리", "매운 요리 쿨타임 -2초", cd(1, 2)),
      T("화끈한 맛", "스킬 피해 +3", skill(3)),
      T("넓은 팬", "스킬 범위 +8", area(8)),
      T("★ 불바다", "매운 요리 자리에 3초간 불 장판이 남음"),
    ] },
    { id: "k_buffet", name: "뷔페", icon: "🍱", tiers: [
      T("가벼운 앞치마", "이동 속도 +5", spd(5)),
      T("미리 장보기", "대잔치 쿨타임 -10초", cd(3, 10)),
      T("시식", "최대 체력 +20", hp(20)),
      T("기름 넉넉히", "기름 붓기 쿨타임 -2초", cd(2, 2)),
      T("★ 무한 리필", "대잔치 쿨타임 절반 + 10초간 동료 이동 속도 +20%", cd(3, 25)),
    ] },
  ],
  ninja: [
    { id: "n_assn", name: "암살", icon: "🗡", tiers: [
      T("급소", "치명타 확률 +6%", crit(0.06)),
      T("깊은 상처", "치명타 피해 +40%", critDmg(0.4)),
      T("연기 장인", "연막탄 쿨타임 -3초", cd(1, 3)),
      T("그림자 일격", "연막탄 뒤 첫 공격 2배 → 3배", flag("assassin")),
      T("★ 필살", "연막탄 뒤 첫 공격은 반드시 치명타"),
    ] },
    { id: "n_shur", name: "표창", icon: "✴", tiers: [
      T("빠른 손", "표창 쿨타임 -1.5초", cd(0, 1.5)),
      T("날카로운 날", "스킬 피해 +4", skill(4)),
      T("관통", "표창이 적을 1명 더 뚫음"),
      T("표창 장인", "표창이 5개로 늘어남", flag("shurikenPlus")),
      T("★ 부메랑", "표창이 끝까지 날아간 뒤 되돌아옴"),
    ] },
    { id: "n_shadow", name: "그림자", icon: "👥", tiers: [
      T("단련된 몸", "최대 체력 +15", hp(15)),
      T("분신 숙련", "그림자 분신 쿨타임 -4초", cd(2, 4)),
      T("오래가는 그림자", "분신 지속 +3초"),
      T("발놀림", "이동 속도 +6", spd(6)),
      T("★ 그림자 군단", "분신 3개 + 표창을 던지면 분신도 같이 던짐"),
    ] },
  ],
  archer: [
    { id: "a_snipe", name: "저격", icon: "🎯", tiers: [
      T("단단한 시위", "평타 피해 +1.5", atk(1.5)),
      T("정조준", "치명타 확률 +6%", crit(0.06)),
      T("먼 사거리", "평타 사거리 +20%"),
      T("급소 사격", "치명타 피해 +30%", critDmg(0.3)),
      T("★ 매의 눈", "멀리 맞출수록 피해 증가 (최대 +50%)"),
    ] },
    { id: "a_trap", name: "덫사냥꾼", icon: "🪤", tiers: [
      T("손재주", "올가미 덫 쿨타임 -1.5초", cd(1, 1.5)),
      T("덫 주머니", "덫 최대 개수 +1"),
      T("넓은 올가미", "스킬 범위 +6", area(6)),
      T("질긴 밧줄", "덫 속박 +1초"),
      T("★ 폭발 덫", "덫이 터지며 주변 적까지 피해 + 속박"),
    ] },
    { id: "a_rapid", name: "연사", icon: "🏹", tiers: [
      T("빠른 장전", "초당 공격 +0.25", aps(0.25)),
      T("가벼운 신발", "이동 속도 +5", spd(5)),
      T("손이 안 보여", "초당 공격 +0.25", aps(0.25)),
      T("구르기 연습", "뒤구르기 사격 쿨타임 -2초", cd(2, 2)),
      T("★ 삼연발", "3번째 평타마다 화살이 3갈래"),
    ] },
  ],
  mage: [
    { id: "m_fire", name: "화염", icon: "☄", tiers: [
      T("불씨", "스킬 피해 +3", skill(3)),
      T("빠른 주문", "메테오 쿨타임 -2초", cd(0, 2)),
      T("큰 불", "스킬 범위 +8", area(8)),
      T("쌍둥이 메테오", "메테오가 2개 떨어짐", flag("twinMeteor")),
      T("★ 유성우", "메테오가 3개 연속으로 떨어짐"),
    ] },
    { id: "m_frost", name: "냉기", icon: "❄", tiers: [
      T("서늘한 몸", "최대 체력 +15", hp(15)),
      T("얼음 숙련", "얼음 장판 쿨타임 -2초", cd(1, 2)),
      T("동상", "평타 5% 확률로 빙결", (s) => { s.freezeChance += 0.05; }),
      T("얼음 갑옷", "받는 피해 -1", guard(1)),
      T("★ 얼음 파편", "빙결된 적을 때리면 깨지며 주변 폭발"),
    ] },
    { id: "m_arcane", name: "비전", icon: "✨", tiers: [
      T("집중", "모든 스킬 쿨타임 -0.5초", (s) => { s.skillCdFlat += 0.5; }),
      T("공간 감각", "순간이동 쿨타임 -1.5초", cd(2, 1.5)),
      T("마력 구슬", "평타 피해 +1.5", atk(1.5)),
      T("마나 폭주", "스킬 사용 후 3초간 평타가 크게 폭발", flag("manaSurge")),
      T("★ 연속 도약", "순간이동을 2번 연속으로 쓸 수 있음"),
    ] },
  ],
  engineer: [
    { id: "e_turret", name: "포탑", icon: "🔫", tiers: [
      T("빠른 조립", "포탑 설치 쿨타임 -1.5초", cd(0, 1.5)),
      T("강화 탄", "스킬 피해 +3", skill(3)),
      T("튼튼한 다리", "포탑 지속 +4초"),
      T("자동 장전", "포탑 공격 속도 +40%"),
      T("★ 포탑 공장", "포탑 최대 3대"),
    ] },
    { id: "e_mine", name: "폭파", icon: "💣", tiers: [
      T("빠른 매설", "지뢰 지대 쿨타임 -2초", cd(1, 2)),
      T("지뢰 추가", "지뢰 +2개"),
      T("넓은 지대", "스킬 범위 +6", area(6)),
      T("고성능 화약", "스킬 피해 +4", skill(4)),
      T("★ 연쇄 폭발", "지뢰가 터지면 근처 지뢰도 같이 터짐"),
    ] },
    { id: "e_repair", name: "정비", icon: "🔧", tiers: [
      T("보호복", "최대 체력 +20", hp(20)),
      T("드론 정비", "수리 드론 쿨타임 -3초", cd(2, 3)),
      T("방탄판", "받는 피해 -1", guard(1)),
      T("연료 보충", "거대 로봇 지속 +3초"),
      T("★ 상주 드론", "작은 드론이 늘 따라다니며 주변 동료 초당 체력 1% 회복"),
    ] },
  ],
  necro: [
    { id: "x_summon", name: "사령", icon: "👻", tiers: [
      T("부름", "유령 소환 쿨타임 -3초", cd(0, 3)),
      T("오래 머묾", "유령 지속 +5초"),
      T("원한", "스킬 피해 +2", skill(2)),
      T("뼈 갑옷", "최대 체력 +15", hp(15)),
      T("★ 유령 무리", "유령이 2체 소환됨"),
    ] },
    { id: "x_curse", name: "저주", icon: "🟣", tiers: [
      T("빠른 저주", "약화 저주 쿨타임 -1.5초", cd(1, 1.5)),
      T("끈질긴 저주", "저주 지속 +2초", (s) => { s.curseExt = Math.max(s.curseExt, 2); }),
      T("넓은 저주", "스킬 범위 +8", area(8)),
      T("사신의 손길", "저주받은 적이 받는 피해 +30% → +50%", flag("curseBoost")),
      T("★ 전염", "저주받은 적이 죽으면 주변 적에게 저주가 옮겨붙음"),
    ] },
    { id: "x_leech", name: "흡혈", icon: "🩸", tiers: [
      T("창백한 피부", "최대 체력 +20", hp(20)),
      T("생명 흡수", "흡혈 2%", steal(0.02)),
      T("죽음의 옷", "받는 피해 -1", guard(1)),
      T("어둠 구슬", "평타 피해 +1.5", atk(1.5)),
      T("★ 피의 계약", "저주받은 적을 때리면 피해의 8%만큼 회복"),
    ] },
  ],
  cleric: [
    { id: "c_heal", name: "치유", icon: "💚", tiers: [
      T("기도", "치유의 빛 쿨타임 -3초", cd(0, 3)),
      T("성스러운 몸", "최대 체력 +20", hp(20)),
      T("축복의 빛", "치유의 빛 받은 동료 공격력 +20% (5초)", flag("blessLight")),
      T("손길", "부활 속도 +30%", (s) => { s.reviveMul = Math.max(s.reviveMul, 1.3); }),
      T("★ 은총", "치유의 빛이 끝난 뒤 3초간 초당 체력 5% 회복"),
    ] },
    { id: "c_ward", name: "수호", icon: "🔰", tiers: [
      T("빠른 축복", "축복의 방패 쿨타임 -2초", cd(1, 2)),
      T("굳은 신념", "받는 피해 -1", guard(1)),
      T("두꺼운 방패", "보호막 +50%"),
      T("단단한 믿음", "보호막 2배, 동료 2명에게", flag("doubleShield")),
      T("★ 빛의 파편", "보호막이 깨질 때 주변 적에게 폭발"),
    ] },
    { id: "c_judge", name: "심판", icon: "🔨", tiers: [
      T("신성한 힘", "평타 피해 +1.5", atk(1.5)),
      T("빠른 심판", "신성한 망치 쿨타임 -2.5초", cd(2, 2.5)),
      T("천벌", "스킬 피해 +3", skill(3)),
      T("눈부신 빛", "치명타 확률 +6%", crit(0.06)),
      T("★ 삼연타", "신성한 망치가 3번 내리침"),
    ] },
  ],
  bard: [
    { id: "b_cheer", name: "응원", icon: "📣", tiers: [
      T("목 풀기", "최대 체력 +15", hp(15)),
      T("빠른 앙코르", "앙코르 쿨타임 -1.5초", cd(0, 1.5)),
      T("큰 목소리", "용기의 노래 범위 +15"),
      T("확성기", "용기의 노래·불협화음 범위 +50%", flag("loud")),
      T("★ 행진곡", "용기의 노래가 동료 공격 속도도 +15%"),
    ] },
    { id: "b_lull", name: "자장가", icon: "💤", tiers: [
      T("부드러운 선율", "자장가 쿨타임 -1.5초", cd(1, 1.5)),
      T("넓은 울림", "스킬 범위 +6", area(6)),
      T("깊은 잠", "잠드는 시간 +1초"),
      T("메아리", "음표가 2번 더 튕김", flag("echo")),
      T("★ 악몽", "잠든 적이 깰 때 큰 피해를 받음"),
    ] },
    { id: "b_noise", name: "소음", icon: "🎸", tiers: [
      T("강한 피킹", "평타 피해 +1.5", atk(1.5)),
      T("빠른 연주", "불협화음 쿨타임 -1.5초", cd(2, 1.5)),
      T("찢어지는 소리", "스킬 피해 +2", skill(2)),
      T("무대 매너", "이동 속도 +5", spd(5)),
      T("★ 앵콜 공연", "불협화음 5초 지속 + 범위 +10%"),
    ] },
  ],
};

export const BRANCH_BY_ID: Record<string, TalentBranch> = Object.fromEntries(
  Object.values(TALENTS).flat().map((b) => [b.id, b]),
);
