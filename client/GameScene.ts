import Phaser from "phaser";
import { CLASSES, CLASS_IDS, SKILL_UNLOCK, type ClassId } from "../shared/classes";
import { DASH_SPEED, DASH_TIME, GHOST_SPEED, MARKET_RANGE, PLAYER_COLORS, PLAYER_RADIUS, TILE, VIEW_H, VIEW_W } from "../shared/constants";
import { moveCircle, tileAt } from "../shared/collide";
import type { Fx, InputState, Snapshot, SnapMonster, SnapPlayer, StageInfo } from "../shared/protocol";
import { MONSTERS, WORLDS, type WorldDef } from "../shared/worlds";
import type { Net } from "./net";
import { isKey, settings } from "./settings";
import { SKINS } from "../shared/skins";
import { titleName } from "../shared/achievements";
import {
  BODIES, CAPES, skinPalette, skinRows, CHEST, CHEST_PAL, COIN, COIN_PAL, GEM, GEM_PAL, HATS, RAINBOW, SPIDER, SPIDER_LASER_PAL, SPIDER_PAL, TRAILS,
  capedPalette, CROWN, CROWN_PAL, DUMMY, DUMMY_PAL, FLAME, FLAME_PAL, PORTAL, PORTAL_PAL,
  PROJ, TENT, TENT_PAL, TRAP, TRAP_PAL, WEAPONS,
  floorTile, heroPalette, heroRows, monsterPalette, paint, specialTile, wallTile,
  KEY_PAL, KEY_ROWS, TURRET, TURRET_PAL, DRONE, DRONE_PAL, GHOST_PET, GHOST_PET_PAL, CHEST_OPEN, CHEST_OPEN_PAL, MIMIC, MIMIC_PAL,
} from "./sprites";
import { sfx } from "./sound";

/** 스냅샷이 15Hz라 보간 지연을 조금 늘림 */
const INTERP_DELAY = 150;

interface PlayerView {
  root: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  off: Phaser.GameObjects.Text;
  bars: Phaser.GameObjects.Graphics;
  cls: ClassId;
  color: number;
  lastX: number;
  lastY: number;
  walkT: number;
  frame: number;
  /** v1.7 전설 스킨 빛 색 (적용된 것) */
  glow?: string;
}

interface MonsterView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  crown?: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
  bars: Phaser.GameObjects.Graphics;
  kind: SnapMonster["k"];
  /** 맞은 순간 (찌그러짐 연출) */
  punch?: number;
  scale: number;
}

const ELITE_NAME: Record<string, string> = { rage: "분노", split: "분열", guard: "보호막", vamp: "흡혈", blink: "순간이동" };

const TEXT_STYLE ={ fontFamily: "Galmuri7", fontSize: "8px", color: "#ffffff", stroke: "#000000", strokeThickness: 2 };

export class GameScene extends Phaser.Scene {
  net!: Net;
  myId = 0;
  /** DOM 창(상점 등)이 열려 있으면 게임 입력을 막음 */
  uiOpen = false;
  private altarGfx: Phaser.GameObjects.Graphics | null = null;
  private altarTimer: Phaser.Time.TimerEvent | null = null;

  /** 제단까지 거리 (없으면 무한) */
  nearAltar() {
    const a = this.stage?.altar;
    if (!a) return Infinity;
    return Math.hypot(this.local.x - a.x, this.local.y - a.y);
  }
  /** 채팅 말풍선: 플레이어 id → 내용과 사라질 시각 */
  private chats = new Map<number, { text: string; until: number }>();

  /** 말풍선은 저해상도 캔버스 대신 HTML 글자로 그려서 또렷하게 */
  private bubbleEls = new Map<number, HTMLDivElement>();

  showChat(id: number, text: string) {
    this.chats.set(id, { text, until: performance.now() + 4500 });
  }

  private clearBubbles() {
    for (const el of this.bubbleEls.values()) el.remove();
    this.bubbleEls.clear();
    for (const el of this.comboEls.values()) el.remove();
    this.comboEls.clear();
  }

  /** v1.7 전설 스킨 연출 */
  private legendT = new Map<number, number>();
  private drawLegend(p: SnapPlayer, v: PlayerView, x: number, y: number, now: number) {
    const sk = p.cos?.sk;
    const glow = sk === 4 ? SKINS[p.cls]?.[4]?.glow : undefined;
    const want = glow && !p.ghost ? glow : "";
    // 빛나는 테두리 (WebGL이면 글로우 효과, 감자 모드면 끔)
    if ((v.glow ?? "") !== (settings.potato ? "" : want)) {
      v.glow = settings.potato ? "" : want;
      v.body.preFX?.clear();
      if (v.glow) v.body.preFX?.addGlow(Phaser.Display.Color.HexStringToColor(v.glow).color, 2, 0, false, 0.1, 6);
    }
    if (!want || this.lite) return;
    // 움직이면 잔상 (반투명 그림이 뒤에 남음) + 반짝이
    const last = this.legendT.get(p.id) ?? 0;
    const moving = Math.hypot(x - v.lastX, y - v.lastY) > 0.05 || p.dash;
    if (moving && now - last > 70) {
      this.legendT.set(p.id, now);
      const ghost = this.track(this.add.image(x, y + 5, v.body.texture.key).setOrigin(0.5, 1).setScale(p.size).setFlipX(v.body.flipX)
        .setTint(Phaser.Display.Color.HexStringToColor(want).color).setAlpha(0.45).setDepth(y - 1).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.add({ targets: ghost, alpha: 0, duration: 320, onComplete: () => ghost.destroy() });
    }
    if (Math.random() < 0.08) {
      const c = Phaser.Display.Color.HexStringToColor(want).color;
      this.pixelBurst(x + (Math.random() - 0.5) * 12, y - 6 - Math.random() * 10, 1, [c, 0xffffff], 8, 650);
    }
  }

  /** v1.6 각성 오라: 발밑 금빛 고리 + 가끔 반짝임, 성역/만한전석은 범위 원 */
  private auraGfx: Phaser.GameObjects.Graphics | null = null;
  private auraFrame = -1;
  private drawAura(p: SnapPlayer, x: number, y: number, now: number) {
    if (!this.auraGfx) this.auraGfx = this.add.graphics();
    const frame = Math.floor(now / 16);
    if (frame !== this.auraFrame) { this.auraGfx.clear(); this.auraFrame = frame; }
    if (p.ghost) return;
    const g = this.auraGfx.setDepth(1);
    if (p.sa) {
      const r = p.sa === 1 ? 90 : 85;
      const col = p.sa === 1 ? 0xf8e070 : 0xff9050;
      g.fillStyle(col, 0.08).fillCircle(x, y, r);
      g.lineStyle(1, col, 0.55 + 0.25 * Math.sin(now / 200)).strokeCircle(x, y, r);
    }
    if (!p.aw) return;
    const pulse = 0.5 + 0.5 * Math.sin(now / 260 + p.id);
    g.fillStyle(0xffd040, 0.18 + 0.14 * pulse).fillEllipse(x, y + 4, 22 + pulse * 4, 8 + pulse * 2);
    g.lineStyle(1, 0xfff0a0, 0.5 + 0.4 * pulse).strokeEllipse(x, y + 4, 24 + pulse * 4, 9 + pulse * 2);
    if (!this.lite && Math.random() < 0.06) this.pixelBurst(x + (Math.random() - 0.5) * 14, y - 4 - Math.random() * 12, 1, [0xfff4a0, 0xffd040], 6, 600);
  }

  /** v1.4 회전 칼날 (서버와 같은 각도 공식) */
  private orbitImgs = new Map<number, Phaser.GameObjects.Image[]>();
  private drawOrbit(p: SnapPlayer, x: number, y: number, _now: number) {
    const n = p.ghost ? 0 : p.ob ?? 0;
    let imgs = this.orbitImgs.get(p.id) ?? [];
    while (imgs.length < n) imgs.push(this.add.image(x, y, "proj_shuriken").setScale(1.4));
    while (imgs.length > n) imgs.pop()!.destroy();
    this.orbitImgs.set(p.id, imgs);
    const st = this.latest()?.time ?? 0;
    imgs.forEach((im, i) => {
      const a = st * 4 + (i / n) * Math.PI * 2;
      im.setPosition(Math.round(x + Math.cos(a) * 26), Math.round(y - 4 + Math.sin(a) * 26)).setRotation(a * 3).setDepth(y + 20);
    });
  }

  /** 연속 처치 콤보: 머리 위 (HTML, 3콤보부터) */
  private comboEls = new Map<number, HTMLDivElement>();
  private drawCombo(p: SnapPlayer, x: number, y: number) {
    const cb = p.cb ?? 0;
    let el = this.comboEls.get(p.id);
    if (cb < 3 || p.ghost) {
      if (el) { el.style.display = "none"; el.dataset.n = ""; }
      return false;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "head-combo";
      el.innerHTML = "<b></b><span>COMBO</span>";
      document.getElementById("chat-bubbles")?.append(el);
      this.comboEls.set(p.id, el);
    }
    if (el.dataset.n !== String(cb)) {
      el.dataset.n = String(cb);
      el.querySelector("b")!.textContent = String(cb);
      el.classList.toggle("hot", cb >= 10 && cb < 25);
      el.classList.toggle("fire", cb >= 25);
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
    const s = this.toScreen(x, y - (p.off ? 36 : 22));
    el.style.display = "";
    el.style.left = `${Math.round(s.x)}px`;
    el.style.top = `${Math.round(s.y)}px`;
    return true;
  }

  /** 월드 좌표 → 화면(px) 좌표 */
  private toScreen(x: number, y: number) {
    const cam = this.cameras.main;
    const r = this.game.canvas.getBoundingClientRect();
    const k = r.width / this.scale.width;
    return { x: r.left + (x - cam.worldView.x) * cam.zoom * k, y: r.top + (y - cam.worldView.y) * cam.zoom * k };
  }

  private drawBubble(p: SnapPlayer, x: number, y: number) {
    const ch = this.chats.get(p.id);
    let el = this.bubbleEls.get(p.id);
    if (!ch || ch.until <= performance.now() || !this.uiVisible()) {
      if (ch && ch.until <= performance.now()) this.chats.delete(p.id);
      if (el) el.style.display = "none";
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.className = "chat-bubble";
      document.getElementById("chat-bubbles")?.append(el);
      this.bubbleEls.set(p.id, el);
    }
    if (el.textContent !== ch.text) el.textContent = ch.text;
    el.style.color = PLAYER_COLORS[p.c] ?? "#fff";
    // 콤보가 떠 있으면 그 위로
    const s = this.toScreen(x, y - (p.off ? 36 : 24) - ((p.cb ?? 0) >= 3 && !p.ghost ? 12 : 0));
    el.style.display = "";
    el.style.left = `${Math.round(s.x)}px`;
    el.style.top = `${Math.round(s.y)}px`;
  }

  private uiVisible() {
    return this.sys.isActive();
  }
  onSnapshot: (s: Snapshot) => void = () => {};

  private ready = false;
  stage: StageInfo | null = null;
  private worldDef: WorldDef = WORLDS[0];
  /** 월드 기믹 화면 효과 (카메라 고정 레이어) */
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private fog: Phaser.GameObjects.RenderTexture | null = null;
  private weather: { o: Phaser.GameObjects.Rectangle; vx: number; vy: number }[] = [];
  private gimmick = "none";
  private gemImg!: Phaser.GameObjects.Image;
  private keyImgs: Phaser.GameObjects.Image[] = [];
  private lastSig = "";
  /** 보물방 상자 (열린 결과는 나에게만 보임) */
  private chestImgs: Phaser.GameObjects.Image[] = [];
  private songT = new Map<number, number>();
  private trailT = new Map<number, number>();
  private gemGfx!: Phaser.GameObjects.Graphics;
  private mapImage: Phaser.GameObjects.Image | null = null;
  private tent: Phaser.GameObjects.Image | null = null;
  private mapKey = 0;
  private snaps: { at: number; s: Snapshot }[] = [];
  local = { x: 0, y: 0, vx: 0, vy: 0, init: false, dashT: 0, dashDx: 0, dashDy: 0 };
  /** v1.3 왕복 지연(ms) — main 이 핑으로 측정해서 넣어 줌 */
  rtt = 100;
  /** 내 예측 위치 기록 (지연만큼 과거의 내 위치와 서버 위치를 비교하려고) */
  private hist: { t: number; x: number; y: number }[] = [];
  /** 내가 화면에서 먼저 낸 대시 시각들 (서버 소식이 늦게 와도 '내 대시'로 알아보려고) */
  private dashAt: number[] = [];
  private players = new Map<number, PlayerView>();
  private monsters = new Map<number, MonsterView>();
  private projs = new Map<number, Phaser.GameObjects.Image>();
  private flames = new Map<number, Phaser.GameObjects.Image>();
  private traps = new Map<number, Phaser.GameObjects.Image>();
  private pets = new Map<number, Phaser.GameObjects.Image>();
  private zoneGfx!: Phaser.GameObjects.Graphics;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private portal!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private inputState: InputState = { up: false, down: false, left: false, right: false, ax: 0, ay: 0, atk: false, dashSeq: 0 };
  private lastSend = 0;
  private sendDirty = false;
  /** 조준 중인 스킬 슬롯 (-1: 없음) */
  aiming = -1;
  private suppressAtk = false;
  /** 개발용: 외부(자동 테스트)에서 입력을 보낼 때 true */
  externalInput = false;
  /** 진행 중인 이펙트 오브젝트 — 맵이 바뀌면 한꺼번에 정리 */
  private fxObjs = new Set<Phaser.GameObjects.GameObject>();

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.fxObjs.add(o);
    o.once("destroy", () => this.fxObjs.delete(o));
    return o;
  }

  constructor() {
    super("game");
  }

  create() {
    const tex = (key: string, c: HTMLCanvasElement) => {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, c);
    };
    for (const cls of CLASS_IDS) {
      for (let color = 0; color < PLAYER_COLORS.length; color++) {
        for (const f of [0, 1]) tex(`hero_${cls}_${color}_${f}`, paint(heroRows(cls, f), heroPalette(cls, color)));
      }
      tex(`weapon_${cls}`, paint(WEAPONS[cls].rows, WEAPONS[cls].pal));
    }
    tex("dummy_0", paint(DUMMY, DUMMY_PAL));
    tex("dummy_1", paint(DUMMY, DUMMY_PAL));
    tex("chest_0", paint(CHEST, CHEST_PAL));
    tex("chest_1", paint(CHEST, CHEST_PAL));
    // 몬스터: 공용 몸통에 몬스터별 색을 입힘
    for (const def of Object.values(MONSTERS)) {
      BODIES[def.base].forEach((rows, f) => tex(`${def.id}_${f}`, paint(rows, monsterPalette(def.pal))));
    }
    // 안개 월드용 빛 브러시
    const light = document.createElement("canvas");
    light.width = light.height = 180;
    const lctx = light.getContext("2d")!;
    const grad = lctx.createRadialGradient(90, 90, 20, 90, 90, 90);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.85)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, 180, 180);
    tex("light", light);
    tex("crown", paint(CROWN, CROWN_PAL));
    tex("tent", paint(TENT, TENT_PAL));
    // 도박꾼 가판대: 같은 천막을 빨강·금색으로
    tex("tent_g", paint(TENT, { ...TENT_PAL, p: "#8a1a2a", P: "#e04050", g: "#f0c040", c: "#ffffff", y: "#f0c040", Y: "#a07018" }));
    tex("trap", paint(TRAP, TRAP_PAL));
    tex("coin", paint(COIN, COIN_PAL));
    tex("gem", paint(GEM, GEM_PAL));
    tex("spider", paint(SPIDER, SPIDER_PAL));
    for (const [id, h] of Object.entries(HATS)) tex(`hat_${id}`, paint(h.rows, h.pal));
    tex("spider_laser", paint(SPIDER, SPIDER_LASER_PAL));
    for (const [k, p] of Object.entries(PROJ)) tex(`proj_${k}`, paint(p.rows, p.pal));
    FLAME.forEach((rows, f) => tex(`flame_${f}`, paint(rows, FLAME_PAL)));
    tex("portal", paint(PORTAL, PORTAL_PAL));
    tex("panic_key", paint(KEY_ROWS, KEY_PAL));
    tex("pet_turret", paint(TURRET, TURRET_PAL));
    tex("pet_drone", paint(DRONE, DRONE_PAL));
    tex("pet_ghost", paint(GHOST_PET, GHOST_PET_PAL));
    tex("chest_open", paint(CHEST_OPEN, CHEST_OPEN_PAL));
    tex("mimic", paint(MIMIC, MIMIC_PAL));

    this.zoneGfx = this.add.graphics().setDepth(1);
    this.gemImg = this.add.image(0, 0, "gem").setVisible(false);
    this.gemGfx = this.add.graphics();
    this.aimGfx = this.add.graphics().setDepth(100000);
    this.portal = this.add.image(0, 0, "portal").setVisible(false).setDepth(2);
    this.tweens.add({ targets: this.portal, angle: 360, duration: 3000, repeat: -1 });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT", false) as Record<string, Phaser.Input.Keyboard.Key>;
    // 스킬·대시 키는 설정에서 바꿀 수 있어서 DOM 키 이벤트로 직접 처리
    const SKILL_KEYS = ["skill1", "skill2", "skill3", "skill4", "skill5"] as const;
    const onDown = (e: KeyboardEvent) => {
      if (this.uiOpen || e.repeat || e.target instanceof HTMLInputElement) return;
      if (isKey(e, "dash")) {
        e.preventDefault();
        this.pressDash();
        return;
      }
      const slot = SKILL_KEYS.findIndex((a) => isKey(e, a));
      if (slot < 0) return;
      // 엔지니어처럼 누르는 스킬이 없는 직업은 조준하지 않음
      const me = this.latest()?.players.find((p) => p.id === this.myId);
      if (me && CLASSES[me.cls].skills[slot].aim === "passive") return;
      if (settings.castMode === "instant") {
        const ptr = this.input.activePointer;
        const w = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
        sfx.cast();
        this.net.send({ t: "cast", slot, x: Math.round(w.x), y: Math.round(w.y) });
      } else {
        this.aiming = slot;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const slot = SKILL_KEYS.findIndex((a) => isKey(e, a));
      if (slot >= 0 && this.aiming === slot) this.aiming = -1;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    this.sys.events.once("destroy", () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.uiOpen || !p.leftButtonDown() || this.aiming < 0) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      sfx.cast();
      this.net.send({ t: "cast", slot: this.aiming, x: Math.round(w.x), y: Math.round(w.y) });
      this.aiming = -1;
      this.suppressAtk = true;
    });
    this.input.on("pointerup", () => { this.suppressAtk = false; });

    this.cameras.main.setRoundPixels(true);
    this.ready = true;
    if (this.stage) this.setStage(this.stage);
  }

  // ---------- 서버에서 온 데이터 ----------
  setStage(st: StageInfo) {
    this.stage = st;
    if (!this.ready) return;
    for (const v of this.players.values()) v.root.destroy();
    for (const v of this.monsters.values()) v.root.destroy();
    for (const m of [this.projs, this.flames, this.traps, this.pets]) {
      for (const v of m.values()) v.destroy();
      m.clear();
    }
    this.players.clear();
    this.monsters.clear();
    this.clearBubbles();
    for (const list of this.orbitImgs.values()) for (const im of list) im.destroy();
    this.orbitImgs.clear();
    for (const o of this.fxObjs) { this.tweens.killTweensOf(o); o.destroy(); }
    this.fxObjs.clear();
    this.snaps = [];
    this.local.init = false;
    this.aiming = -1;

    const c = document.createElement("canvas");
    c.width = st.w * TILE;
    c.height = st.h * TILE;
    const ctx = c.getContext("2d")!;
    const wd = WORLDS[st.world - 1] ?? WORLDS[0];
    this.worldDef = wd;
    const wall = (x: number, y: number) => x < 0 || y < 0 || x >= st.w || y >= st.h || st.tiles[y * st.w + x] === "#";
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const ch = st.tiles[y * st.w + x];
        const seed = x * 73 + y * 151 + st.round * 977 + st.world * 31;
        let img: HTMLCanvasElement;
        if (ch === "#") img = wallTile(!wall(x, y + 1), seed, wd);
        else if ("~_%v=".includes(ch)) img = specialTile(ch, seed);
        else img = floorTile(ch === "," ? 1 : ch === '"' ? 2 : 0, seed, wd);
        ctx.drawImage(img, x * TILE, y * TILE);
        if (ch !== "#" && wall(x, y - 1)) {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x * TILE, y * TILE, TILE, 4);
        }
      }
    }
    if (st.market) {
      // 암시장 범위 표시 (보라색 원)
      ctx.strokeStyle = "rgba(160,112,240,0.55)";
      ctx.fillStyle = "rgba(122,74,224,0.10)";
      ctx.beginPath();
      ctx.arc(st.market.x, st.market.y, MARKET_RANGE, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.stroke();
    }
    const key = `map_${++this.mapKey}`;
    this.textures.addCanvas(key, c);
    this.mapImage?.destroy();
    if (this.textures.exists(`map_${this.mapKey - 1}`)) this.textures.remove(`map_${this.mapKey - 1}`);
    this.mapImage = this.add.image(0, 0, key).setOrigin(0).setDepth(0);
    this.cameras.main.setBounds(0, 0, c.width, c.height);
    this.portal.setVisible(false);

    // 휴게소와 보석 쟁탈전 아레나에선 월드 기믹(안개·모래폭풍 등) 없음
    // 무한 하강 '어둠' 변형은 안개처럼
    this.setupGimmick(st.kind === "rest" || st.kind === "arena" ? "none" : st.mod === "dark" ? "fog" : wd.gimmick);

    for (const c of this.chestImgs) c.destroy();
    this.chestImgs = (st.chests ?? []).map((c) => {
      const img = this.add.image(c.x, c.y + 8, "chest_0").setOrigin(0.5, 1).setScale(2).setDepth(c.y + 8);
      this.tweens.add({ targets: img, y: c.y + 6, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      return img;
    });

    // v1.5 저주받은 제단: 보랏빛으로 맥동하는 원 + 제단 돌
    this.altarGfx?.destroy();
    this.altarGfx = null;
    this.altarTimer?.remove();
    this.altarTimer = null;
    if (st.altar) {
      const a = st.altar;
      const g = this.add.graphics().setDepth(a.y - 2);
      this.altarGfx = g;
      const draw = (t: number) => {
        g.clear();
        const pulse = 0.5 + 0.5 * Math.sin(t / 300);
        g.fillStyle(0x6020a0, 0.18 + 0.15 * pulse).fillCircle(a.x, a.y + 6, 30);
        g.lineStyle(1, 0xc060ff, 0.6 + 0.4 * pulse).strokeCircle(a.x, a.y + 6, 26);
        for (let i = 0; i < 5; i++) {
          const an1 = (i / 5) * Math.PI * 2 - Math.PI / 2, an2 = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2;
          g.lineBetween(a.x + Math.cos(an1) * 24, a.y + 6 + Math.sin(an1) * 24, a.x + Math.cos(an2) * 24, a.y + 6 + Math.sin(an2) * 24);
        }
        g.fillStyle(0x3a3448, 1).fillRect(a.x - 9, a.y - 6, 18, 12);
        g.fillStyle(0x5a5068, 1).fillRect(a.x - 11, a.y - 9, 22, 4);
        g.fillStyle(0xff3040, 0.7 + 0.3 * pulse).fillRect(a.x - 2, a.y - 13, 4, 4);
      };
      draw(0);
      this.altarTimer = this.time.addEvent({ delay: 60, loop: true, callback: () => draw(this.time.now) });
    }
    this.tent?.destroy();
    this.tent = null;
    if (st.market) {
      this.tent = this.add.image(st.market.x, st.market.y + 18, st.stall === "gambler" ? "tent_g" : "tent").setOrigin(0.5, 1).setScale(2).setDepth(st.market.y + 18);
      this.tweens.add({ targets: this.tent, scaleY: 2.06, duration: 900, yoyo: true, repeat: -1 });
    }
  }

  /** 보물방: 내가 연 상자 모습 바꾸기 (미믹이면 덜컹거림) */
  openChest(idx: number, mimic: boolean) {
    const img = this.chestImgs[idx];
    if (!img) return;
    this.tweens.killTweensOf(img);
    img.setTexture(mimic ? "mimic" : "chest_open");
    if (mimic) {
      this.tweens.add({ targets: img, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 12, onComplete: () => img.setAngle(0) });
      this.shake(300, 0.01);
    } else {
      this.tweens.add({ targets: img, scale: 2.4, duration: 120, yoyo: true });
    }
  }

  /** 가장 가까운 안 연 상자까지 거리 */
  nearChest(opened: Set<number>) {
    const me = this.myPos();
    if (!me) return Infinity;
    let best = Infinity;
    (this.stage?.chests ?? []).forEach((c, i) => {
      if (!opened.has(i)) best = Math.min(best, Math.hypot(me.x - c.x, me.y - c.y));
    });
    return best;
  }

  /** 모래폭풍 / 눈 / 안개 같은 화면 효과 준비 */
  private setupGimmick(g: string) {
    this.gimmick = g;
    this.overlay?.destroy();
    this.overlay = null;
    this.fog?.destroy();
    this.fog = null;
    for (const w of this.weather) w.o.destroy();
    this.weather = [];
    // 감자 모드: 날씨 입자 없음 (모래폭풍 어두워짐만)
    const potato = settings.potato;
    if (g === "sandstorm") {
      this.overlay = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xc8a060, 0).setOrigin(0).setScrollFactor(0).setDepth(200000);
      for (let i = 0; i < (potato ? 0 : 70); i++) {
        const o = this.add.rectangle(Math.random() * VIEW_W, Math.random() * VIEW_H, 3, 1, 0xf0d8a0, 0).setScrollFactor(0).setDepth(200001);
        this.weather.push({ o, vx: 180 + Math.random() * 120, vy: 20 + Math.random() * 30 });
      }
    } else if (g === "ice") {
      for (let i = 0; i < (potato ? 0 : 60); i++) {
        const o = this.add.rectangle(Math.random() * VIEW_W, Math.random() * VIEW_H, 1, 1, 0xffffff, 0.8).setScrollFactor(0).setDepth(200001);
        this.weather.push({ o, vx: -10 + Math.random() * 20, vy: 18 + Math.random() * 20 });
      }
    } else if (g === "lava") {
      for (let i = 0; i < (potato ? 0 : 30); i++) {
        const o = this.add.rectangle(Math.random() * VIEW_W, Math.random() * VIEW_H, 1, 1, 0xf08030, 0.8).setScrollFactor(0).setDepth(200001);
        this.weather.push({ o, vx: -5 + Math.random() * 10, vy: -(10 + Math.random() * 20) });
      }
    } else if (g === "fog") {
      this.fog = this.add.renderTexture(0, 0, VIEW_W, VIEW_H).setOrigin(0).setScrollFactor(0).setDepth(200000);
    }
  }

  private updateGimmick(dt: number, s: Snapshot) {
    for (const w of this.weather) {
      w.o.x += w.vx * dt;
      w.o.y += w.vy * dt;
      if (w.o.x > VIEW_W) w.o.x -= VIEW_W;
      if (w.o.x < 0) w.o.x += VIEW_W;
      if (w.o.y > VIEW_H) w.o.y -= VIEW_H;
      if (w.o.y < 0) w.o.y += VIEW_H;
    }
    if (this.gimmick === "sandstorm") {
      const storm = s.storm ?? 0;
      this.overlay?.setFillStyle(0xc8a060, storm * 0.6);
      for (const w of this.weather) w.o.setAlpha(0.2 + storm * 0.8);
    }
    if (this.fog) {
      // 짙은 안개: 살아있는 용사 주변만 보임
      const cam = this.cameras.main;
      this.fog.clear();
      this.fog.fill(0x05040a, 0.92);
      for (const p of s.players) {
        if (p.ghost) continue;
        const x = (p.id === this.myId && this.local.init ? this.local.x : p.x) - cam.scrollX;
        const y = (p.id === this.myId && this.local.init ? this.local.y : p.y) - cam.scrollY;
        this.fog.erase("light", x - 90, y - 90);
      }
    }
  }

  private prevMe: { at: boolean; dash: boolean; hp: number; ghost: boolean } | null = null;
  private prevPortal = false;

  /** 내 캐릭터 상태 변화로 효과음 (평타 · 대시 · 피격) + 포탈 열림 */
  private soundFromSnapshot(s: Snapshot) {
    const me = s.players.find((p) => p.id === this.myId);
    if (me) {
      const pm = this.prevMe;
      if (pm) {
        if (me.at && !pm.at) sfx.swing(CLASSES[me.cls].attack.kind);
        if (me.dash && !pm.dash) sfx.dash();
        if (me.hp < pm.hp && !me.ghost && !pm.ghost) sfx.hurt();
      }
      this.prevMe = { at: me.at, dash: me.dash, hp: me.hp, ghost: me.ghost };
    }
    const portal = !!s.portal && this.stage?.kind !== "rest" && this.stage?.kind !== "treasure" && this.stage?.zone === undefined;
    if (portal && !this.prevPortal) sfx.portal();
    this.prevPortal = portal;
  }

  pushSnapshot(s: Snapshot) {
    if (this.ready && !document.hidden) this.soundFromSnapshot(s);
    this.snaps.push({ at: performance.now(), s });
    if (this.snaps.length > 30) this.snaps.shift();
    // 탭이 가려진 동안 쌓인 이펙트가 한꺼번에 터지지 않게
    if (this.ready && !document.hidden) for (const f of s.fx) this.playFx(f, s);
    this.onSnapshot(s);
  }

  myPos() {
    return this.local.init ? { x: this.local.x, y: this.local.y } : null;
  }

  // ---------- 입력 ----------
  private pressDash() {
    this.inputState.dashSeq++;
    this.sendDirty = true;
    const me = this.latest()?.players.find((p) => p.id === this.myId);
    // 서버의 남은 대시 수는 핑만큼 늦게 오므로, 아직 반영 안 된 내 대시만큼 빼고 판단
    const now = performance.now();
    this.dashAt = this.dashAt.filter((t) => now - t < this.rtt + 400);
    const pending = this.dashAt.filter((t) => now - t < this.rtt + 120).length;
    if (me && !me.ghost && me.dc - pending > 0 && this.local.dashT <= 0) {
      this.dashAt.push(now);
      const { mx, my } = this.moveDir(me.rev);
      const len = Math.hypot(mx, my);
      this.local.dashT = DASH_TIME;
      this.local.dashDx = len ? mx / len : Math.cos(me.a);
      this.local.dashDy = len ? my / len : Math.sin(me.a);
    }
  }

  /** v1.6 모바일 조작 (조이스틱 방향 · 공격 버튼) */
  touch = { on: false, mx: 0, my: 0, atk: false };

  /** 가장 가까운 적 (자동 조준) */
  private nearestFoe(range = 230) {
    let best: SnapMonster | null = null;
    let bd = range;
    for (const m of this.latest()?.monsters ?? []) {
      if (m.k === "chest" || (m.sp ?? 0) > 0) continue;
      const d = Math.hypot(m.x - this.local.x, m.y - this.local.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  private lastFace = { x: 1, y: 0 };
  private autoAim() {
    const f = this.nearestFoe();
    if (f) return { x: f.x, y: f.y };
    return { x: this.local.x + this.lastFace.x * 40, y: this.local.y + this.lastFace.y * 40 };
  }
  /** 모바일: 스킬을 가까운 적(없으면 바라보는 쪽)에 바로 시전 */
  castAuto(slot: number) {
    if (this.uiOpen) return;
    const me = this.latest()?.players.find((p) => p.id === this.myId);
    if (!me || CLASSES[me.cls].skills[slot]?.aim === "passive") return;
    const t = this.autoAim();
    sfx.cast();
    this.net.send({ t: "cast", slot, x: Math.round(t.x), y: Math.round(t.y) });
  }
  dashNow() {
    if (!this.uiOpen) this.pressDash();
  }

  private moveDir(rev = false) {
    const k = this.keys;
    if (this.uiOpen) return { mx: 0, my: 0 };
    if (this.touch.on && (this.touch.mx || this.touch.my)) {
      // 조이스틱: 8방향으로 (서버 입력이 방향키라서)
      let mx = this.touch.mx > 0.38 ? 1 : this.touch.mx < -0.38 ? -1 : 0;
      let my = this.touch.my > 0.38 ? 1 : this.touch.my < -0.38 ? -1 : 0;
      if (rev) { mx = -mx; my = -my; }
      return { mx, my };
    }
    let mx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let my = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (rev) { mx = -mx; my = -my; }
    return { mx, my };
  }

  private latest() {
    return this.snaps.length ? this.snaps[this.snaps.length - 1].s : null;
  }

  // ---------- 메인 루프 ----------
  /** v1.5 보스 등장: 카메라가 보스에게 다가가 확대 → 포효 → 원래대로 */
  private introCamOn = false;
  private introKind = "";
  private introT = 0;
  startIntroCam(kind: string) {
    this.introKind = kind;
    this.introT = 0;
    this.introCamOn = true;
  }
  private updateIntroCam(deltaMs: number) {
    if (!this.introCamOn) return;
    this.introT += deltaMs;
    const cam = this.cameras.main;
    const boss = this.latest()?.monsters.find((m) => m.k === this.introKind);
    const tx = boss?.x ?? this.local.x, ty = (boss?.y ?? this.local.y) - 10;
    const k = Math.min(1, this.introT / 600);
    const ease = k * k * (3 - 2 * k);
    if (this.introT < 1500) {
      // 0~0.6초: 보스 쪽으로 이동하며 확대, 0.7초: 포효 흔들림
      const cx = this.local.x + (tx - this.local.x) * ease;
      const cy = this.local.y + (ty - this.local.y) * ease;
      cam.setZoom(1 + 1.2 * ease);
      cam.centerOn(Math.round(cx), Math.round(cy));
      if (this.introT > 700 && this.introT - deltaMs <= 700) {
        this.shake(600, 0.02);
        cam.flash(250, 255, 60, 40);
        if (boss) this.ring(boss.x, boss.y - 8, 70, 0xff4030, 600);
      }
    } else if (this.introT < 4000) {
      cam.setZoom(2.2);
      cam.centerOn(Math.round(tx), Math.round(ty));
    } else {
      // 끝: 원래 시점으로
      const b = Math.min(1, (this.introT - 4000) / 300);
      cam.setZoom(2.2 - 1.2 * b);
      cam.centerOn(Math.round(tx + (this.local.x - tx) * b), Math.round(ty + (this.local.y - ty) * b));
      if (b >= 1) { this.introCamOn = false; cam.setZoom(1); }
    }
  }

  /** 히트스톱: 이 시각까지 화면을 아주 잠깐 멈춤 (치명타·보스 처치) */
  private hitStopUntil = 0;

  /** 맞은 위치 근처 몬스터를 찌그러뜨림 */
  private punchAt(x: number, y: number) {
    let best: MonsterView | undefined;
    let bd = 14;
    for (const v of this.monsters.values()) {
      const d = Math.hypot(v.root.x - x, v.root.y - y);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) best.punch = performance.now();
  }

  update(time: number, deltaMs: number) {
    // v1.5 프레임 감시: 40fps 아래가 4초 이어지면 자동 간소화 (감자 모드면 이미 가벼움)
    this.fpsClock += deltaMs;
    if (this.fpsClock >= 1000) {
      this.fpsClock = 0;
      const fps = this.game.loop.actualFps;
      if (!document.hidden && fps < 40) this.lowFpsSec++;
      else this.lowFpsSec = 0;
      if (this.lowFpsSec >= 4 && !this.autoLite && !settings.potato) {
        this.autoLite = true;
        this.onAutoLite();
      }
    }
    this.updateIntroCam(deltaMs);
    if (!this.stage || !this.snaps.length) return;
    if (performance.now() < this.hitStopUntil) return;
    const dt = deltaMs / 1000;
    const latest = this.latest()!;
    const meSnap = latest.players.find((p) => p.id === this.myId);

    // 내 캐릭터는 예측 이동 (반응 지연 없음) + 서버 위치로 부드럽게 보정
    if (meSnap) {
      if (!this.local.init) {
        this.local.x = meSnap.x;
        this.local.y = meSnap.y;
        this.local.init = true;
      }
      const { mx, my } = this.moveDir(meSnap.rev);
      const len = Math.hypot(mx, my) || 1;
      let vx = 0, vy = 0;
      if (this.local.dashT > 0 && !meSnap.ghost) {
        this.local.dashT -= dt;
        vx = this.local.dashDx * DASH_SPEED;
        vy = this.local.dashDy * DASH_SPEED;
      } else if (!(meSnap.dash && this.local.dashT <= 0)) {
        // 서버와 같은 지형 규칙으로 예측 (유사·독 늪 감속, 빙판 관성)
        const tile = meSnap.ghost ? "." : tileAt(this.stage, this.local.x, this.local.y);
        let sp = meSnap.ghost ? GHOST_SPEED : meSnap.spd;
        if (tile === "~") sp *= 0.6;
        if (tile === "%") sp *= 0.8;
        const tx = (mx / len) * sp;
        const ty = (my / len) * sp;
        if (tile === "_") {
          const k = Math.min(1, dt * 2.5);
          this.local.vx += (tx - this.local.vx) * k;
          this.local.vy += (ty - this.local.vy) * k;
        } else {
          this.local.vx = tx;
          this.local.vy = ty;
        }
        vx = this.local.vx;
        vy = this.local.vy;
      }
      const pos = moveCircle(this.stage, this.local.x, this.local.y, PLAYER_RADIUS, vx * dt, vy * dt);
      if (pos.x === this.local.x) this.local.vx = 0;
      if (pos.y === this.local.y) this.local.vy = 0;
      this.local.x = pos.x;
      this.local.y = pos.y;
      // v1.3 보정: 서버 위치는 '왕복 지연'만큼 과거의 내 위치와 비교 (지금 위치와 비교하면 걷는 내내 뒤로 당겨져서 느려짐)
      const nowT = performance.now();
      this.hist.push({ t: nowT, x: this.local.x, y: this.local.y });
      while (this.hist.length > 2 && nowT - this.hist[0].t > 1500) this.hist.shift();
      const recvAt = this.snaps[this.snaps.length - 1]?.at ?? nowT;
      const when = recvAt - this.rtt;
      let past = this.hist[0];
      for (const h of this.hist) { if (h.t <= when) past = h; else break; }
      // 내가 낸 대시가 늦게 서버 소식으로 온 건 '서버가 시킨 돌진'(방패 돌진 등)이 아님 → 끌어당기지 않음
      const myDashEcho = this.dashAt.some((t) => nowT - t < this.rtt + DASH_TIME * 1000 + 200);
      const serverDash = meSnap.dash && this.local.dashT <= 0 && !myDashEcho;
      // 서버 쪽 돌진(방패 돌진 등)은 지금 위치를 서버 위치로 빠르게 맞춤
      const ex = meSnap.x - (serverDash ? this.local.x : past.x);
      const ey = meSnap.y - (serverDash ? this.local.y : past.y);
      const err = Math.hypot(ex, ey);
      if (err > 48) {
        this.local.x = meSnap.x;
        this.local.y = meSnap.y;
        this.hist = [];
      } else if (err > 2.5 || serverDash) {
        const k = 1 - Math.exp(-dt * (serverDash ? 20 : 8));
        const cx = ex * k, cy = ey * k;
        this.local.x += cx;
        this.local.y += cy;
        // 기록도 같이 옮겨서 같은 오차를 두 번 고치지 않게
        for (const h of this.hist) { h.x += cx; h.y += cy; }
      }
      if (!this.introCamOn) this.cameras.main.centerOn(Math.round(this.local.x), Math.round(this.local.y));
    }

    // 입력 전송 (30Hz)
    const k = this.keys;
    const ptr = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const st = this.inputState;
    const free = !this.uiOpen;
    st.up = free && (k.W.isDown || k.UP.isDown);
    st.down = free && (k.S.isDown || k.DOWN.isDown);
    st.left = free && (k.A.isDown || k.LEFT.isDown);
    st.right = free && (k.D.isDown || k.RIGHT.isDown);
    st.ax = Math.round(world.x);
    st.ay = Math.round(world.y);
    st.atk = free && ptr.leftButtonDown() && !this.suppressAtk && this.aiming < 0;
    if (this.touch.on) {
      // 모바일: 조이스틱 이동 + 자동 조준 + 공격 버튼
      const d = this.moveDir(false);
      st.up = free && d.my < 0; st.down = free && d.my > 0;
      st.left = free && d.mx < 0; st.right = free && d.mx > 0;
      if (d.mx || d.my) { const l = Math.hypot(d.mx, d.my); this.lastFace = { x: d.mx / l, y: d.my / l }; }
      const t = this.autoAim();
      st.ax = Math.round(t.x);
      st.ay = Math.round(t.y);
      st.atk = free && this.touch.atk;
    }
    // 입력은 바뀌었을 때 바로, 안 바뀌면 0.15초마다만 (네트워크 절약)
    const sig = `${+st.up}${+st.down}${+st.left}${+st.right}${+st.atk}${st.dashSeq}${Math.round(st.ax / 4)},${Math.round(st.ay / 4)}`;
    const changedIn = sig !== this.lastSig;
    if (!this.externalInput && (this.sendDirty || (changedIn && time - this.lastSend > 33) || time - this.lastSend > 150)) {
      this.lastSig = sig;
      this.net.send({ t: "input", input: { ...st } });
      this.lastSend = time;
      this.sendDirty = false;
    }

    this.renderWorld(dt);
    this.drawAim(meSnap, world.x, world.y);
    this.updateGimmick(dt, latest);
  }

  /** 스킬 키를 누르고 있는 동안 사거리·범위 표시 */
  /** 평타 방향 표시: 원거리는 회색 막대, 검사는 베기 범위 부채꼴 */
  private drawAttackGuide(me: SnapPlayer, wx: number, wy: number) {
    const g = this.aimGfx;
    const px = this.local.x, py = this.local.y - 3;
    const ang = Math.atan2(wy - py, wx - px);
    const atk = CLASSES[me.cls].attack;
    const col = 0xb8b8c8;
    if (atk.kind === "melee") {
      const r = (atk.range ?? 24) * Math.sqrt(me.size);
      g.fillStyle(col, 0.16);
      g.slice(px, py, r, ang - 0.96, ang + 0.96, false);
      g.fillPath();
      g.lineStyle(1, col, 0.45);
      g.beginPath();
      g.arc(px, py, r, ang - 0.96, ang + 0.96);
      g.strokePath();
      return;
    }
    const len = Math.min(110, (atk.projSpeed ?? 200) * (atk.projLife ?? 1));
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const start = 7;
    // 끝으로 갈수록 옅어지는 막대
    for (let i = 0; i < 4; i++) {
      const a0 = start + ((len - start) * i) / 4;
      const a1 = start + ((len - start) * (i + 1)) / 4;
      g.lineStyle(2, col, 0.45 - i * 0.1);
      g.lineBetween(px + ca * a0, py + sa * a0, px + ca * a1, py + sa * a1);
    }
    g.fillStyle(col, 0.5).fillRect(Math.round(px + ca * len) - 1, Math.round(py + sa * len) - 1, 2, 2);
  }

  private drawAim(me: SnapPlayer | undefined, wx: number, wy: number) {
    const g = this.aimGfx;
    g.clear();
    if (!me || me.ghost || this.uiOpen) return;
    if (this.aiming < 0) {
      if (settings.aimBar) this.drawAttackGuide(me, wx, wy);
      return;
    }
    if (!settings.skillRange) return;
    const slot = this.aiming;
    const def = CLASSES[me.cls].skills[slot];
    const locked = me.lv < SKILL_UNLOCK[slot];
    const cooling = me.cds[slot] > 0;
    const col = locked || cooling ? 0xe84a4a : 0x40e0f0;
    const px = this.local.x, py = this.local.y;
    const ang = Math.atan2(wy - py, wx - px);
    const d = Math.min(def.range, Math.hypot(wx - px, wy - py));
    const tx = px + Math.cos(ang) * d;
    const ty = py + Math.sin(ang) * d;

    if (def.range > 0 && def.aim !== "line") g.lineStyle(1, col, 0.35).strokeCircle(px, py, def.range);
    if (def.aim === "self") {
      g.fillStyle(col, 0.12).fillCircle(px, py, def.radius);
      g.lineStyle(1, col, 0.9).strokeCircle(px, py, def.radius);
    } else if (def.aim === "point") {
      g.fillStyle(col, 0.15).fillCircle(tx, ty, Math.max(6, def.radius));
      g.lineStyle(1, col, 0.9).strokeCircle(tx, ty, Math.max(6, def.radius));
      g.lineStyle(1, col, 0.4).lineBetween(px, py, tx, ty);
    } else if (def.aim === "line") {
      const len = def.range;
      const w = def.radius;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa * w, ny = ca * w;
      const ex = px + ca * len, ey = py + sa * len;
      g.fillStyle(col, 0.15);
      g.fillPoints([
        new Phaser.Math.Vector2(px + nx, py + ny), new Phaser.Math.Vector2(ex + nx, ey + ny),
        new Phaser.Math.Vector2(ex - nx, ey - ny), new Phaser.Math.Vector2(px - nx, py - ny),
      ], true);
      g.lineStyle(1, col, 0.9).strokeRect(0, 0, 0, 0);
      g.lineBetween(px + nx, py + ny, ex + nx, ey + ny);
      g.lineBetween(px - nx, py - ny, ex - nx, ey - ny);
    } else {
      // dir: 부채꼴
      g.fillStyle(col, 0.15);
      g.slice(px, py, def.range, ang - 0.35, ang + 0.35, false);
      g.fillPath();
      g.lineStyle(1, col, 0.9);
      g.beginPath();
      g.arc(px, py, def.range, ang - 0.35, ang + 0.35);
      g.strokePath();
    }
  }

  private interpolated() {
    const rt = performance.now() - INTERP_DELAY;
    const b = this.snaps;
    let a = b[b.length - 1], c = a, alpha = 0;
    for (let i = b.length - 2; i >= 0; i--) {
      if (b[i].at <= rt) {
        a = b[i];
        c = b[i + 1];
        alpha = Math.min(1, (rt - a.at) / Math.max(1, c.at - a.at));
        break;
      }
    }
    return { a: a.s, c: c.s, alpha };
  }

  private renderWorld(dt: number) {
    const { a, c, alpha } = this.interpolated();
    const lerp = (x0: number, x1: number) => x0 + (x1 - x0) * alpha;
    const latest = this.latest()!;
    const now = this.time.now;

    const sync = <S extends { id: number; x: number; y: number }>(
      list: S[], prev: S[], next: S[], draw: (s: S, x: number, y: number) => void,
    ) => {
      for (const s of list) {
        const s0 = prev.find((q) => q.id === s.id);
        const s1 = next.find((q) => q.id === s.id);
        draw(s, s0 && s1 ? lerp(s0.x, s1.x) : s.x, s0 && s1 ? lerp(s0.y, s1.y) : s.y);
      }
    };
    const prune = <V>(map: Map<number, V>, ids: Set<number>, kill: (v: V) => void) => {
      for (const [id, v] of map) if (!ids.has(id)) { kill(v); map.delete(id); }
    };

    // 플레이어
    sync(latest.players, a.players, c.players, (p, x, y) => {
      if (p.id === this.myId && this.local.init) { x = this.local.x; y = this.local.y; }
      this.drawPlayer(p, x, y, dt, now);
    });
    prune(this.players, new Set(latest.players.map((p) => p.id)), (v) => v.root.destroy());
    for (const [id, el] of this.bubbleEls) if (!this.players.has(id)) { el.remove(); this.bubbleEls.delete(id); }
    for (const [id, el] of this.comboEls) if (!this.players.has(id)) { el.remove(); this.comboEls.delete(id); }

    // 몬스터
    sync(latest.monsters, a.monsters, c.monsters, (m, x, y) => this.drawMonster(m, x, y, now));
    prune(this.monsters, new Set(latest.monsters.map((m) => m.id)), (v) => v.root.destroy());

    // 분신
    sync(latest.pets, a.pets, c.pets, (pt, x, y) => {
      let img = this.pets.get(pt.id);
      const owner = latest.players.find((p) => p.id === pt.owner);
      if (!owner) return;
      if (!img) {
        img = pt.k === "clone"
          ? this.add.image(x, y, `hero_${owner.cls}_${owner.c}_0`).setOrigin(0.5, 1).setScale(0.6).setAlpha(0.85)
          : pt.k === "shadow"
          ? this.add.image(x, y, `hero_${owner.cls}_${owner.c}_0`).setOrigin(0.5, 1).setTintFill(0x201830).setAlpha(0.75)
          : pt.k === "turret" ? this.add.image(x, y, "pet_turret").setOrigin(0.5, 1)
          : pt.k === "drone" ? this.add.image(x, y, "pet_drone").setOrigin(0.5, 0.5)
          : pt.k === "ghost" ? this.add.image(x, y, "pet_ghost").setOrigin(0.5, 1).setAlpha(0.8)
          : this.add.image(x, y, "spider").setOrigin(0.5, 1);
        this.pets.set(pt.id, img);
      }
      if (pt.k === "turret") {
        img.setPosition(Math.round(x), Math.round(y) + 4).setDepth(y).setFlipX(Math.cos(pt.a) < 0);
      } else if (pt.k === "drone" || pt.k === "ghost") {
        img.setPosition(Math.round(x), Math.round(y) + Math.round(Math.sin(now / 200 + pt.id) * 2)).setDepth(y + 40);
      } else if (pt.k === "clone" || pt.k === "shadow") {
        img.setPosition(Math.round(x), Math.round(y) + Math.round(Math.sin(now / 150 + pt.id) * 1)).setDepth(y);
      } else {
        // 거미 포탑: 다리를 까딱이며 조준 쪽을 바라봄
        img.setTexture(pt.k === "laser" ? "spider_laser" : "spider");
        img.setPosition(Math.round(x), Math.round(y) + (Math.floor(now / 120 + pt.id) % 2)).setDepth(y).setFlipX(Math.cos(pt.a) < 0);
      }
    });
    prune(this.pets, new Set(latest.pets.map((p) => p.id)), (v) => v.destroy());

    // 투사체
    sync(latest.projs, a.projs, c.projs, (pr, x, y) => {
      let img = this.projs.get(pr.id);
      if (!img) {
        img = this.add.image(x, y, `proj_${pr.k}`);
        this.projs.set(pr.id, img);
      }
      img.setPosition(Math.round(x), Math.round(y)).setRotation(pr.a).setDepth(y + 8);
    });
    prune(this.projs, new Set(latest.projs.map((p) => p.id)), (v) => v.destroy());

    // 장판
    const g = this.zoneGfx;
    g.clear();
    const flameIds = new Set<number>();
    const trapIds = new Set<number>();
    for (const z of latest.zones) {
      switch (z.k) {
        case "fire": {
          flameIds.add(z.id);
          let f = this.flames.get(z.id);
          if (!f) {
            f = this.add.image(z.x, z.y, "flame_0").setOrigin(0.5, 1);
            this.flames.set(z.id, f);
          }
          f.setTexture(`flame_${Math.floor(now / 120 + z.id) % 2}`).setDepth(z.y).setAlpha(1 - z.t * 0.6);
          break;
        }
        case "trap": {
          trapIds.add(z.id);
          if (!this.traps.has(z.id)) this.traps.set(z.id, this.add.image(z.x, z.y, "trap").setDepth(2));
          break;
        }
        case "rain": {
          g.lineStyle(1, 0xe8e8e8, 0.5).strokeCircle(z.x, z.y, z.r);
          g.fillStyle(0xe8e8e8, 0.8);
          for (let i = 0; i < 14; i++) {
            const ang = (i * 2.4 + now / 200) % (Math.PI * 2);
            const rr = (((i * 37) % 10) / 10) * z.r;
            const fy = ((now / 3 + i * 23) % 14) - 7;
            g.fillRect(Math.round(z.x + Math.cos(ang) * rr), Math.round(z.y + Math.sin(ang) * rr + fy), 1, 4);
          }
          break;
        }
        case "ice":
          g.fillStyle(0x80c8ff, 0.18 + z.t * 0.12).fillCircle(z.x, z.y, z.r);
          g.lineStyle(1, 0xc8ecff, 0.8).strokeCircle(z.x, z.y, z.r);
          for (let i = 0; i < 8; i++) {
            const ang = i * 0.785 + now / 900;
            g.fillStyle(0xffffff, 0.7).fillRect(Math.round(z.x + Math.cos(ang) * z.r * 0.6), Math.round(z.y + Math.sin(ang) * z.r * 0.6), 2, 2);
          }
          break;
        case "blackhole":
          g.fillStyle(0x120820, 0.55).fillCircle(z.x, z.y, z.r);
          g.lineStyle(1, 0xa070f0, 0.9).strokeCircle(z.x, z.y, z.r * (1 - ((now / 600) % 1) * 0.8));
          g.lineStyle(1, 0xa070f0, 0.5).strokeCircle(z.x, z.y, z.r * (1 - (((now / 600) + 0.5) % 1) * 0.8));
          g.fillStyle(0x000000, 1).fillCircle(z.x, z.y, 6 + z.t * 6);
          break;
        case "oil":
          // 미끄러운 기름: 갈색 웅덩이에 반짝이는 기름막
          g.fillStyle(0x3a2a10, 0.55 - z.t * 0.2).fillCircle(z.x, z.y, z.r);
          g.lineStyle(1, 0xd8a050, 0.5).strokeCircle(z.x, z.y, z.r);
          for (let i = 0; i < 5; i++) {
            const ang = i * 1.3 + now / 1500;
            g.fillStyle(0xf0d080, 0.5).fillRect(Math.round(z.x + Math.cos(ang) * z.r * 0.5), Math.round(z.y + Math.sin(ang) * z.r * 0.4), 3, 1);
          }
          break;
        case "mine": {
          // 엔지니어 지뢰: 깜빡이는 빨간 불
          g.fillStyle(0x3a3a44, 1).fillCircle(z.x, z.y, 4);
          g.fillStyle(Math.floor(now / 300 + z.id) % 2 ? 0xff3030 : 0x601010, 1).fillRect(Math.round(z.x) - 1, Math.round(z.y) - 1, 2, 2);
          break;
        }
        case "curse": {
          // 네크로 저주: 보라 소용돌이
          g.fillStyle(0x5a2a8a, 0.35 * (1 - z.t)).fillCircle(z.x, z.y, z.r);
          g.lineStyle(1, 0x60ff80, 0.8 * (1 - z.t)).strokeCircle(z.x, z.y, z.r * (0.5 + z.t * 0.5));
          break;
        }
        case "discord": {
          // 불협화음: 바드를 따라다니는 보라 파동
          const pulse = (now / 400) % 1;
          g.lineStyle(1, 0xa070f0, 0.8 - pulse * 0.6).strokeCircle(z.x, z.y, z.r * (0.4 + pulse * 0.6));
          g.lineStyle(1, 0xa070f0, 0.35).strokeCircle(z.x, z.y, z.r);
          break;
        }
        default: {
          // meteor / slam / hammer: 예고 원이 차오름
          const col = z.k === "meteor" ? 0xf08030 : z.k === "hammer" ? 0xf8e070 : z.k === "strike" ? 0xf8f0a0 : 0xe03040;
          g.fillStyle(col, 0.12).fillCircle(z.x, z.y, z.r);
          g.lineStyle(1, col, 0.8).strokeCircle(z.x, z.y, z.r);
          g.fillStyle(col, 0.3).fillCircle(z.x, z.y, z.r * z.t);
        }
      }
    }
    prune(this.flames, flameIds, (v) => v.destroy());
    prune(this.traps, trapIds, (v) => v.destroy());

    // 바드 용기의 노래 (항상 켜짐): 주황색 범위 원
    for (const p of latest.players) {
      if (!p.song || p.ghost) continue;
      const pos = p.id === this.myId && this.local.init ? { x: this.local.x, y: this.local.y } : p;
      const r = 105;
      g.fillStyle(0xf08030, 0.06).fillCircle(pos.x, pos.y, r);
      g.lineStyle(1, 0xf08030, 0.55 + Math.sin(now / 300) * 0.15).strokeCircle(pos.x, pos.y, r);
    }

    // 보석 쟁탈전: 바닥의 보석 / 든 사람 머리 위 보석 + 하이라이트
    this.gemGfx.clear();
    if (latest.gem) {
      const holder = latest.gem.holder !== null ? latest.players.find((p) => p.id === latest.gem!.holder) : undefined;
      let gx = latest.gem.x, gy = latest.gem.y;
      if (holder) {
        const v = this.players.get(holder.id);
        gx = holder.id === this.myId ? this.local.x : v?.root.x ?? holder.x;
        gy = holder.id === this.myId ? this.local.y : v?.root.y ?? holder.y;
        const pulse = 10 + Math.sin(now / 120) * 2;
        this.gemGfx.setDepth(gy - 1);
        this.gemGfx.fillStyle(0xf05a8a, 0.18).fillCircle(gx, gy, pulse + 4);
        this.gemGfx.lineStyle(2, 0xffd040, 0.9).strokeCircle(gx, gy - 3, pulse);
        this.gemImg.setVisible(true).setPosition(Math.round(gx), Math.round(gy - 24 - Math.sin(now / 200) * 2)).setDepth(gy + 50);
      } else {
        this.gemGfx.setDepth(gy - 1);
        this.gemGfx.fillStyle(0xf05a8a, 0.25).fillCircle(gx, gy + 2, 9 + Math.sin(now / 150) * 2);
        this.gemImg.setVisible(true).setPosition(Math.round(gx), Math.round(gy - 4 - Math.sin(now / 200) * 2)).setDepth(gy);
      }
      // 화면 밖에 있으면 가장자리에 방향 표시
      const cam = this.cameras.main;
      const vx = gx - cam.scrollX, vy = gy - cam.scrollY;
      if (vx < 0 || vy < 0 || vx > VIEW_W || vy > VIEW_H) {
        const cx = cam.scrollX + VIEW_W / 2, cy = cam.scrollY + VIEW_H / 2;
        const a = Math.atan2(gy - cy, gx - cx);
        const ex = cx + Math.cos(a) * (VIEW_W / 2 - 14), ey = cy + Math.sin(a) * (VIEW_H / 2 - 14);
        this.gemGfx.setDepth(199999);
        this.gemGfx.fillStyle(0xf05a8a, 0.9).fillTriangle(
          ex + Math.cos(a) * 8, ey + Math.sin(a) * 8,
          ex + Math.cos(a + 2.4) * 6, ey + Math.sin(a + 2.4) * 6,
          ex + Math.cos(a - 2.4) * 6, ey + Math.sin(a - 2.4) * 6,
        );
      }
    } else {
      this.gemImg.setVisible(false);
    }

    // PANIC 열쇠
    const kp = latest.panic?.keys ?? [];
    const nKeys = kp.length / 2;
    while (this.keyImgs.length < nKeys) this.keyImgs.push(this.add.image(0, 0, "panic_key"));
    this.keyImgs.forEach((img, i) => {
      if (i >= nKeys) { img.setVisible(false); return; }
      const ky = kp[i * 2 + 1];
      img.setVisible(true).setPosition(kp[i * 2], Math.round(ky - 4 - Math.sin(now / 180 + i) * 3)).setDepth(ky).setAlpha(0.75 + Math.sin(now / 120 + i) * 0.25);
    });

    // 포탈
    if (latest.portal && this.stage?.kind !== "rest") {
      this.portal.setVisible(true).setPosition(latest.portal.x, latest.portal.y);
      this.portal.setScale(1 + Math.sin(now / 200) * 0.08);
    } else {
      this.portal.setVisible(false);
    }
  }

  /** 망토 코스튬이면 몸통 색을 바꾼 텍스처를 필요할 때 만들어 씀 */
  private heroTexture(p: SnapPlayer, frame: number, now: number) {
    const cape = p.cos?.cape;
    const sk = p.cos?.sk;
    if (sk !== undefined && sk >= 0 && sk < 5) {
      // v1.7 직업 스킨 (+ 망토 색)
      const capeColor = cape ? (cape === "rainbow" ? RAINBOW[Math.floor(now / 250) % RAINBOW.length] : CAPES[cape]) : undefined;
      const key = `hero_${p.cls}_${p.c}_${frame}_s${sk}_${capeColor ?? ""}`;
      if (!this.textures.exists(key)) this.textures.addCanvas(key, paint(skinRows(p.cls, frame, sk), skinPalette(p.cls, p.c, sk, capeColor)));
      return key;
    }
    if (!cape) return `hero_${p.cls}_${p.c}_${frame}`;
    const color = cape === "rainbow" ? RAINBOW[Math.floor(now / 250) % RAINBOW.length] : CAPES[cape];
    if (!color) return `hero_${p.cls}_${p.c}_${frame}`;
    const key = `hero_${p.cls}_${p.c}_${frame}_${color}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paint(heroRows(p.cls, frame), capedPalette(p.cls, p.c, color)));
    return key;
  }

  private drawPlayer(p: SnapPlayer, x: number, y: number, dt: number, now: number) {
    let v = this.players.get(p.id);
    if (!v || v.cls !== p.cls || v.color !== p.c) {
      v?.root.destroy();
      const shadow = this.add.ellipse(0, 4, 10, 4, 0x000000, 0.4);
      const body = this.add.image(0, 5, `hero_${p.cls}_${p.c}_0`).setOrigin(0.5, 1);
      const weapon = this.add.image(0, -3, `weapon_${p.cls}`).setOrigin(0.15, 0.5);
      const name = this.add.text(0, -18, p.n, { ...TEXT_STYLE, color: PLAYER_COLORS[p.c] }).setOrigin(0.5, 1).setVisible(p.id !== this.myId);
      const bars = this.add.graphics();
      const hat = this.add.image(0, 0, "hat_crown").setOrigin(0.5, 1).setVisible(false);
      const off = this.add.text(0, -30, "연결끊김!", { ...TEXT_STYLE, color: "#ff5a4a" }).setOrigin(0.5, 1).setVisible(false);
      const root = this.add.container(x, y, [shadow, body, hat, weapon, bars, name, off]);
      v = { root, shadow, body, hat, weapon, name, off, bars, cls: p.cls, color: p.c, lastX: x, lastY: y, walkT: 0, frame: 0 };
      this.players.set(p.id, v);
    }
    // 칭호는 이름 앞에
    const title = titleName(p.cos?.title);
    const label = title ? `[${title}] ${p.n}` : p.n;
    if (v.name.text !== label) v.name.setText(label);
    // 연결 끊긴 사람: 머리 위에 깜빡이는 "연결끊김!" + 반투명
    v.off.setVisible(!!p.off && Math.floor(now / 400) % 2 === 0);
    v.root.setAlpha(p.off ? 0.55 : 1);
    // v1.7 전설 스킨: 빛나는 테두리 + 움직이면 잔상·반짝이
    this.drawLegend(p, v, x, y, now);
    // v1.4 카드 '회전 칼날'
    this.drawOrbit(p, x, y, now);
    // v1.6 각성 오라 (Lv15) · 성역/만한전석 범위
    this.drawAura(p, x, y, now);
    // 채팅 말풍선 (머리 위 4.5초, HTML)
    this.drawCombo(p, x, y);
    this.drawBubble(p, x, y);

    const moved = Math.hypot(x - v.lastX, y - v.lastY) > 0.05;
    v.lastX = x;
    v.lastY = y;
    if (moved) {
      v.walkT += dt;
      if (v.walkT > 0.14) { v.walkT = 0; v.frame ^= 1; }
    } else {
      v.frame = 0;
    }
    const bob = p.ghost ? Math.sin(now / 250 + p.id) * 2 - 3 : 0;
    const jitter = p.shake && !p.ghost ? Math.round(Math.sin(now / 30) * 0.8) : 0;
    v.root.setPosition(Math.round(x), Math.round(y)).setDepth(y);
    v.body.setTexture(this.heroTexture(p, v.frame, now)).setPosition(jitter, 5 + Math.round(bob)).setScale(p.size);
    v.shadow.setScale(p.size);
    const left = Math.cos(p.a) < 0;
    v.body.setFlipX(left);
    const top = -13 * p.size;
    // 코스튬: 모자
    const hatId = p.cos?.hat;
    if (hatId && HATS[hatId]) {
      const hover = hatId === "halo" ? -3 + Math.round(Math.sin(now / 300)) : 0;
      v.hat.setVisible(true).setTexture(`hat_${hatId}`).setScale(p.size).setFlipX(left)
        .setPosition(jitter, Math.round(5 + bob + top + 3 * p.size + hover)).setAlpha(p.ghost ? 0.45 : 1);
    } else {
      v.hat.setVisible(false);
    }
    // 코스튬: 발자국
    const trail = p.cos?.trail ? TRAILS[p.cos.trail] : undefined;
    if (trail && !settings.potato && moved && !p.ghost && now - (this.trailT.get(p.id) ?? 0) > 110) {
      this.trailT.set(p.id, now);
      const col = trail[Math.floor(now / 110) % trail.length];
      const dot = this.track(this.add.rectangle(Math.round(x) + Math.round((Math.random() - 0.5) * 4), Math.round(y) + 4, 2, 2, col).setDepth(y - 1));
      this.tweens.add({ targets: dot, alpha: 0, duration: 700, onComplete: () => dot.destroy() });
    }
    // 바드 연주 중: 음표가 둥실
    if (p.song && !settings.potato && !p.ghost && now - (this.songT.get(p.id) ?? 0) > 380) {
      this.songT.set(p.id, now);
      this.floatText(Math.round(x) + Math.round((Math.random() - 0.5) * 16), Math.round(y) - 14, "♪", "#f8e070", 900);
    }

    if (p.ghost) {
      v.body.setAlpha(0.45).setTintFill(0xdde4ff);
      v.weapon.setVisible(false);
      v.shadow.setAlpha(0.15);
    } else {
      v.body.setAlpha(p.ps.includes("h") ? 0.3 : p.dash ? 0.6 : 1);
      if (p.f) v.body.setTintFill(0xffffff);
      else if (p.ps.includes("R")) v.body.setTint(0xb8c4d8);
      else if (p.ps.includes("b")) v.body.setTint(Math.floor(now / 100) % 2 ? 0xffa060 : 0xff7040);
      else if (p.ps.includes("p")) v.body.setTint(0x90ff90);
      else if (p.ps.includes("s")) v.body.setTint(0xa0d0ff);
      else if (p.giant) v.body.setTint(0xffd0a0);
      else v.body.clearTint();
      v.weapon.setVisible(true).setScale(p.size);
      v.shadow.setAlpha(0.4);
      let rot = p.a;
      let ox = Math.cos(p.a) * 3 * p.size;
      let oy = Math.sin(p.a) * 2 - 3 * p.size;
      if (p.at) {
        if (p.cls === "warrior") rot += Math.sin(now / 25) * 0.9;
        else { ox -= Math.cos(p.a) * 2; oy -= Math.sin(p.a) * 2; }
      }
      v.weapon.setPosition(Math.round(ox), Math.round(oy)).setRotation(rot).setFlipY(left);
      v.root.moveTo(v.weapon, Math.sin(p.a) < -0.3 ? 1 : 2);
    }

    const g = v.bars;
    g.clear();
    if (p.ghost) {
      g.fillStyle(0x000000, 0.8).fillRect(-8, -24, 16, 3);
      g.fillStyle(0xf0d050, 1).fillRect(-7, -23, Math.round(14 * p.rv), 1);
      v.name.setY(-26);
    } else {
      const w = 14;
      const by = Math.round(top + 1);
      g.fillStyle(0x000000, 0.8).fillRect(-w / 2 - 1, by, w + 2, 3);
      const ratio = Math.max(0, p.hp / p.mhp);
      const col = ratio > 0.5 ? 0x50d870 : ratio > 0.25 ? 0xf0c040 : 0xe84a4a;
      g.fillStyle(col, 1).fillRect(-w / 2, by + 1, Math.round(w * ratio), 1);
      if (p.shield > 0) {
        g.fillStyle(0x40e0f0, 1).fillRect(-w / 2, by - 1, Math.round(w * Math.min(1, p.shield / 40)), 1);
        g.lineStyle(1, 0x40e0f0, 0.5 + Math.sin(now / 150) * 0.2).strokeCircle(0, -3 * p.size, 9 * p.size);
      }
      v.name.setY(by - 1);
    }
  }

  private drawMonster(m: SnapMonster, x: number, y: number, now: number) {
    const def = MONSTERS[m.k];
    const scale = (def?.scale ?? 1) * (m.el ? 1.5 : 1);
    const big = !!def?.boss;
    let v = this.monsters.get(m.id);
    if (!v) {
      const shadowW = big ? 34 : m.k === "chest" ? 14 : 12;
      const shadow = this.add.ellipse(0, big ? 10 : 3, shadowW, shadowW / 3, 0x000000, def?.base === "flyer" ? 0.25 : 0.4);
      const body = this.add.image(0, 0, `${m.k}_0`).setOrigin(0.5, 1).setScale(scale);
      const scaleBase = scale;
      const bars = this.add.graphics();
      const parts: Phaser.GameObjects.GameObject[] = [bars, shadow, body];
      let crown: Phaser.GameObjects.Image | undefined;
      let label: Phaser.GameObjects.Text | undefined;
      if (def?.boss?.crown) {
        crown = this.add.image(0, 0, "crown").setScale(2).setOrigin(0.5, 1);
        parts.push(crown);
      }
      if (m.k === "dummy") {
        label = this.add.text(0, -18, "", { ...TEXT_STYLE, color: "#f0c040", align: "center" }).setOrigin(0.5, 1);
        parts.push(label);
      }
      if (m.el) {
        label = this.add.text(0, -24, `엘리트 · ${ELITE_NAME[m.el]}`, { ...TEXT_STYLE, color: "#f0c040" }).setOrigin(0.5, 1);
        parts.push(label);
      }
      const root = this.add.container(x, y, parts);
      v = { root, body, crown, label, bars, kind: m.k, scale: scaleBase };
      this.monsters.set(m.id, v);
    }
    const frozen = (m.st ?? "").includes("z") || (m.st ?? "").includes("s");
    const fast = def?.base === "flyer" || def?.base === "skeleton";
    const frame = frozen || m.k === "dummy" || m.k === "chest" ? 0 : Math.floor(now / (fast ? 180 : 260) + m.id) % 2;
    v.body.setTexture(`${m.k}_${frame}`);
    // 맞으면 잠깐 옆으로 퍼졌다가 돌아옴 (찌그러짐)
    const pk = v.punch ? Math.max(0, 1 - (performance.now() - v.punch) / 110) : 0;
    v.body.setScale(v.scale * (1 + 0.28 * pk), v.scale * (1 - 0.18 * pk));
    // 날아다니는 몬스터는 위아래로 둥실
    const hover = def?.base === "flyer" && !frozen ? Math.round(Math.sin(now / 160 + m.id) * 2) - 4 * scale : 0;
    const footY = Math.round(4 * scale) + hover;
    v.body.setY(footY);
    if (v.crown) v.crown.setY(footY - v.body.displayHeight + 4);
    v.root.setPosition(Math.round(x), Math.round(y)).setDepth(y);
    v.root.setAlpha(((m.sp ?? 0) > 0 ? 1 - (m.sp ?? 0) / 0.7 : 1) * (def?.alpha ?? 1));
    if (m.f) v.body.setTintFill(0xffffff);
    else if (m.el && Math.floor(now / 250) % 2) v.body.setTint(0xffe080);
    else if ((m.st ?? "").includes("c")) v.body.setTint(Math.floor(now / 200) % 2 ? 0xc090ff : 0x9060d0);
    else if ((m.st ?? "").includes("z")) v.body.setTint(0x80c8ff);
    else if ((m.st ?? "").includes("p")) v.body.setTint(0x90ff90);
    else if ((m.st ?? "").includes("w")) v.body.setTint(0xc0e0ff);
    else v.body.clearTint();
    if (m.k === "dummy") {
      v.body.setRotation(m.f ? Math.sin(now / 20) * 0.15 : 0);
      v.label?.setText(`DPS ${m.dps ?? 0}\n누적 ${m.tot ?? 0}`);
    }
    if (m.el && v.label) v.label.setY(footY - Math.round(v.body.displayHeight) - 6);

    const g = v.bars;
    g.clear();
    const headY = footY - Math.round(v.body.displayHeight) - 4;
    // 돌진 예고선
    if (m.ca !== undefined && settings.chargeLine) {
      const len = big ? 140 : 90;
      const blink = Math.floor(now / 80) % 2 ? 0.9 : 0.4;
      g.lineStyle(big ? 6 : 3, 0xe84a4a, blink * 0.5).lineBetween(0, 0, Math.cos(m.ca) * len, Math.sin(m.ca) * len);
      g.lineStyle(1, 0xffffff, blink).lineBetween(0, 0, Math.cos(m.ca) * len, Math.sin(m.ca) * len);
    }
    if (m.el) {
      // 엘리트: 발밑 금색 고리 + 항상 보이는 체력바
      const pulse = 1 + Math.sin(now / 150) * 0.15;
      g.lineStyle(1, 0xf0c040, 0.9).strokeEllipse(0, 4, 22 * pulse, 8 * pulse);
      if (m.el === "guard") g.lineStyle(1, 0x40e0f0, 0.35).strokeCircle(0, 0, 60);
      g.fillStyle(0x000000, 0.8).fillRect(-11, headY, 22, 4);
      g.fillStyle(0xf0c040, 1).fillRect(-10, headY + 1, Math.round(20 * (m.hp / m.mhp)), 2);
    } else if (m.hp < m.mhp && !big && m.k !== "dummy" && m.k !== "chest") {
      g.fillStyle(0x000000, 0.8).fillRect(-6, headY, 12, 3);
      g.fillStyle(0xe84a4a, 1).fillRect(-5, headY + 1, Math.round(10 * (m.hp / m.mhp)), 1);
    }
    if ((m.st ?? "").includes("s")) {
      for (let i = 0; i < 3; i++) {
        const ang = now / 200 + (i * Math.PI * 2) / 3;
        g.fillStyle(0xf8e070, 1).fillRect(Math.round(Math.cos(ang) * 6) - 1, headY - 4 + Math.round(Math.sin(ang) * 2), 2, 2);
      }
    }
    if ((m.st ?? "").includes("r")) g.lineStyle(1, 0xb08050, 1).strokeEllipse(0, 4, 14, 5);
  }

  // ---------- 이펙트 ----------
  /** 감자 모드면 화면 흔들림 없음 */
  private shake(duration: number, intensity: number) {
    if (!settings.potato) this.cameras.main.shake(duration, this.autoLite ? intensity * 0.5 : intensity);
  }

  /** v1.5 지금 떠 있는 파티클 수 (상한을 넘으면 새 파티클을 줄임) */
  private liveParticles = 0;
  /** v1.5 프레임이 계속 낮으면 이펙트를 자동으로 줄임 */
  autoLite = false;
  private lowFpsSec = 0;
  private fpsClock = 0;
  onAutoLite: () => void = () => {};
  private get lite() {
    return settings.potato || this.autoLite;
  }

  private pixelBurst(x: number, y: number, n: number, colors: number[], spread: number, life: number) {
    if (settings.potato) return;
    // 상한: 동시에 300개까지, 많아지면 개수를 줄이고, 자동 간소화면 1/3
    const budget = 300 - this.liveParticles;
    if (budget <= 0) return;
    n = Math.min(budget, this.autoLite ? Math.ceil(n / 3) : this.liveParticles > 150 ? Math.ceil(n / 2) : n);
    for (let i = 0; i < n; i++) {
      const col = colors[i % colors.length];
      const px = this.track(this.add.rectangle(x, y, 2, 2, col).setDepth(y + 20));
      this.liveParticles++;
      px.once("destroy", () => { this.liveParticles--; });
      const ang = Math.random() * Math.PI * 2;
      const d = spread * (0.4 + Math.random() * 0.6);
      this.tweens.add({
        targets: px, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d - 4, alpha: 0,
        duration: life, ease: "Quad.easeOut", onComplete: () => px.destroy(),
      });
    }
  }

  private ring(x: number, y: number, r: number, color: number, life: number, fill = false) {
    if (settings.potato) return;
    const c = this.track(this.add.circle(x, y, r, color, fill ? 0.35 : 0).setDepth(y + 30));
    if (!fill) c.setStrokeStyle(1, color, 1);
    c.setScale(0.2);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: life, ease: "Quad.easeOut", onComplete: () => c.destroy() });
  }

  /** v1.4 피해 숫자: 저해상도 캔버스 대신 HTML로 또렷하게. 너무 많으면 작은 숫자는 생략 */
  private dmgNum(x: number, y: number, v: number, kind: "hit" | "crit" | "big") {
    const box = document.getElementById("chat-bubbles");
    if (!box) return;
    // 숫자가 너무 많으면 작은 숫자부터 생략 (자동 간소화면 더 적게)
    if (kind === "hit" && box.childElementCount > (this.autoLite ? 25 : 55)) return;
    const s = this.toScreen(x + (Math.random() * 10 - 5), y - 10 - Math.random() * 4);
    const el = document.createElement("div");
    el.className = `dmg-num ${kind}`;
    el.textContent = kind === "crit" ? `${v}!` : String(v);
    el.style.left = `${Math.round(s.x)}px`;
    el.style.top = `${Math.round(s.y)}px`;
    el.addEventListener("animationend", () => el.remove());
    box.append(el);
  }

  /** v1.4 번쩍 원 (폭발·스킬이 더 화려하게) */
  private flashCircle(x: number, y: number, r: number, color: number, life = 160) {
    if (this.lite) return;
    const c = this.track(this.add.circle(x, y, r, color, 0.55).setDepth(y + 30).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: c, alpha: 0, scale: 1.25, duration: life, ease: "Quad.easeOut", onComplete: () => c.destroy() });
  }

  /** v1.4 보스 연출용 큰 글자 (HTML) */
  private bigBanner(text: string, cls: string) {
    const el = document.createElement("div");
    el.className = `fx-banner ${cls}`;
    el.textContent = text;
    el.addEventListener("animationend", () => el.remove());
    document.body.append(el);
  }

  private floatText(x: number, y: number, text: string, color: string, life = 700) {
    const t = this.track(this.add.text(x, y, text, { ...TEXT_STYLE, color }).setOrigin(0.5, 1).setDepth(99999));
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: life, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  private fxSound(k: Fx["k"]) {
    switch (k) {
      case "hit": sfx.hit(); break;
      case "crit": sfx.crit(); break;
      case "die": sfx.kill(); break;
      case "boom": case "fall": sfx.boom(); break;
      case "heal": case "food": sfx.heal(); break;
      case "taunt": sfx.shout(); break;
      case "shield": sfx.shield(); break;
      case "revive": sfx.revive(); break;
      case "pdie": sfx.playerDown(); break;
      case "bolt": case "zap": sfx.zap(); break;
      case "blink": sfx.blink(); break;
      case "spin": case "line": sfx.spin(); break;
      case "sleep": case "encore": sfx.magic(); break;
    }
  }

  private playFx(f: Fx, s: Snapshot) {
    this.fxSound(f.k);
    if (settings.potato) {
      // 감자 모드: 소리와 숫자만 (파티클·고리·잔상·멈칫·흔들림 없음)
      if (f.k === "num") this.dmgNum(f.x, f.y, f.r ?? 0, "hit");
      else if (f.k === "crit" && f.r) this.dmgNum(f.x, f.y, f.r, "crit");
      return;
    }
    switch (f.k) {
      case "hit":
        this.pixelBurst(f.x, f.y - 4, 3, [0xffffff, 0xfff0a0], 7, 180);
        this.punchAt(f.x, f.y);
        if (f.r) this.dmgNum(f.x, f.y, f.r, f.r >= 60 ? "big" : "hit");
        break;
      case "crit":
        this.pixelBurst(f.x, f.y - 4, 5, [0xf8e070, 0xffffff], 10, 240);
        this.punchAt(f.x, f.y);
        // 타격감: 치명타는 살짝 멈칫 + 흔들림
        this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + 45);
        this.shake(80, 0.003);
        this.flashCircle(f.x, f.y - 4, 7, 0xffe080, 120);
        if (f.r) this.dmgNum(f.x, f.y, f.r, "crit");
        break;
      case "num":
        this.dmgNum(f.x, f.y, f.r ?? 0, "hit");
        break;
      case "die":
        this.pixelBurst(f.x, f.y - 3, 10, [0x4fc06a, 0xc8f8d0, 0xffffff], 14 + (f.r ?? 6), 380);
        if ((f.r ?? 0) >= 14) {
          // 보스 처치: 크게 멈칫 + 크게 흔들림
          this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + 220);
          this.shake(500, 0.014);
          this.cameras.main.flash(450, 255, 255, 255);
          this.pixelBurst(f.x, f.y - 10, 40, [0xffffff, 0xf8e070, 0xf08030], 70, 900);
          this.bigBanner("격파!", "down");
        } else {
          this.shake(50, 0.0015);
        }
        break;
      case "swing": {
        const g = this.track(this.add.graphics().setDepth(f.y + 25));
        g.lineStyle(2, 0xffffff, 0.85);
        g.beginPath();
        g.arc(f.x, f.y - 3, f.r ?? 22, (f.a ?? 0) - 0.9, (f.a ?? 0) + 0.9);
        g.strokePath();
        this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
        break;
      }
      case "spin":
        this.ring(f.x, f.y - 3, f.r ?? 28, 0xffffff, 220);
        break;
      case "boom":
        this.flashCircle(f.x, f.y, (f.r ?? 18) * 0.7, 0xffe0a0, 140);
        this.ring(f.x, f.y, f.r ?? 18, 0xf08030, 300, true);
        this.pixelBurst(f.x, f.y, 16, [0xf8c040, 0xf08030, 0xffffff, 0xff6030], f.r ?? 18, 420);
        if ((f.r ?? 0) > 40) this.shake(120, 0.006);
        break;
      case "heal":
        this.flashCircle(f.x, f.y, (f.r ?? 60) * 0.5, 0x80ffb0, 260);
        this.ring(f.x, f.y, f.r ?? 60, 0x50e080, 450, true);
        this.pixelBurst(f.x, f.y, 22, [0x50e080, 0xc8ffd8, 0xffffff], f.r ?? 60, 650);
        break;
      case "frost":
        // v1.4 서리 대시
        this.flashCircle(f.x, f.y, (f.r ?? 36) * 0.6, 0xa0e0ff, 200);
        this.ring(f.x, f.y, f.r ?? 36, 0x80d0ff, 350, true);
        this.pixelBurst(f.x, f.y, 14, [0xffffff, 0xa0e0ff, 0x60a0ff], f.r ?? 36, 450);
        break;
      case "awaken":
        // v1.6 각성: 금빛 기둥 + 고리
        this.flashCircle(f.x, f.y - 10, (f.r ?? 50) * 0.6, 0xfff0a0, 260);
        this.ring(f.x, f.y, f.r ?? 50, 0xffd040, 500);
        this.ring(f.x, f.y, (f.r ?? 50) * 1.5, 0xfff4a0, 700);
        this.pixelBurst(f.x, f.y - 10, 24, [0xffd040, 0xfff4a0, 0xffffff], f.r ?? 50, 700);
        break;
      case "rage":
        // v1.4 보스 광폭화: 붉은 번쩍 + 충격파 + 큰 글자
        this.cameras.main.flash(500, 255, 40, 40);
        this.shake(450, 0.01);
        this.ring(f.x, f.y, f.r ?? 80, 0xff3030, 600);
        this.ring(f.x, f.y, (f.r ?? 80) * 1.6, 0xff6030, 800);
        this.pixelBurst(f.x, f.y - 10, 30, [0xff3030, 0xff9030, 0xffffff], 60, 800);
        break;
      case "taunt":
        this.ring(f.x, f.y, f.r ?? 90, 0xe84a4a, 400);
        this.ring(f.x, f.y, (f.r ?? 90) * 0.6, 0xe84a4a, 300);
        break;
      case "shield":
        this.ring(f.x, f.y - 3, 14, 0x40e0f0, 400, true);
        break;
      case "revive":
        this.ring(f.x, f.y, 20, 0xf8e070, 500, true);
        this.pixelBurst(f.x, f.y - 6, 12, [0xf8e070, 0xffffff], 18, 500);
        break;
      case "pdie":
        this.pixelBurst(f.x, f.y - 6, 14, [0xffffff, 0xf8e070, 0xe84a4a], 20, 600);
        this.shake(150, 0.004);
        break;
      case "fall":
        this.pixelBurst(f.x, f.y, 10, [0xffffff, 0xc8d8f8], 12, 400);
        if (s.players.some((p) => p.id === this.myId && Math.hypot(p.x - f.x, p.y - f.y) < 30)) this.shake(150, 0.005);
        break;
      case "bolt": {
        // 낙뢰: 하늘에서 내리꽂는 번개
        const g = this.track(this.add.graphics().setDepth(99990));
        g.lineStyle(3, 0xfff8c0, 0.6);
        let x = f.x + (Math.random() * 10 - 5);
        let y = f.y - 120;
        g.beginPath();
        g.moveTo(x, y);
        while (y < f.y) {
          y += 14;
          x += Math.random() * 12 - 6;
          g.lineTo(x, Math.min(y, f.y));
        }
        g.strokePath();
        this.ring(f.x, f.y, f.r ?? 24, 0xf8f0a0, 300, true);
        this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
        break;
      }
      case "flame": {
        // 화염방사: 부채꼴로 퍼지는 불씨
        const a = f.a ?? 0;
        const r = f.r ?? 40;
        for (let i = 0; i < 6; i++) {
          const ang = a + (Math.random() - 0.5) * 0.9;
          const col = [0xf08030, 0xf8c040, 0xfff090, 0xc03020][i % 4];
          const px = this.track(this.add.rectangle(f.x + Math.cos(a) * 6, f.y - 3 + Math.sin(a) * 6, 2 + (i % 2), 2, col).setDepth(f.y + 25));
          const d = r * (0.5 + Math.random() * 0.5);
          this.tweens.add({
            targets: px, x: f.x + Math.cos(ang) * d, y: f.y - 3 + Math.sin(ang) * d, alpha: 0, scale: 2,
            duration: 220 + Math.random() * 120, ease: "Quad.easeOut", onComplete: () => px.destroy(),
          });
        }
        break;
      }
      case "food": {
        // 음식이 포물선으로 날아가서 회복
        const [sx, sy] = f.pts ?? [f.x, f.y];
        const dish = this.track(this.add.rectangle(sx, sy - 6, 4, 3, 0xf0c040).setStrokeStyle(1, 0x7a4a1a).setDepth(99990));
        this.tweens.add({ targets: dish, x: f.x, duration: 350, ease: "Linear" });
        this.tweens.add({
          targets: dish, y: sy - 30, duration: 175, ease: "Quad.easeOut", yoyo: false,
          onComplete: () => this.tweens.add({
            targets: dish, y: f.y, duration: 175, ease: "Quad.easeIn",
            onComplete: () => {
              dish.destroy();
              this.ring(f.x, f.y, f.r ?? 40, 0x50e080, 450, true);
              this.pixelBurst(f.x, f.y, 10, [0xf0c040, 0x50e080, 0xffffff], f.r ?? 40, 450);
            },
          }),
        });
        break;
      }
      case "sleep":
        this.ring(f.x, f.y, f.r ?? 50, 0xa070f0, 600, true);
        for (let i = 0; i < 3; i++) this.time.delayedCall(i * 150, () => this.floatText(f.x + (i - 1) * 10, f.y - 6, "Zz", "#c8b0ff", 900));
        break;
      case "encore":
        this.ring(f.x, f.y, f.r ?? 100, 0xf8e070, 600);
        for (let i = 0; i < 4; i++) this.time.delayedCall(i * 100, () => this.floatText(f.x + (Math.random() - 0.5) * 40, f.y - 10, "♪", "#f8e070", 900));
        break;
      case "lvl":
        {
          // 레벨업 이펙트 코스튬: 가장 가까운 용사의 것을 씀
          const who = s.players.reduce<SnapPlayer | null>((a, b) => (!a || Math.hypot(b.x - f.x, b.y - f.y) < Math.hypot(a.x - f.x, a.y - f.y) ? b : a), null);
          const style = who?.cos?.lvfx;
          const cols = style === "ghost" ? [0xc8ecff, 0xffffff, 0x8890b8] : style === "gold" ? [0xf0c040, 0xfff4b0, 0xffffff] : [0xf8e070, 0xffffff];
          const ringCol = style === "ghost" ? 0xc8ecff : style === "gold" ? 0xf0c040 : 0xf8e070;
          const textCol = style === "ghost" ? "#c8ecff" : style === "gold" ? "#ffd040" : "#f8e070";
          this.ring(f.x, f.y - 4, style === "gold" ? 34 : 22, ringCol, 600, true);
          this.pixelBurst(f.x, f.y - 6, style === "gold" ? 30 : 16, cols, style === "gold" ? 34 : 22, 700);
          this.floatText(f.x, f.y - 16, `LEVEL ${f.r}!`, textCol, 1200);
        }
        break;
      case "zap": {
        const g = this.track(this.add.graphics().setDepth(99990));
        g.lineStyle(1, 0xc8f0ff, 1);
        const pts = f.pts ?? [];
        for (let i = 0; i < pts.length; i += 2) {
          // 지그재그 번개
          const mx = (f.x + pts[i]) / 2 + (Math.random() * 8 - 4);
          const my = (f.y + pts[i + 1]) / 2 + (Math.random() * 8 - 4);
          g.lineBetween(f.x, f.y - 4, mx, my - 4);
          g.lineBetween(mx, my - 4, pts[i], pts[i + 1] - 4);
        }
        this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
        break;
      }
      case "line": {
        const [ex, ey] = f.pts ?? [f.x, f.y];
        const g = this.track(this.add.graphics().setDepth(99990));
        g.lineStyle((f.r ?? 10) * 2, 0xd8a050, 0.6).lineBetween(f.x, f.y, ex, ey);
        g.lineStyle(2, 0xffffff, 0.9).lineBetween(f.x, f.y, ex, ey);
        this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
        this.shake(100, 0.004);
        break;
      }
      case "blink": {
        const [ex, ey] = f.pts ?? [f.x, f.y];
        this.pixelBurst(f.x, f.y - 6, 12, [0xa070f0, 0xffffff], 14, 400);
        this.pixelBurst(ex, ey - 6, 12, [0xa070f0, 0xffffff], 14, 400);
        if (f.x !== ex || f.y !== ey) {
          const me = s.players.find((p) => p.id === this.myId);
          if (me && Math.hypot(me.x - ex, me.y - ey) < 4) {
            this.local.x = ex;
            this.local.y = ey;
          }
        }
        break;
      }
      case "coin": {
        const target = s.players.find((p) => p.id === f.to);
        const n = Math.min(6, Math.max(1, Math.round((f.r ?? 1) / 3)));
        for (let i = 0; i < n; i++) {
          const coin = this.track(this.add.image(f.x, f.y - 4, "coin").setDepth(99995));
          const ox = Math.random() * 16 - 8, oy = -6 - Math.random() * 8;
          this.tweens.add({
            targets: coin, x: f.x + ox, y: f.y + oy, duration: 220, ease: "Quad.easeOut",
            onComplete: () => {
              const pv = target ? this.players.get(target.id) : undefined;
              const tx = target?.id === this.myId ? this.local.x : pv?.root.x ?? f.x;
              const ty = (target?.id === this.myId ? this.local.y : pv?.root.y ?? f.y) - 6;
              this.tweens.add({ targets: coin, x: tx, y: ty, duration: 300 + i * 40, ease: "Quad.easeIn", onComplete: () => coin.destroy() });
            },
          });
        }
        if (f.to === this.myId) this.floatText(f.x, f.y - 10, `+${f.r}원`, "#f0c040", 800);
        break;
      }
    }
  }
}
