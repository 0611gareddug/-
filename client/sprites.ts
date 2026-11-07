import { SKINS } from "../shared/skins";
import type { ClassId } from "../shared/classes";
import { PLAYER_COLORS, TILE } from "../shared/constants";
import type { SpriteBase, WorldDef } from "../shared/worlds";

// 모든 그래픽은 코드로 찍는 오리지널 도트. 문자 하나 = 픽셀 하나.
export type Palette = Record<string, string>;

const OUT = "#141218";

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export function paint(rows: string[], pal: Palette, scale = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = pal[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  return c;
}

// ---------- 용사 ----------
const HEADS: Record<ClassId, string[]> = {
  warrior: [
    "...oooo...",
    "..ommmmo..",
    ".ommmmmmo.",
    ".oMmmmmMo.",
    ".osesseso.",
    ".osssssso.",
    "..oSSSSo..",
  ],
  archer: [
    "....o.....",
    "...oho....",
    "..ohhho...",
    ".ohhhhhho.",
    ".ohesseho.",
    ".ohsssSho.",
    "..oSSSSo..",
  ],
  mage: [
    "...oo.....",
    "...ohoo...",
    "..ohhyho..",
    "ohhhhhhhho",
    ".osesseso.",
    ".osssssso.",
    "..oSSSSo..",
  ],
  cleric: [
    "..oyyyyo..",
    "...oooo...",
    "..owwwwo..",
    ".owwwwwwo.",
    ".owesseWo.",
    ".owssssWo.",
    "..oSSSSo..",
  ],
  // 안전모 + 고글
  engineer: [
    "...oooo...",
    "..oyyyyo..",
    ".oyyyyyyo.",
    "oYYYYYYYYo",
    ".oggssggo.",
    ".osssssso.",
    "..oSSSSo..",
  ],
  // 높은 요리사 모자
  cook: [
    "..owwwwo..",
    ".owwwwwwo.",
    ".owwwwwwo.",
    "..oWWWWo..",
    ".osesseso.",
    ".osssssso.",
    "..oSSSSo..",
  ],
  // 깃털 달린 베레모
  bard: [
    "......rr..",
    ".....rro..",
    "..ohhhhoo.",
    ".ohhhhhhho",
    ".osesseso.",
    ".osssssso.",
    "..oSSSSo..",
  ],
  // 검은 복면 + 빨간 머리띠
  ninja: [
    "...oooo...",
    "..okkkko..",
    ".orrrrrrrr",
    ".okkkkkkr.",
    ".okesseko.",
    ".okkkkkko.",
    "..okkkko..",
  ],
  // 보라 두건 + 초록 눈빛
  necro: [
    "....oo....",
    "...oppo...",
    "..oppppo..",
    ".opppppppo",
    ".opkggkpo.",
    ".opkkkkpo.",
    "..oPPPPo..",
  ],
};

const BODY = [
  "..occcco..",
  ".osccccso.",
  ".oocCCcoo.",
  "..oCccCo..",
];
const LEGS = [
  ["..obo.obo.", "..ooo.ooo."],
  [".obo..obo.", ".ooo...oo."],
];

const HEAD_PAL: Record<ClassId, Palette> = {
  warrior: { m: "#c8ccd8", M: "#7c8296" },
  archer: { h: "#4f8a3c" },
  mage: { h: "#5a3fb0", y: "#f0d050" },
  cleric: { y: "#f8e070", w: "#ece6d6", W: "#b8b0a0" },
  engineer: { y: "#f0a030", Y: "#b06818", g: "#40e0f0" },
  cook: { w: "#ffffff", W: "#c8c8d0" },
  bard: { h: "#2a8a6a", r: "#e04050" },
  ninja: { k: "#2a2a34", r: "#e03040" },
  necro: { p: "#5a2a8a", P: "#3a1a5a", k: "#1a1420", g: "#60ff80" },
};

export function heroRows(cls: ClassId, frame: number) {
  return [...HEADS[cls], ...BODY, ...LEGS[frame]];
}

export function heroPalette(cls: ClassId, color: number): Palette {
  const team = PLAYER_COLORS[color] ?? PLAYER_COLORS[0];
  return {
    o: OUT, s: "#f2c79a", S: "#c99570", e: OUT, b: "#3a2e2e",
    c: team, C: shade(team, -0.35),
    ...HEAD_PAL[cls],
  };
}

// ---------- 무기 (조준 방향으로 회전) ----------
export const WEAPONS: Record<ClassId, { rows: string[]; pal: Palette }> = {
  warrior: {
    rows: ["..M......", "wwMmmmmmo", "..M......"],
    pal: { w: "#7a4a2a", M: "#d0a040", m: "#dfe3ee", o: "#9aa0b4" },
  },
  archer: {
    rows: ["ww..", ".w.l", ".w.l", "..wl", "..wl", "..wl", ".w.l", ".w.l", "ww.."],
    pal: { w: "#9a6a3a", l: "#e8e8e8" },
  },
  mage: {
    rows: ["........yy.", "wwwwwwwwyYy", "........yy."],
    pal: { w: "#6a4a2a", y: "#a070f0", Y: "#f0e0ff" },
  },
  cleric: {
    rows: ["......mm", "wwwwwmMm", "......mm"],
    pal: { w: "#8a6a3a", m: "#f0d060", M: "#fff4b0" },
  },
  // 화염방사기
  engineer: {
    rows: ["...mm....", "rrMMmmmmM", "...mm...."],
    pal: { r: "#c03020", M: "#5a6072", m: "#9aa0b4" },
  },
  // 프라이팬
  cook: {
    rows: ["......oo.", "wwwwwoMMo", "......oo."],
    pal: { w: "#8a5a2a", o: "#2a2a30", M: "#4a4a58" },
  },
  // 류트
  bard: {
    rows: ["....oo..", "wwwwoyyo", "....oyyo", "....oo.."],
    pal: { w: "#6a4a2a", y: "#d8a050", o: "#3a2a1a" },
  },
  // 단검
  ninja: {
    rows: [".k....", "kkmmmw", ".k...."],
    pal: { k: "#2a2a34", m: "#dfe3ee", w: "#ffffff" },
  },
  // 해골 지팡이
  necro: {
    rows: ["........bbb.", "wwwwwwwwbkb.", "........bbb."],
    pal: { w: "#4a3a2a", b: "#e8e4d0", k: "#60ff80" },
  },
};

// ---------- 코스튬: 모자 (머리 위에 얹음) ----------
export const HATS: Record<string, { rows: string[]; pal: Palette }> = {
  slime: {
    rows: ["..oooooo..", ".ogglgggo.", "oggggggggo", "oGGGGGGGGo"],
    pal: { o: OUT, g: "#4fc06a", G: "#2f8a48", l: "#c8f8d0" },
  },
  alarm: {
    rows: ["rr.oooo.rr", "rRowwwwoRr", ".owwowwwo.", ".owwooowo.", ".owwwwwwo.", "..oRRRRo..", ".o......o."],
    pal: { o: OUT, r: "#ff4a4a", R: "#e03040", w: "#f8f4e8" },
  },
  crown: {
    rows: ["y.y..y.y", "yyyyyyyy", "yrYyyrYy"],
    pal: { y: "#f0c040", Y: "#b08020", r: "#e03040" },
  },
  horn: {
    rows: ["w........w", "wo......ow", ".oommmmoo.", "oMmmmmmmMo"],
    pal: { o: OUT, w: "#f0e8d0", m: "#9aa0b4", M: "#5a6072" },
  },
  card: {
    rows: ["..oooooo..", "..okkkko..", "..okwrko..", "..okkkko..", "oooooooooo"],
    pal: { o: OUT, k: "#2a2838", w: "#ffffff", r: "#e04050" },
  },
  halo: {
    rows: [".oyyyyyyo.", "y........y", ".oyyyyyyo."],
    pal: { y: "#f8e070", o: "#fff4b0" },
  },
  gem: {
    rows: ["p..P..p.", "pyyPPyyp", "yYyyyyYy"],
    pal: { p: "#f05a8a", P: "#ff9ac0", y: "#f0c040", Y: "#b08020" },
  },
};

/** 코스튬: 망토 = 몸통 색. rainbow 는 시간에 따라 색이 바뀜 */
export const CAPES: Record<string, string> = {
  desert: "#d8a050",
  cloud: "#e8f0ff",
  cross: "#f0f0f0",
  silver: "#c0c8d8",
  gold: "#f0c040",
  abyss: "#4a2a70",
  warning: "#f0a020",
};
export const RAINBOW = ["#e84a4a", "#f0904a", "#f0c040", "#50d890", "#4aa0f0", "#a070f0"];

/**
 * v1.7 직업 스킨: 단계(0~4)가 오를수록 소품이 붙음
 *  2단계 허리띠(x) · 3단계 어깨 장식(x) · 4단계 가슴 문양(z) · 5단계 밑단 장식(x)
 */
export function skinRows(cls: ClassId, frame: number, tier: number) {
  const rows = heroRows(cls, frame).slice();
  const head = HEADS[cls].length;
  const set = (r: number, i: number, ch: string) => {
    const row = rows[head + r];
    if (row && row[i] !== "o" && row[i] !== ".") rows[head + r] = row.slice(0, i) + ch + row.slice(i + 1);
  };
  if (tier >= 1) { set(2, 4, "x"); set(2, 5, "x"); }
  if (tier >= 2) { set(0, 3, "x"); set(0, 6, "x"); }
  if (tier >= 3) { set(1, 4, "z"); set(1, 5, "z"); }
  if (tier >= 4) { set(3, 3, "x"); set(3, 6, "x"); }
  return rows;
}
export function skinPalette(cls: ClassId, color: number, tier: number, capeColor?: string): Palette {
  const base = capeColor ? capedPalette(cls, color, capeColor) : heroPalette(cls, color);
  return { ...base, ...(SKINS[cls]?.[tier]?.pal ?? {}) };
}
/** 스킨까지 입힌 캐릭터 그림 (로비·옷장·컷씬용) */
export function heroSkinCanvas(cls: ClassId, color: number, tier?: number, scale = 1) {
  if (tier === undefined || tier < 0) return paint(heroRows(cls, 0), heroPalette(cls, color), scale);
  return paint(skinRows(cls, 0, tier), skinPalette(cls, color, tier), scale);
}

export function capedPalette(cls: ClassId, color: number, capeColor: string): Palette {
  return { ...heroPalette(cls, color), c: capeColor, C: shade(capeColor, -0.35) };
}

/** 코스튬: 발자국 색 */
export const TRAILS: Record<string, number[]> = {
  snow: [0xffffff, 0xc8ecff],
  skull: [0xe8e4d0, 0x888780],
  coin: [0xf0c040, 0xfff4b0],
  lightning: [0xfff060, 0x40e0f0],
  rainbow: [0xe84a4a, 0xf0c040, 0x50d890, 0x4aa0f0, 0xa070f0],
  spark: [0xff3a20, 0xf08030, 0xffe060],
};

// 엔지니어 거미 포탑 (g = 눈 렌즈 색)
export const SPIDER = [
  "o..oooo..o",
  ".o.oyyo.o.",
  "..oyYYyo..",
  "ooyYggYyoo",
  "..oyyyyo..",
  ".o.oooo.o.",
  "o........o",
];
export const SPIDER_PAL: Palette = { o: OUT, y: "#f0a030", Y: "#b06818", g: "#40e0f0" };
export const SPIDER_LASER_PAL: Palette = { ...SPIDER_PAL, y: "#d8dce8", Y: "#8890a8", g: "#f05a8a" };

// ---------- 몬스터 ----------
export const SLIME = [
  [
    "....oooo....",
    "..oollggoo..",
    ".olggggggGo.",
    ".oggeggegGo.",
    "oggggggggGGo",
    "oGggggggGGGo",
    "oGGGGGGGGGGo",
    ".oooooooooo.",
  ],
  [
    "............",
    "...oooooo...",
    ".oollgggggo.",
    "olggeggeggGo",
    "oggggggggGGo",
    "oGGGGGGGGGGo",
    ".oooooooooo.",
    "............",
  ],
];
export const SLIME_PAL: Palette = { o: OUT, g: "#4fc06a", G: "#2f8a48", l: "#c8f8d0", e: OUT };
export const BOSS_PAL: Palette = { o: OUT, g: "#e05a8a", G: "#9a2f5a", l: "#ffd0e0", e: OUT };

export const SKELETON = [
  [
    "..ooooo..",
    ".obbbbbo.",
    ".orbbbro.",
    ".obbbbbo.",
    "..oBoBo..",
    "...obo...",
    ".oobbboo.",
    "ob.oBo.bo",
    "...obo...",
    "..ob.bo..",
    "..ob.bo..",
    "..oo.oo..",
  ],
  [
    "..ooooo..",
    ".obbbbbo.",
    ".orbbbro.",
    ".obbbbbo.",
    "..oBoBo..",
    "...obo...",
    ".oobbboo.",
    "ob.oBo.bo",
    "...obo...",
    ".ob..bo..",
    ".ob...bo.",
    ".oo...oo.",
  ],
];
export const SKELETON_PAL: Palette = { o: OUT, b: "#e8e4d0", B: "#a8a490", r: "#ff4a4a" };

export const CROWN = [
  "y...y...y",
  "yy.yYy.yy",
  "yyyyyyyyy",
  "yYrYyYrYy",
  "YYYYYYYYY",
];
export const CROWN_PAL: Palette = { y: "#f0c040", Y: "#b08020", r: "#e03040" };

// ---------- 몬스터 공용 몸통 (a 기본 · A 그림자 · l 밝은 면 · e 눈) ----------
export const BODIES: Record<SpriteBase, string[][]> = {
  slime: SLIME.map((f) => f.map((r) => r.replace(/g/g, "a").replace(/G/g, "A"))),
  skeleton: SKELETON.map((f) => f.map((r) => r.replace(/b/g, "a").replace(/B/g, "A").replace(/r/g, "e"))),
  beast: [
    [
      "............",
      "...oooo.....",
      "..oaaalo..o.",
      ".oaeaaaaooao",
      ".oaaaaaaaaao",
      "..oAaaaaAAo.",
      "..oAAAAAAo..",
      "..oo.oo.oo..",
      "............",
    ],
    [
      "............",
      "...oooo.....",
      "..oaaalo..o.",
      ".oaeaaaaooao",
      ".oaaaaaaaaao",
      "..oAaaaaAAo.",
      "..oAAAAAAo..",
      ".oo..oo..oo.",
      "............",
    ],
  ],
  flyer: [
    [
      "oo..oooo..oo",
      "oaooaaalooao",
      "oaaaeaaeaaao",
      "oaaaaaaaaaao",
      ".oAaaaaaaAo.",
      "..oAaaaaAo..",
      "...oAAAAo...",
      "....oooo....",
    ],
    [
      "....oooo....",
      "...oaaalo...",
      "..oaeaaeao..",
      "ooaaaaaaaaoo",
      "oaAaaaaaaAao",
      "oAooAaaAooAo",
      "oo..oAAo..oo",
      "....oooo....",
    ],
  ],
  golem: [
    [
      "...oooooo...",
      "..oaaaaalo..",
      "..oaeaaeao..",
      "..oaaaaaao..",
      "...oAAAAo...",
      ".ooaaaaaaoo.",
      "oaaaaaaaaaao",
      "oaoaaaaaaoao",
      "oaoaaAAaaoao",
      "oooaaAAaaooo",
      "...oaaaao...",
      "...oAooAo...",
      "...oAo.oAo..",
      "..ooo..ooo..",
    ],
    [
      "...oooooo...",
      "..oaaaaalo..",
      "..oaeaaeao..",
      "..oaaaaaao..",
      "...oAAAAo...",
      ".ooaaaaaaoo.",
      "oaaaaaaaaaao",
      "oaoaaaaaaoao",
      "oaoaaAAaaoao",
      "oooaaAAaaooo",
      "...oaaaao...",
      "...oAooAo...",
      "..oAo..oAo..",
      ".ooo....ooo.",
    ],
  ],
};

export function monsterPalette(pal: { a: string; A: string; l: string; e: string }): Palette {
  return { o: OUT, ...pal };
}

// ---------- 휴게소 / 기타 오브젝트 ----------
export const DUMMY = [
  "....ooo....",
  "...osSso...",
  "...oSsSo...",
  "....ooo....",
  "..ooowooo..",
  ".owwwwwwwo.",
  "..oowwwoo..",
  "....oro....",
  "...oowoo...",
  "....owo....",
  "....owo....",
  "....owo....",
  "...ooooo...",
  "..obbbbbo..",
];
export const DUMMY_PAL: Palette = { o: "#3a2a1a", s: "#d8c088", S: "#a88850", w: "#b08050", r: "#c03030", b: "#6a4a2a" };

export const TENT = [
  "..........................oo..........",
  ".........................oyyo.........",
  "..........................oo..........",
  "..........................oo..........",
  "................oooooooooooooo........",
  "..............oopPpPpPpPpPpPpPoo......",
  "............oopPpPpPpPpPpPpPpPpPoo....",
  "..........oopPpPpPpPpPpPpPpPpPpPpPoo..",
  "........oopPpPpPpPpPpPpPpPpPpPpPpPpPoo",
  "........oyyyyyyyyyyyyyyyyyyyyyyyyyyyyo",
  "........oYyYyYyYyYyYyYyYyYyYyYyYyYyYyo",
  ".........o.ddddddddddddddddddddddd.o..",
  ".........o.dkkkkkkkkkkkkkkkkkkkkkd.o..",
  ".........o.dkkkgkkkkkcckkkkkgkkkkd.o..",
  ".........o.dkkgggkkkkcckkkkgggkkkd.o..",
  ".........o.dkkkgkkkkkkkkkkkkgkkkkd.o..",
  ".........o.dkkkkkkkkkkkkkkkkkkkkkd.o..",
  ".........owwwwwwwwwwwwwwwwwwwwwwwwwwo.",
  ".........oWWWWWWWWWWWWWWWWWWWWWWWWWWo.",
  ".........o.ooo..................ooo.o.",
  ".........o.o.o..................o.o.o.",
  ".........ooooo..................ooooo.",
];
export const TENT_PAL: Palette = {
  o: OUT, p: "#4a2a8a", P: "#7a4ae0", y: "#f0c040", Y: "#b08020", d: "#2a1a3a", k: "#120c1c",
  g: "#40e0f0", c: "#f0c040", w: "#7a5030", W: "#4a3020",
};

export const CHEST = [
  ".oooooooooo.",
  "oyYYYYYYYYyo",
  "oYwwwwwwwwYo",
  "oyyyyooyyyyo",
  "oYwwwoYowwYo",
  "oYwwwwwwwwYo",
  "oYwwwwwwwwYo",
  "oyyyyyyyyyyo",
  ".oooooooooo.",
];
export const CHEST_PAL: Palette = { o: OUT, y: "#f0c040", Y: "#b08020", w: "#8a5a2a" };
/** 열린 상자 (동전이 보임) */
export const CHEST_OPEN = [
  ".oooooooooo.",
  "oYwwwwwwwwYo",
  "oyyyyyyyyyyo",
  "oCcCcCcCcCco",
  "oyyyyooyyyyo",
  "oYwwwoYowwYo",
  "oYwwwwwwwwYo",
  "oyyyyyyyyyyo",
  ".oooooooooo.",
];
/** 미믹: 이빨과 혀가 달린 상자 */
export const MIMIC = [
  ".oooooooooo.",
  "oyYYYYYYYYyo",
  "oYwrwwwwrwYo",
  "oWoWoWoWoWWo",
  "orrrRRRRrrro",
  "oWoWoWoWoWWo",
  "oYwwwwwwwwYo",
  "oyyyyyyyyyyo",
  ".oooooooooo.",
];
export const CHEST_OPEN_PAL: Palette = { ...CHEST_PAL, c: "#fff090", C: "#f0c040" };
export const MIMIC_PAL: Palette = { ...CHEST_PAL, r: "#e02030", R: "#ff7080", W: "#ffffff" };

export const TRAP = [
  "m.m.m.m",
  ".mMMMm.",
  "mM.o.Mm",
  ".M.o.M.",
  "mM.o.Mm",
  ".mMMMm.",
  "m.m.m.m",
];
export const TRAP_PAL: Palette = { m: "#9aa0b4", M: "#5a6072", o: "#8a5a2a" };

export const GEM = [
  "...oooo...",
  "..oWppPo..",
  ".oWppPPPo.",
  "oWppPPPPPo",
  "opppPPPPdo",
  ".oppPPPdo.",
  "..oppPdo..",
  "...opdo...",
  "....oo....",
];
export const GEM_PAL: Palette = { o: OUT, W: "#ffffff", p: "#f05a8a", P: "#ff9ac0", d: "#a02a5a" };

export const COIN = [".yy.", "yYWy", "yYYy", ".yy."];
export const COIN_PAL: Palette = { y: "#b08020", Y: "#f0c040", W: "#fff4b0" };

// ---------- 투사체 ----------
export const PROJ: Record<string, { rows: string[]; pal: Palette }> = {
  bigarrow: {
    rows: [
      "..............mm..",
      "ll............mMm.",
      "lllwwwwwwwwwwwmMMm",
      "lllwwwwwwwwwwwmMMm",
      "ll............mMm.",
      "..............mm..",
    ],
    pal: { l: "#40e0f0", w: "#e8e8f0", m: "#40e0f0", M: "#ffffff" },
  },
  arrow: { rows: [".....m.", "llwwwmm", ".....m."], pal: { l: "#e8e8e8", w: "#b08050", m: "#dfe3ee" } },
  orb: {
    rows: ["..pp..", ".pPPp.", "pPWWPp", "pPWWPp", ".pPPp.", "..pp.."],
    pal: { p: "#7a4ae0", P: "#b890ff", W: "#ffffff" },
  },
  bolt: { rows: ["..y..", ".yYy.", "yYWYy", ".yYy.", "..y.."], pal: { y: "#e8c030", Y: "#fff090", W: "#ffffff" } },
  bone: { rows: [".b..b.", "bbbbbb", ".b..b."], pal: { b: "#e8e4d0" } },
  note: { rows: ["..nn.", "..n.n", "..n..", "nnn..", "nnn.."], pal: { n: "#f8e070" } },
  laser: { rows: ["WWWWWWWWWW", "llllllllll"], pal: { W: "#ffffff", l: "#f05a8a" } },
  turret: { rows: ["oo", "oo"], pal: { o: "#f0a030" } },
  shuriken: { rows: [".m.", "mwm", ".m."], pal: { m: "#9aa0b4", w: "#ffffff" } },
  dark: { rows: [".pp.", "pggp", "pggp", ".pp."], pal: { p: "#5a2a8a", g: "#60ff80" } },
  missile: { rows: ["rwwwy", "rwwwy"], pal: { r: "#f08030", w: "#c8ccd8", y: "#ffe060" } },
  sand: { rows: [".ss.", "sSSs", "sSSs", ".ss."], pal: { s: "#b08040", S: "#f0c878" } },
  ice: { rows: ["..i..", ".iWi.", "iWWWi", ".iWi.", "..i.."], pal: { i: "#60b0f0", W: "#e0f8ff" } },
  seed: { rows: [".gg.", "gGGg", "gGGg", ".gg."], pal: { g: "#3a8a3a", G: "#a0f070" } },
  fire: { rows: [".ff.", "fFYf", "fYYf", ".ff."], pal: { f: "#c03020", F: "#f08030", Y: "#fff060" } },
  spirit: { rows: [".cc.", "cWWc", "cWWc", ".cc."], pal: { c: "#40e0d0", W: "#e0fff8" } },
  light: { rows: ["..y..", ".yWy.", "yWWWy", ".yWy.", "..y.."], pal: { y: "#f0c040", W: "#ffffff" } },
};

export const FLAME = [
  [
    "..y...",
    ".yYy..",
    ".yWYy.",
    "yYWWYy",
    "yrYYry",
    ".rrrr.",
  ],
  [
    "...y..",
    "..yYy.",
    ".yYWy.",
    "yYWWYy",
    "yrYYry",
    ".rrrr.",
  ],
];
export const FLAME_PAL: Palette = { y: "#f08030", Y: "#f8c040", W: "#fff4c0", r: "#c03020" };

export const PORTAL = [
  "....oooooo....",
  "..oopPPPPpoo..",
  ".opPP....PPpo.",
  ".oP..pppp..Po.",
  "opP.pPPPPp.Ppo",
  "oP.pP....Pp.Po",
  "oP.pP.WW.Pp.Po",
  "oP.pP.WW.Pp.Po",
  "oP.pP....Pp.Po",
  "opP.pPPPPp.Ppo",
  ".oP..pppp..Po.",
  ".opPP....PPpo.",
  "..oopPPPPpoo..",
  "....oooooo....",
];
export const PORTAL_PAL: Palette = { o: "#2a1a4a", p: "#7a4ae0", P: "#40e0f0", W: "#ffffff" };

// ---------- v0.9 소환물 ----------
/** 엔지니어 설치 포탑 (삼각대 위 포신) */
export const TURRET = [
  "....oooo....",
  "...oMMMMoooo",
  "...oMggMMMMo",
  "...oMMMMoooo",
  "....oooo....",
  ".....oo.....",
  "....o..o....",
  "...o....o...",
  "..oo....oo..",
];
export const TURRET_PAL: Record<string, string> = { o: "#141218", M: "#8a90a8", g: "#40e0f0" };
/** 수리 드론 (프로펠러 + 초록 십자) */
export const DRONE = [
  "oooo..oooo",
  "...o..o...",
  "..oooooo..",
  ".olllllllo",
  ".olleelllo",
  ".oleeeello",
  ".olleelllo",
  "..oooooo..",
];
export const DRONE_PAL: Record<string, string> = { o: "#141218", l: "#d8dce8", e: "#50d060" };
/** 네크로 유령 */
export const GHOST_PET = [
  "..oooooo..",
  ".oPPPPPPo.",
  "oPPkPPkPPo",
  "oPPkPPkPPo",
  "oPPPPPPPPo",
  "oPPPkkPPPo",
  "oPPPPPPPPo",
  "oPoPPoPPoo",
  ".o.oo.oo..",
];
export const GHOST_PET_PAL: Record<string, string> = { o: "#3a1a5a", P: "#c8a0ff", k: "#60ff80" };

// ---------- PANIC 열쇠 ----------
export const KEY_ROWS = [
  "..oooo......",
  ".oyYYyo.....",
  "oyo..oyo....",
  "oYo..oYooooo",
  "oyo..oyYYYYo",
  ".oyYYyoooYoo",
  "..oooo..oYo.",
  "........oo..",
];
export const KEY_PAL: Palette = { o: OUT, y: "#fff09a", Y: "#f8c030" };

// 카드 그림은 cardArt.ts

// ---------- 타일 (던전 돌바닥) ----------
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 월드 1 풀밭: 선명한 잔디 + 풀잎 + 꽃 */
function grassTile(variant: number, seed: number, w: WorldDef): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  const f = w.floor;
  ctx.fillStyle = f.base;
  ctx.fillRect(0, 0, TILE, TILE);
  // 잔디 결 (밝은 / 어두운 풀잎)
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(r() * 15), y = Math.floor(r() * 14);
    ctx.fillStyle = r() < 0.5 ? f.hi : f.groove;
    ctx.fillRect(x, y, 1, 2);
    if (r() < 0.5) ctx.fillRect(x + 1, y - 1, 1, 1);
  }
  if (variant === 2 || (variant === 0 && r() < 0.18)) {
    // 꽃: 노랑 / 하양 / 빨강 / 하늘
    const cols = ["#f8e060", "#ffffff", "#f06070", "#80c8ff"];
    const n = variant === 2 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = 3 + Math.floor(r() * 9), y = 3 + Math.floor(r() * 9);
      const col = cols[Math.floor(r() * cols.length)];
      ctx.fillStyle = col;
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
      ctx.fillStyle = "#f8a030";
      ctx.fillRect(x, y, 1, 1);
    }
  } else if (variant === 1) {
    // 작은 흙길 자국
    ctx.fillStyle = "#8a7048";
    ctx.fillRect(4 + Math.floor(r() * 6), 6 + Math.floor(r() * 4), 3, 2);
  }
  return c;
}

/** 월드 1 벽: 동글동글한 덤불 (위) + 나무 울타리 (앞) */
function bushTile(front: boolean, seed: number, w: WorldDef): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  const p = w.wall;
  if (!front) {
    ctx.fillStyle = shade(p.top, -0.2);
    ctx.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? p.top : p.topHi;
      const x = Math.floor(r() * 12), y = Math.floor(r() * 12);
      ctx.fillRect(x, y, 4, 3);
      ctx.fillRect(x + 1, y - 1, 2, 5);
    }
    if (r() < 0.3) { ctx.fillStyle = "#e04050"; ctx.fillRect(5 + Math.floor(r() * 6), 5 + Math.floor(r() * 6), 1, 1); }
    return c;
  }
  // 앞면: 덤불 아래 나무 울타리
  ctx.fillStyle = p.top;
  ctx.fillRect(0, 0, TILE, 5);
  ctx.fillStyle = p.topHi;
  for (let x = 0; x < TILE; x += 4) ctx.fillRect(x + Math.floor(r() * 2), 0, 2, 2);
  ctx.fillStyle = p.front;
  ctx.fillRect(0, 5, TILE, TILE - 5);
  ctx.fillStyle = p.mortar;
  for (const x of [0, 5, 10, 15]) ctx.fillRect(x, 5, 1, TILE - 5);
  ctx.fillRect(0, 8, TILE, 1);
  ctx.fillRect(0, 12, TILE, 1);
  ctx.fillStyle = shade(p.front, 0.2);
  ctx.fillRect(1, 6, 3, 1);
  ctx.fillRect(6, 6, 3, 1);
  ctx.fillRect(11, 6, 3, 1);
  ctx.fillStyle = "#15161b";
  ctx.fillRect(0, TILE - 1, TILE, 1);
  return c;
}

export function floorTile(variant: number, seed: number, w: WorldDef): HTMLCanvasElement {
  if (w.id === 1) return grassTile(variant, seed, w);
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  const f = w.floor;
  ctx.fillStyle = f.base;
  ctx.fillRect(0, 0, TILE, TILE);
  // 돌판 4장으로 나눈 줄눈
  ctx.fillStyle = f.groove;
  ctx.fillRect(0, TILE - 1, TILE, 1);
  ctx.fillRect(TILE - 1, 0, 1, TILE);
  ctx.fillRect(0, 7, TILE, 1);
  ctx.fillRect(r() < 0.5 ? 7 : 9, 0, 1, 7);
  ctx.fillRect(r() < 0.5 ? 4 : 11, 8, 1, 7);
  // 윗면 하이라이트
  ctx.fillStyle = f.hi;
  ctx.fillRect(0, 0, TILE - 1, 1);
  ctx.fillRect(0, 8, TILE - 1, 1);
  // 잡티
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = r() < 0.5 ? f.speck : f.hi;
    ctx.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1);
  }
  if (variant === 1) {
    // 금
    ctx.fillStyle = shade(f.groove, -0.3);
    let x = 3 + Math.floor(r() * 8), y = 2 + Math.floor(r() * 4);
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(x, y, 1, 1);
      x += r() < 0.5 ? 1 : 0;
      y += 1;
    }
  } else if (variant === 2) {
    // 이끼 / 모래 / 눈 (월드 색)
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = r() < 0.5 ? f.moss : shade(f.moss, -0.2);
      ctx.fillRect(2 + Math.floor(r() * 10), 4 + Math.floor(r() * 9), r() < 0.3 ? 2 : 1, 1);
    }
  }
  return c;
}

export function wallTile(front: boolean, seed: number, w: WorldDef): HTMLCanvasElement {
  if (w.id === 1) return bushTile(front, seed, w);
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  const p = w.wall;
  if (!front) {
    ctx.fillStyle = shade(p.top, -0.15);
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = p.top;
    ctx.fillRect(1, 1, TILE - 2, TILE - 2);
    ctx.fillStyle = shade(p.top, -0.15);
    for (let i = 0; i < 4; i++) ctx.fillRect(2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), 1, 1);
    return c;
  }
  // 앞면: 벽돌
  ctx.fillStyle = p.top;
  ctx.fillRect(0, 0, TILE, 4);
  ctx.fillStyle = p.topHi;
  ctx.fillRect(0, 0, TILE, 1);
  ctx.fillStyle = p.front;
  ctx.fillRect(0, 4, TILE, TILE - 4);
  ctx.fillStyle = p.mortar;
  for (const y of [4, 8, 12]) ctx.fillRect(0, y, TILE, 1);
  const off = r() < 0.5 ? 0 : 4;
  for (const [y, o] of [[5, off], [9, off + 4], [13, off]] as const) {
    for (let x = o % 8; x < TILE; x += 8) ctx.fillRect(x, y, 1, 3);
  }
  ctx.fillStyle = "#15161b";
  ctx.fillRect(0, TILE - 1, TILE, 1);
  return c;
}

/** 특수 지형: ~ 유사 · _ 빙판 · % 독 늪 · v 구멍 · = 용암 */
export function specialTile(ch: string, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d")!;
  const r = rng(seed);
  const dots = (cols: string[], n: number, size = 1) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(Math.floor(r() * (TILE - size)), Math.floor(r() * (TILE - size)), size, size);
    }
  };
  switch (ch) {
    case "~":
      ctx.fillStyle = "#a07838";
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = "#c89a50";
      for (let y = 2; y < TILE; y += 5) ctx.fillRect((y * 3 + Math.floor(r() * 4)) % 8, y, 7, 1);
      dots(["#7a5828", "#e0b870"], 8);
      break;
    case "_":
      ctx.fillStyle = "#9cc8e8";
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = "#d8f0ff";
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(r() * 10), y = Math.floor(r() * 12);
        ctx.fillRect(x, y, 4, 1);
        ctx.fillRect(x + 4, y + 1, 2, 1);
      }
      dots(["#ffffff", "#78a8d0"], 5);
      break;
    case "%":
      ctx.fillStyle = "#3a4a2a";
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = "#4a3a5a";
      ctx.fillRect(2, 3, 11, 9);
      dots(["#80c050", "#a070c0", "#2a3020"], 9, 2);
      break;
    case "v": {
      // 구멍 너머로 보이는 하늘
      ctx.fillStyle = "#4a68b8";
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = "#6a88d0";
      ctx.fillRect(0, 0, TILE, 6);
      dots(["#ffffff", "#c8d8f8"], 4, 2);
      break;
    }
    case "=":
      ctx.fillStyle = "#c83018";
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.fillStyle = "#f07020";
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.floor(r() * 10), Math.floor(r() * 12), 5, 3);
      dots(["#ffd040", "#fff090", "#902010"], 8, 2);
      break;
  }
  return c;
}
