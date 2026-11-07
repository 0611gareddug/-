import { isWallAt } from "../shared/collide";
import { CLASSES } from "../shared/classes";
import { tier } from "../shared/talents";
import type { Game, Player } from "./game";

/** 사거리 안으로 조준점을 당긴다 */
function clampTarget(p: Player, x: number, y: number, range: number) {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= range || d === 0) return { x, y, a: Math.atan2(dy, dx), d };
  return { x: p.x + (dx / d) * range, y: p.y + (dy / d) * range, a: Math.atan2(dy, dx), d: range };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const vx = x2 - x1, vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / len2));
  return Math.hypot(px - (x1 + vx * t), py - (y1 + vy * t));
}

export function castSkill(g: Game, p: Player, slot: number, x: number, y: number) {
  const def = CLASSES[p.cls].skills[slot];
  // 스킬 범위: 배율 + 고정 반경(카드 '큰 손')을 이 스킬 반경 기준으로 환산
  const area = p.stats.skillAreaMul + p.stats.areaFlat / Math.max(20, def.radius || 40);
  const t = clampTarget(p, x, y, def.range || 1);
  const key = `${p.cls}${slot}`;
  /** 이 갈래를 몇 단계 찍었는지 */
  const tl = (id: string) => tier(p.tal, id);

  switch (key) {
    // ---------- 검사 ----------
    case "warrior0": {
      const r = def.radius * area * (p.stats.tauntBoost ? 2 : 1);
      p.tauntT = 4 + (p.stats.tauntBoost ? 3 : 0);
      p.tauntR = r;
      g.fx.push({ k: "taunt", x: p.x, y: p.y, r });
      break;
    }
    case "warrior1": {
      const range = def.range * (p.stats.chargeBoost ? 1.5 : 1);
      const c = clampTarget(p, x, y, range);
      g.startDash(p, Math.cos(c.a), Math.sin(c.a), Math.max(0.08, c.d / 300), 300, true);
      break;
    }
    case "warrior2": {
      const len = def.range * area;
      const w = def.radius * area;
      const hit = new Set<number>();
      for (const off of tl("w_blade") >= 5 ? [-0.4, 0, 0.4] : [0]) {
        const ex = p.x + Math.cos(t.a + off) * len;
        const ey = p.y + Math.sin(t.a + off) * len;
        g.fx.push({ k: "line", x: p.x, y: p.y, r: w, pts: [Math.round(ex), Math.round(ey)] });
        for (const m of [...g.monsters]) {
          if (m.spawnT > 0 || hit.has(m.id)) continue;
          if (distToSegment(m.x, m.y, p.x, p.y, ex, ey) < w + m.r) { hit.add(m.id); g.dealDamage(m, off ? 20 : 35, p, { skill: true }); }
        }
      }
      break;
    }
    case "warrior3":
      p.giantT = 8;
      g.fx.push({ k: "taunt", x: p.x, y: p.y, r: 40 });
      break;

    // ---------- 궁수 ----------
    case "archer0": {
      const boost = p.stats.rainBoost ? 1.5 : 1;
      g.addZone("rain", t.x, t.y, def.radius * area * boost, p.id, 8, 2 + (p.stats.rainBoost ? 2 : 0));
      break;
    }
    case "archer1": {
      const mine = g.zones.filter((z) => z.kind === "trap" && z.ownerId === p.id);
      if (mine.length >= 3 + (tl("a_trap") >= 2 ? 1 : 0)) g.zones = g.zones.filter((z) => z !== mine[0]);
      g.addZone("trap", t.x, t.y, def.radius * area, p.id, 10, 30);
      break;
    }
    case "archer2": {
      g.startDash(p, -Math.cos(t.a), -Math.sin(t.a), 0.15, 220, false);
      for (let i = -2; i <= 2; i++) {
        g.fireProj(p, "arrow", t.a + i * 0.15, 240, 0.8, 10, { skill: true });
      }
      break;
    }
    case "archer3": {
      const pr = g.fireProj(p, "bigarrow", t.a, 320, def.range / 320, 80, { skill: true });
      pr.pierce = 999;
      pr.bounce = 0;
      pr.hitR = 10 * area;
      break;
    }

    // ---------- 마법사 ----------
    case "mage0": {
      const r = def.radius * area;
      g.addZone("meteor", t.x, t.y, r, p.id, 60, 0.8);
      if (p.stats.twinMeteor) {
        const a = Math.random() * Math.PI * 2;
        g.addZone("meteor", t.x + Math.cos(a) * 30, t.y + Math.sin(a) * 30, r, p.id, 60, 1.1);
        if (tl("m_fire") >= 5) g.addZone("meteor", t.x - Math.cos(a) * 30, t.y - Math.sin(a) * 30, r, p.id, 25, 1.4);
      }
      break;
    }
    case "mage1":
      g.addZone("ice", t.x, t.y, def.radius * area, p.id, 0, 3);
      break;
    case "mage2": {
      // 벽 안으로는 못 가니 조준선을 따라 뒤로 물러나며 빈 칸을 찾음
      let tx = t.x, ty = t.y;
      for (let k = 0; k < 20 && isWallAt(g.map, tx, ty); k++) {
        tx -= Math.cos(t.a) * 6;
        ty -= Math.sin(t.a) * 6;
      }
      const ox = p.x, oy = p.y;
      p.x = tx;
      p.y = ty;
      p.invulnT = Math.max(p.invulnT, 0.3);
      g.fx.push({ k: "blink", x: Math.round(ox), y: Math.round(oy), pts: [Math.round(tx), Math.round(ty)] });
      g.explode(ox, oy, def.radius * area, 30, p, true);
      if (tl("m_arcane") >= 5) {
        // 마법사 특성 '연속 도약': 한 번 더 바로 쓸 수 있음
        if (!p.blink2) { p.blink2 = true; p.cds[slot] = 0.4; } else p.blink2 = false;
      }
      break;
    }
    case "mage3":
      g.addZone("blackhole", t.x, t.y, def.radius * area, p.id, 5, 3);
      break;

    // ---------- 성직자 ----------
    case "cleric0": {
      const r = def.radius * area;
      g.fx.push({ k: "heal", x: p.x, y: p.y, r });
      for (const q of g.players.values()) {
        if (q.ghost || Math.hypot(q.x - p.x, q.y - p.y) > r) continue;
        q.hp = Math.min(q.stats.maxHp, q.hp + q.stats.maxHp * 0.4);
        if (p.stats.blessLight) q.buffAtkT = 5;
        if (tl("c_heal") >= 5) q.regenT = 3;
      }
      break;
    }
    case "cleric1": {
      const allies = [...g.players.values()]
        .filter((q) => !q.ghost)
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))
        .slice(0, p.stats.doubleShield ? 2 : 1);
      for (const q of allies) {
        q.shield = 40 * (p.stats.doubleShield ? 2 : 1) * (tl("c_ward") >= 3 ? 1.5 : 1);
        q.shieldT = 8;
        q.shieldBy = tl("c_ward") >= 5 ? p.id : undefined;
        g.fx.push({ k: "shield", x: q.x, y: q.y });
      }
      break;
    }
    case "cleric2":
      g.addZone("hammer", t.x, t.y, def.radius * area, p.id, 40, 0.4, 1.5);
      if (tl("c_judge") >= 5) {
        g.addZone("hammer", t.x, t.y, def.radius * area, p.id, 14, 0.75, 0.3);
        g.addZone("hammer", t.x, t.y, def.radius * area, p.id, 14, 1.1, 0.3);
      }
      break;
    // ---------- 요리사 ----------
    case "cook0": {
      const r = def.radius * area * (p.stats.bigPot ? 1.3 : 1);
      const heal = 0.25 * (p.stats.bigPot ? 2 : 1);
      // 요리사 특성 '두 접시': 2번째 접시는 나(또는 조준점 반대편 동료) 쪽으로
      const spots = [{ x: t.x, y: t.y }];
      if (tl("k_nutri") >= 5) {
        const far = [...g.players.values()]
          .filter((q) => !q.ghost && Math.hypot(q.x - t.x, q.y - t.y) > r)
          .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
        spots.push(far ? { x: far.x, y: far.y } : { x: t.x + 30, y: t.y });
      }
      for (const s of spots) {
        g.fx.push({ k: "food", x: Math.round(s.x), y: Math.round(s.y), r, pts: [Math.round(p.x), Math.round(p.y)] });
        for (const q of g.players.values()) {
          if (q.ghost || Math.hypot(q.x - s.x, q.y - s.y) > r) continue;
          q.hp = Math.min(q.stats.maxHp, q.hp + q.stats.maxHp * heal);
        }
      }
      break;
    }
    case "cook1":
      // 매운 요리: 메테오(60)의 0.7배 광역 피해
      g.explode(t.x, t.y, def.radius * area, 42, p, true);
      g.fx.push({ k: "flame", x: Math.round(t.x), y: Math.round(t.y), a: -Math.PI / 2, r: Math.round(def.radius * area) });
      if (tl("k_fire") >= 5) g.addZone("fire", t.x, t.y, def.radius * area * 0.8, p.id, 3, 3);
      break;
    case "cook2":
      g.addZone("oil", t.x, t.y, def.radius * area, p.id, 0, 6);
      break;
    case "cook3": {
      const r = def.radius * area;
      g.fx.push({ k: "heal", x: p.x, y: p.y, r });
      for (const q of g.players.values()) {
        if (q.ghost || Math.hypot(q.x - p.x, q.y - p.y) > r) continue;
        q.hp = q.stats.maxHp;
        q.feastT = 10;
        q.feastFast = tl("k_buffet") >= 5;
      }
      break;
    }

    // ---------- 바드 ----------
    // 바드 1번: 앙코르 (v0.9, 쿨 12초) — 자신의 앙코르는 제외하고 주변 동료 쿨타임 초기화
    case "bard0": {
      const r = def.radius * area;
      g.fx.push({ k: "encore", x: p.x, y: p.y, r });
      for (const q of g.players.values()) {
        if (q.ghost || Math.hypot(q.x - p.x, q.y - p.y) > r) continue;
        // 각성기(5번)는 초기화하지 않음
        q.cds = q.cds.map((c, i) => ((q === p && i === 0) || i === 4 ? c : 0));
      }
      break;
    }
    case "bard1": {
      const r = def.radius * area;
      g.fx.push({ k: "sleep", x: Math.round(t.x), y: Math.round(t.y), r });
      for (const m of g.monsters) {
        if (m.spawnT > 0 || m.kind === "dummy" || m.kind === "chest" || m.kind === "pvp") continue;
        if (Math.hypot(m.x - t.x, m.y - t.y) > r + m.r) continue;
        // 보스는 짧게만 잠듦
        m.stunT = Math.max(m.stunT, m.def.boss ? 0.8 : 2 + (tl("b_lull") >= 3 ? 1 : 0));
        m.sleep = true;
        m.nightmare = tl("b_lull") >= 5 ? p.id : undefined;
      }
      break;
    }
    case "bard2":
      g.addZone("discord", p.x, p.y, def.radius * area * (p.stats.loud ? 1.5 : 1) * (tl("b_noise") >= 5 ? 1.1 : 1), p.id, 6, tl("b_noise") >= 5 ? 5 : 4);
      break;
    // ---------- 엔지니어 (v0.9 개편) ----------
    case "engineer0": {
      // 포탑 설치: 최대 2대, 12초
      const mine = g.petsOf(p.id, "turret");
      if (mine.length >= (tl("e_turret") >= 5 ? 3 : 2)) g.removePet(mine[0].id);
      const at = isWallAt(g.map, t.x, t.y) ? { x: p.x, y: p.y } : { x: t.x, y: t.y };
      g.summon(p, "turret", 12 + (tl("e_turret") >= 3 ? 4 : 0), at);
      g.fx.push({ k: "shield", x: Math.round(at.x), y: Math.round(at.y) });
      break;
    }
    case "engineer1": {
      // 지뢰 지대: 5개
      const r = def.radius * area;
      const count = 5 + (tl("e_mine") >= 2 ? 2 : 0);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const d = i === 0 ? 0 : r * (0.45 + Math.random() * 0.55);
        const x = t.x + Math.cos(a) * d;
        const y = t.y + Math.sin(a) * d;
        if (isWallAt(g.map, x, y)) continue;
        g.addZone("mine", x, y, 10, p.id, 10, 20);
      }
      break;
    }
    case "engineer2":
      // 수리 드론: 6초
      p.droneT = 6;
      g.summon(p, "drone", 6);
      g.fx.push({ k: "heal", x: p.x, y: p.y, r: def.radius * area });
      break;
    case "engineer3":
      // 거대 로봇: 10초간 몸 2배 · 받는 피해 -50% · 평타 미사일
      p.robotT = 10 + (tl("e_repair") >= 4 ? 3 : 0);
      p.giantT = p.robotT;
      g.fx.push({ k: "boom", x: p.x, y: p.y, r: 30 });
      break;

    // ---------- 닌자 ----------
    case "ninja0": {
      const a = Math.atan2(y - p.y, x - p.x);
      for (const off of p.stats.shurikenPlus ? [-0.36, -0.18, 0, 0.18, 0.36] : [-0.18, 0, 0.18]) {
        const pr = g.fireProj(p, "shuriken", a + off, 270, 0.7, 13, { skill: true });
        pr.pierce = 1 + (tl("n_shur") >= 3 ? 1 : 0);
        pr.boomer = tl("n_shur") >= 5;
      }
      // 닌자 특성 '그림자 군단': 분신도 표창을 던짐
      if (tl("n_shadow") >= 5) {
        for (const sh of g.petsOf(p.id, "shadow")) {
          const pr = g.fireProj(p, "shuriken", Math.atan2(y - sh.y, x - sh.x), 270, 0.7, 8, { skill: true });
          pr.x = sh.x;
          pr.y = sh.y;
        }
      }
      break;
    }
    case "ninja1":
      // 연막탄: 3초 은신 + 다음 공격 2배
      p.stealthT = 3;
      p.nextDouble = true;
      g.fx.push({ k: "boom", x: p.x, y: p.y, r: def.radius * area });
      break;
    case "ninja2": {
      const life = 8 + (tl("n_shadow") >= 3 ? 3 : 0);
      for (const old of g.petsOf(p.id, "shadow")) g.removePet(old.id);
      for (let i = 0; i < (tl("n_shadow") >= 5 ? 3 : 2); i++) g.summon(p, "shadow", life);
      g.fx.push({ k: "blink", x: p.x, y: p.y });
      break;
    }
    case "ninja3": {
      // 천벌: 방패 돌진처럼 지정 위치로 돌진. 돌진 중 무적, 부딪힌 적은 보스 빼고 즉사
      const c = clampTarget(p, x, y, def.range);
      p.lethalDash = true;
      g.startDash(p, Math.cos(c.a), Math.sin(c.a), Math.max(0.1, c.d / 340), 340, true);
      g.fx.push({ k: "blink", x: p.x, y: p.y });
      break;
    }

    // ---------- 네크로맨서 ----------
    case "necro0":
      // 유령은 1체만
      for (const old of g.petsOf(p.id, "ghost")) g.removePet(old.id);
      for (let i = 0; i < (tl("x_summon") >= 5 ? 2 : 1); i++) g.summon(p, "ghost", 15 + (tl("x_summon") >= 2 ? 5 : 0));
      g.fx.push({ k: "blink", x: p.x, y: p.y });
      break;
    case "necro1": {
      const r = def.radius * area;
      g.addZone("curse", t.x, t.y, r, p.id, 0, 0.6);
      for (const m of g.monsters) {
        if (m.spawnT > 0 || m.kind === "dummy" || m.kind === "chest" || m.kind === "pvp") continue;
        if (Math.hypot(m.x - t.x, m.y - t.y) <= r + m.r) {
          m.curseT = Math.max(m.curseT ?? 0, 6 + p.stats.curseExt);
          m.curseBy = p.id;
          if (p.stats.curseBoost) m.curseBoost = true;
        }
      }
      break;
    }
    case "necro2": {
      const r = def.radius * area;
      g.addZone("curse", t.x, t.y, r, p.id, 0, 0.6);
      for (const m of g.monsters) {
        if (m.spawnT > 0 || m.kind === "dummy" || m.kind === "chest" || m.kind === "pvp") continue;
        if (Math.hypot(m.x - t.x, m.y - t.y) > r + m.r) continue;
        m.slowT = Math.max(m.slowT, 4);
        m.poisonT = Math.max(m.poisonT, 4);
        m.poisonDps = Math.max(m.poisonDps, 6 * p.stats.atkMul);
        m.poisonOwner = p.id;
        m.curseT = Math.max(m.curseT ?? 0, 4 + p.stats.curseExt);
        m.curseBy = p.id;
        if (p.stats.curseBoost) m.curseBoost = true;
      }
      break;
    }
    case "necro3": {
      // 죽음의 표식: 화면 안의 저주받은 적 모두에게 높은 피해
      const r = def.radius * area;
      let n = 0;
      for (const m of [...g.monsters]) {
        if ((m.curseT ?? 0) <= 0 || Math.hypot(m.x - p.x, m.y - p.y) > r) continue;
        // v0.9.1: 메테오(60)의 0.6배
        g.dealDamage(m, 36, p, { skill: true });
        g.fx.push({ k: "boom", x: Math.round(m.x), y: Math.round(m.y), r: 18 });
        n++;
      }
      if (!n) g.fx.push({ k: "sleep", x: p.x, y: p.y, r: 30 });
      break;
    }

    // ---------- v1.6 각성기 (5번, Lv15) ----------
    case "warrior4": {
      // 천지개벽: 전방 130° 넓은 베기
      const a0 = Math.atan2(y - p.y, x - p.x);
      const r = def.range * area;
      g.fx.push({ k: "swing", x: p.x, y: p.y, a: a0, r });
      g.fx.push({ k: "awaken", x: Math.round(p.x + Math.cos(a0) * r * 0.5), y: Math.round(p.y + Math.sin(a0) * r * 0.5), r: Math.round(r * 0.7) });
      for (const m of [...g.monsters]) {
        if (m.spawnT > 0) continue;
        const d = Math.hypot(m.x - p.x, m.y - p.y);
        if (d > r + m.r) continue;
        let diff = Math.atan2(m.y - p.y, m.x - p.x) - a0;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > 1.15) continue;
        g.dealDamage(m, 70, p, { skill: true });
        if (m.kind !== "pvp" && m.kind !== "dummy") m.stunT = Math.max(m.stunT, 1);
      }
      break;
    }
    case "archer4":
      // 별빛 화살비: 5초 동안 0.3초마다 주변 적 3명에게
      p.volleyT = 5;
      p.volleyTick = 0;
      g.fx.push({ k: "awaken", x: p.x, y: p.y, r: 40 });
      break;
    case "mage4": {
      // 대유성우: 2초 동안 유성 8개
      const r = def.radius * area;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * r;
        const mx = t.x + Math.cos(a) * d, my = t.y + Math.sin(a) * d;
        if (!isWallAt(g.map, mx, my)) g.addZone("meteor", mx, my, 35, p.id, 30, 0.6 + i * 0.2);
      }
      break;
    }
    case "cleric4":
      // 성역: 8초 동안 나를 따라오는 보호막 원
      p.sanctT = 8;
      g.fx.push({ k: "heal", x: p.x, y: p.y, r: def.radius });
      g.fx.push({ k: "awaken", x: p.x, y: p.y, r: 60 });
      break;
    case "engineer4":
      // 궤도 폭격: 1.5초 뒤 큰 폭발
      g.addZone("meteor", t.x, t.y, def.radius * area, p.id, 90, 1.5);
      break;
    case "cook4":
      // 만한전석: 6초 동안 주변 회복 + 공속
      p.banquetT = 6;
      g.fx.push({ k: "food", x: Math.round(p.x), y: Math.round(p.y), r: def.radius, pts: [Math.round(p.x), Math.round(p.y) - 30] });
      g.fx.push({ k: "awaken", x: p.x, y: p.y, r: 60 });
      break;
    case "bard4": {
      // 피날레: 주변 적 피해 + 기절, 주변 동료 쿨타임 절반
      const r = def.radius * area;
      g.fx.push({ k: "encore", x: p.x, y: p.y, r });
      g.fx.push({ k: "awaken", x: p.x, y: p.y, r: Math.round(r * 0.8) });
      for (const m of [...g.monsters]) {
        if (m.spawnT > 0 || Math.hypot(m.x - p.x, m.y - p.y) > r + m.r) continue;
        g.dealDamage(m, 50, p, { skill: true });
        if (m.kind !== "pvp" && m.kind !== "dummy") m.stunT = Math.max(m.stunT, m.def.boss ? 0.8 : 2.5);
      }
      for (const q of g.players.values()) {
        if (q.ghost || Math.hypot(q.x - p.x, q.y - p.y) > r) continue;
        q.cds = q.cds.map((c, i) => (i === 4 ? c : c / 2));
      }
      break;
    }
    case "ninja4": {
      // 그림자 난무: 무적 + 가까운 적 최대 10명을 차례로 베고 마지막 적 옆으로
      const r = def.radius * area;
      const targets = g.monsters
        .filter((m) => m.spawnT <= 0 && m.kind !== "dummy" && m.kind !== "chest" && Math.hypot(m.x - p.x, m.y - p.y) < r)
        .sort((m1, m2) => Math.hypot(m1.x - p.x, m1.y - p.y) - Math.hypot(m2.x - p.x, m2.y - p.y))
        .slice(0, 10);
      const pts: number[] = [Math.round(p.x), Math.round(p.y)];
      for (const m of targets) {
        pts.push(Math.round(m.x), Math.round(m.y));
        g.dealDamage(m, 45, p, { skill: true });
      }
      const last = targets[targets.length - 1];
      if (last && !isWallAt(g.map, last.x, last.y + 10)) { p.x = last.x; p.y = last.y + 10; }
      g.fx.push({ k: "blink", x: p.x, y: p.y, pts });
      g.fx.push({ k: "awaken", x: p.x, y: p.y, r: 40 });
      p.invulnT = Math.max(p.invulnT, 1.6);
      break;
    }
    case "necro4": {
      // 망자의 군대: 유령 4체 + 주변 적 모두 저주
      for (let i = 0; i < 4; i++) g.summon(p, "ghost", 10);
      const r = def.radius * area;
      for (const m of g.monsters) {
        if (m.spawnT > 0 || m.kind === "dummy" || m.kind === "chest" || m.kind === "pvp" || Math.hypot(m.x - p.x, m.y - p.y) > r) continue;
        m.curseT = Math.max(m.curseT ?? 0, 6 + p.stats.curseExt);
        m.curseBy = p.id;
        if (p.stats.curseBoost) m.curseBoost = true;
      }
      g.fx.push({ k: "awaken", x: p.x, y: p.y, r: 80 });
      break;
    }

    case "cleric3":
      for (const q of g.players.values()) {
        if (q.ghost) g.revive(q);
        q.hp = Math.min(q.stats.maxHp, q.hp + q.stats.maxHp * 0.5);
      }
      g.fx.push({ k: "heal", x: p.x, y: p.y, r: 120 });
      break;
  }
}
