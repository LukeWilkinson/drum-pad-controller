// Checks the converted KEYS instrument samples (public/samples/instruments/<id>/<note>.flac):
// decodes each with ffmpeg, measures its pitch with the app's own YIN (src/vocal/pitch.ts) and
// its loudness, and checks that every archive source's licence text says CC0. Exits 1 when a
// sample is more than 10 cents off its note (within the octave) or a licence is missing.
// The level column is for setting each instrument's `gain` (the older ones sit near −28 dBFS).
// Kalimba tines are inharmonic, so YIN can't read most of them and its row fails; ignore it.
//
//   node scripts/instrument-check.mjs [id ...]      (npm run check:instruments; default: all)
//
// YIN covers 80–1000 Hz, so each file is read as if its sample rate were k times higher (k a power
// of 2 that brings the note into 100–800 Hz) and the result divided by k again.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { sources, format, instruments } = JSON.parse(readFileSync(join(ROOT, 'src', 'audio', 'instruments.json'), 'utf8'));
const only = process.argv.slice(2);
const TOLERANCE = 10;

const server = await createServer({
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});
const { Yin } = await server.ssrLoadModule('/src/vocal/pitch.ts');
await server.close();

function decode(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-f', 'f32le', 'pipe:1']);
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code} for ${file}`));
      const buf = Buffer.concat(out);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
    });
  });
}

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Median pitch (Hz) over 0.15–1.2 s, from windows YIN is confident about. When nothing is found,
 *  tries again an octave higher (a sub-octave fundamental below YIN's range, as on the organ). */
function measure(x, rate, note) {
  let k = 1;
  while (midiHz(note) * k < 100) k *= 2;
  while (midiHz(note) * k > 800) k /= 2;
  return measureAt(x, rate, k) || measureAt(x, rate, k * 2);
}

function measureAt(x, rate, k) {
  const yin = new Yin(rate * k);
  const found = [];
  const end = Math.min(x.length - yin.size, Math.round(1.2 * rate));
  for (let start = Math.round(0.15 * rate); start < end; start += yin.size >> 1) {
    const { hz, conf } = yin.detect(x.subarray(start, start + yin.size));
    if (hz > 0 && conf > 0.8) found.push(hz / k);
  }
  if (!found.length) return 0;
  found.sort((a, b) => a - b);
  return found[found.length >> 1];
}

/** RMS level of the first second in dBFS. */
function level(x, rate) {
  const n = Math.min(x.length, rate);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[i] * x[i];
  return 10 * Math.log10(sum / n + 1e-12);
}

let failed = 0;
for (const inst of instruments) {
  if (only.length && !only.includes(inst.id)) continue;
  const offs = [];
  const levels = [];
  const bad = [];
  const octaves = [];
  for (const s of inst.samples) {
    const file = join(ROOT, 'public', 'samples', 'instruments', inst.id, `${s.note}.flac`);
    if (!existsSync(file)) { bad.push(`${s.note} missing`); continue; }
    const x = await decode(file);
    levels.push(level(x, format.rate));
    const hz = measure(x, format.rate, s.note);
    if (!hz) { bad.push(`${s.note} no pitch`); continue; }
    let c = 1200 * Math.log2(hz / midiHz(s.note));
    // A whole-octave reading is YIN locking onto a strong sub-octave or 2nd harmonic (the organ's 16'
    // drawbar, a low guitar string): reported, not failed. The cents within the octave still count.
    const oct = Math.round(c / 1200);
    c -= oct * 1200;
    if (oct) octaves.push(`${s.note}${oct > 0 ? '+' : ''}${oct}oct`);
    offs.push(c);
    if (Math.abs(c) > TOLERANCE) bad.push(`${s.note} ${c > 0 ? '+' : ''}${c.toFixed(1)}c`);
  }
  const worst = offs.reduce((m, c) => Math.max(m, Math.abs(c)), 0);
  const avg = levels.reduce((a, b) => a + b, 0) / (levels.length || 1);
  console.log(
    `${bad.length ? 'FAIL' : 'ok  '} ${inst.id.padEnd(8)} ${String(inst.samples.length).padStart(2)} samples  worst ${worst.toFixed(1)}c  ` +
    `level ${avg.toFixed(1)} dBFS (+gain ${inst.gain} = ${(avg + inst.gain).toFixed(1)})${bad.length ? `  ${bad.join(', ')}` : ''}` +
    (octaves.length ? `  [octave readings: ${octaves.join(' ')}]` : ''),
  );
  if (bad.length) failed++;
}

// Licence: each archive source's unpacked folder (from fetch-instruments) must contain CC0 text.
for (const [key, src] of Object.entries(sources)) {
  if (!src.archive) continue;
  const dir = join(ROOT, '.cache', 'instruments', key);
  if (!existsSync(dir)) { console.log(`skip licence ${key}: not unpacked (run npm run fetch-instruments)`); continue; }
  const texts = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (/\.txt$/i.test(e.name)) texts.push(readFileSync(join(d, e.name), 'utf8'));
    }
  };
  walk(dir);
  const ok = texts.some((t) => /CC0|publicdomain\/zero/i.test(t));
  console.log(`${ok ? 'ok  ' : 'FAIL'} licence ${key}: ${ok ? 'CC0' : 'no CC0 text found'}`);
  if (!ok) failed++;
}

if (failed) process.exit(1);
