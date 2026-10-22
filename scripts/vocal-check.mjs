// Offline check of the vocal tuner (src/vocal/psola.ts): renders synthetic voices through it
// and measures the output pitch with its own estimator (a windowed DTFT peak search, separate
// from the tuner's YIN). Prints a table, writes each case as a WAV for scripts/vocal_check.py,
// and exits 1 if a case fails.
//
//   node scripts/vocal-check.mjs [out-dir]      (npm run check:vocal)

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const outDir = process.argv[2] ?? join(tmpdir(), 'drumpad-vocal-check');
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});
const { Tuner } = await server.ssrLoadModule('/src/vocal/psola.ts');
await server.close();

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const cents = (hz, ref) => 1200 * Math.log2(hz / ref);

// ---- Synthetic voice: harmonics shaped by three vowel formants (/a/), a little breath noise.

function formantGain(f) {
  let g = 0.05;
  for (const [fc, bw, amp] of [[700, 110, 1], [1220, 120, 0.5], [2600, 160, 0.25]]) {
    g += amp / Math.sqrt(1 + ((f - fc) / (bw / 2)) ** 2);
  }
  return g;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5;
  };
}

/** `pitch(t)` gives Hz at time t (s). Peak −6 dBFS, breath noise about −65 dBFS RMS.
 *  `jitter` is the RMS cycle-to-cycle change in period (a real voice: about 0.005). */
function voice(sr, seconds, pitch, { noise = 0.002, jitter = 0, seed = 1 } = {}) {
  const n = Math.round(sr * seconds);
  const out = new Float32Array(n);
  const maxH = 60;
  const phase = new Float64Array(maxH + 1);
  const rand = rng(seed);
  let wobble = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (phase[1] >= 2 * Math.PI) {
      for (let h = 1; h <= maxH; h++) phase[h] %= 2 * Math.PI * h;
      wobble = 1 + jitter * Math.sqrt(12) * rand(); // a new period length each cycle
    }
    const f = pitch(t) * wobble;
    let y = 0;
    for (let h = 1; h <= maxH && h * f < 7000; h++) {
      phase[h] += (2 * Math.PI * h * f) / sr;
      y += (formantGain(h * f) / h) * Math.sin(phase[h]);
    }
    out[i] = y * Math.min(1, t / 0.02, (seconds - t) / 0.02);
  }
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  for (let i = 0; i < n; i++) out[i] = (0.5 * out[i]) / peak + noise * rand();
  return out;
}

function noiseSignal(sr, seconds, seed = 7) {
  const rand = rng(seed);
  return Float32Array.from({ length: Math.round(sr * seconds) }, () => 0.3 * rand());
}

// ---- Run the tuner in 128-frame blocks, as an AudioWorklet does.

function render(sr, input, settings) {
  const tuner = new Tuner(sr);
  Object.assign(tuner.settings, settings);
  const out = new Float32Array(input.length);
  const t0 = performance.now();
  for (let i = 0; i < input.length; i += 128) {
    tuner.process(input.subarray(i, i + 128), out.subarray(i, i + 128));
  }
  return { out, ms: performance.now() - t0, delay: tuner.delay };
}

// ---- Independent pitch estimate: Hann-windowed DTFT magnitude on a 1-cent grid around a
// guess, peak refined by a parabola. Searching near the guess keeps it on the fundamental.

const FRAME = 2048;

function dtftPeak(x, start, sr, lo, hi) {
  const w = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME)) * x[start + i];
  const mags = [];
  const freqs = [];
  for (let c = cents(lo, 440); c <= cents(hi, 440); c += 1) {
    const f = 440 * 2 ** (c / 1200);
    const dr = Math.cos((2 * Math.PI * f) / sr);
    const di = -Math.sin((2 * Math.PI * f) / sr);
    let pr = 1;
    let pi = 0;
    let re = 0;
    let im = 0;
    for (let i = 0; i < FRAME; i++) {
      re += w[i] * pr;
      im += w[i] * pi;
      const t = pr * dr - pi * di;
      pi = pr * di + pi * dr;
      pr = t;
    }
    mags.push(Math.log(re * re + im * im + 1e-30));
    freqs.push(c);
  }
  let k = 0;
  for (let i = 1; i < mags.length; i++) if (mags[i] > mags[k]) k = i;
  if (k === 0 || k === mags.length - 1) return null; // no peak inside the range
  const [a, b, c] = [mags[k - 1], mags[k], mags[k + 1]];
  const frac = (a - c) / (2 * (a - 2 * b + c));
  return 440 * 2 ** ((freqs[k] + frac) / 1200);
}

/** Pitch track of `x` from `from` to `to` seconds, searching ±250 cents around `guess(t)`. */
function track(x, sr, from, to, guess, hop = 512) {
  const pts = [];
  for (let s = Math.round(from * sr); s + FRAME <= Math.min(x.length, to * sr); s += hop) {
    const t = (s + FRAME / 2) / sr;
    const g = guess(t);
    const hz = dtftPeak(x, s, sr, g * 2 ** (-250 / 1200), g * 2 ** (250 / 1200));
    if (hz) pts.push({ t, hz });
  }
  return pts;
}

const median = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
const pct = (a, p) => [...a].sort((p1, q) => p1 - q)[Math.min(a.length - 1, Math.floor(a.length * p))];
const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));

function writeWav(name, sr, x) {
  const buf = Buffer.alloc(44 + x.length * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + x.length * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(x.length * 4, 40);
  for (let i = 0; i < x.length; i++) buf.writeFloatLE(x[i], 44 + i * 4);
  writeFileSync(join(outDir, name), buf);
}

// ---- Cases. Key C major throughout; A3 = 220 Hz.

const A3 = midiHz(57);
const rows = [];
const expectations = []; // for vocal_check.py: { file, from, to, expect (Hz) or null }
let cpuMs = 0;
let cpuSec = 0;

function check(name, pass, detail) {
  rows.push({ name, pass, detail });
}

function steadyCase(name, sr, inHz, expectHz, settings, { tol = 3, from = 0.6, jitter = 0 } = {}) {
  const secs = 2.5;
  const input = voice(sr, secs, () => inHz, { jitter });
  const { out, ms } = render(sr, input, settings);
  cpuMs += ms;
  cpuSec += secs;
  const pts = track(out, sr, from, secs - 0.1, () => expectHz);
  const errs = pts.map((p) => cents(p.hz, expectHz));
  const med = median(errs);
  const p95 = pct(errs.map(Math.abs), 0.95);
  const inMed = median(track(input, sr, from, secs - 0.1, () => inHz).map((p) => cents(p.hz, expectHz)));
  check(name, Math.abs(med) < tol && p95 < 3 * tol, `in ${inMed.toFixed(1)} c → out median ${med.toFixed(1)} c, p95 |err| ${p95.toFixed(1)} c`);
  const file = `${name.replace(/[^a-z0-9]+/gi, '-')}.wav`;
  writeWav(file, sr, out);
  expectations.push({ file, from, to: secs - 0.1, expect: expectHz });
  return { input, out };
}

const SR = 48000;
const hard = { key: 0, scale: 'major', strength: 1, speed: 0 };

steadyCase('A3 +50 c, hard', SR, A3 * 2 ** (50 / 1200), A3, hard);
steadyCase('A3 -40 c, hard', SR, A3 * 2 ** (-40 / 1200), A3, hard);
steadyCase('A3 +40 c, strength 0.5', SR, A3 * 2 ** (40 / 1200), A3 * 2 ** (20 / 1200), { ...hard, strength: 0.5 });
steadyCase('A3 +40 c, speed 200 ms', SR, A3 * 2 ** (40 / 1200), A3, { ...hard, speed: 200 }, { from: 1.4 });
steadyCase('G2 +40 c (98 Hz), hard', SR, midiHz(43) * 2 ** (40 / 1200), midiHz(43), hard);
steadyCase('E5 +30 c (659 Hz), hard', SR, midiHz(76) * 2 ** (30 / 1200), midiHz(76), hard);
steadyCase('A3 +50 c, 44.1 kHz', 44100, A3 * 2 ** (50 / 1200), A3, hard);
steadyCase('D4 +45 c, A minor', SR, midiHz(62) * 2 ** (45 / 1200), midiHz(62), { ...hard, key: 9, scale: 'minor' });
// A wide shift: B3 −40 c in A minor pentatonic goes up 1.4 semitones to C4 (A3 is 1.6 below).
steadyCase('B3 -40 c → C4, pent minor', SR, midiHz(59) * 2 ** (-40 / 1200), midiHz(60), { ...hard, key: 9, scale: 'pentMinor' });
// A real voice's period wobbles about 0.5 % cycle to cycle; hard tune should not add to it.
steadyCase('A3 +50 c, jittery, hard', SR, A3 * 2 ** (50 / 1200), A3, hard, { jitter: 0.005, tol: 5 });

// In tune: pitch kept, level kept, delay within DELAY_MS + one period.
{
  const { input, out } = steadyCase('A3 in tune', SR, A3, A3, hard);
  const a = Math.round(0.6 * SR);
  const b = Math.round(2.3 * SR);
  const levelDb = 20 * Math.log10(rms(out, a, b) / rms(input, a, b));
  const delay = Math.round(0.02 * SR);
  const period = Math.round(SR / A3);
  let best = 0;
  let bestLag = 0;
  for (let lag = 0; lag < 3000; lag++) {
    let s = 0;
    for (let i = a; i < b; i++) s += out[i] * input[i - lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  // A periodic signal correlates every period; the true lag is the one in [delay, delay + period).
  const lagMod = delay + ((((bestLag - delay) % period) + period) % period);
  check('A3 in tune: level', Math.abs(levelDb) < 1, `${levelDb.toFixed(2)} dB`);
  check('A3 in tune: delay', lagMod >= delay && lagMod < delay + period, `${((lagMod / SR) * 1000).toFixed(2)} ms (allowed ${((delay / SR) * 1000).toFixed(1)}–${(((delay + period) / SR) * 1000).toFixed(1)} ms)`);
}

// Vibrato ±40 c at 5.5 Hz around A3: hard flattens it, speed 200 ms keeps most of it.
for (const [label, speed, want] of [['hard', 0, 'flat'], ['speed 200 ms', 200, 'kept']]) {
  const secs = 3;
  const vib = (t) => A3 * 2 ** ((40 * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
  const input = voice(SR, secs, vib);
  const { out, ms } = render(SR, input, { ...hard, speed });
  cpuMs += ms;
  cpuSec += secs;
  const depth = (x) => {
    const c = track(x, SR, 0.6, secs - 0.1, () => A3, 256).map((p) => cents(p.hz, A3));
    return (pct(c, 0.95) - pct(c, 0.05)) / 2;
  };
  const dIn = depth(input);
  const dOut = depth(out);
  const pass = want === 'flat' ? dOut < 0.25 * dIn : dOut > 0.6 * dIn;
  check(`Vibrato ±40 c, ${label}`, pass, `depth in ±${dIn.toFixed(1)} c → out ±${dOut.toFixed(1)} c (${want === 'flat' ? '< 25 %' : '> 60 %'})`);
  const file = `Vibrato-${label.replace(/[^a-z0-9]+/gi, '-')}.wav`;
  writeWav(file, SR, out);
  expectations.push({ file, from: 0.6, to: secs - 0.1, expect: null });
}

// Glide A3 → C4 over 2 s, hard: the output steps A3, B3, C4 and sits on scale notes.
{
  const secs = 3;
  const glide = (t) => midiHz(57 + 3 * Math.min(1, Math.max(0, (t - 0.5) / 2)));
  const input = voice(SR, secs, glide);
  const { out, ms } = render(SR, input, hard);
  cpuMs += ms;
  cpuSec += secs;
  const pts = track(out, SR, 0.3, secs - 0.1, (t) => glide(t - 0.02), 256);
  const notes = [];
  let onNote = 0;
  for (const p of pts) {
    const m = 69 + 12 * Math.log2(p.hz / 440);
    const n = Math.round(m);
    if (Math.abs(m - n) * 100 < 10 && [57, 59, 60].includes(n)) {
      onNote++;
      if (notes[notes.length - 1] !== n) notes.push(n);
    }
  }
  const share = onNote / pts.length;
  const order = notes.join(',') === '57,59,60';
  check('Glide A3→C4, hard', share > 0.85 && order, `${(share * 100).toFixed(0)} % of frames within 10 c of a scale note; notes in order ${notes.join(' → ')}`);
  writeWav('Glide.wav', SR, out);
  expectations.push({ file: 'Glide.wav', from: 0.3, to: secs - 0.1, expect: null });
}

// Unvoiced (noise) passes through unchanged, only delayed.
{
  const input = noiseSignal(SR, 1.5);
  const { out, delay } = render(SR, input, hard);
  let best = -1;
  let bestLag = 0;
  for (let lag = delay; lag < delay + SR / 80 + 2; lag++) {
    let s = 0;
    for (let i = SR * 0.5; i < SR * 1.4; i++) s += out[i] * input[i - lag];
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  let err = 0;
  let ref = 0;
  for (let i = SR * 0.5; i < SR * 1.4; i++) {
    err += (out[i] - input[i - bestLag]) ** 2;
    ref += input[i - bestLag] ** 2;
  }
  const db = 10 * Math.log10(err / ref);
  check('Noise passes through', db < -60, `residual ${db.toFixed(1)} dB at ${((bestLag / SR) * 1000).toFixed(2)} ms`);
}

// Silence in, silence out.
{
  const { out } = render(SR, new Float32Array(SR), hard);
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  check('Silence stays silent', peak === 0, `peak ${peak}`);
}

writeFileSync(join(outDir, 'cases.json'), JSON.stringify(expectations, null, 1));

let failed = 0;
for (const r of rows) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(28)} ${r.detail}`);
}
console.log(`CPU: ${((cpuMs / 1000 / cpuSec) * 100).toFixed(2)} % of real time (this machine, Node)`);
console.log(`WAVs: ${outDir}`);
console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
