// 서버 성능 측정: 8명이 몬스터 무리와 싸우는 상황에서 틱 시간 · 스냅샷 크기
// 실행: npx tsx scripts/perf-bench.ts   (PERF_PLAYERS=4 PERF_WORLD=6 로 조절)
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
process.env.STORE_FILE = path.join(os.tmpdir(), `osin-perf-${Date.now()}.json`);
process.env.START_WORLD = process.env.PERF_WORLD ?? "5";
process.env.START_ROUND = "4";
const { Game } = await import("../server/game");
const { CLASS_IDS } = await import("../shared/classes");

const N = Number(process.env.PERF_PLAYERS ?? 8);
const TICKS = Number(process.env.PERF_TICKS ?? 1800);
let bytes = 0;
let sends = 0;
let maxBytes = 0;
let zbytes = 0;
const g = new Game(
  Array.from({ length: N }, (_, i) => ({ id: i + 1, name: `P${i}`, color: i, cls: CLASS_IDS[i % CLASS_IDS.length] })),
  (m) => {
    if (m.t !== "snap") return;
    // 실제 서버처럼 방 인원수만큼 보낸다고 치고 한 번만 직렬화
    const s = JSON.stringify(m);
    bytes += Buffer.byteLength(s);
    // 실제 서버처럼 perMessageDeflate(level 1)로 압축했을 때
    if (sends % 10 === 0) zbytes += zlib.deflateRawSync(s, { level: 1 }).length * 10;
    maxBytes = Math.max(maxBytes, s.length);
    sends++;
  },
  () => {}, () => {},
  { mode: { speedrun: false, diff: 2 }, saveId: "perf", hostName: "P0" },
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = g as any;
for (const p of g.players.values()) { p.god = true; p.level = 12; p.stats = G.levelStats(p); }
// 몬스터를 넉넉히 (8인 실전 수준)
const extra = Number(process.env.PERF_MONSTERS ?? 120);
for (let i = 0; i < extra; i++) G.spawnMonster(i % 7 === 0 ? "orb_mage" : i % 5 === 0 ? "imp" : "harpy");

const times: number[] = [];
let t = 0;
for (; t < TICKS; t++) {
  for (const p of g.players.values()) {
    const target = g.monsters[(p.id * 7 + t) % Math.max(1, g.monsters.length)];
    p.input = { up: t % 60 < 30, down: t % 60 >= 30, left: p.id % 2 === 0, right: p.id % 2 === 1, ax: target?.x ?? p.x + 1, ay: target?.y ?? p.y, atk: true, dashSeq: Math.floor(t / 50) };
    if (t % 20 === p.id && target) g.handleCast(p.id, t % 4, target.x, target.y);
  }
  // 몬스터 수를 고정 (죽지 않게 체력 유지) → 매번 같은 부하로 비교
  for (const m of g.monsters) if (m.hp < m.mhp * 0.5) m.hp = m.mhp;
  G.phase = "play";
  const a = performance.now();
  g.step();
  times.push(performance.now() - a);
}
times.sort((x, y) => x - y);
const avg = times.reduce((x, y) => x + y, 0) / times.length;
const p99 = times[Math.floor(times.length * 0.99)];
console.log(`${N}명 · 몬스터 ~${g.monsters.length} · 투사체 ${g.projs.length} · ${t}틱`);
console.log(`틱 평균 ${avg.toFixed(3)}ms · p99 ${p99.toFixed(3)}ms · 최대 ${times[times.length - 1].toFixed(2)}ms (예산 33.3ms)`);
console.log(`스냅샷 평균 ${Math.round(bytes / Math.max(1, sends))}B · 최대 ${maxBytes}B · ${sends}번 → 1인당 ${(bytes / Math.max(1, sends) * 15 / 1024).toFixed(1)}KB/s (압축 전) · 압축 후 약 ${(zbytes / Math.max(1, sends) * 15 / 1024).toFixed(1)}KB/s`);
if (!(globalThis as any).__split) process.exit(0);
