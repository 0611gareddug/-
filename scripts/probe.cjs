// 서버 속도 측정: 봇 N명이 같은 방에서 게임 시작 → 게임 시간이 실제 시간만큼 흐르는지
// node scripts/probe.cjs <ws주소> [봇 수]
const WebSocket = require("ws");
const url = process.argv[2];
const N = Number(process.argv[3] ?? 1);
let code = null, first = null, snaps = 0, done = false;
const bots = [];
function bot(i) {
  const ws = new WebSocket(url);
  bots.push(ws);
  ws.on("open", () => ws.send(JSON.stringify(i === 0 ? { t: "create", name: "측정봇0" } : { t: "join", code, name: `측정봇${i}` })));
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    if (m.t === "joined" && i > 0) ws.send(JSON.stringify({ t: "ready", ready: true }));
    if (m.t === "joined" && i === 0) { code = m.code; for (let k = 1; k < N; k++) bot(k); setTimeout(() => ws.send(JSON.stringify({ t: "start" })), 1500); }
    if (m.t === "snap" && i === 0) {
      // 봇들은 계속 공격하며 돌아다님
      if (snaps % 5 === 0) for (const [k, b] of bots.entries()) if (b.readyState === 1) b.send(JSON.stringify({ t: "input", input: { up: snaps % 40 < 20, down: snaps % 40 >= 20, left: k % 2 === 0, right: k % 2 === 1, ax: 0, ay: 0, atk: true, dashSeq: 0 } }));
      snaps++;
      if (!first) first = { wall: Date.now(), game: m.time };
      if (!done && Date.now() - first.wall > 10000) {
        done = true;
        const wall = (Date.now() - first.wall) / 1000, game = m.time - first.game;
        console.log(`봇 ${N}명 · 몬스터 ${m.mz?.length ?? m.monsters?.length} · 스냅샷 ${(snaps / wall).toFixed(1)}/s (정상 15) · 게임 속도 ${(game / wall * 100).toFixed(0)}%`);
        process.exit(0);
      }
    }
  });
}
bot(0);
setTimeout(() => { console.log("timeout", snaps); process.exit(1); }, 40000);
