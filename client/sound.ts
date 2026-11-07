// 소리: 효과음 + 배경음악 (전부 Web Audio로 직접 만든 8비트 소리, 파일 없음)
// 전체 음량 → 효과음 / 배경음악 각각 따로 조절
import { onSettingsChange, settings } from "./settings";

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let bgmBus: GainNode;
let noiseBuf: AudioBuffer;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      sfxBus = ctx.createGain();
      bgmBus = ctx.createGain();
      sfxBus.connect(master);
      bgmBus.connect(master);
      master.connect(ctx.destination);
      // 드럼용 잡음
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolume();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function applyVolume() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(settings.sound ? settings.volume : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sfxVolume, t, 0.05);
  bgmBus.gain.setTargetAtTime(settings.bgmOn ? settings.bgmVolume : 0, t, 0.05);
}
onSettingsChange(applyVolume);

// 브라우저는 사용자가 한 번 누르기 전엔 소리를 막음 → 첫 클릭/키 입력에 켜고 대기 중인 음악 시작
const unlock = () => {
  const a = audio();
  if (a && a.state === "running") {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    bgm.kick();
  }
};
window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

/** 음 하나: 주파수(Hz), 시작 지연(초), 길이(초) */
function tone(freq: number, at: number, dur: number, type: OscillatorType = "square", vol = 0.25, slideTo?: number, bus?: GainNode, when?: number) {
  const a = audio();
  if (!a) return;
  const t0 = (when ?? a.currentTime) + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(bus ?? sfxBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 잡음 (타격·폭발·하이햇) */
function noise(at: number, dur: number, vol = 0.25, hp = 800, bus?: GainNode, when?: number) {
  const a = audio();
  if (!a) return;
  const t0 = (when ?? a.currentTime) + at;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(gain).connect(bus ?? sfxBus);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// 같은 소리가 한 프레임에 수십 번 겹치지 않게
const lastPlayed = new Map<string, number>();
function throttle(key: string, ms: number) {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? 0) < ms) return false;
  lastPlayed.set(key, now);
  return true;
}

export const sfx = {
  // ---------- PANIC ----------
  tick(urgent: boolean) {
    tone(urgent ? 1320 : 880, 0, 0.07, "square", urgent ? 0.3 : 0.22);
  },
  alarm() {
    for (let i = 0; i < 2; i++) {
      tone(620, i * 0.36, 0.17, "sawtooth", 0.25);
      tone(880, i * 0.36 + 0.17, 0.17, "sawtooth", 0.25);
    }
  },
  complete() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.24, "square", 0.28));
  },
  timeOver() {
    tone(440, 0, 0.9, "sawtooth", 0.32, 110);
    tone(220, 0.05, 0.9, "square", 0.2, 70);
  },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.28, "square", 0.26));
  },
  go() {
    tone(660, 0, 0.1, "square", 0.24);
    tone(990, 0.12, 0.18, "square", 0.24);
  },
  coin() {
    tone(988, 0, 0.07, "square", 0.26);
    tone(1319, 0.07, 0.16, "square", 0.26);
  },
  mimic() {
    tone(180, 0, 0.12, "sawtooth", 0.4, 90);
    tone(140, 0.12, 0.12, "sawtooth", 0.4, 70);
    tone(110, 0.24, 0.35, "square", 0.35, 50);
  },

  // ---------- 전투 ----------
  /** 내 평타: 근접은 휙, 원거리는 퓽, 화염은 치익 */
  swing(kind: "melee" | "proj" | "flame") {
    if (!throttle("swing", kind === "flame" ? 140 : 70)) return;
    if (kind === "melee") noise(0, 0.08, 0.22, 2500);
    else if (kind === "flame") noise(0, 0.12, 0.12, 1200);
    else tone(900, 0, 0.08, "square", 0.14, 500);
  },
  hit() {
    if (!throttle("hit", 45)) return;
    noise(0, 0.05, 0.22, 1500);
    tone(220, 0, 0.05, "square", 0.12, 120);
  },
  crit() {
    if (!throttle("crit", 60)) return;
    noise(0, 0.07, 0.3, 2000);
    tone(1200, 0, 0.08, "square", 0.18, 600);
  },
  kill() {
    if (!throttle("kill", 50)) return;
    tone(520, 0, 0.12, "square", 0.2, 140);
    noise(0.02, 0.1, 0.12, 600);
  },
  hurt() {
    if (!throttle("hurt", 200)) return;
    tone(300, 0, 0.18, "sawtooth", 0.32, 90);
  },
  dash() {
    noise(0, 0.14, 0.2, 3000);
    tone(400, 0, 0.12, "triangle", 0.18, 900);
  },
  playerDown() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.1, 0.18, "square", 0.25));
  },

  // ---------- 스킬 ----------
  cast() {
    tone(660, 0, 0.08, "triangle", 0.2, 1320);
  },
  boom() {
    if (!throttle("boom", 80)) return;
    noise(0, 0.45, 0.45, 80);
    tone(120, 0, 0.4, "sine", 0.45, 40);
  },
  heal() {
    if (!throttle("heal", 150)) return;
    [784, 988, 1175].forEach((f, i) => tone(f, i * 0.06, 0.2, "triangle", 0.2));
  },
  zap() {
    if (!throttle("zap", 70)) return;
    noise(0, 0.12, 0.25, 4000);
    tone(1500, 0, 0.12, "sawtooth", 0.14, 300);
  },
  shout() {
    tone(180, 0, 0.3, "sawtooth", 0.3, 260);
    noise(0, 0.25, 0.15, 400);
  },
  shield() {
    tone(523, 0, 0.25, "triangle", 0.22, 1046);
  },
  blink() {
    tone(1400, 0, 0.12, "sine", 0.22, 400);
    tone(400, 0.1, 0.12, "sine", 0.2, 1400);
  },
  spin() {
    if (!throttle("spin", 120)) return;
    noise(0, 0.2, 0.2, 1800);
  },
  magic() {
    if (!throttle("magic", 100)) return;
    [659, 880, 1319].forEach((f, i) => tone(f, i * 0.05, 0.14, "square", 0.14));
  },

  // ---------- 화면·진행 ----------
  click() {
    tone(1100, 0, 0.04, "square", 0.14);
  },
  portal() {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.2, "triangle", 0.22));
  },
  revive() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.22, "triangle", 0.24));
  },
  bossRoar() {
    tone(90, 0, 1.1, "sawtooth", 0.4, 45);
    tone(140, 0.05, 1.0, "square", 0.22, 60);
    noise(0, 0.9, 0.25, 100);
  },
  defeat() {
    [392, 370, 349, 330, 262].forEach((f, i) => tone(f, i * 0.22, 0.3, "triangle", 0.3));
  },
};

// ======================== 배경음악 ========================
// 곡마다 템포·음계·코드 진행·악기만 정하고, 멜로디는 정해진 씨앗으로 매번 같은 곡이 만들어짐
export type BgmId = "lobby" | "rest" | "treasure" | "boss" | "panic" | `w${number}`;

interface Track {
  bpm: number;
  /** 으뜸음 (MIDI) */
  root: number;
  /** 음계 (반음 간격) */
  scale: number[];
  /** 마디마다 코드 (음계의 몇 번째 음) */
  prog: number[];
  lead: OscillatorType;
  bass: OscillatorType;
  /** 16칸 드럼: k 킥, s 스네어, h 하이햇 */
  drums: string;
  seed: number;
  /** 멜로디 밀도 0~1 */
  density: number;
  /** 화음 아르페지오 */
  arp?: boolean;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10];

const TRACKS: Record<string, Track> = {
  lobby: { bpm: 104, root: 60, scale: MAJOR, prog: [0, 5, 3, 4], lead: "square", bass: "triangle", drums: "k...h...s...h...", seed: 11, density: 0.45, arp: true },
  rest: { bpm: 88, root: 62, scale: MAJOR, prog: [0, 3, 4, 3], lead: "triangle", bass: "triangle", drums: "k.......s.......", seed: 23, density: 0.35, arp: true },
  treasure: { bpm: 126, root: 65, scale: MAJOR, prog: [0, 4, 5, 3], lead: "square", bass: "square", drums: "k.h.s.h.k.h.s.hh", seed: 31, density: 0.6 },
  w1: { bpm: 120, root: 60, scale: MAJOR, prog: [0, 4, 5, 3], lead: "square", bass: "triangle", drums: "k.h.s.h.k.hks.h.", seed: 101, density: 0.55 },
  w2: { bpm: 112, root: 62, scale: PHRYG_DOM, prog: [0, 1, 0, 6], lead: "sawtooth", bass: "triangle", drums: "k..hs.h.k.khs.h.", seed: 202, density: 0.5 },
  w3: { bpm: 100, root: 64, scale: LYDIAN, prog: [0, 1, 4, 0], lead: "triangle", bass: "triangle", drums: "k...h...s...h..h", seed: 303, density: 0.4, arp: true },
  w4: { bpm: 116, root: 57, scale: DORIAN, prog: [0, 3, 0, 4], lead: "square", bass: "square", drums: "k.hhs.h.k.hhs.hk", seed: 404, density: 0.55 },
  w5: { bpm: 128, root: 65, scale: MAJOR, prog: [0, 3, 4, 5], lead: "square", bass: "triangle", drums: "k.h.s.h.k.h.s.h.", seed: 505, density: 0.6, arp: true },
  w6: { bpm: 140, root: 57, scale: HARM, prog: [0, 5, 4, 4], lead: "sawtooth", bass: "square", drums: "kkh.s.hkk.h.s.hh", seed: 606, density: 0.65 },
  w7: { bpm: 92, root: 58, scale: MINOR, prog: [0, 5, 6, 4], lead: "triangle", bass: "sine", drums: "k.......s...h...", seed: 707, density: 0.35, arp: true },
  w8: { bpm: 132, root: 62, scale: MIXO, prog: [0, 6, 3, 0], lead: "square", bass: "square", drums: "k.hhs.hhk.hhs.hh", seed: 808, density: 0.6 },
  boss: { bpm: 152, root: 52, scale: HARM, prog: [0, 0, 5, 4], lead: "sawtooth", bass: "square", drums: "k.hks.hkk.hks.hk", seed: 909, density: 0.7 },
  panic: { bpm: 150, root: 55, scale: MINOR, prog: [0, 0, 5, 6], lead: "square", bass: "sawtooth", drums: "khhhskhhkhhhskhh", seed: 777, density: 0.75 },
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Song {
  track: Track;
  /** 마디 8개 × 16칸 멜로디 (MIDI, 없으면 쉼) */
  melody: (number | null)[];
}

function compose(t: Track): Song {
  const r = rng(t.seed);
  const deg = (d: number, oct = 0) => {
    const i = ((d % 7) + 7) % 7;
    return t.root + t.scale[i] + 12 * (oct + Math.floor(d / 7));
  };
  // 2마디짜리 프레이즈 A, B 를 만들어 A A B A' 로 반복 (8마디)
  const phrase = (bars: number[]) => {
    const out: (number | null)[] = [];
    let pos = 2;
    for (const chord of bars) {
      for (let step = 0; step < 16; step++) {
        const strong = step % 4 === 0;
        if (r() < (strong ? t.density + 0.25 : t.density * 0.6)) {
          // 강박은 코드 음, 약박은 음계를 따라 한두 칸 이동
          if (strong) pos = [0, 2, 4][Math.floor(r() * 3)];
          else pos += [-1, 1, 1, -2, 2][Math.floor(r() * 5)];
          pos = Math.max(-2, Math.min(9, pos));
          out.push(deg(chord + pos, 1));
        } else {
          out.push(null);
        }
      }
    }
    return out;
  };
  const p = t.prog;
  const A = phrase([p[0], p[1]]);
  const B = phrase([p[2], p[3]]);
  const B2 = phrase([p[2], p[3]]);
  return { track: t, melody: [...A, ...B, ...A, ...B2] };
}

const songs = new Map<string, Song>();

class BgmPlayer {
  private id: string | null = null;
  private song: Song | null = null;
  private step = 0;
  private nextT = 0;
  private timer: number | undefined;
  /** PANIC: 남은 시간이 줄수록 빨라짐 */
  tempoMul = 1;

  play(id: string | null) {
    if (id === this.id) return;
    this.id = id;
    this.tempoMul = 1;
    if (!id) {
      this.song = null;
      return;
    }
    let s = songs.get(id);
    if (!s) {
      const t = TRACKS[id] ?? TRACKS.w1;
      s = compose(t);
      songs.set(id, s);
    }
    this.song = s;
    this.step = 0;
    this.kick();
  }

  /** 소리가 막혀 있다가 풀리면 다시 시작 */
  kick() {
    const a = audio();
    if (!a || a.state !== "running" || !this.song) return;
    this.nextT = a.currentTime + 0.1;
    if (this.timer === undefined) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule() {
    const a = ctx;
    if (!a || !this.song) return;
    const t = this.song.track;
    const stepDur = 60 / (t.bpm * this.tempoMul) / 4;
    const deg = (d: number, oct = 0) => t.root + t.scale[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));
    // 배경음악이 꺼져 있으면 음을 만들지 않고 박자만 흘려보냄
    if (!settings.bgmOn) {
      this.nextT = a.currentTime + 0.1;
      return;
    }
    while (this.nextT < a.currentTime + 0.15) {
      const i = this.step % this.song.melody.length;
      const bar = Math.floor(i / 16) % t.prog.length;
      const chord = t.prog[bar];
      const s16 = i % 16;
      const when = this.nextT;
      // 멜로디
      const n = this.song.melody[i];
      if (n !== null) tone(midi(n), 0, stepDur * 1.8, t.lead, 0.09, undefined, bgmBus, when);
      // 베이스: 8분음표, 으뜸음과 5도
      if (s16 % 2 === 0) {
        const bn = deg(chord + (s16 % 8 === 4 ? 4 : 0), -1);
        tone(midi(bn), 0, stepDur * 1.6, t.bass, 0.13, undefined, bgmBus, when);
      }
      // 아르페지오
      if (t.arp && s16 % 2 === 1) tone(midi(deg(chord + [0, 2, 4, 7][(s16 >> 1) % 4], 0)), 0, stepDur, "triangle", 0.045, undefined, bgmBus, when);
      // 드럼
      const d = t.drums[s16];
      if (d === "k") tone(130, 0, 0.12, "sine", 0.3, 45, bgmBus, when);
      else if (d === "s") noise(0, 0.12, 0.13, 1200, bgmBus, when);
      else if (d === "h") noise(0, 0.03, 0.06, 6000, bgmBus, when);
      this.nextT += stepDur;
      this.step++;
    }
  }
}

export const bgm = new BgmPlayer();
