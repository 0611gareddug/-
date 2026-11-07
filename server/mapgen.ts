import { TILE } from "../shared/constants";
import type { TileMap } from "../shared/collide";

export interface GenMap extends TileMap {
  spawn: { x: number; y: number };
  portal: { x: number; y: number };
}

const W = 40;
const H = 26;

function rand(a: number, b: number) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** special: 월드 특수 지형 문자 (없으면 일반 바닥만) */
export function generateMap(boss: boolean, special?: string): GenMap {
  const g: string[][] = [];
  for (let y = 0; y < H; y++) {
    const row: string[] = [];
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      row.push(border ? "#" : ".");
    }
    g.push(row);
  }

  // 모서리를 깎아서 네모 상자 느낌을 줄임
  for (const [cx, cy] of [[1, 1], [W - 4, 1], [1, H - 4], [W - 4, H - 4]]) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g[cy + y][cx + x] = "#";
  }

  const spawnTile = { x: 4, y: Math.floor(H / 2) };
  const portalTile = { x: W - 5, y: Math.floor(H / 2) };
  const nearKey = (x: number, y: number, pad: number) =>
    (Math.abs(x - spawnTile.x) < 5 + pad && Math.abs(y - spawnTile.y) < 4 + pad) ||
    (Math.abs(x - portalTile.x) < 4 + pad && Math.abs(y - portalTile.y) < 3 + pad);

  if (boss) {
    for (const [px, py] of [[12, 7], [26, 7], [12, 17], [26, 17]]) {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g[py + y][px + x] = "#";
    }
  } else {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 14; tries++) {
      const bw = rand(1, 3);
      const bh = rand(1, 3);
      const bx = rand(3, W - 4 - bw);
      const by = rand(3, H - 4 - bh);
      if (nearKey(bx, by, 1)) continue;
      // 주변 1칸까지 비어 있어야 배치 → 항상 지나갈 길이 남음
      let ok = true;
      for (let y = by - 1; y <= by + bh && ok; y++) {
        for (let x = bx - 1; x <= bx + bw && ok; x++) {
          if (g[y][x] !== ".") ok = false;
        }
      }
      if (!ok) continue;
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) g[y][x] = "#";
      placed++;
    }
  }

  // 특수 지형 웅덩이 (시작 지점·포탈 주변은 비움)
  if (special) {
    const pools = boss ? 5 : 9;
    for (let i = 0; i < pools; i++) {
      const cx = rand(6, W - 7);
      const cy = rand(3, H - 4);
      const rx = rand(1, 3);
      const ry = rand(1, 2);
      for (let y = cy - ry; y <= cy + ry; y++) {
        for (let x = cx - rx; x <= cx + rx; x++) {
          if (y < 1 || x < 1 || y >= H - 1 || x >= W - 1 || g[y][x] !== ".") continue;
          if (nearKey(x, y, 0)) continue;
          // 타원 모양으로
          if (((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 > 1) continue;
          g[y][x] = special;
        }
      }
    }
  }

  // 바닥 장식 (금 간 돌 / 이끼)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== ".") continue;
      const r = Math.random();
      if (r < 0.08) g[y][x] = ",";
      else if (r < 0.14) g[y][x] = '"';
    }
  }

  return {
    w: W,
    h: H,
    tiles: g.map((r) => r.join("")).join(""),
    spawn: { x: spawnTile.x * TILE + TILE / 2, y: spawnTile.y * TILE + TILE / 2 },
    portal: { x: portalTile.x * TILE + TILE / 2, y: portalTile.y * TILE + TILE / 2 },
  };
}

export interface RestMap extends GenMap {
  market: { x: number; y: number };
  dummies: { x: number; y: number }[];
}

/** 휴게소: 왼쪽 훈련장(허수아비) + 오른쪽 암시장 천막 */
export function generateRestMap(): RestMap {
  const w = 30;
  const h = 18;
  const g: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      row.push(border ? "#" : Math.random() < 0.06 ? '"' : ".");
    }
    g.push(row);
  }
  // 훈련장과 암시장 사이 낮은 칸막이
  for (const y of [2, 3, 4, 13, 14, 15]) g[y][13] = "#";
  const T = (v: number) => v * TILE + TILE / 2;
  return {
    w, h,
    tiles: g.map((r) => r.join("")).join(""),
    spawn: { x: T(14), y: T(9) },
    portal: { x: T(14), y: T(9) },
    market: { x: T(22), y: T(8) },
    dummies: [{ x: T(7), y: T(5) }, { x: T(7), y: T(9) }, { x: T(7), y: T(13) }],
  };
}

/** 보물방: 작은 방 + 상자 4개 + 오른쪽 출구 */
export function generateTreasureMap(): GenMap & { chests: { x: number; y: number }[] } {
  const w = 22;
  const h = 13;
  const g: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) row.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? "#" : Math.random() < 0.05 ? '"' : ".");
    g.push(row);
  }
  const T = (v: number) => v * TILE + TILE / 2;
  return {
    w, h,
    tiles: g.map((r) => r.join("")).join(""),
    spawn: { x: T(3), y: T(6) },
    portal: { x: T(19), y: T(6) },
    chests: [{ x: T(7), y: T(3) }, { x: T(13), y: T(3) }, { x: T(7), y: T(9) }, { x: T(13), y: T(9) }],
  };
}

export function randomFloorPoint(m: TileMap, awayFrom: { x: number; y: number }, minDist: number) {
  for (let i = 0; i < 500; i++) {
    const tx = rand(2, m.w - 3);
    const ty = rand(2, m.h - 3);
    const ch = m.tiles[ty * m.w + tx];
    if (ch === "#" || ch === "v") continue;
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    if (Math.hypot(x - awayFrom.x, y - awayFrom.y) < minDist) continue;
    return { x, y };
  }
  return { x: (m.w / 2) * TILE, y: (m.h / 2) * TILE };
}
