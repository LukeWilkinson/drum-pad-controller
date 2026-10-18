// Downloads the CC0 samples for the sampled KEYS instruments and converts them with ffmpeg into
// small files: public/samples/instruments/<id>/<note>.flac (mono, 32 kHz, 16-bit, leading silence
// removed, trimmed to the instrument's length with a short fade-out).
// The file list comes from src/audio/instruments.json (the same file the app reads), pinned to a
// commit of each repo so the files never change underneath us. Skips files already present.
// Needs ffmpeg on the PATH. Usage: npm run fetch-instruments
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'samples', 'instruments');
const { sources, format, instruments } = JSON.parse(readFileSync(join(ROOT, 'src', 'audio', 'instruments.json'), 'utf8'));
const PARALLEL = 4;

/** Runs ffmpeg with `input` on stdin and returns stdout. */
function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`ffmpeg not found (${e.message}). Install it and put it on the PATH.`)));
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exit ${code}: ${err.trim()}`))));
    p.stdin.on('error', () => {}); // ffmpeg may stop reading early; the exit code reports any real problem
    p.stdin.end(input);
  });
}

async function convert(inst, sample, dest) {
  const { repo, commit } = sources[sample.source];
  const url = `https://raw.githubusercontent.com/${repo}/${commit}/${sample.file.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${sample.file}`);
  const wav = Buffer.from(await res.arrayBuffer());
  const len = inst.seconds;
  const fade = format.fadeOut;
  const filters = [
    'aformat=channel_layouts=mono',
    'silenceremove=start_periods=1:start_threshold=-60dB',
    `atrim=0:${len}`,
    `afade=t=out:st=${len - fade}:d=${fade}`,
  ].join(',');
  const flac = await ffmpeg(
    ['-i', 'pipe:0', '-af', filters, '-ar', String(format.rate), '-sample_fmt', 's16', '-c:a', 'flac', '-compression_level', '8', '-f', 'flac', 'pipe:1'],
    wav,
  );
  writeFileSync(dest, flac);
}

const jobs = [];
for (const inst of instruments) {
  mkdirSync(join(OUT, inst.id), { recursive: true });
  for (const sample of inst.samples) jobs.push({ inst, sample, dest: join(OUT, inst.id, `${sample.note}.flac`) });
}

let got = 0, skipped = 0, failed = 0;
const queue = [...jobs];
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      if (existsSync(job.dest)) { skipped++; continue; }
      try {
        await convert(job.inst, job.sample, job.dest);
        got++;
      } catch (err) {
        console.error(`FAIL ${job.inst.id}/${job.sample.note}: ${err.message}`);
        failed++;
      }
    }
  }),
);

for (const inst of instruments) {
  const bytes = inst.samples.reduce((n, s) => {
    const f = join(OUT, inst.id, `${s.note}.flac`);
    return n + (existsSync(f) ? statSync(f).size : 0);
  }, 0);
  console.log(`${inst.id.padEnd(8)} ${String(inst.samples.length).padStart(2)} samples  ${(bytes / 1e6).toFixed(2)} MB`);
}
console.log(`instruments: ${got} converted, ${skipped} already present, ${failed} failed`);
if (failed) process.exit(1);
