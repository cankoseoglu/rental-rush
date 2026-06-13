"use client";

// ---------------------------------------------------------------------------
// Procedural sound. No asset files, no network, no licensing — everything is
// synthesised with the Web Audio API. Three voices the game asks for:
//   · dice roll  — a filtered-noise rattle with tumbling clicks + a settle
//   · token hop  — a soft marimba tap per board step
//   · background — a calm, slowly evolving major-9 pad while a game is on
// A single master gain handles mute; everything is SSR-guarded.
// ---------------------------------------------------------------------------

const MUTE_KEY = "rr.muted.v1";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  // a gentle limiter so music + dice + hops never clip when they stack
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

/** Read the saved mute preference (call once on mount). */
export function loadMutePref(): boolean {
  if (typeof window === "undefined") return false;
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

/** Create + resume the context. Must be called from a user gesture. */
export function initAudio(): void {
  const c = ensureCtx();
  if (c && c.state === "suspended") void c.resume();
}

export function setMuted(next: boolean): void {
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
  const c = ensureCtx();
  if (c && master) {
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setTargetAtTime(next ? 0 : 1, c.currentTime, 0.08);
    if (!next && c.state === "suspended") void c.resume();
  }
}

// --- one-shot helpers --------------------------------------------------------

function blip(
  c: AudioContext,
  dest: AudioNode,
  t: number,
  from: number,
  to: number,
  vol: number,
  dur: number,
  type: OscillatorType = "triangle",
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;
function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer;
  const len = Math.floor(c.sampleRate * 0.6);
  noiseBuffer = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  // deterministic-ish noise; this is presentation only, no game RNG involved
  let s = 1234567;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (s / 0x40000000 - 1) * (1 - i / len); // fade the tail
  }
  return noiseBuffer;
}

/** The dice rattle: ~0.55s, matched to the on-screen shake. */
export function playDice(): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  const dur = 0.5;

  const noise = c.createBufferSource();
  noise.buffer = getNoise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(800, now);
  bp.frequency.exponentialRampToValueAtTime(2600, now + dur);
  bp.Q.value = 0.9;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, now);
  ng.gain.linearRampToValueAtTime(0.16, now + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(bp).connect(ng).connect(master);
  noise.start(now);
  noise.stop(now + dur);

  // tumbling clicks
  for (let k = 0; k < 4; k++) {
    const t = now + 0.05 + k * 0.1;
    blip(c, master, t, 220 + k * 40, 150, 0.1, 0.07);
  }
  // settle thunk
  blip(c, master, now + dur, 150, 90, 0.16, 0.12);
}

/** A soft hop tap as the token lands on each tile; pitch steps up the run. */
export function playHop(i: number): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const now = c.currentTime;
  // gentle pentatonic-ish walk so a long roll sounds like footsteps, not a siren
  const steps = [0, 3, 5, 7, 10];
  const semis = steps[i % steps.length] + Math.floor(i / steps.length) * 2;
  const freq = 330 * Math.pow(2, semis / 12);
  blip(c, master, now, freq * 1.6, freq, 0.12, 0.14, "sine");
}

// --- money & feedback cues ---------------------------------------------------
// Generic, synthesized takes on the universal game-money sounds: a register
// ring for cash in, a terminal beep for cash out, a fail tone, a token clink.

/** A short ringing bell (sine fundamental + shimmer partials). */
function bell(c: AudioContext, t: number, freq: number, vol: number, decay: number) {
  if (!master) return;
  for (const [mult, v] of [
    [1, vol],
    [2, vol * 0.4],
    [2.76, vol * 0.18], // inharmonic partial → metallic sparkle
  ] as const) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * mult;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/** Cash collected: a sparkling two-note register ring with a drawer "cha". */
export function playCash(): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  // drawer/bell-strike noise
  const noise = c.createBufferSource();
  noise.buffer = getNoise(c);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3200;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.1, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  noise.connect(hp).connect(ng).connect(master);
  noise.start(now);
  noise.stop(now + 0.08);
  // two ascending dings
  bell(c, now, 1318.5, 0.17, 0.4); // E6
  bell(c, now + 0.085, 1760, 0.2, 0.55); // A6
}

/** Cash spent: a crisp two-tone electronic terminal beep. */
export function playSpend(): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  blip(c, master, now, 920, 920, 0.09, 0.06, "square");
  blip(c, master, now + 0.085, 1380, 1380, 0.09, 0.07, "square");
}

/** Failed transaction / insolvency: a buzzy descending "denied" tone. */
export function playError(): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  blip(c, master, now, 400, 300, 0.1, 0.18, "sawtooth");
  blip(c, master, now + 0.14, 300, 196, 0.1, 0.24, "sawtooth");
}

/** Token set-down: a tiny metallic clink (high ping + filtered tick). */
export function playClink(): void {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const now = c.currentTime;
  bell(c, now, 2300, 0.09, 0.13);
  const noise = c.createBufferSource();
  noise.buffer = getNoise(c);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 5200;
  bp.Q.value = 2.2;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.07, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  noise.connect(bp).connect(ng).connect(master);
  noise.start(now);
  noise.stop(now + 0.05);
}

// --- background melody -------------------------------------------------------
// A warm lo-fi loop: chords + walking bass + a music-box melody with a soft
// echo. Two 8-bar phrases (A then B over the same C–Am–F–G changes) make a
// ~48s loop so the tune doesn't feel repetitive. A lookahead scheduler keeps
// timing tight despite JS timer jitter.

const BPM = 82;
const SPB = 60 / BPM; // seconds per beat
const LOOP_BEATS = 16 * 4; // 16 bars of 4/4

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// one chord per bar: C Am F G, twice over the 16-bar loop
const CHORDS: { pad: number[]; bass: number }[] = [
  { pad: [60, 64, 67, 71], bass: 36 }, // Cmaj7
  { pad: [57, 60, 64, 67], bass: 33 }, // Am7
  { pad: [53, 57, 60, 64], bass: 29 }, // Fmaj7
  { pad: [55, 59, 62, 65], bass: 31 }, // G7
];
const BAR_CHORD = [0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3];

// melody as [midi | null rest, beats], laid end to end across the 16 bars
const MELODY: Array<[number | null, number]> = [
  // phrase A
  [64, 1], [67, 1], [72, 1], [null, 1],
  [71, 1.5], [67, 0.5], [64, 1], [null, 1],
  [69, 1], [72, 1], [71, 1], [null, 1],
  [67, 1], [64, 1], [69, 2],
  [69, 1], [72, 1], [77, 1], [null, 1],
  [76, 1.5], [72, 0.5], [69, 1], [null, 1],
  [67, 1], [71, 1], [74, 1], [null, 1],
  [77, 1], [74, 1], [67, 2],
  // phrase B
  [67, 0.5], [69, 0.5], [67, 1], [64, 1], [null, 1],
  [72, 1], [74, 1], [76, 2],
  [72, 0.5], [71, 0.5], [69, 1], [67, 1], [64, 1],
  [69, 2], [null, 2],
  [65, 0.5], [67, 0.5], [69, 1], [72, 1], [69, 1],
  [67, 1], [65, 1], [64, 2],
  [62, 1], [67, 1], [71, 1], [74, 1],
  [72, 2], [null, 2],
];

interface Music {
  gain: GainNode;
  chordBus: AudioNode;
  melodyBus: AudioNode;
  delay: DelayNode;
  timer: ReturnType<typeof setInterval>;
  nextLoopAt: number;
}
let music: Music | null = null;

/** Schedule one envelope-shaped oscillator note. */
function voice(
  c: AudioContext,
  dest: AudioNode,
  freq: number,
  t: number,
  dur: number,
  vol: number,
  type: OscillatorType,
  attack: number,
  release: number,
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + release + 0.05);
}

function scheduleLoop(c: AudioContext, m: Music, start: number) {
  // chords (soft pad) + walking bass
  for (let bar = 0; bar < 16; bar++) {
    const barT = start + bar * 4 * SPB;
    const ch = CHORDS[BAR_CHORD[bar]];
    for (const n of ch.pad) {
      voice(c, m.chordBus, midi(n), barT, 4 * SPB * 0.96, 0.038, "triangle", 0.5, 0.4);
    }
    voice(c, m.chordBus, midi(ch.bass), barT, 1.7 * SPB, 0.13, "sine", 0.02, 0.25);
    voice(c, m.chordBus, midi(ch.bass), barT + 2 * SPB, 1.7 * SPB, 0.11, "sine", 0.02, 0.25);
  }
  // melody (music-box: triangle + an octave of sine sparkle), with echo send
  let beat = 0;
  for (const [n, d] of MELODY) {
    if (n !== null) {
      const t = start + beat * SPB;
      const dur = d * SPB * 0.9;
      const f = midi(n);
      const vol = 0.17 * (0.9 + Math.random() * 0.2); // gentle humanise
      voice(c, m.melodyBus, f, t, dur, vol, "triangle", 0.012, 0.5);
      voice(c, m.melodyBus, f * 2, t, dur * 0.6, vol * 0.22, "sine", 0.012, 0.3);
      voice(c, m.delay, f, t, dur, vol * 0.5, "triangle", 0.012, 0.4);
    }
    beat += d;
  }
}

export function startBackground(): void {
  const c = ensureCtx();
  if (!c || !master || music) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.9, now + 2.5); // slow fade-in (master handles mute)
  gain.connect(master);

  // pad/bass tone-shaping
  const chordBus = c.createBiquadFilter();
  chordBus.type = "lowpass";
  chordBus.frequency.value = 1500;
  chordBus.Q.value = 0.4;
  chordBus.connect(gain);

  // melody bus + a tape-ish echo for lo-fi space
  const melodyBus = c.createGain();
  melodyBus.gain.value = 1;
  melodyBus.connect(gain);
  const delay = c.createDelay(1.0);
  delay.delayTime.value = SPB * 0.75;
  const fb = c.createGain();
  fb.gain.value = 0.26;
  const wet = c.createGain();
  wet.gain.value = 0.16;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(gain);

  const m: Music = { gain, chordBus, melodyBus, delay, timer: 0 as never, nextLoopAt: now + 0.25 };
  music = m;

  const pump = () => {
    if (!music) return;
    // schedule whole loops a little ahead of the playhead
    while (music.nextLoopAt < c.currentTime + 1.5) {
      scheduleLoop(c, music, music.nextLoopAt);
      music.nextLoopAt += LOOP_BEATS * SPB;
    }
  };
  pump();
  m.timer = setInterval(pump, 250);
}

export function stopBackground(): void {
  const c = ctx;
  if (!c || !music) return;
  const m = music;
  music = null;
  clearInterval(m.timer);
  const now = c.currentTime;
  m.gain.gain.cancelScheduledValues(now);
  m.gain.gain.setTargetAtTime(0.0001, now, 0.35); // fade out; queued notes die silent
  setTimeout(() => {
    try {
      m.gain.disconnect();
    } catch {
      /* already gone */
    }
  }, 2000);
}

// Debug/automation handle (used by scripts; harmless in production).
if (typeof window !== "undefined") {
  (window as unknown as { __audio?: unknown }).__audio = {
    playDice, playHop, playCash, playSpend, playError, playClink,
    startBackground, stopBackground, setMuted, isMuted, initAudio,
  };
}
