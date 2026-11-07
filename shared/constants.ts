export const TILE = 16;
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const MAX_PLAYERS = 8;

export const VIEW_W = 480;
export const VIEW_H = 270;

export const PLAYER_RADIUS = 5;
export const GHOST_SPEED = 60;
export const DASH_SPEED = 240;
export const DASH_TIME = 0.14;
export const DASH_COOLDOWN = 1.2;
export const HIT_INVULN = 0.5;

export const REVIVE_TIME = 5;
/** 쓰러졌다 일어날 때 체력 비율 */
export const REVIVE_HP = 0.3;
/** 라운드 사이 회복 비율 */
export const ROUND_HEAL = 0.15;
export const REVIVE_RANGE = 22;
export const PORTAL_RANGE = 26;
export const CARD_PICK_TIME = 20;
export const VOTE_TIME = 20;
export const REST_MAX_TIME = 120;
export const MARKET_RANGE = PORTAL_RANGE * 3;
export const ROUNDS_PER_WORLD = 6;

/** 다음 레벨까지 필요한 경험치 */
export const xpToNext = (level: number) => 20 + 15 * (level - 1);

export const PLAYER_COLORS = [
  "#e8504a",
  "#4aa0f0",
  "#a070f0",
  "#f0c040",
  "#50d890",
  "#f07ab8",
  "#f0904a",
  "#e8e8f0",
];
