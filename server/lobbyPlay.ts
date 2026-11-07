// 로비 미니게임: 양배추 축구 + 밀치기 (대기실에서 기다리는 동안)
// 자리 순서로 왼쪽(0) · 오른쪽(1) 팀 자동. 양배추를 상대 골대에 넣으면 1점.
import { LOBBY_FIELD_H, LOBBY_FIELD_W, LOBBY_GOAL_HALF } from "../shared/protocol";

const DT = 1 / 30;
const P_R = 7;
const B_R = 6;
const SPEED = 90;
const DASH_SPEED = 240;
const DASH_TIME = 0.16;
const DASH_CD = 1;

interface LPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 밀쳐진 속도 (점점 줄어듦) */
  kx: number;
  ky: number;
  dashT: number;
  dashCd: number;
  dashDx: number;
  dashDy: number;
  lastDash: number;
  team: number;
  input: LobbyInput;
}

export interface LobbyInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  dash: number;
}

export class LobbyPlay {
  players = new Map<number, LPlayer>();
  ball = { x: LOBBY_FIELD_W / 2, y: LOBBY_FIELD_H / 2, vx: 0, vy: 0 };
  score: [number, number] = [0, 0];
  /** 골 연출 남은 시간 / 넣은 팀 */
  goalT = 0;
  goalTeam = -1;
  private tickN = 0;

  /** 방 인원과 맞춤 (자리 순서대로 팀 번갈아) */
  sync(ids: number[]) {
    for (const id of [...this.players.keys()]) if (!ids.includes(id)) this.players.delete(id);
    ids.forEach((id, i) => {
      let p = this.players.get(id);
      const team = i % 2;
      if (!p) {
        p = {
          x: team === 0 ? LOBBY_FIELD_W * 0.25 : LOBBY_FIELD_W * 0.75,
          y: LOBBY_FIELD_H / 2 + ((i >> 1) % 3 - 1) * 30,
          vx: 0, vy: 0, kx: 0, ky: 0, dashT: 0, dashCd: 0, dashDx: 1, dashDy: 0, lastDash: 0, team,
          input: { up: false, down: false, left: false, right: false, dash: 0 },
        };
        this.players.set(id, p);
      }
      p.team = team;
    });
    if (!ids.length) this.score = [0, 0];
  }

  input(id: number, inp: Partial<LobbyInput>) {
    const p = this.players.get(id);
    if (!p) return;
    p.input = { up: !!inp.up, down: !!inp.down, left: !!inp.left, right: !!inp.right, dash: Number(inp.dash) || 0 };
  }

  /** 1틱 진행. 보낼 차례면 true */
  step(): boolean {
    this.tickN++;
    if (this.goalT > 0) {
      this.goalT -= DT;
      if (this.goalT <= 0) this.resetBall();
    }
    for (const p of this.players.values()) this.movePlayer(p);
    // 밀치기: 겹치면 떨어뜨리고, 대시 중이면 세게 밀어냄
    const list = [...this.players.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= P_R * 2) continue;
        const nx = dx / d, ny = dy / d;
        const push = (P_R * 2 - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        if (a.dashT > 0 && b.dashT <= 0) { b.kx += nx * 260; b.ky += ny * 260; a.dashT = 0; }
        else if (b.dashT > 0 && a.dashT <= 0) { a.kx -= nx * 260; a.ky -= ny * 260; b.dashT = 0; }
        else if (a.dashT > 0 && b.dashT > 0) { a.kx -= nx * 160; a.ky -= ny * 160; b.kx += nx * 160; b.ky += ny * 160; a.dashT = b.dashT = 0; }
      }
    }
    if (this.goalT <= 0) this.moveBall();
    return this.tickN % 2 === 0;
  }

  private movePlayer(p: LPlayer) {
    let mx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let my = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len) { mx /= len; my /= len; p.dashDx = mx; p.dashDy = my; }
    p.dashCd -= DT;
    if (p.input.dash !== p.lastDash) {
      p.lastDash = p.input.dash;
      if (p.dashCd <= 0) { p.dashT = DASH_TIME; p.dashCd = DASH_CD; }
    }
    if (p.dashT > 0) {
      p.dashT -= DT;
      p.vx = p.dashDx * DASH_SPEED;
      p.vy = p.dashDy * DASH_SPEED;
    } else {
      p.vx = mx * SPEED;
      p.vy = my * SPEED;
    }
    p.x += (p.vx + p.kx) * DT;
    p.y += (p.vy + p.ky) * DT;
    p.kx *= 0.85;
    p.ky *= 0.85;
    p.x = Math.max(P_R, Math.min(LOBBY_FIELD_W - P_R, p.x));
    p.y = Math.max(P_R, Math.min(LOBBY_FIELD_H - P_R, p.y));
  }

  private moveBall() {
    const b = this.ball;
    // 사람과 부딪히면 굴러감 (대시면 강슛)
    for (const p of this.players.values()) {
      const dx = b.x - p.x, dy = b.y - p.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= P_R + B_R) continue;
      const nx = dx / d, ny = dy / d;
      b.x = p.x + nx * (P_R + B_R);
      b.y = p.y + ny * (P_R + B_R);
      const kick = p.dashT > 0 ? 300 : 150;
      b.vx = nx * kick + (p.vx + p.kx) * 0.3;
      b.vy = ny * kick + (p.vy + p.ky) * 0.3;
    }
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.vx *= 0.975;
    b.vy *= 0.975;
    if (Math.abs(b.vx) < 2 && Math.abs(b.vy) < 2) { b.vx = 0; b.vy = 0; }
    const mid = LOBBY_FIELD_H / 2;
    const inMouth = Math.abs(b.y - mid) < LOBBY_GOAL_HALF - B_R / 2;
    // 골: 골대 입구 안으로 완전히 들어가면
    if (inMouth && b.x < -B_R) return this.goal(1);
    if (inMouth && b.x > LOBBY_FIELD_W + B_R) return this.goal(0);
    if (!inMouth) {
      if (b.x < B_R) { b.x = B_R; b.vx = Math.abs(b.vx) * 0.8; }
      if (b.x > LOBBY_FIELD_W - B_R) { b.x = LOBBY_FIELD_W - B_R; b.vx = -Math.abs(b.vx) * 0.8; }
    }
    if (b.y < B_R) { b.y = B_R; b.vy = Math.abs(b.vy) * 0.8; }
    if (b.y > LOBBY_FIELD_H - B_R) { b.y = LOBBY_FIELD_H - B_R; b.vy = -Math.abs(b.vy) * 0.8; }
  }

  private goal(team: number) {
    this.score[team]++;
    this.goalT = 1.5;
    this.goalTeam = team;
    this.ball.vx = this.ball.vy = 0;
  }

  private resetBall() {
    this.ball = { x: LOBBY_FIELD_W / 2, y: LOBBY_FIELD_H / 2, vx: 0, vy: 0 };
    this.goalTeam = -1;
  }

  snapshot() {
    return {
      t: "lobbyPlay" as const,
      p: [...this.players.entries()].map(([id, p]) => [id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.dashT > 0 ? 1 : 0, p.team] as [number, number, number, number, number]),
      b: [Math.round(this.ball.x * 10) / 10, Math.round(this.ball.y * 10) / 10] as [number, number],
      s: [...this.score] as [number, number],
      g: this.goalT > 0 ? this.goalTeam : -1,
    };
  }
}
