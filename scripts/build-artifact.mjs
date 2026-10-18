// Builds the app for a private Claude artifact (play it on a phone on any network).
// Output: dist-artifact/ with drum-pads.html (the page), the assets, icons and samples, plus
// files.json (the supporting files list Claude passes to the Artifact tool when publishing).
// Artifacts can't serve FLAC, so every sample is converted to WAV and the app is built with
// VITE_SAMPLE_EXT=wav. Paths are relative (base ./). The service worker and manifest are left out:
// artifacts can't run them, so there is no install or offline mode there (and no Web MIDI).
// Needs ffmpeg on the PATH. Usage: npm run build:artifact
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-artifact');
const PAGE = 'drum-pads.html';
const PARALLEL = 4;
// Artifact limits per publish (Artifact tool, checked 2026-10-18).
const MAX_FILES = 255;
const MAX_BYTES = 64 * 1024 * 1024;

process.env.VITE_SAMPLE_EXT = 'wav';
process.env.HTTP = '1'; // no self-signed certificate plugin; not needed for a build
const { build } = await import('vite');
await build({ root: ROOT, base: './', logLevel: 'warn', build: { outDir: OUT, emptyOutDir: true } });

/** Every file under `dir`, as paths relative to OUT with forward slashes. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(OUT, join(dir, e.name)).split('\\').join('/')],
  );
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`ffmpeg not found (${e.message}). Install it and put it on the PATH.`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.trim()}`))));
  });
}

// The page: the built index.html's asset links, without the document skeleton (the artifact adds it).
const index = readFileSync(join(OUT, 'index.html'), 'utf8');
const js = index.match(/<script[^>]+src="(\.\/assets\/[^"]+\.js)"/)?.[1];
const css = index.match(/<link[^>]+href="(\.\/assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('Could not find the built script and stylesheet in index.html');
writeFileSync(
  join(OUT, PAGE),
  `<title>Drum Pad Controller</title>
<meta name="theme-color" content="#2B2A28">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="${css}">
<style>html,body{background:#2B2A28;color:#D6D1C6;color-scheme:dark}</style>
<div id="app"></div>
<script type="module" src="${js}"></script>
`,
);

// Drop what artifacts can't use: the service worker (workbox-window, which the app imports, stays).
for (const f of walk(OUT)) {
  if (f === 'index.html' || f === 'sw.js' || f === 'manifest.webmanifest' || /^workbox-[^/]+\.js$/.test(f)) rmSync(join(OUT, f));
}

// FLAC → WAV (16-bit PCM, same rate and channels), a few at a time.
const flacs = walk(OUT).filter((f) => f.endsWith('.flac'));
let next = 0;
async function worker() {
  while (next < flacs.length) {
    const f = flacs[next++];
    await ffmpeg(['-i', join(OUT, f), '-c:a', 'pcm_s16le', join(OUT, f.replace(/\.flac$/, '.wav'))]);
    rmSync(join(OUT, f));
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

const files = walk(OUT).filter((f) => f !== PAGE && f !== 'files.json');
writeFileSync(join(OUT, 'files.json'), JSON.stringify(files.map((path) => ({ path }))));
const bytes = files.reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
console.log(`dist-artifact: ${PAGE} + ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (${flacs.length} samples as WAV)`);
if (files.length > MAX_FILES || bytes > MAX_BYTES) console.warn(`Over one publish's limit (${MAX_FILES} files, 64 MB): publish in parts.`);
