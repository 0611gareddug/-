// 틱 안 단계별 시간 (perf-bench 와 같은 상황)
import os from "node:os";
import path from "node:path";
process.env.STORE_FILE = path.join(os.tmpdir(), `osin-perf-${Date.now()}.json`);
const { Game } = await import("../server/game");
const proto = Game.prototype as any;
const acc: Record<string, number> = {};
for (const k of ["updatePlayer", "updatePets", "updateRevives", "updateMonster", "separateMonsters", "updateProjs", "updateZones", "sendSnapshot", "targetFor", "moveMonster", "hurtPlayer", "dealDamage", "updateGimmick", "checkPortal"]) {
  const f = proto[k];
  if (!f) continue;
  proto[k] = function (...a: unknown[]) { const t = performance.now(); const r = f.apply(this, a); acc[k] = (acc[k] ?? 0) + performance.now() - t; return r; };
}
const tickF = proto.tick;
proto.tick = function () { const t = performance.now(); const r = tickF.apply(this); acc.TICK = (acc.TICK ?? 0) + performance.now() - t; return r; };
(globalThis as any).__split = true;
await import("./perf-bench");
const T = acc.TICK;
for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(18), `${v.toFixed(0)}ms`.padStart(8), `${((v / T) * 100).toFixed(1)}%`);
process.exit(0);
