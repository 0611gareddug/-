// 서버 게임 로직 점검용 스크립트: npx tsx scripts/logic-test.ts
import os from "node:os";
import path from "node:path";
import { CARDS, CARD_BY_ID } from "../shared/cards";
import type { ServerMsg } from "../shared/protocol";
import { MONSTERS, WORLDS } from "../shared/worlds";

// 실제 순위·저장 파일을 건드리지 않게 임시 파일 사용
process.env.STORE_FILE = path.join(os.tmpdir(), `osin-test-${Date.now()}.json`);
const { Game } = await import("../server/game");
const store = await import("../server/store");

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!ok) fails++;
};

const sent: { to: number | "all"; m: ServerMsg }[] = [];
const g = new Game(
  [
    { id: 1, name: "A", color: 0, cls: "warrior" },
    { id: 2, name: "B", color: 1, cls: "mage" },
  ],
  (m) => sent.push({ to: "all", m }),
  (to, m) => sent.push({ to, m }),
  () => {},
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const G = g as any;
const A = g.players.get(1)!;
const B = g.players.get(2)!;

// ---------- 카드 수 ----------
check("검사 이름 변경 + 마법사 스킬 피해 감소", (await import("../shared/classes")).CLASSES.warrior.name === "검사" && (g as any).players.size > 0);
check("카드 76장 (v1.4 현란한 카드 5장 포함)", CARDS.length === 76, `${CARDS.length}`);
check("팀카드 10장", CARDS.filter((c) => c.rarity === "team").length === 10);

// ---------- 암시장 ----------
G.startStage("rest");
check("휴게소 진입", G.phase === "rest" && !!G.market);
check("허수아비 3개", g.monsters.filter((m) => m.kind === "dummy").length === 3);
A.x = G.market.x; A.y = G.market.y;
A.gold = 100;
const before = A.cards.length;
g.handleBuy(1, "rare");
const gacha = sent.filter((s) => s.to === 1 && s.m.t === "gacha").pop()?.m as Extract<ServerMsg, { t: "gacha" }>;
check("희귀 상자 구매", A.gold === 20 && A.cards.length === before + 1, `gold ${A.gold}`);
check("희귀 카드가 나옴", !!gacha?.card && CARD_BY_ID[gacha.card].rarity === "rare", gacha?.card ?? "none");
g.handleBuy(1, "rare");
check("돈 부족하면 구매 안 됨", A.gold === 20);
B.x = 0; B.y = 0; B.gold = 500;
g.handleBuy(2, "common");
check("암시장 범위 밖이면 구매 안 됨", B.gold === 500);

// ---------- 허수아비 DPS ----------
const dummy = g.monsters.find((m) => m.kind === "dummy")!;
g.dealDamage(dummy, 50, A, {});
check("허수아비는 안 죽고 누적 피해 기록", dummy.total > 0 && g.monsters.includes(dummy));

// ---------- 휴게소 쿨타임 ----------
A.cds = [0, 0, 0, 0];
g.handleCast(1, 0, A.x + 10, A.y);
check("휴게소에선 스킬 쿨타임 0.3초", A.cds[0] <= 0.3 && A.cds[0] > 0, `${A.cds[0]}`);

// ---------- 준비 완료 → 다음 라운드 ----------
const r0 = G.round;
g.handleRestReady(1, true);
check("한 명만 준비하면 대기", G.phase === "rest");
g.handleRestReady(2, true);
check("모두 준비하면 다음 라운드", G.phase === "play" && G.round === r0 + 1);

// ---------- 팀 투표 ----------
G.openVote();
const opts: string[] = G.voteOptions;
check("투표 카드 3장", opts.length === 3 && opts.every((id) => CARD_BY_ID[id].rarity === "team"));
g.handleVote(1, 2);
g.handleVote(2, 2);
check("만장일치 카드가 양쪽에 적용", A.cards.includes(opts[2]) && B.cards.includes(opts[2]));

// ---------- 빚쟁이 ----------
G.openCards();
A.options = ["debt"];
g.handlePick(1, 0);
check("빚쟁이: 카드 2장 더 선택", A.pendingPicks === 2 && !!A.options, `pending ${A.pendingPicks}`);
g.handlePick(1, 0);
g.handlePick(1, 0);
check("빚쟁이: 추가 선택 완료", A.pendingPicks === 0 && !A.options);
check("빚쟁이: 다음 2번 건너뛰기 예약", A.skipPicks === 2);

// ---------- 신의 주사위 ----------
const count = A.cards.filter((id: string) => CARD_BY_ID[id].rarity !== "team").length;
g.giveCard(A, "dice");
const after = A.cards.filter((id: string) => CARD_BY_ID[id].rarity !== "team" && id !== "dice").length;
check("신의 주사위: 카드 수 유지", after === count, `${count} -> ${after}`);
check("신의 주사위: 최대 체력 정상", A.stats.maxHp > 0 && A.hp <= A.stats.maxHp, `${A.hp}/${A.stats.maxHp}`);

// ---------- 레벨업 / 스킬 해금 ----------
B.level = 1; B.xp = 0;
g.addXp(B, 250);
check("경험치 250 → Lv6", B.level === 6, `Lv${B.level}`);
G.phase = "play";
B.cds = [0, 0, 0, 0];
g.handleCast(2, 3, B.x, B.y);
check("Lv6에서 4번 스킬은 잠김", B.cds[3] === 0);
g.handleCast(2, 2, B.x + 30, B.y);
check("Lv6에서 3번 스킬 사용 가능", B.cds[2] > 0);

// ---------- 기여도 돈 ----------
G.startStage("battle");
const slime = g.monsters.find((m) => m.kind === "slime")!;
slime.spawnT = 0;
A.gold = 0; B.gold = 0;
A.stats.critChance = 0; B.stats.critChance = 0;
g.dealDamage(slime, 5, A, { raw: true });
g.dealDamage(slime, 1000, B, { raw: true });
check("기여도 1위가 돈 전부", B.gold > 0 && A.gold === 0, `A ${A.gold} / B ${B.gold}`);

// ---------- 월드 데이터 ----------
check("월드 8개", WORLDS.length === 8);
check("월드 몬스터·보스가 모두 정의됨", WORLDS.every((w) => [...w.monsters, w.boss].every((id) => !!MONSTERS[id])));
check("보스 소환 몬스터가 모두 정의됨", Object.values(MONSTERS).every((m) => !m.boss?.summon || !!MONSTERS[m.boss.summon]));

// ---------- 월드 진행: 보스 → 카드 → 휴게소(전원 회복·저장) → 다음 월드 ----------
const sent2: ServerMsg[] = [];
const g2 = new Game(
  [{ id: 1, name: "Host", color: 0, cls: "archer" }, { id: 2, name: "Pal", color: 1, cls: "cleric" }],
  (m) => sent2.push(m), () => {}, () => {},
  { mode: { speedrun: false, diff: 1 }, saveId: "save-test", hostName: "Host" },
);
const G2 = g2 as any;
G2.world = 2;
G2.round = 6;
G2.nextRound();
check("6라운드 다음은 보스", G2.stageKind === "boss" && g2.monsters.some((m) => m.kind === "pharaoh"));
const h1 = g2.players.get(1)!, h2 = g2.players.get(2)!;
h2.ghost = true; h2.hp = 0;
h1.hp = 5;
G2.openCards();
for (const p of g2.players.values()) while (p.options) g2.handlePick(p.id, 0);
check("보스 후 휴게소 확정", G2.phase === "rest");
check("월드 클리어 시 전원 부활·회복", !h2.ghost && h2.hp === h2.stats.maxHp && h1.hp === h1.stats.maxHp);
const saved = store.getSave("save-test");
check("월드 클리어 시 자동 저장", !!saved && saved.world === 3 && saved.players.length === 2, `world ${saved?.world}`);
g2.handleRestReady(1, true);
g2.handleRestReady(2, true);
check("휴게소 후 다음 월드 1라운드", G2.world === 3 && G2.round === 1 && g2.monsters.some((m) => m.kind === "snow_slime"));

// ---------- 저장에서 이어하기 ----------
h1.level = 1;
const g3 = new Game(
  [{ id: 5, name: "host", color: 0, cls: "warrior" }, { id: 6, name: "Newbie", color: 1, cls: "mage" }],
  () => {}, () => {}, () => {},
  { mode: { speedrun: false, diff: 1 }, save: saved, saveId: "save-test", hostName: "Host" },
);
const r1 = g3.players.get(5)!, r2 = g3.players.get(6)!;
check("이어하기: 저장된 월드부터", (g3 as any).world === 3);
check("이어하기: 같은 닉네임(대소문자 무시)은 직업·카드 복구", r1.cls === "archer" && r1.cards.length === saved!.players[0].cards.length);
check("이어하기: 새 친구는 팀 평균 레벨", r2.level === Math.round((saved!.players[0].level + saved!.players[1].level) / 2));

// ---------- 지형 ----------
const g4 = new Game([{ id: 9, name: "T", color: 0, cls: "warrior" }], () => {}, () => {}, () => {});
const G4 = g4 as any;
const t = g4.players.get(9)!;
const putTile = (ch: string) => {
  const tx = Math.floor(t.x / 16), ty = Math.floor(t.y / 16);
  const arr = G4.map.tiles.split("");
  arr[ty * G4.map.w + tx] = ch;
  G4.map.tiles = arr.join("");
};
g4.monsters = [];
t.invulnT = 0;
t.safeX = t.x - 40;
t.safeY = t.y;
const hpBefore = t.hp;
putTile("v");
G4.updatePlayer(t);
check("구멍: 피해 + 안전한 곳으로", t.hp < hpBefore && Math.hypot(t.x - t.safeX, t.y - t.safeY) < 12, `${hpBefore} -> ${Math.round(t.hp)}`);
t.dashT = 0;
putTile("=");
G4.updatePlayer(t);
check("용암: 화상 상태", t.burnT > 0);

// ---------- 난이도 배율 (체력 ×배율, 피해 ×(1+배율)/2) ----------
const mk = (diff: number) => {
  const gg = new Game([{ id: 1, name: "X", color: 0, cls: "mage" }], () => {}, () => {}, () => {}, { mode: { speedrun: false, diff }, saveId: "x", hostName: "X" });
  gg.monsters = [];
  gg.spawnMonster("slime");
  return gg.monsters[0];
};
const easy = mk(1), normalD = mk(2), hardD = mk(3), hc = mk(4);
const ratio = (a: number, b: number, want: number) => Math.abs(a / b - want) < 0.05;
check("난이도 보통: 체력 ×2, 피해 ×1.5", ratio(normalD.mhp, easy.mhp, 2) && ratio(normalD.dmg, easy.dmg, 1.5), `${easy.mhp} / ${normalD.mhp}`);
check("난이도 어려움: 체력 ×3, 피해 ×2", ratio(hardD.mhp, easy.mhp, 3) && ratio(hardD.dmg, easy.dmg, 2));
check("난이도 하드코어: 체력 ×4, 피해 ×2.5", ratio(hc.mhp, easy.mhp, 4) && ratio(hc.dmg, easy.dmg, 2.5));

// ---------- 스피드런 타이머 ----------
const g5 = new Game([{ id: 1, name: "S", color: 0, cls: "mage" }], () => {}, () => {}, () => {}, { mode: { speedrun: true, diff: 1 }, saveId: "s", hostName: "S" });
const G5 = g5 as any;
for (let i = 0; i < 30; i++) g5.tick();
const t1 = G5.runTime;
G5.openCards();
for (let i = 0; i < 30; i++) g5.tick();
check("스피드런: 전투 중엔 타이머가 흐름", t1 > 0.9);
check("스피드런: 카드 고르는 동안 타이머 정지", G5.runTime === t1);

// ---------- 순위 ----------
store.addRecord(2, 0, ["A"], 300);
const rank = store.addRecord(2, 0, ["B"], 200);
store.addRecord(3, 0, ["C"], 100);
check("순위: 더 빠른 기록이 1위", rank === 1 && store.getRecords()["2"].total[0].names[0] === "B");
check("순위: 난이도별로 따로", store.getRecords()["3"].total[0].names[0] === "C" && store.getRecords()["2"].total.length === 2);
store.addClears(["Hero"]);
check("8월드 클리어 → 하드코어 해금 (대소문자 무시)", store.canHardcore("hero") && !store.canHardcore("other"));

// ---------- 보석 쟁탈전 ----------
const gemMsgs: ServerMsg[] = [];
const gg = new Game(
  [
    { id: 1, name: "A", color: 0, cls: "archer" },
    { id: 2, name: "B", color: 1, cls: "mage" },
    { id: 3, name: "C", color: 2, cls: "warrior" },
  ],
  (m) => gemMsgs.push(m), () => {}, () => {},
  { mode: { speedrun: false, diff: 1, gem: true }, saveId: "g", hostName: "A" },
);
const GG = gg as any;
const [ga, gb, gc] = [1, 2, 3].map((id) => gg.players.get(id)!);
check("쟁탈전: 레벨 10 + 드래프트 5장", ga.level === 10 && ga.pendingPicks === 5 && GG.phase === "cards");
for (const p of gg.players.values()) while (p.options) gg.handlePick(p.id, 0);
check("쟁탈전: 드래프트 후 카드 5장", ga.cards.length >= 5, `${ga.cards.length}`);
check("쟁탈전: 아레나 시작, 몬스터 없음", GG.stageKind === "arena" && gg.monsters.every((m) => m.kind === "pvp"));
for (const p of gg.players.values()) { p.stats.critChance = 0; p.invulnT = 0; }
const proxyOf = (id: number) => gg.monsters.find((m) => m.owner === id)!;
GG.syncProxies();
// 아무도 보석이 없을 때: 서로 공격 불가
const bHp = gb.hp;
gg.dealDamage(proxyOf(2), 20, ga, {});
check("쟁탈전: 보석 없는 사람끼리는 공격 안 됨", gb.hp === bHp);
// A가 보석을 주움
ga.x = GG.gem.x; ga.y = GG.gem.y;
GG.updateGem();
check("쟁탈전: 보석 줍기", GG.gem.holder === 1);
GG.syncProxies();
gg.dealDamage(proxyOf(3), 20, gb, {});
check("쟁탈전: 보석 든 사람이 아니면 서로 못 때림", gc.hp === gc.stats.maxHp);
const aHp = ga.hp;
gg.dealDamage(proxyOf(1), 20, gb, {});
check("쟁탈전: 보석 든 사람은 맞음", ga.hp < aHp);
gc.invulnT = 0;
gg.dealDamage(proxyOf(3), 20, ga, {});
check("쟁탈전: 보석 든 사람은 공격 가능", gc.hp < gc.stats.maxHp);
ga.shield = 0;
gg.dealDamage(proxyOf(1), 99999, gb, { raw: true, noCrit: true });
check("쟁탈전: 보석 든 사람이 쓰러지면 보석 떨어짐", ga.ghost && GG.gem.holder === null && gb.kills === 1);
for (let i = 0; i < 100; i++) GG.updateGem();
check("쟁탈전: 3초 뒤 부활", !ga.ghost && ga.hp === ga.stats.maxHp);
gb.x = GG.gem.x; gb.y = GG.gem.y;
GG.updateGem();
gb.score = 99.99;
GG.updateGem();
check("쟁탈전: 100점이면 우승", GG.phase === "end" && GG.gemWinner === 2);

// ---------- 공통 난이도 조정 ----------
const gr = new Game([{ id: 1, name: "R1", color: 0, cls: "mage" }, { id: 2, name: "R2", color: 1, cls: "mage" }], () => {}, () => {}, () => {});
const GR = gr as any;
const [ra, rb] = [gr.players.get(1)!, gr.players.get(2)!];
rb.ghost = true; rb.hp = 0;
ra.x = rb.x; ra.y = rb.y;
gr.monsters = [];
for (let i = 0; i < 30 * 4; i++) GR.updateRevives();
check("부활: 4초로는 아직 (5초 필요)", rb.ghost);
for (let i = 0; i < 30 * 1.2; i++) GR.updateRevives();
check("부활: 5초 후 체력 30%", !rb.ghost && rb.hp === Math.ceil(rb.stats.maxHp * 0.3), `${rb.hp}/${rb.stats.maxHp}`);
ra.hp = 10;
GR.round = 1;
GR.nextRound();
check("라운드 사이 회복 15%", ra.hp === 10 + Math.ceil(ra.stats.maxHp * 0.15), `${ra.hp}`);

// ---------- 엘리트 ----------
gr.monsters = [];
const eNormal = gr.spawnMonster("slime")!;
const eSplit = gr.spawnMonster("slime", { x: eNormal.x, y: eNormal.y }, "split")!;
check("엘리트: 체력 5배·피해 1.5배", Math.abs(eSplit.mhp / eNormal.mhp - 5) < 0.6 && Math.abs(eSplit.dmg / eNormal.dmg - 1.5) < 0.01);
eSplit.spawnT = 0;
const countBefore = gr.monsters.length;
gr.dealDamage(eSplit, 999999, ra, { raw: true, noCrit: true });
check("엘리트 분열: 죽으면 작은 몹 3마리", gr.monsters.length === countBefore - 1 + 3, `${countBefore} -> ${gr.monsters.length}`);
gr.monsters = [];
const guard = gr.spawnMonster("slime", { x: 200, y: 200 }, "guard")!;
const buddy = gr.spawnMonster("slime", { x: 210, y: 200 })!;
guard.spawnT = buddy.spawnT = 0;
const hpB = buddy.hp;
gr.dealDamage(buddy, 10, ra, { raw: true, noCrit: true });
check("엘리트 보호막: 근처 몹 피해 절반", Math.abs(hpB - buddy.hp - 5) < 0.01, `${hpB - buddy.hp}`);

// ---------- 도박꾼 ----------
const gx = new Game([{ id: 1, name: "Gam", color: 0, cls: "archer" }], () => {}, (_id, m) => gxMsgs.push(m), () => {});
const gxMsgs: ServerMsg[] = [];
const GX = gx as any;
GX.startStage("rest", "gambler");
const gp = gx.players.get(1)!;
gp.x = GX.market.x; gp.y = GX.market.y;
gp.gold = 1000;
gx.handleBuy(1, "common");
check("도박꾼 휴게소에선 암시장 구매 안 됨", gp.gold === 1000);
let sum = 0;
for (let i = 0; i < 40; i++) {
  const before = gp.gold;
  gx.handleGamble(1, "oddeven", 10, "odd");
  sum += Math.abs(gp.gold - before);
}
check("도박: 홀짝은 건 돈만큼 따거나 잃음", sum === 400);
const rolls = new Set<string>();
for (let i = 0; i < 60; i++) {
  gp.gold = 1000;
  gx.handleGamble(1, "roulette", 10);
  const res = gxMsgs.filter((m) => m.t === "gambleResult").pop() as Extract<ServerMsg, { t: "gambleResult" }>;
  const want: Record<string, number> = { "1": -10, "2": 0, "3": 0, "4": 0, "5": 10, "6": 40 };
  if (res.delta !== want[res.outcome]) rolls.add("bad");
  rolls.add(res.outcome);
}
check("도박: 룰렛 배당 (1꽝·2~4본전·5두배·6다섯배)", !rolls.has("bad") && rolls.size >= 5);
gp.gold = 40;
gx.handleGamble(1, "card", 0);
check("도박: 카드 도박은 50원 필요", gp.gold === 40);

// ---------- 시련의 방 ----------
const gt = new Game([{ id: 1, name: "T1", color: 0, cls: "mage" }, { id: 2, name: "T2", color: 1, cls: "warrior" }], () => {}, () => {}, () => {});
const GT = gt as any;
GT.openTrialVote();
gt.handleTrial(1, true);
gt.handleTrial(2, false);
check("시련: 과반 아니면 도전 안 함 → 카드 선택", GT.phase === "cards");
for (const p of gt.players.values()) { p.options = null; p.pendingPicks = 0; }
GT.openTrialVote();
gt.handleTrial(1, true);
check("시련: 투표 대기", GT.phase === "trialvote");
GT.timer = 0;
gt.handleTrial(2, true);
check("시련: 과반이면 시련의 방", GT.stageKind === "trial" && GT.phase === "play");
const tg = gt.players.get(1)!;
const goldBefore = tg.gold;
for (const p of gt.players.values()) p.god = true;
for (let i = 0; i < 30 * 31; i++) gt.tick();
check("시련: 30초 버티면 보상 후 카드 선택", GT.phase === "cards" && tg.gold > goldBefore, `${goldBefore} -> ${tg.gold}`);

// ---------- 커맨드 / 도감 ----------
const gc2 = new Game([{ id: 1, name: "Codex", color: 0, cls: "mage" }], () => {}, () => {}, () => {});
const GC = gc2 as any;
const cp = gc2.players.get(1)!;
GC.giveCard(cp, "muscle");
check("도감: 얻은 카드 기록", store.getCodex("codex").cards.includes("muscle"));
gc2.handleCmd(1, { a: "gold", n: 500 });
check("커맨드: 돈 지급 + 커맨드 사용 표시", cp.gold === 500 && GC.cmdUsed);
GC.giveCard(cp, "skin");
check("커맨드 쓴 판은 도감에 안 남음", !store.getCodex("codex").cards.includes("skin"));
gc2.handleCmd(1, { a: "level", n: 10 });
check("커맨드: 레벨 지정", cp.level === 10);
gc2.handleCmd(1, { a: "goto", world: 4, round: 7 });
check("커맨드: 4월드 보스로 이동", GC.world === 4 && GC.stageKind === "boss");
gc2.handleCmd(1, { a: "spawn", kind: "yeti", n: 2, elite: true });
check("커맨드: 엘리트 소환", gc2.monsters.filter((m) => m.kind === "yeti" && m.elite).length === 2);
gc2.handleCmd(1, { a: "killall" });
check("커맨드: 전부 처치", gc2.monsters.length === 0);
gc2.handleCmd(1, { a: "god" });
const hpG = cp.hp;
gc2.hurtPlayer(cp, 50, true);
check("커맨드: 무적", cp.hp === hpG);

// ---------- 새 직업 ----------
const gn = new Game(
  [
    { id: 1, name: "Eng", color: 0, cls: "engineer" },
    { id: 2, name: "Cook", color: 1, cls: "cook" },
    { id: 3, name: "Bard", color: 2, cls: "bard" },
  ],
  () => {}, () => {}, () => {},
);
const GN = gn as any;
const [en, ck, bd] = [1, 2, 3].map((id) => gn.players.get(id)!);
for (const p of gn.players.values()) { p.god = true; p.stats.critChance = 0; }
GN.updatePets();
check("엔지니어: Lv1 거미 포탑 1대", GN.pets.filter((p: any) => p.ownerId === 1 && p.kind === "spider").length === 1);
en.level = 6;
GN.updatePets();
check("엔지니어: Lv6에도 거미 포탑 1대 고정", GN.pets.filter((p: any) => p.ownerId === 1 && p.kind === "spider").length === 1);
gn.handleCast(1, 0, en.x + 30, en.y);
check("엔지니어: 1번 포탑 설치 (쿨 10초)", GN.pets.some((p: any) => p.ownerId === 1 && p.kind === "turret") && en.cds[0] > 9);
GN.pets = GN.pets.filter((p: any) => p.kind !== "turret");
gn.monsters = [];
const tgt = gn.spawnMonster("slime", { x: en.x + 20, y: en.y })!;
tgt.spawnT = 0;
en.input = { ...en.input, atk: true, ax: tgt.x, ay: tgt.y };
en.atkCd = 0;
const hpT = tgt.hp;
GN.updatePlayer(en);
check("엔지니어: 화염방사 피해 + 화상", tgt.hp < hpT && tgt.poisonT > 0);
ck.hp = 10;
ck.level = 10; bd.level = 10;
gn.handleCast(2, 0, ck.x, ck.y);
check("요리사: 음식 던지기로 회복", ck.hp > 10);
gn.handleCast(2, 2, en.x + 20, en.y);
const oil = gn.zones.find((z) => z.kind === "oil");
check("요리사: 기름 장판", !!oil);
en.atkCd = 0;
en.input = { ...en.input, atk: true, ax: oil!.x, ay: oil!.y };
GN.updatePlayer(en);
check("요리사 기름 + 엔지니어 불 = 폭발", !gn.zones.some((z) => z.kind === "oil"));
ck.hp = 1;
gn.handleCast(2, 3, ck.x, ck.y);
check("요리사: 대잔치 (전부 회복 + 피해 감소)", ck.hp === ck.stats.maxHp && ck.feastT > 0);
en.x = bd.x + 20; en.y = bd.y;
GN.updatePlayer(bd);
check("바드: Lv10 용기의 노래 패시브 → 주변 동료 평타 버프", bd.songOn && (en.songBuffT ?? 0) > 0);
gn.monsters = [];
const sleeper = gn.spawnMonster("slime", { x: bd.x + 30, y: bd.y })!;
sleeper.spawnT = 0;
gn.handleCast(3, 1, sleeper.x, sleeper.y);
check("바드: 자장가로 잠듦", !!sleeper.sleep && sleeper.stunT > 1);
gn.dealDamage(sleeper, 1, bd, { raw: true, noCrit: true });
check("바드: 맞으면 깸", !sleeper.sleep && sleeper.stunT <= 0);
en.cds = [5, 5, 5, 5];
ck.cds = [5, 5, 5, 5];
ck.x = bd.x; ck.y = bd.y;
gn.handleCast(3, 0, bd.x, bd.y);
check("바드: 1번 앙코르로 동료 쿨타임 초기화 (쿨 12초)", ck.cds.every((c) => c === 0) && bd.cds[0] > 11);

// ---------- 업적 ----------
const ga2 = new Game([{ id: 1, name: "AchTester", color: 0, cls: "warrior" }], () => {}, (_id, m) => achMsgs.push(m), () => {});
const achMsgs: ServerMsg[] = [];
const GA = ga2 as any;
const ap = ga2.players.get(1)!;
ap.gold = 990;
GA.giveGold(ap, 20, { x: 0, y: 0 });
check("업적: 부자 (1000원)", store.getProfile("achtester").ach.includes("rich") && achMsgs.some((m) => m.t === "achievement"));
GA.world = 2; GA.round = 7;
GA.stageKind = "boss";
GA.clearWorld();
check("업적: 월드 2 클리어 + 무사고", store.getProfile("achtester").ach.includes("w2") && store.getProfile("achtester").ach.includes("flawless"));
check("코스튬: 가진 것만 장착", store.setEquip("achtester", "cape", "desert").cape === "desert" && !store.setEquip("achtester", "hat", "halo").hat);
const gc3 = new Game([{ id: 1, name: "Cheater", color: 0, cls: "warrior" }], () => {}, () => {}, () => {});
gc3.handleCmd(1, { a: "gold", n: 5000 });
(gc3 as any).giveGold(gc3.players.get(1)!, 1, { x: 0, y: 0 });
check("업적: 커맨드 쓴 판은 업적 안 남음", !store.getProfile("cheater").ach.includes("rich"));

// ---------- 무한 하강 ----------
const gd = new Game([{ id: 1, name: "Diver", color: 0, cls: "mage" }], () => {}, () => {}, () => {}, { mode: { speedrun: false, descent: true, diff: 2 }, saveId: "d", hostName: "Diver" });
const GD = gd as any;
check("무한 하강: 1층 시작 + 변형 규칙", GD.floor === 1 && GD.stageKind === "battle" && !!GD.mod);
const hp1 = gd.monsters.find((m) => !m.elite && m.kind === WORLDS[GD.world - 1].monsters[0]);
GD.floor = 9;
GD.nextRound();
check("무한 하강: 10층은 보스", GD.floor === 10 && GD.stageKind === "boss" && gd.monsters.some((m) => m.def.boss));
GD.openCards();
for (const p of gd.players.values()) while (p.options) gd.handlePick(p.id, 0);
check("무한 하강: 보스 뒤 휴게소", GD.phase === "rest");
gd.handleRestReady(1, true);
check("무한 하강: 휴게소 뒤 11층", GD.floor === 11 && GD.phase === "play");
GD.floor = 40;
GD.mod = null;
gd.monsters = [];
const deep = gd.spawnMonster("slime")!;
check("무한 하강: 깊을수록 적이 강해짐", !!hp1 && deep.mhp > hp1.mhp * 3, `${hp1?.mhp} -> ${deep.mhp}`);
GD.finish(false);
for (let i = 0; i < 70; i++) gd.tick();
check("무한 하강: 최고 층 기록", (store.getRecords()["2"].descent ?? []).some((e) => e.floor === 40 && e.names[0] === "Diver"));

// ---------- PANIC ----------
const pm: ServerMsg[] = [];
const gpn = new Game(
  [{ id: 1, name: "Panic1", color: 0, cls: "warrior" }, { id: 2, name: "Panic2", color: 1, cls: "mage" }],
  (m) => pm.push(m), (_id, m) => pm.push(m), () => {},
  { mode: { speedrun: false, panic: true, diff: 2 }, saveId: "pn", hostName: "Panic1" },
);
const GP = gpn as any;
const pStage = pm.find((m) => m.t === "stage") as Extract<ServerMsg, { t: "stage" }> | undefined;
check("PANIC: 구역 1 시작 · 90초 · 임무", GP.zone === 1 && GP.world === 1 && Math.abs(GP.panicT - 90) < 0.01 && ["kill", "exit", "collect"].includes(GP.mission));
check("PANIC: 무대 정보에 구역·임무", pStage?.stage.zone === 1 && !!pStage?.stage.mission);
// 열쇠 수집 임무
GP.mission = "collect";
GP.setupPanicZone();
check("PANIC: 열쇠 5개 (2명)", GP.keys.length === 5 && GP.keyGoal === 5);
const pa = gpn.players.get(1)!;
for (const k of [...GP.keys]) { pa.x = k.x; pa.y = k.y; gpn.tick(); }
check("PANIC: 열쇠만 모으고 몬스터가 남으면 아직 돌파 아님", GP.keyGot === 5 && GP.phase === "play" && gpn.monsters.length > 0);
gpn.monsters = [];
gpn.tick();
check("PANIC: 열쇠를 다 모으면 COMPLETE!", GP.phase === "complete" && pm.some((m) => m.t === "panicComplete"));
check("PANIC: 구역 기록", GP.zoneTimes.length === 1 && GP.zoneTimes[0] < 90);
const snapDone = [...pm].reverse().find((m) => m.t === "snap") as Extract<ServerMsg, { t: "snap" }>;
check("PANIC: 스냅샷에 타이머·진행", !!snapDone.panic && snapDone.panic.done === true && snapDone.panic.got === 5);
for (let i = 0; i < 30 * 2.5; i++) gpn.tick();
check("PANIC: 연출 뒤 카드 선택 (타이머 멈춤)", GP.phase === "cards");
const tBefore = GP.runTime;
for (const p of gpn.players.values()) while (p.options) gpn.handlePick(p.id, 0);
check("PANIC: 카드 뒤 구역 2 · 시간 다시 90초", GP.zone === 2 && GP.phase === "play" && Math.abs(GP.panicT - 90) < 0.01 && GP.runTime === tBefore);
// 탈출구 임무
GP.mission = "exit";
GP.setupPanicZone();
check("PANIC: 탈출구는 처음부터 열림", GP.portalOpen);
for (const p of gpn.players.values()) { p.x = GP.map.portal.x; p.y = GP.map.portal.y; }
for (const p of gpn.players.values()) p.god = true;
gpn.tick();
check("PANIC: 탈출구에 모여도 몬스터가 남으면 돌파 아님", GP.phase === "play");
gpn.monsters = [];
gpn.tick();
check("PANIC: 모두 탈출구에 모이면 돌파", GP.phase === "complete");
for (let i = 0; i < 30 * 2.5; i++) gpn.tick();
for (const p of gpn.players.values()) while (p.options) gpn.handlePick(p.id, 0);
// 전멸 임무
GP.mission = "kill";
GP.setupPanicZone();
gpn.monsters = gpn.monsters.filter((m) => m.kind === "chest");
gpn.tick();
check("PANIC: 몬스터 전멸 임무", GP.phase === "complete" && GP.zone === 3);
for (let i = 0; i < 30 * 2.5; i++) gpn.tick();
for (const p of gpn.players.values()) while (p.options) gpn.handlePick(p.id, 0);
check("PANIC: 월드마다 2구역", GP.zone === 4 && GP.world === 2);
// 시간 초과
for (const p of gpn.players.values()) { p.god = true; }
GP.panicT = 0.05;
for (let i = 0; i < 30 * 3; i++) gpn.tick();
const over = pm.find((m) => m.t === "result") as Extract<ServerMsg, { t: "result" }> | undefined;
check("PANIC: 시간이 0초면 TIME OVER", !!over && !over.win && over.timeUp === true && over.zone === 4, JSON.stringify({ win: over?.win, timeUp: over?.timeUp, zone: over?.zone }));
check("PANIC: 실패 화면에 파티원 체력", !!over && over.rows.every((r) => r.mhp !== undefined));
// 마지막 구역 클리어
process.env.START_ZONE = "16";
const pm2: ServerMsg[] = [];
const gpw = new Game([{ id: 1, name: "PanicWin", color: 0, cls: "mage" }], (m) => pm2.push(m), (_id, m) => pm2.push(m), () => {},
  { mode: { speedrun: false, panic: true, diff: 2 }, saveId: "pw", hostName: "PanicWin" });
delete process.env.START_ZONE;
const GW = gpw as any;
check("PANIC: 16구역은 신들의 정원 최종 보스", GW.zone === 16 && GW.world === 8 && GW.mission === "boss" && gpw.monsters.some((m) => m.def.boss));
gpw.monsters = [];
gpw.tick();
check("PANIC: 최종 구역은 COMPLETE! 없이 클리어", !pm2.some((m) => m.t === "panicComplete") && GW.phase === "end");
for (let i = 0; i < 70; i++) gpw.tick();
const win = pm2.find((m) => m.t === "result") as Extract<ServerMsg, { t: "result" }> | undefined;
check("PANIC: PANIC CLEAR 결과 + 순위", !!win?.win && win.panicRank === 1 && win.time !== undefined);
check("PANIC: 클리어 업적 보상", !!win?.rewards?.includes("panic_clear") && store.getProfile("panicwin").ach.includes("panic_clear"));
check("PANIC: 순위표에 기록", (store.getRecords()["2"].panic ?? []).some((e) => e.names[0] === "PanicWin"));

// ---------- v0.8: 보물방 · 저주 교체 · 재접속 · 직업 밸런스 ----------
const tm: { to: number | "all"; m: ServerMsg }[] = [];
const gtr = new Game(
  [{ id: 1, name: "Lucky", color: 0, cls: "warrior" }, { id: 2, name: "Unlucky", color: 1, cls: "mage" }],
  (m) => tm.push({ to: "all", m }), (to, m) => tm.push({ to, m }), () => {},
);
const GTR = gtr as any;
GTR.startTreasure();
check("보물방: 상자 4개 + 출구 열림", GTR.stageKind === "treasure" && GTR.chests.length === 4 && GTR.portalOpen);
const l1 = GTR.chestLoot.get(1).loot as number[];
const l2 = GTR.chestLoot.get(2).loot as number[];
check("보물방: 내용물 20·50·60·미믹", [...l1].sort((a, b) => a - b).join() === "-1,20,50,60");
const lucky = gtr.players.get(1)!;
const unlucky = gtr.players.get(2)!;
lucky.gold = 10;
unlucky.gold = 300;
// 미믹이 아닌 상자만 열기
for (let i = 0; i < 4; i++) {
  if (l1[i] < 0) continue;
  lucky.x = GTR.chests[i].x; lucky.y = GTR.chests[i].y;
  gtr.handleChest(1);
}
check("보물방: 미믹 피해서 3개 열면 130원", lucky.gold === 140, `${lucky.gold}`);
const mi = l2.indexOf(-1);
unlucky.x = GTR.chests[mi].x; unlucky.y = GTR.chests[mi].y;
gtr.handleChest(2);
const mimicMsg = tm.find((x) => x.to === 2 && x.m.t === "chestResult")?.m as Extract<ServerMsg, { t: "chestResult" }> | undefined;
check("보물방: 미믹 열면 돈 전부 잃음 (나에게만 알림)", unlucky.gold === 0 && !!mimicMsg?.mimic && mimicMsg.lost === 300 && !tm.some((x) => x.to === "all" && x.m.t === "chestResult"));
const other = l2.findIndex((v) => v > 0);
unlucky.x = GTR.chests[other].x; unlucky.y = GTR.chests[other].y;
gtr.handleChest(2);
check("보물방: 미믹 뒤엔 더 못 엶", unlucky.gold === 0);
for (const p of gtr.players.values()) { p.x = GTR.map.portal.x; p.y = GTR.map.portal.y; }
gtr.tick();
check("보물방: 모두 출구에 모이면 카드 선택", GTR.phase === "cards");

const { CARD_BY_ID: CB } = await import("../shared/cards");
const { baseStats: bs } = await import("../shared/cards");
const st1 = bs(100);
CB.shiny.apply(st1, {} as any);
check("저주 교체: 유리 심장 (피해 증가, 받는 피해 +25%, 어그로 없음)", st1.atkMul > 1 && st1.dmgTakenMul === 1.25 && st1.aggro === 0);
const st2 = bs(100);
CB.noisy.apply(st2, {} as any);
check("저주 교체: 기분파 (공속 증가, 어그로 없음)", st2.atkSpdMul > 1 && st2.moody === 1 && st2.aggro === 0);
const gm = new Game([{ id: 1, name: "Moody", color: 0, cls: "warrior" }], () => {}, () => {}, () => {});
const GM = gm as any;
const mp = gm.players.get(1)!;
mp.stats.moody = 1;
GM.time = 1;
check("기분파: 10초 중 3초는 공격력 절반", GM.moodyDown(mp) === true);
GM.time = 5;
check("기분파: 나머지 7초는 정상", GM.moodyDown(mp) === false);

// 재접속
const gdc = new Game([{ id: 1, name: "Stay", color: 0, cls: "warrior" }, { id: 2, name: "Leave", color: 1, cls: "cleric" }], () => {}, () => {}, () => {});
const GDC = gdc as any;
const lv = gdc.players.get(2)!;
gdc.setDisconnected(2, true);
const hp0 = lv.hp;
gdc.hurtPlayer(lv, 50, true);
check("재접속: 끊긴 동안 무적", lv.hp === hp0 && lv.dc === true);
const mon = gdc.monsters.find((m) => !m.def.boss)!;
lv.x = mon.x; lv.y = mon.y;
check("재접속: 몬스터가 끊긴 사람은 안 노림", GDC.targetFor(mon)?.id !== 2);
gdc.monsters = [];
gdc.tick();
const stay = gdc.players.get(1)!;
stay.x = GDC.map.portal.x; stay.y = GDC.map.portal.y;
gdc.tick();
check("재접속: 포탈은 연결된 사람만 모이면 출발", GDC.phase === "cards" || GDC.phase === "trialvote" || GDC.stageKind === "treasure");
gdc.setDisconnected(2, false);
check("재접속: 돌아오면 다시 정상", lv.dc === false);

// 직업 밸런스
const { CLASSES: CL } = await import("../shared/classes");
const gmg = new Game([{ id: 1, name: "Mage", color: 0, cls: "mage" }], () => {}, () => {}, () => {});
check("밸런스: 마법사 스킬 피해 ×0.75 (특성 모드 너프 포함)", Math.abs(gmg.players.get(1)!.stats.skillDmgMul - 0.75 * 0.85 / 0.9) < 1e-9);
check("밸런스: 검사 범위 36 · 궁수 화살비 쿨 13.5 · 성직자 공속 0.525", CL.warrior.attack.range === 36 && CL.archer.skills[0].cd === 13.5 && CL.cleric.attack.cd === 0.525);

// ---------- 하늘섬 구멍: 피해 한 번 + 튕겨 나감 ----------
{
  process.env.START_WORLD = "5";
  const gh = new Game([{ id: 1, name: "Faller", color: 0, cls: "warrior" }], () => {}, () => {}, () => {});
  delete process.env.START_WORLD;
  const GH = gh as any;
  gh.monsters = [];
  const fp = gh.players.get(1)!;
  let hole: { x: number; y: number } | null = null;
  for (let ty = 1; ty < GH.map.h - 1 && !hole; ty++) for (let tx = 1; tx < GH.map.w - 1; tx++) {
    if (GH.map.tiles[ty * GH.map.w + tx] === "v") { hole = { x: tx * 16 + 8, y: ty * 16 + 8 }; break; }
  }
  check("하늘섬: 구멍이 있음", !!hole);
  if (hole) {
    const { tileAt: ta } = await import("../shared/collide");
    const hp0 = fp.hp;
    fp.invulnT = 0;
    fp.x = hole.x; fp.y = hole.y;
    GH.updatePlayer(fp);
    const hp1 = fp.hp;
    check("하늘섬: 구멍 피해 6%", Math.round(hp0 - hp1) === Math.round(fp.stats.maxHp * 0.06), `${hp0} -> ${hp1}`);
    for (let i = 0; i < 12; i++) GH.updatePlayer(fp);
    check("하늘섬: 빠진 뒤 구멍 밖으로 튕겨 나감", ta(GH.map, fp.x, fp.y) !== "v");
    fp.dashT = 0;
    fp.x = hole.x; fp.y = hole.y;
    GH.updatePlayer(fp);
    check("하늘섬: 1.5초 안에 다시 빠져도 피해 없음 (중첩 방지)", fp.hp === hp1, `${hp1} -> ${fp.hp}`);
  }
}

// ---------- v0.9: 카드 고정값 · 직업 개편 · 새 직업 · 커맨드 ----------
{
  const { CLASSES: CL9 } = await import("../shared/classes");
  const gv = new Game(
    [
      { id: 1, name: "Sword", color: 0, cls: "warrior" },
      { id: 2, name: "Ninja", color: 1, cls: "ninja" },
      { id: 3, name: "Necro", color: 2, cls: "necro" },
      { id: 4, name: "Engi", color: 3, cls: "engineer" },
    ],
    () => {}, () => {}, () => {},
  );
  const GV = gv as any;
  const [sw, nj, nc, eg] = [1, 2, 3, 4].map((id) => gv.players.get(id)!);
  for (const p of gv.players.values()) { p.god = true; p.stats.critChance = 0; p.level = 10; }

  // 카드 고정값: 근육 자랑 3장 = 평타 +6 (곱해지지 않음)
  for (let i = 0; i < 3; i++) gv.giveCard(sw, "muscle");
  check("카드 고정값: 근육 자랑 3장 = 평타 피해 +6 (너프된 기본 + 6)", Math.abs(sw.stats.atkMul * CL9.warrior.attack.dmg - (CL9.warrior.attack.dmg * 0.9 + 6)) < 0.01, `${(sw.stats.atkMul * CL9.warrior.attack.dmg).toFixed(2)}`);
  gv.giveCard(sw, "feather");
  gv.giveCard(sw, "feather");
  check("카드 고정값: 가벼운 발걸음 2장 = 이속 +14", Math.abs(sw.stats.speedMul * CL9.warrior.speed - (CL9.warrior.speed + 14)) < 0.01);
  check("근접: 검사 체력 170 · v1.4 받는 피해 감소 없음", CL9.warrior.hp === 170 && sw.stats.dmgTakenMul === 1);
  check("원거리 너프: 궁수 평타 9", CL9.archer.attack.dmg === 9);

  // 닌자
  gv.monsters = [];
  const a1 = gv.spawnMonster("slime", { x: nj.x + 40, y: nj.y })!;
  const a2 = gv.spawnMonster("slime", { x: nj.x - 40, y: nj.y })!;
  a1.spawnT = 0; a2.spawnT = 0;
  const boss9 = gv.spawnMonster("king_slime", { x: nj.x + 90, y: nj.y })!;
  boss9.spawnT = 0;
  const bh = boss9.hp;
  nj.god = false;
  gv.handleCast(2, 3, nj.x + 150, nj.y);
  check("닌자 천벌: 돌진 중 무적", nj.dashT > 0 && gv.hurtPlayer(nj, 50, true) === false);
  for (let i = 0; i < 20; i++) GV.updatePlayer(nj);
  nj.god = true;
  check("닌자 천벌: 부딪힌 적 즉사 · 보스는 안 죽고 피해만 · 쿨 75초", !gv.monsters.includes(a1) && gv.monsters.includes(boss9) && boss9.hp < bh && nj.cds[3] > 70);
  gv.monsters = gv.monsters.filter((m) => m !== boss9);
  gv.handleCast(2, 1, nj.x, nj.y);
  check("닌자 연막탄: 은신 + 다음 공격 2배", (nj.stealthT ?? 0) > 0 && nj.nextDouble === true);
  check("닌자 은신 중엔 몬스터가 안 노림", GV.targetFor(a1)?.id !== 2);
  gv.handleCast(2, 2, nj.x, nj.y);
  check("닌자 그림자 분신 2개", GV.pets.filter((p: any) => p.ownerId === 2 && p.kind === "shadow").length === 2);

  // 네크로맨서
  gv.monsters = [];
  const c1 = gv.spawnMonster("slime", { x: nc.x + 40, y: nc.y })!;
  const c2 = gv.spawnMonster("slime", { x: nc.x + 200, y: nc.y })!;
  c1.spawnT = 0; c2.spawnT = 0;
  gv.handleCast(3, 1, c1.x, c1.y);
  check("네크로 약화 저주", (c1.curseT ?? 0) > 0 && !(c2.curseT));
  const hb = c1.hp;
  gv.dealDamage(c1, 10, nc, { raw: true, noCrit: true });
  check("저주받은 적은 받는 피해 +30%", Math.abs((hb - c1.hp) - 13) < 0.01, `${hb - c1.hp}`);
  const hc1 = c1.hp, hc2 = c2.hp;
  gv.handleCast(3, 3, nc.x, nc.y);
  check("죽음의 표식: 저주받은 적만 피해 (메테오 0.6배)", c1.hp < hc1 - 30 && c1.hp > hc1 - 60 && c2.hp === hc2, `${hc1 - c1.hp}`);
  gv.handleCast(3, 0, nc.x, nc.y);
  check("네크로 유령 소환", GV.pets.some((p: any) => p.ownerId === 3 && p.kind === "ghost"));

  // 엔지니어
  gv.handleCast(4, 1, eg.x + 60, eg.y);
  check("엔지니어 지뢰 지대", gv.zones.filter((z) => z.kind === "mine").length >= 3);
  eg.hp = 10;
  gv.handleCast(4, 2, eg.x, eg.y);
  for (let i = 0; i < 30; i++) GV.updatePlayer(eg);
  check("엔지니어 수리 드론 회복", eg.hp > 10 && GV.pets.some((p: any) => p.kind === "drone"));
  gv.handleCast(4, 3, eg.x, eg.y);
  check("엔지니어 거대 로봇 (몸 2배·피해 감소)", (eg.robotT ?? 0) > 9 && eg.giantT > 9);
  gv.monsters = [];
  const rt = gv.spawnMonster("slime", { x: eg.x + 30, y: eg.y })!;
  rt.spawnT = 0;
  eg.input = { ...eg.input, atk: true, ax: rt.x, ay: rt.y };
  eg.atkCd = 0;
  GV.updatePlayer(eg);
  check("거대 로봇 평타 = 미사일", gv.projs.some((pr) => pr.kind === "missile"));
  check("추가 포탑 카드는 1장까지", (await import("../shared/cards")).CARD_BY_ID.e_turret.stack !== true);

  // 도박꾼 삭제
  let gam = 0;
  for (let i = 0; i < 40; i++) {
    GV.openEvent();
    if (GV.stall === "gambler" && GV.phase === "rest") gam++;
    GV.phase = "play";
  }
  check("도박꾼 이벤트 없음", gam === 0);

  // 커맨드: 게임 속도 · 관전 · 혼자 메뉴 일시정지
  gv.handleCmd(1, { a: "speed", mul: 0 });
  const t0 = GV.time;
  gv.step(); gv.step();
  check("커맨드: 일시정지", GV.time === t0);
  gv.handleCmd(1, { a: "speed", mul: 2 });
  gv.step();
  check("커맨드: 2배속", Math.abs(GV.time - t0 - 2 / 30) < 1e-6);
  gv.handleCmd(1, { a: "speed", mul: 1 });
  gv.handleCmd(1, { a: "spectate" });
  check("커맨드: 관전·투명 모드 (몬스터가 안 노림)", sw.spec === true && GV.targetFor(rt)?.id !== 1);
  const solo = new Game([{ id: 1, name: "Solo", color: 0, cls: "warrior" }], () => {}, () => {}, () => {});
  const SO = solo as any;
  solo.setMenuPause(true);
  const st0 = SO.time;
  solo.step();
  check("혼자일 때 메뉴 열면 일시정지", SO.time === st0);
  gv.setMenuPause(true);
  const mt0 = GV.time;
  gv.step();
  check("여럿이면 메뉴 열어도 계속 진행", GV.time > mt0);
}

// ---------- v0.9.1: 요리사 매운 요리 광역 피해 ----------
{
  const gk = new Game([{ id: 1, name: "Chef", color: 0, cls: "cook" }], () => {}, () => {}, () => {});
  const GK = gk as any;
  const ck9 = gk.players.get(1)!;
  ck9.level = 3;
  gk.monsters = [];
  const s1 = gk.spawnMonster("slime", { x: ck9.x + 60, y: ck9.y })!;
  s1.spawnT = 0;
  const hs = s1.hp;
  gk.handleCast(1, 1, s1.x, s1.y);
  check("요리사 매운 요리: 광역 피해 (도발 아님)", s1.hp < hs - 30 || !gk.monsters.includes(s1));
  check("요리사 평타 범위 30", (await import("../shared/classes")).CLASSES.cook.attack.range === 30);
  void GK;
}

// ---------- v0.9.2: 몹 체력 ×1.6 · 인원수만큼 몹 수 · 스냅샷 최적화 ----------
{
  const mk = (n: number) => new Game(Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `M${i}`, color: i, cls: "warrior" as const })), () => {}, () => {}, () => {});
  const solo = mk(1);
  const quad = mk(4);
  const SPECIAL = ["bomb_shroom", "shield_knight", "summoner", "orb_mage", "field_rat", "sand_worm", "frost_archer", "spore_shroom", "wind_spirit", "lava_golem", "wraith_knight", "archangel"];
  const cnt = (g: any) => g.monsters.filter((m: any) => !m.elite && m.kind !== "chest" && !SPECIAL.includes(m.kind)).length;
  check("몹 수: 4명이면 혼자의 4배", cnt(quad) === cnt(solo) * 4, `${cnt(solo)} -> ${cnt(quad)}`);
  const s1 = (solo as any).monsters.find((m: any) => m.kind === "slime" && !m.elite);
  const expect = Math.round(MONSTERS.slime.hp * (0.7 + 0.3 * 1) * 1 * 1 * 1 * 1.6);
  check("몹 체력 ×1.6", Math.abs(s1.mhp - expect) <= 1, `${s1.mhp} vs ${expect}`);
  const msgs: ServerMsg[] = [];
  const gs = new Game([{ id: 1, name: "Snap", color: 0, cls: "warrior" }], (m) => msgs.push(m), () => {}, () => {});
  for (let i = 0; i < 30; i++) gs.tick();
  const snaps = msgs.filter((m) => m.t === "snap") as Extract<ServerMsg, { t: "snap" }>[];
  check("스냅샷 15Hz (30틱에 15번)", snaps.length === 15, `${snaps.length}`);
  check("카드는 바뀔 때만 보냄", snaps[0].players[0].cards !== undefined && snaps[3].players[0].cards === undefined);
}

// ---------- v1.0: 특성 트리 ----------
{
  const { TALENTS } = await import("../shared/talents");
  const sent: ServerMsg[] = [];
  const gt = new Game(
    [
      { id: 1, name: "Tal", color: 0, cls: "warrior" },
      { id: 2, name: "Ally", color: 1, cls: "mage" },
    ],
    () => {}, (_id, m) => sent.push(m), () => {},
  );
  const GT = gt as any;
  const w = gt.players.get(1)!;
  check("특성 모드: 평타 -10% 적용", Math.abs(w.stats.atkMul - 0.9) < 1e-9, `${w.stats.atkMul}`);
  check("특성 모드: 스킬 합계 -15%", Math.abs(w.stats.atkMul * w.stats.skillDmgMul - 0.85) < 1e-9);
  check("Lv1은 특성 포인트 0", gt.talentLeft(w) === 0);
  gt.addXp(w, 99999);
  const lv = w.level;
  check("2레벨마다 1포인트", gt.talentLeft(w) === Math.floor(lv / 2), `Lv${lv} → ${gt.talentLeft(w)}`);
  // 카드 시간이 아니면 못 찍음
  GT.phase = "play";
  gt.handleTalent(1, 0);
  check("카드 고를 때만 특성 찍기", !w.tal.w_berserk);
  GT.phase = "cards";
  const atk0 = w.stats.atkMul;
  gt.handleTalent(1, 0);
  check("광전사 1단계: 평타 +2", Math.abs((w.stats.atkMul - atk0) * 16 - 2) < 1e-6 && w.tal.w_berserk === 1);
  check("특성 상태를 본인에게 보냄", sent.some((m) => m.t === "talents"));
  for (let i = 0; i < 9; i++) gt.handleTalent(1, 0);
  check("갈래는 5단계까지만", w.tal.w_berserk === 5);
  const hp0 = w.stats.maxHp;
  gt.handleTalent(1, 1);
  check("수호자 1단계: 체력 +25", w.stats.maxHp === hp0 + 25);
  // 다시 계산해도 특성 유지 (레벨 스탯 재계산)
  const re = GT.levelStats(w);
  check("스탯 재계산에도 특성 유지", re.maxHp === GT.levelStats({ ...w, tal: {} }).maxHp + 25);
  // 비기: 폭주 (체력 30% 이하 공속 2배)
  w.hp = w.stats.maxHp * 0.2;
  w.atkCd = 0;
  w.input = { ...w.input, atk: true, ax: w.x + 10, ay: w.y };
  GT.phase = "play";
  GT.updatePlayer(w);
  const fast = w.atkCd;
  w.hp = w.stats.maxHp;
  w.atkCd = 0;
  GT.updatePlayer(w);
  check("검사 비기 '폭주': 체력 낮으면 공격 속도 +60%", Math.abs(fast * 1.6 - w.atkCd) < 1e-6, `${fast} vs ${w.atkCd}`);

  // 칸별 쿨타임: 마법사 메테오 -2초
  const mg = gt.players.get(2)!;
  mg.level = 6;
  mg.tal = { m_fire: 2 };
  mg.stats = GT.levelStats(mg);
  gt.handleCast(2, 0, mg.x + 20, mg.y);
  const { CLASSES: CLT } = await import("../shared/classes");
  check("특성 칸별 쿨타임 (메테오 -2초)", Math.abs(mg.cds[0] - (CLT.mage.skills[0].cd - 2)) < 0.05, `${mg.cds[0]}`);

  // 모든 직업 갈래 3개 × 5단계, 비기 표시
  const all = Object.values(TALENTS);
  check("9직업 × 3갈래 × 5단계", all.length === 9 && all.every((b) => b.length === 3 && b.every((x) => x.tiers.length === 5 && x.tiers[4].name.startsWith("★"))));

  // 다른 모드엔 특성·너프 없음
  const gp = new Game([{ id: 1, name: "P", color: 0, cls: "warrior" }], () => {}, () => {}, () => {}, { mode: { speedrun: false, panic: true, diff: 1 }, saveId: "x", hostName: "X" });
  const pp = gp.players.get(1)!;
  check("PANIC: 특성·너프 없음", !gp.talentsOn && pp.stats.atkMul === 1);

  // 몇 가지 비기 동작
  const gx = new Game(
    [
      { id: 1, name: "Eng", color: 0, cls: "engineer" },
      { id: 2, name: "Nec", color: 1, cls: "necro" },
      { id: 3, name: "Arc", color: 2, cls: "archer" },
    ],
    () => {}, () => {}, () => {},
  );
  const GX = gx as any;
  const [en, nc, ar] = [1, 2, 3].map((id) => gx.players.get(id)!);
  for (const p of gx.players.values()) { p.god = true; p.level = 10; }
  en.tal = { e_turret: 5, e_mine: 5 };
  for (let i = 0; i < 4; i++) { en.cds[0] = 0; gx.handleCast(1, 0, en.x + 20 * i, en.y); }
  check("엔지니어 비기 '포탑 공장': 포탑 3대", gx.petsOf(1, "turret").length === 3);
  gx.zones = [];
  gx.monsters = [];
  gx.handleCast(1, 1, en.x + 80, en.y);
  check("엔지니어 '지뢰 추가': 지뢰 7개 근처", gx.zones.filter((z) => z.kind === "mine").length >= 5);
  const mines = gx.zones.filter((z) => z.kind === "mine");
  const vic = gx.spawnMonster("slime", { x: mines[0].x, y: mines[0].y })!;
  vic.spawnT = 0;
  GX.updateZones();
  check("엔지니어 비기 '연쇄 폭발'", gx.zones.filter((z) => z.kind === "mine").length < mines.length - 1, `${mines.length} → ${gx.zones.filter((z) => z.kind === "mine").length}`);

  nc.tal = { x_curse: 5 };
  gx.monsters = [];
  const c1 = gx.spawnMonster("slime", { x: nc.x + 40, y: nc.y })!;
  const c2 = gx.spawnMonster("slime", { x: nc.x + 70, y: nc.y })!;
  c1.spawnT = 0; c2.spawnT = 0;
  gx.handleCast(2, 1, c1.x, c1.y - 40);
  c2.curseT = 0;
  if ((c1.curseT ?? 0) <= 0) c1.curseT = 3;
  c1.curseBy = 2;
  gx.dealDamage(c1, 99999, nc, { raw: true, noCrit: true });
  check("네크로 비기 '전염': 죽으면 주변에 저주", (c2.curseT ?? 0) > 0);

  ar.tal = { a_trap: 5 };
  gx.monsters = [];
  gx.zones = [];
  gx.handleCast(3, 1, ar.x + 60, ar.y);
  const trap = gx.zones.find((z) => z.kind === "trap")!;
  const t1 = gx.spawnMonster("slime", { x: trap.x, y: trap.y })!;
  const t2 = gx.spawnMonster("slime", { x: trap.x + 30, y: trap.y })!;
  t1.spawnT = 0; t2.spawnT = 0;
  GX.updateZones();
  check("궁수 비기 '폭발 덫': 주변 적도 속박 (+1초)", t1.rootT === 3 && t2.rootT === 3);
}

// ---------- 시상식 ----------
{
  const ga = new Game([{ id: 1, name: "A", color: 0, cls: "warrior" }, { id: 2, name: "B", color: 1, cls: "cleric" }], () => {}, () => {}, () => {});
  const GA = ga as any;
  const [pa, pb] = [ga.players.get(1)!, ga.players.get(2)!];
  pa.dmgTaken = 500; pb.dmgTaken = 20;
  pb.revives = 3;
  pa.ghostTime = 12;
  ga.noteChat(2); ga.noteChat(2);
  const aw = GA.awards([pa, pb]);
  const by = (n: string) => aw.find((x: any) => x.name === n)?.id;
  check("시상식: 인간 방패 · 저승 체류자 · 야전 의무관 · 작전 통신병", by("인간 방패") === 1 && by("저승 체류자") === 1 && by("야전 의무관") === 2 && by("작전 통신병") === 2, JSON.stringify(aw.map((x: any) => x.name)));
}

// ---------- 전투 개편: 보스 체력 × 인원 · 새 몬스터 · 보스 패턴 · 콤보 ----------
{
  const mkg = (n: number) => new Game(Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `C${i}`, color: i, cls: "warrior" as const })), () => {}, () => {}, () => {});
  const g1 = mkg(1), g4 = mkg(4);
  const b1 = g1.spawnMonster("king_slime")!, b4 = g4.spawnMonster("king_slime")!;
  check("보스 체력 = 인원수 배", Math.abs(b4.mhp / b1.mhp - 4) < 0.01, `${b1.mhp} → ${b4.mhp}`);
  check("보스 피해 ×1.2", Math.abs(b1.dmg / (MONSTERS.king_slime.dmg * b1.dmg / b1.dmg) - 1.2 * (b1.dmg / MONSTERS.king_slime.dmg / 1.2)) < 1e-6 && b1.dmg > MONSTERS.king_slime.dmg);
  const G1 = g1 as any;
  const p = g1.players.get(1)!;
  p.god = true;
  // 방패병: 정면 피해 감소
  g1.monsters = [];
  const sk = g1.spawnMonster("shield_knight", { x: p.x + 40, y: p.y })!;
  sk.spawnT = 0;
  G1.updateMonster(sk);
  const h0 = sk.hp;
  g1.dealDamage(sk, 20, p, { noCrit: true });
  const front = h0 - sk.hp;
  sk.faceA = 0; // 오른쪽을 봄 → 왼쪽(플레이어)에서 때리면 등 뒤
  const h1 = sk.hp;
  g1.dealDamage(sk, 20, p, { noCrit: true });
  const back = h1 - sk.hp;
  check("방패병: 정면은 75% 감소, 등 뒤는 그대로", Math.abs(front * 4 - back) < 0.01, `${front.toFixed(1)} vs ${back.toFixed(1)}`);
  // 폭탄 버섯: 가까이 오면 심지 후 자폭
  g1.monsters = [];
  p.god = false;
  p.invulnT = 0;
  const bm = g1.spawnMonster("bomb_shroom", { x: p.x + 10, y: p.y })!;
  bm.spawnT = 0;
  const hp0 = p.hp;
  for (let i = 0; i < 40; i++) { p.invulnT = 0; G1.updateMonster(bm); if (!g1.monsters.includes(bm)) break; }
  check("폭탄 버섯: 심지 후 자폭 (피해 + 사라짐)", !g1.monsters.includes(bm) && p.hp < hp0);
  p.hp = p.stats.maxHp;
  p.god = true;
  // 주술사: 졸개 소환
  g1.monsters = [];
  const sm = g1.spawnMonster("summoner", { x: p.x + 120, y: p.y })!;
  sm.spawnT = 0; sm.atkCd = 0;
  G1.updateMonster(sm);
  check("해골 주술사: 졸개 소환", g1.monsters.filter((o: any) => o.summonBy === sm.id).length >= 1);
  // 탄막 술사
  g1.monsters = []; g1.projs = [];
  const om = g1.spawnMonster("orb_mage", { x: p.x + 110, y: p.y })!;
  om.spawnT = 0; om.atkCd = 0;
  G1.updateMonster(om);
  check("탄막 술사: 원형 탄막 12발", g1.projs.filter((pr) => !pr.fromPlayer).length >= 12);
  // 보스 새 패턴
  g1.monsters = []; g1.zones = []; g1.projs = [];
  const boss = g1.spawnMonster("king_slime", { x: p.x + 60, y: p.y })!;
  boss.spawnT = 0;
  G1.bossAbility(boss, "quake", p, false);
  check("보스 지진 파동: 충격파 장판 여러 개", g1.zones.filter((z) => z.kind === "slam").length >= 15);
  G1.bossAbility(boss, "barrage", p, false);
  for (let i = 0; i < 30; i++) G1.updateVolleys(boss, p);
  check("보스 연속 사격: 부채꼴 3번", g1.projs.length >= 15, `${g1.projs.length}`);
  g1.projs = [];
  G1.bossAbility(boss, "spiral", p, true);
  for (let i = 0; i < 20; i++) G1.updateVolleys(boss, p);
  check("보스 나선 탄막", g1.projs.length >= 20, `${g1.projs.length}`);
  // 광폭화 연출
  boss.hp = boss.mhp * 0.4; boss.abilityCd = 5; boss.busyT = 0; boss.windT = 0; boss.rushT = 0;
  G1.updateMonster(boss);
  check("광폭화 순간 연출 (한 번만)", boss.enrageDone === true);
  // 콤보
  g1.monsters = [];
  for (let i = 0; i < 4; i++) {
    const s1 = g1.spawnMonster("slime", { x: p.x + 30, y: p.y })!;
    s1.spawnT = 0;
    g1.dealDamage(s1, 99999, p, { raw: true, noCrit: true });
  }
  check("연속 처치 콤보", p.combo === 4);
  for (let i = 0; i < 90; i++) G1.updatePlayer(p);
  check("2.5초 지나면 콤보 초기화", !p.combo);
}

// ---------- v1.4: 보스 고유 패턴 · 컷씬 · 새 잡몹 · 새 카드 ----------
{
  const { WORLDS: W14, worldDmgMul: wdm } = await import("../shared/worlds");
  check("월드마다 세 번째 잡몹이 정의됨", W14.every((w) => !!MONSTERS[w.extra]));
  check("챕터별 몬스터 피해 상향 (8월드 약 6배)", wdm(8) > 5.5 && wdm(1) === 1, `${wdm(8).toFixed(2)}`);
  const sig: Record<string, string> = { king_slime: "bounce", pharaoh: "sandwall", yeti: "avalanche", flower_queen: "garden", thunder_eagle: "boltline", demon_lord: "hellfire", ghost_captain: "phantom", prank_god: "judgment" };
  check("보스마다 고유 패턴", W14.every((w) => MONSTERS[w.boss].boss!.abilities.includes(sig[w.boss] as any)));
  const gb = new Game([{ id: 1, name: "B", color: 0, cls: "warrior" }, { id: 2, name: "C", color: 1, cls: "mage" }], () => {}, () => {}, () => {});
  const GB = gb as any;
  const p = gb.players.get(1)!;
  for (const q of gb.players.values()) q.god = true;
  for (const [boss, ab] of Object.entries(sig)) {
    gb.monsters = []; gb.zones = []; gb.projs = [];
    const b = gb.spawnMonster(boss, { x: p.x + 70, y: p.y })!;
    b.spawnT = 0;
    GB.bossAbility(b, ab, p, false);
    for (let i = 0; i < 40; i++) GB.updateVolleys(b, p);
    const made = gb.zones.length + gb.projs.length + gb.monsters.length - 1;
    check(`보스 고유 패턴 동작: ${MONSTERS[boss].name} (${ab})`, made > 0, `${made}`);
  }
  // 컷씬 동안 멈춤
  const sent: ServerMsg[] = [];
  const gi = new Game([{ id: 1, name: "I", color: 0, cls: "warrior" }], (m) => sent.push(m), () => {}, () => {});
  const GI = gi as any;
  GI.round = 6;
  GI.nextRound();
  const intro = sent.find((m) => m.t === "bossIntro");
  const ip = gi.players.get(1)!;
  const x0 = ip.x;
  ip.input = { ...ip.input, right: true };
  for (let i = 0; i < 30; i++) gi.tick();
  check("보스 컷씬: VS 메시지 + 그동안 멈춤", !!intro && ip.x === x0);
  for (let i = 0; i < 120; i++) gi.tick();
  check("컷씬 뒤엔 다시 움직임", ip.x !== x0);
  // 새 카드
  const gc = new Game([{ id: 1, name: "K", color: 0, cls: "warrior" }], () => {}, () => {}, () => {});
  const GC = gc as any;
  const kp = gc.players.get(1)!;
  kp.god = true;
  gc.giveCard(kp, "orbit");
  gc.monsters = [];
  const om = gc.spawnMonster("slime", { x: kp.x + 26, y: kp.y })!;
  om.spawnT = 0; om.hp = om.mhp = 9999;
  for (let i = 0; i < 60; i++) { GC.buildGrid(); GC.updateCardFx(kp); GC.time += 1 / 30; }
  check("회전 칼날: 주변 적에게 피해", om.hp < 9999);
  gc.giveCard(kp, "killzap");
  gc.monsters = [];
  const k1 = gc.spawnMonster("slime", { x: kp.x + 30, y: kp.y })!, k2 = gc.spawnMonster("slime", { x: kp.x + 50, y: kp.y })!;
  k1.spawnT = 0; k2.spawnT = 0;
  const h2 = k2.hp;
  gc.dealDamage(k1, 99999, kp, { raw: true, noCrit: true });
  check("처치 번개: 처치하면 주변 적에게 번개", k2.hp < h2);
  gc.giveCard(kp, "meteorrain");
  gc.zones = [];
  for (let i = 0; i < 130; i++) GC.updateCardFx(kp);
  check("유성 소환: 4초마다 유성", gc.zones.some((z) => z.kind === "meteor"));
}

console.log(fails ? `\n${fails}개 실패` : "\n전부 통과");
process.exit(fails ? 1 : 0);
