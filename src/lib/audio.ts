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
let bg: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
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

// --- background pad ----------------------------------------------------------

export function startBackground(): void {
  const c = ensureCtx();
  if (!c || !master || bg) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;

  const sub = c.createGain();
  sub.gain.setValueAtTime(0.0001, now);
  sub.gain.linearRampToValueAtTime(0.5, now + 3); // slow fade-in

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 620;
  filter.Q.value = 0.6;

  // slow cutoff "breathing"
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  filter.connect(sub).connect(master);

  // A add9 voicing, low and warm: A2 E3 A3 B3 C#4
  const chord = [110, 164.81, 220, 246.94, 277.18];
  const oscs: OscillatorNode[] = [];
  chord.forEach((f, i) => {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = i % 2 === 0 ? 4 : -4; // gentle beating for warmth
    const g = c.createGain();
    g.gain.value = 0.1;
    o.connect(g).connect(filter);
    o.start(now);
    oscs.push(o);
  });

  bg = { gain: sub, nodes: [lfo, ...oscs] };
}

export function stopBackground(): void {
  const c = ctx;
  if (!c || !bg) return;
  const now = c.currentTime;
  const { gain, nodes } = bg;
  bg = null;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(0.0001, now, 0.4);
  for (const n of nodes) {
    try {
      n.stop(now + 1.6);
    } catch {
      /* already stopped */
    }
  }
}
