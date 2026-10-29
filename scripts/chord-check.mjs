// Checks src/keys/chords.ts against a brute-force rebuild: for every key × scale × root note (0–127)
// × chord type × voicing, the chord is rebuilt by walking up the keyboard and counting scale notes
// (no scale-degree arithmetic), then compared. Also checks chord names on known scales.
// Exits 1 on any mismatch.
//
//   node scripts/chord-check.mjs      (npm run check:chords)

import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
});
const { SCALES, SCALE_IDS } = await server.ssrLoadModule('/src/keys/scales.ts');
const { chordNotes, chordName, CHORD_TYPES, CHORD_VOICINGS } = await server.ssrLoadModule('/src/keys/chords.ts');
await server.close();

const PARENT = { pentMajor: 'major', pentMinor: 'minor', blues: 'minor' };
const pcIn = (note, key, scale) => SCALES[scale].steps.includes((((note - key) % 12) + 12) % 12);

/** Nearest in-scale note, scanning outwards, the lower one on a tie. */
function bruteSnap(note, key, scale) {
  for (let d = 0; d < 12; d++) {
    if (pcIn(note - d, key, scale)) return note - d;
    if (pcIn(note + d, key, scale)) return note + d;
  }
  throw new Error('no scale note');
}

/** The k-th scale note above `note` (k = 0 is `note`), by walking up one semitone at a time. */
function walkUp(note, key, scale, k) {
  let n = note;
  for (let found = 0; found < k; ) if (pcIn(++n, key, scale)) found++;
  return n;
}

function bruteClose(root, key, scale, type) {
  const r = bruteSnap(root, key, scale);
  if (type === 'sus2') return [r, r + 2, r + 7];
  if (type === 'sus4') return [r, r + 5, r + 7];
  if (type === 'power') return [r, r + 7, r + 12];
  const parent = PARENT[scale] ?? scale;
  const b = bruteSnap(r, key, parent);
  const ks = type === 'seventh' ? [0, 2, 4, 6] : type === 'add9' ? [0, 2, 4, 8] : [0, 2, 4];
  return ks.map((k) => walkUp(b, key, parent, k));
}

function bruteVoice(close, voicing) {
  let v;
  if (voicing === 'inv1') v = [...close.slice(1), close[0] + 12];
  else if (voicing === 'inv2') v = [...close.slice(2), close[0] + 12, close[1] + 12];
  else if (voicing === 'spread') v = close.map((n, i) => (i % 2 ? n + 12 : n));
  else v = [...close];
  return [...new Set(v)].filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
}

let cases = 0;
let fails = 0;
const fail = (msg) => {
  if (fails++ < 20) console.log(`FAIL ${msg}`);
};
for (let key = 0; key < 12; key++)
  for (const scale of SCALE_IDS)
    for (let root = 0; root < 128; root++)
      for (const type of CHORD_TYPES)
        for (const voicing of CHORD_VOICINGS) {
          cases++;
          const want = bruteVoice(bruteClose(root, key, scale, type), voicing);
          const got = chordNotes(root, key, scale, type, voicing);
          if (JSON.stringify(got) !== JSON.stringify(want)) fail(`key ${key} ${scale} root ${root} ${type} ${voicing}: got ${got} want ${want}`);
          // Tertian chords use only notes of the parent scale.
          if (['triad', 'seventh', 'add9'].includes(type) && got.some((n) => !pcIn(n, key, PARENT[scale] ?? scale)))
            fail(`key ${key} ${scale} root ${root} ${type}: note outside the scale`);
        }

// Names on known scales, roots C4 upwards through the scale.
const names = (key, scale, type) => {
  const out = [];
  for (let n = 60 + key; out.length < 7; n++) if (pcIn(n, key, scale)) out.push(chordName(n, key, scale, type));
  return out.join(' ');
};
const expect = [
  [0, 'major', 'triad', 'C Dm Em F G Am Bdim'],
  [0, 'major', 'seventh', 'Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5'],
  [9, 'minor', 'triad', 'Am Bdim C Dm Em F G'],
  [9, 'harmonicMinor', 'triad', 'Am Bdim Caug Dm E F G#dim'],
  [9, 'harmonicMinor', 'seventh', 'AmMaj7 Bm7b5 CaugMaj7 Dm7 E7 Fmaj7 G#dim7'],
  [2, 'dorian', 'triad', 'Dm Em F G Am Bdim C'],
  [7, 'mixolydian', 'seventh', 'G7 Am7 Bm7b5 Cmaj7 Dm7 Em7 Fmaj7'],
  [0, 'major', 'add9', 'Cadd9 Dmadd9 Emadd9 Fadd9 Gadd9 Amadd9 Bdimadd9'],
  [0, 'major', 'power', 'C5 D5 E5 F5 G5 A5 B5'],
  [0, 'major', 'sus4', 'Csus4 Dsus4 Esus4 Fsus4 Gsus4 Asus4 Bsus4'],
];
for (const [key, scale, type, want] of expect) {
  cases++;
  const got = names(key, scale, type);
  if (got !== want) fail(`names ${key} ${scale} ${type}: got "${got}" want "${want}"`);
}
// Pentatonic / blues roots stay in their own scale: A minor pentatonic gives Am C Dm Em G.
{
  cases++;
  const out = [];
  for (let n = 69; out.length < 5; n++) if (pcIn(n, 9, 'pentMinor')) out.push(chordName(n, 9, 'pentMinor', 'triad'));
  if (out.join(' ') !== 'Am C Dm Em G') fail(`names pentMinor: got "${out.join(' ')}"`);
}

console.log(`${fails ? 'FAIL' : 'PASS'}: ${cases} cases, ${fails} failed`);
if (fails) process.exit(1);
