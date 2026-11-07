import { TILE } from "./constants";

export interface TileMap {
  w: number;
  h: number;
  tiles: string;
}

/** 특수 지형: ~ 유사 · _ 빙판 · % 독 늪 · v 구멍 · = 용암 */
export function tileAt(m: TileMap, x: number, y: number): string {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return "#";
  return m.tiles[ty * m.w + tx];
}

export function isWallTile(m: TileMap, tx: number, ty: number, blockHoles = false): boolean {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
  const ch = m.tiles[ty * m.w + tx];
  return ch === "#" || (blockHoles && ch === "v");
}

export function isWallAt(m: TileMap, x: number, y: number): boolean {
  return isWallTile(m, Math.floor(x / TILE), Math.floor(y / TILE));
}

function circleHitsWall(m: TileMap, x: number, y: number, r: number, blockHoles: boolean): boolean {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isWallTile(m, tx, ty, blockHoles)) return true;
    }
  }
  return false;
}

/** 축별로 따로 움직여서 벽을 따라 미끄러지게 한다. blockHoles: 몬스터는 구멍을 벽처럼 피함 */
export function moveCircle(m: TileMap, x: number, y: number, r: number, dx: number, dy: number, blockHoles = false) {
  let nx = x + dx;
  if (circleHitsWall(m, nx, y, r, blockHoles)) nx = x;
  let ny = y + dy;
  if (circleHitsWall(m, nx, ny, r, blockHoles)) ny = y;
  return { x: nx, y: ny };
}
