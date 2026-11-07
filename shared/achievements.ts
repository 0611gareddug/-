// 업적 33개와 보상(코스튬·칭호). 코스튬은 보기만 바뀌고 능력치는 없음
export type CosSlot = "hat" | "cape" | "trail" | "lvfx" | "title";

export interface Reward {
  slot: CosSlot;
  id: string;
  name: string;
}

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  rewards: Reward[];
}

export type Equip = Partial<Record<CosSlot, string>>;

export const SLOT_NAME: Record<CosSlot, string> = {
  hat: "모자",
  cape: "망토",
  trail: "발자국",
  lvfx: "레벨업 이펙트",
  title: "칭호",
};

const t = (id: string, name: string): Reward => ({ slot: "title", id, name });
const hat = (id: string, name: string): Reward => ({ slot: "hat", id, name });
const cape = (id: string, name: string): Reward => ({ slot: "cape", id, name });
const trail = (id: string, name: string): Reward => ({ slot: "trail", id, name });
const lvfx = (id: string, name: string): Reward => ({ slot: "lvfx", id, name });

export const ACHIEVEMENTS: AchDef[] = [
  { id: "first_step", name: "첫 걸음", desc: "1-1 클리어", rewards: [t("rookie", "신입 용사")] },
  { id: "slime500", name: "슬라임 학살자", desc: "슬라임 500마리 처치 (누적)", rewards: [hat("slime", "슬라임 모자")] },
  { id: "king", name: "왕을 쓰러뜨리다", desc: "왕 슬라임 처치", rewards: [hat("crown", "작은 왕관")] },
  { id: "w2", name: "사막의 방랑자", desc: "월드 2 클리어", rewards: [cape("desert", "사막 망토")] },
  { id: "w3", name: "얼음 땡", desc: "월드 3 클리어", rewards: [trail("snow", "눈송이 발자국")] },
  { id: "w4", name: "늪지 생존자", desc: "월드 4 클리어", rewards: [t("poisonproof", "독에 강한 자")] },
  { id: "w5", name: "구름 위로", desc: "월드 5 클리어", rewards: [cape("cloud", "구름 망토")] },
  { id: "w6", name: "마왕 퇴치", desc: "월드 6 클리어", rewards: [hat("horn", "뿔 투구")] },
  { id: "w7", name: "유령과 친구", desc: "월드 7 클리어", rewards: [lvfx("ghost", "유령 레벨업")] },
  { id: "win", name: "신의 장난감", desc: "8월드 원정 성공", rewards: [t("osin", "양배추 용사")] },
  { id: "win_normal", name: "보통도 껌", desc: "보통 이상으로 원정 성공", rewards: [cape("silver", "은빛 망토")] },
  { id: "win_hard", name: "어려움 정복", desc: "어려움 이상으로 원정 성공", rewards: [cape("gold", "황금 망토")] },
  { id: "win_hc", name: "진짜 양배추", desc: "하드코어로 원정 성공", rewards: [hat("halo", "신의 후광"), t("real_osin", "진짜 양배추")] },
  { id: "flawless", name: "무사고", desc: "한 번도 안 쓰러지고 월드 1개 클리어", rewards: [t("immortal", "불사신")] },
  { id: "medic", name: "부활 전문의", desc: "한 판에 동료 10번 부활", rewards: [cape("cross", "십자 망토")] },
  { id: "cursed", name: "저주받은 용사", desc: "저주 카드 5장 들고 보스 처치", rewards: [trail("skull", "해골 발자국")] },
  { id: "codex50", name: "카드 수집가", desc: "카드 도감 50%", rewards: [t("collector", "수집가")] },
  { id: "codex100", name: "카드 박사", desc: "카드 도감 100%", rewards: [hat("card", "카드 모자")] },
  { id: "mon100", name: "몬스터 박사", desc: "몬스터 도감 100%", rewards: [t("mondoc", "몬스터 박사")] },
  { id: "all_classes", name: "만능 용사", desc: "모든 직업(9개)으로 월드 1 클리어", rewards: [cape("rainbow", "무지개 망토")] },
  { id: "rich", name: "부자", desc: "한 판에 돈 1000원 모으기", rewards: [t("miser", "구두쇠")] },
  { id: "jackpot", name: "대박", desc: "보물방에서 미믹을 피해 상자 3개 다 열기", rewards: [trail("coin", "동전 발자국")] },
  { id: "trial5", name: "시련 극복", desc: "시련의 방 성공 5번 (누적)", rewards: [t("trialist", "시련 극복자")] },
  { id: "elite30", name: "엘리트 사냥꾼", desc: "엘리트 몬스터 30마리 처치 (누적)", rewards: [lvfx("gold", "황금 레벨업")] },
  { id: "gem_win", name: "보석의 주인", desc: "보석 쟁탈전 우승", rewards: [hat("gem", "보석 왕관")] },
  { id: "gem_hunter", name: "보석 사냥꾼", desc: "쟁탈전에서 보석 든 사람 10번 처치 (누적)", rewards: [t("gemhunter", "보석 사냥꾼")] },
  { id: "speed_w1", name: "번개처럼", desc: "스피드런 월드 1을 3분 안에", rewards: [trail("lightning", "번개 발자국")] },
  { id: "abyss30", name: "심연 탐험가", desc: "무한 하강 30층 도달", rewards: [cape("abyss", "심연 망토")] },
  { id: "abyss60", name: "심연의 끝", desc: "무한 하강 60층 도달", rewards: [t("abysslord", "심연의 주인")] },
  { id: "panic_z8", name: "아직 반이나", desc: "PANIC 8구역 돌파", rewards: [cape("warning", "경고 망토")] },
  { id: "panic_clear", name: "PANIC CLEAR", desc: "PANIC 16구역 모두 돌파", rewards: [hat("alarm", "자명종 모자")] },
  { id: "panic_fast", name: "초읽기 장인", desc: "PANIC을 12분 안에 클리어", rewards: [t("panicmaster", "패닉 마스터"), trail("spark", "불꽃 발자국")] },
  { id: "ach25", name: "업적 사냥꾼", desc: "업적 25개 달성", rewards: [trail("rainbow", "무지개 발자국")] },
];

export const ACH_BY_ID: Record<string, AchDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** 달성한 업적으로 쓸 수 있는 코스튬 목록 */
export function ownedCosmetics(achieved: string[]): Reward[] {
  return ACHIEVEMENTS.filter((a) => achieved.includes(a.id)).flatMap((a) => a.rewards);
}

export function titleName(id: string | undefined) {
  if (!id) return "";
  for (const a of ACHIEVEMENTS) for (const r of a.rewards) if (r.slot === "title" && r.id === id) return r.name;
  return "";
}
