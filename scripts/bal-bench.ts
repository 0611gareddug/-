// 특성 트리 밸런스 측정: 직업별로 30초 동안 몬스터 무리에 넣은 피해 비교
//  - 이전(v0.9.2): 너프·특성 없음, 레벨당 공격력 4%
//  - 특성 0개: v1.0 너프만
//  - 특성 최고: 포인트를 한 갈래 5단계 + 나머지 다른 갈래 (모든 조합 중 최고)
// 실행: npx tsx scripts/bal-bench.ts
import os from "node:os";
import path from "node:path";
process.env.STORE_FILE = path.join(os.tmpdir(), `osin-bench-${Date.now()}.json`);
const { Game } = await import("../server/game");
const { CLASS_IDS } = await import("../shared/classes");
const { TALENTS, talentPoints } = await import("../shared/talents");
type ClassId = (typeof CLASS_IDS)[number];

const TICKS = 30 * 30;
const RUNS = 5;

function run(cls: ClassId, level: number, mode: "old" | "new", tal: Record<string, number>) {
  let total = 0;
  for (let r = 0; r < RUNS; r++) {
    const g = new Game([{ id: 1, name: "B", color: 0, cls }], () => {}, () => {}, () => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const G = g as any;
    const p = g.players.get(1)!;
    G.talentsOn = mode === "new";
    p.level = level;
    p.tal = { ...tal };
    p.talN = Object.values(tal).reduce((a, b) => a + b, 0);
    p.stats = G.levelStats(p);
    p.hp = p.stats.maxHp;
    p.god = true;
    g.monsters = [];
    G.portalOpen = false;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = g.spawnMonster("slime", { x: p.x + Math.cos(a) * (30 + (i % 3) * 20), y: p.y + Math.sin(a) * (30 + (i % 3) * 20) })!;
      if (!m) continue;
      m.spawnT = 0;
      m.hp = m.mhp = 1e9;
    }
    const sx = p.x, sy = p.y;
    for (let t = 0; t < TICKS; t++) {
      p.x = sx; p.y = sy;
      const target = g.monsters[0];
      if (!target) break;
      p.input = { up: false, down: false, left: false, right: false, ax: target.x, ay: target.y, atk: true, dashSeq: 0 };
      // 닌자 천벌은 즉사라 측정에서 뺌
      for (let s = 0; s < 4; s++) if (p.cds[s] <= 0 && !(cls === "ninja" && s === 3)) g.handleCast(1, s, target.x, target.y);
      G.phase = "play";
      g.tick();
      for (const m of g.monsters) m.hp = Math.max(m.hp, 1e8);
    }
    total += p.dmgDealt;
  }
  return total / RUNS / 30;
}

function bestTalents(cls: ClassId, level: number) {
  const pts = talentPoints(level);
  const br = TALENTS[cls].map((b) => b.id);
  let best = { dps: 0, desc: "" };
  for (const a of br) {
    for (const b of br) {
      if (a === b) continue;
      const tal: Record<string, number> = { [a]: Math.min(5, pts) };
      if (pts > 5) tal[b] = Math.min(5, pts - 5);
      const dps = run(cls, level, "new", tal);
      if (dps > best.dps) best = { dps, desc: Object.entries(tal).map(([k, v]) => `${k}:${v}`).join(" ") };
    }
  }
  return best;
}

const pct = (a: number, b: number) => `${a >= b ? "+" : ""}${Math.round((a / b - 1) * 100)}%`;
for (const level of (process.env.LV ?? "1,10,20").split(",").map(Number)) {
  console.log(`\n== Lv${level} (특성 포인트 ${talentPoints(level)}) — 초당 피해 ==`);
  for (const cls of CLASS_IDS) {
    const old = run(cls, level, "old", {});
    const none = run(cls, level, "new", {});
    const line = `${cls.padEnd(9)} 이전 ${old.toFixed(0).padStart(5)}  특성0 ${none.toFixed(0).padStart(5)} (${pct(none, old)})`;
    if (level === 1) { console.log(line); continue; }
    const best = bestTalents(cls, level);
    console.log(`${line}  특성최고 ${best.dps.toFixed(0).padStart(5)} (${pct(best.dps, old)})  ${best.desc}`);
  }
}
process.exit(0);
