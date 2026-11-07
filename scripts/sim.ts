// 8월드 전체를 자동으로 돌려보는 시뮬레이션 (충돌·멈춤 점검용): npx tsx scripts/sim.ts
import os from "node:os";
import path from "node:path";
import type { ServerMsg } from "../shared/protocol";
import { tileAt } from "../shared/collide";

process.env.STORE_FILE = path.join(os.tmpdir(), `osin-sim-${Date.now()}.json`);
const { Game } = await import("../server/game");

const msgs: ServerMsg[] = [];
let ended = false;
// SIM_NEW=1: 새 직업 3종으로 / SIM_DESCENT=40: 무한 하강을 40층까지
const newCls = process.env.SIM_NEW === "1";
const descentTo = Number(process.env.SIM_DESCENT ?? 0);
// SIM_PANIC=1: PANIC 16구역
const panicSim = process.env.SIM_PANIC === "1";
const g = new Game(
  [
    { id: 1, name: "Sim1", color: 0, cls: process.env.SIM_V9 ? "ninja" : newCls ? "engineer" : "warrior" },
    { id: 2, name: "Sim2", color: 1, cls: process.env.SIM_V9 ? "necro" : newCls ? "cook" : "mage" },
    { id: 3, name: "Sim3", color: 2, cls: newCls ? "bard" : "archer" },
  ],
  (m) => msgs.push(m), (_id, m) => msgs.push(m), () => { ended = true; },
  { mode: { speedrun: !descentTo && !panicSim, descent: !!descentTo, panic: panicSim, diff: Number(process.env.SIM_DIFF ?? 2) }, saveId: "sim", hostName: "Sim1" },
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = g as any;

const seenMonsters = new Set<string>();
const seenZones = new Set<string>();
let lastWorld = 0;
let ticks = 0;
const MAX_TICKS = 30 * 60 * 40;
while (!ended && ticks < MAX_TICKS) {
  ticks++;
  for (const p of g.players.values()) {
    // 테스트용으로 매우 강하게: 대신 몬스터 AI는 그대로 돌아감
    p.stats.atkMul = 40;
    if (p.hp < p.stats.maxHp * 0.5) p.hp = p.stats.maxHp;
    p.level = Math.max(p.level, 10);
    const target = g.monsters.find((m) => m.kind !== "dummy" && m.spawnT <= 0);
    if (G.phase === "play") {
      if (G.panic && G.mission === "collect" && G.keys.length && ticks % 10 === 0) {
        const k = G.keys[p.id % G.keys.length];
        p.x = k.x; p.y = k.y;
      } else if (G.portalOpen && !(G.panic && target)) {
        p.x = G.map.portal.x; p.y = G.map.portal.y;
      } else if (target && ticks % 15 === 0) {
        // 구멍·벽 위로 순간이동하지 않게 주변 빈 바닥을 찾음
        for (const [ox, oy] of [[20, 0], [-20, 0], [0, 20], [0, -20], [14, 14], [-14, -14], [0, 0]]) {
          const ch = tileAt(G.map, target.x + ox, target.y + oy);
          if (ch !== "#" && ch !== "v") { p.x = target.x + ox; p.y = target.y + oy; break; }
        }
      }
    }
    if (p.ghost) { p.ghost = false; p.hp = p.stats.maxHp; }
    p.input = { up: false, down: false, left: false, right: false, ax: target?.x ?? p.x + 1, ay: target?.y ?? p.y, atk: true, dashSeq: Math.floor(ticks / 40) };
    if (ticks % 45 === 0 && target) g.handleCast(p.id, ticks % 4, target.x, target.y);
    if (p.options) g.handlePick(p.id, 0);
    if (G.phase === "vote") g.handleVote(p.id, 0);
    if (G.phase === "rest") {
      if (G.market) { p.x = G.market.x; p.y = G.market.y; p.gold += 100; g.handleBuy(p.id, "common"); }
      g.handleRestReady(p.id, true);
    }
  }
  g.tick();
  if (descentTo && G.floor >= descentTo && G.phase === "play") {
    console.log(`무한 하강 ${G.floor}층 도달 (틱 ${ticks}) — 종료`);
    G.finish(false);
  }
  for (const m of g.monsters) seenMonsters.add(m.kind);
  for (const z of g.zones) seenZones.add(z.kind);
  if (G.world !== lastWorld && !panicSim) {
    lastWorld = G.world;
    console.log(`월드 ${G.world} 진입 (틱 ${ticks}, 타이머 ${G.runTime.toFixed(1)}초)`);
  }
}

const result = msgs.find((m) => m.t === "result") as Extract<ServerMsg, { t: "result" }> | undefined;
if (!result) {
  console.log("멈춘 상태:", JSON.stringify({
    phase: G.phase, stage: G.stageKind, world: G.world, round: G.round, floor: G.floor, portal: G.portalOpen,
    monsters: g.monsters.map((m) => `${m.kind}(${Math.round(m.x)},${Math.round(m.y)}) hp${Math.round(m.hp)} sp${m.spawnT.toFixed(1)}`),
    players: [...g.players.values()].map((p) => `${p.cls}(${Math.round(p.x)},${Math.round(p.y)}) ghost=${p.ghost} opts=${!!p.options}`),
  }));
}
if (result?.floor !== undefined) console.log("무한 하강 도달 층:", result.floor);
if (result?.zone !== undefined) console.log("PANIC 구역:", result.zone, "구역별 시간:", result.zoneTimes?.join(", "), "시간초과:", !!result.timeUp);
console.log("결과:", result ? `win=${result.win} world=${result.world} time=${result.time} splits=${result.splits?.length}` : "없음 (시간 초과)");
console.log("등장한 몬스터:", [...seenMonsters].sort().join(", "));
console.log("등장한 장판:", [...seenZones].sort().join(", "));
const lv = [...g.players.values()].map((p) => `${p.name} Lv${p.level} 카드${p.cards.length}`).join(" / ");
console.log("최종:", lv);
process.exit(result?.win || (descentTo && result?.floor && result.floor >= descentTo) ? 0 : 1);
