// Downloads the CC0 Sonic Pi samples used by the built-in kits into public/samples/sonicpi/.
// The sample list comes from src/audio/kits.json (the same file the app reads), so there is
// nothing to keep in sync by hand. Pinned to a release tag so the files never change underneath us.
// Skips files already present. Usage: npm run fetch-samples
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'samples', 'sonicpi');
const { source, kits, banks } = JSON.parse(readFileSync(join(ROOT, 'src', 'audio', 'kits.json'), 'utf8'));

const FILES = new Set();
// Names with a folder ("instruments/kalimba/pad_60") aren't Sonic Pi files: fetch-instruments makes them.
const addPads = (pads) => {
  for (const pad of pads) {
    for (const name of [pad.hard, pad.soft]) if (name && !name.includes('/')) FILES.add(name);
  }
};
for (const kit of kits) {
  addPads(kit.pads);
  for (const pads of Object.values(kit.banks ?? {})) addPads(pads);
}
for (const pads of Object.values(banks)) addPads(pads);

mkdirSync(OUT, { recursive: true });
let got = 0, skipped = 0, failed = 0;
for (const name of FILES) {
  const dest = join(OUT, `${name}.flac`);
  if (existsSync(dest)) { skipped++; continue; }
  const res = await fetch(`${source.url}/${name}.flac`);
  if (!res.ok) { console.error(`FAIL ${name}: HTTP ${res.status}`); failed++; continue; }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  got++;
}
console.log(`samples: ${got} downloaded, ${skipped} already present, ${failed} failed (${kits.length} kits, tag ${source.tag})`);
if (failed) process.exit(1);
