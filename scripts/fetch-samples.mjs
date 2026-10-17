// Downloads the CC0 Sonic Pi samples used by the default kit into public/samples/sonicpi/.
// Pinned to a release tag so the files never change underneath us. Skips files already present.
// Usage: npm run fetch-samples
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = 'v4.5.1';
const BASE = `https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/${TAG}/etc/samples`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples', 'sonicpi');

// Keep in sync with src/audio/kit.ts
const FILES = [
  'drum_splash_soft', 'drum_splash_hard',
  'drum_cymbal_soft', 'drum_cymbal_hard',
  'drum_tom_hi_soft', 'drum_tom_hi_hard',
  'drum_tom_lo_soft', 'drum_tom_lo_hard',
  'drum_cymbal_open', 'drum_cymbal_closed', 'drum_cymbal_pedal',
  'perc_swash',
  'drum_snare_soft', 'drum_snare_hard',
  'elec_wood', 'perc_snap2', 'perc_snap',
  'drum_heavy_kick', 'bd_haus', 'bd_808',
  'elec_blip',
];

mkdirSync(OUT, { recursive: true });
let got = 0, skipped = 0, failed = 0;
for (const name of FILES) {
  const dest = join(OUT, `${name}.flac`);
  if (existsSync(dest)) { skipped++; continue; }
  const res = await fetch(`${BASE}/${name}.flac`);
  if (!res.ok) { console.error(`FAIL ${name}: HTTP ${res.status}`); failed++; continue; }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  got++;
}
console.log(`samples: ${got} downloaded, ${skipped} already present, ${failed} failed (tag ${TAG})`);
if (failed) process.exit(1);
