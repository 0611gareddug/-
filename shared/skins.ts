// v1.7 직업 마일스톤 스킨: 그 직업으로 플레이해서 숙련도를 쌓으면 단계마다 스킨 1개 (직업당 5개)
// 몸통은 플레이어 고유색 그대로(멀티에서 구분용), 직업 의상 색 + 단계별 소품, 5단계 전설은 빛·잔상
import type { ClassId } from "./classes";

/** 마일스톤 1~5단계에 필요한 누적 숙련도 */
export const MASTERY_TIERS = [100, 500, 1400, 3200, 6500];

/** 숙련도 → 달성한 마일스톤 수 (0~5) */
export const tierOf = (points: number) => MASTERY_TIERS.filter((t) => points >= t).length;

export interface SkinDef {
  name: string;
  /** 직업 의상 색 덮어쓰기 + x 소품 색 + z 문양 색 */
  pal: Record<string, string>;
  /** 전설 스킨: 빛 색 */
  glow?: string;
}

const s = (name: string, pal: Record<string, string>, glow?: string): SkinDef => ({ name, pal, glow });

export const SKINS: Record<ClassId, [SkinDef, SkinDef, SkinDef, SkinDef, SkinDef]> = {
  warrior: [
    s("녹슨 투구", { m: "#a08a70", M: "#6a5848", x: "#6a4a2a", z: "#a08a70" }),
    s("강철 기사", { m: "#e8eef8", M: "#8890a8", x: "#5a5a68", z: "#c8ccd8" }),
    s("붉은 근위대", { m: "#e05050", M: "#902828", x: "#f0c040", z: "#f0c040" }),
    s("흑철 기사", { m: "#3a3a48", M: "#1e1e28", x: "#b04040", z: "#e04040" }),
    s("전설: 양배추 성기사", { m: "#fff4b0", M: "#d0a040", x: "#6ad050", z: "#b8ff90" }, "#f8e070"),
  ],
  archer: [
    s("숲의 사냥꾼", { h: "#3a7a3a", x: "#7a5a3a", z: "#9a7a4a" }),
    s("가을 순찰자", { h: "#c87a2a", x: "#6a3a1a", z: "#f0b060" }),
    s("눈꽃 궁수", { h: "#d8ecf8", x: "#6aa0d0", z: "#ffffff" }),
    s("그림자 저격수", { h: "#2a2a34", x: "#a02030", z: "#e04050" }),
    s("전설: 별빛 사수", { h: "#3a3aa0", x: "#f0e080", z: "#ffffff" }, "#a0c0ff"),
  ],
  mage: [
    s("견습 마법사", { h: "#3a6ab0", y: "#e0e0e0", x: "#6a4a2a", z: "#c0c0c0" }),
    s("불꽃 술사", { h: "#c03020", y: "#ffb030", x: "#602010", z: "#ff8030" }),
    s("얼음 현자", { h: "#60b0e0", y: "#ffffff", x: "#305070", z: "#c0f0ff" }),
    s("어둠 마도사", { h: "#301848", y: "#c060ff", x: "#1a1020", z: "#a040ff" }),
    s("전설: 은하의 대마법사", { h: "#1a1a50", y: "#fff4a0", x: "#a070f0", z: "#ffffff" }, "#c090ff"),
  ],
  cleric: [
    s("수련 사제", { y: "#e0c070", w: "#e8e0d0", W: "#a8a090", x: "#8a6a3a", z: "#e0c070" }),
    s("새벽 수녀", { y: "#f8a0b0", w: "#fff0f4", W: "#c8a8b0", x: "#d06080", z: "#ffd0e0" }),
    s("청명 신관", { y: "#80c0ff", w: "#e8f4ff", W: "#90b0d0", x: "#3a70c0", z: "#ffffff" }),
    s("심판관", { y: "#f0d040", w: "#303040", W: "#1a1a24", x: "#c09030", z: "#ffe060" }),
    s("전설: 천상의 대주교", { y: "#ffffff", w: "#fff8e0", W: "#f0d070", x: "#f8e070", z: "#ffffff" }, "#fff0a0"),
  ],
  engineer: [
    s("기름때 정비공", { y: "#a0a0a8", Y: "#60606a", g: "#80c0c0", x: "#4a3a2a", z: "#a0a0a8" }),
    s("안전 제일", { y: "#f8e040", Y: "#b0a020", g: "#40e0f0", x: "#e05030", z: "#f8e040" }),
    s("푸른 기술자", { y: "#3a8ae0", Y: "#205090", g: "#a0ffff", x: "#e0e0e0", z: "#40e0f0" }),
    s("증기 기관사", { y: "#b07040", Y: "#704020", g: "#ffb040", x: "#d0a040", z: "#f0c060" }),
    s("전설: 미래 공학자", { y: "#e8f0ff", Y: "#8090b0", g: "#40ffa0", x: "#40e0f0", z: "#ffffff" }, "#60f0ff"),
  ],
  cook: [
    s("분식집 주방장", { w: "#f0f0f0", W: "#b0b0b8", x: "#e05050", z: "#ffffff" }),
    s("제빵사", { w: "#f8e8c8", W: "#c0a070", x: "#a06a3a", z: "#f8d080" }),
    s("중식 대가", { w: "#e04030", W: "#902018", x: "#f0c040", z: "#f0c040" }),
    s("고급 셰프", { w: "#303038", W: "#18181e", x: "#c0c0c8", z: "#e0e0e8" }),
    s("전설: 궁중 수라간", { w: "#f8e070", W: "#c09030", x: "#e04050", z: "#ffffff" }, "#ffd060"),
  ],
  bard: [
    s("거리 악사", { h: "#6a4a2a", r: "#c0c0c0", x: "#8a6a3a", z: "#c0c0c0" }),
    s("음유시인", { h: "#2a6a9a", r: "#f0e060", x: "#f0e060", z: "#ffffff" }),
    s("록스타", { h: "#1a1a20", r: "#ff3060", x: "#c0c0c8", z: "#ff3060" }),
    s("궁정 악단장", { h: "#8a2a6a", r: "#f8d040", x: "#f8d040", z: "#ffffff" }),
    s("전설: 천상의 지휘자", { h: "#f0f0ff", r: "#a0e0ff", x: "#a0e0ff", z: "#ffffff" }, "#c0e8ff"),
  ],
  ninja: [
    s("수련 닌자", { k: "#4a4a58", r: "#8a8a98", x: "#2a2a34", z: "#8a8a98" }),
    s("적풍", { k: "#3a1a1a", r: "#ff6a30", x: "#ff6a30", z: "#ffa060" }),
    s("청풍", { k: "#1a2a3a", r: "#40c0ff", x: "#40c0ff", z: "#a0e0ff" }),
    s("독사", { k: "#1a3a1a", r: "#80ff40", x: "#80ff40", z: "#c0ff90" }),
    s("전설: 월야의 그림자", { k: "#14101e", r: "#f0f0ff", x: "#a080ff", z: "#ffffff" }, "#b090ff"),
  ],
  necro: [
    s("묘지기", { p: "#4a4a58", P: "#2a2a34", k: "#1a1420", g: "#a0ffa0", x: "#3a3040", z: "#a0ffa0" }),
    s("핏빛 주술사", { p: "#8a1a2a", P: "#500c18", k: "#1a0a10", g: "#ff6060", x: "#f0c040", z: "#ff6060" }),
    s("서리 망령", { p: "#5a8ab0", P: "#305070", k: "#101820", g: "#a0f0ff", x: "#c0f0ff", z: "#ffffff" }),
    s("역병 군주", { p: "#4a6a2a", P: "#2a4018", k: "#10180a", g: "#e0ff40", x: "#6a4a2a", z: "#e0ff40" }),
    s("전설: 명계의 왕", { p: "#2a0a3a", P: "#14041e", k: "#000000", g: "#ff40ff", x: "#f0c040", z: "#ff80ff" }, "#e060ff"),
  ],
};

/** 한 판이 끝났을 때 얻는 숙련도 */
export function masteryGain(o: { kills: number; dmgDealt: number; progress: number; win: boolean }) {
  return Math.round(o.kills + o.dmgDealt / 150 + o.progress * 25 + (o.win ? 100 : 0));
}
