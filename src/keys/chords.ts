// Chords from single notes (pure; imports only scales.ts). With CHORD on, a KEYS note plays a chord
// built on it in the current key and scale, so every chord stays in key (src/keys/notes.ts). A root
// outside the scale is snapped into it first.
// - triad / 7th / add9 stack every other scale note (thirds), so the quality follows the scale: in
//   C major, D gives Dm and B gives Bdim. Pentatonic and blues scales stack on their parent 7-note
//   scale (major, minor), since stacking a 5-note scale gives C–E–A rather than a chord. The root is
//   still snapped into the chosen scale.
// - sus2 / sus4 / power are fixed intervals (0-2-7, 0-5-7, 0-7-12) on the snapped root: a diatonic
//   "sus4" on F in C major would be a tritone, which nobody means.
// - Voicing: close (root position), 1st and 2nd inversion (lowest one or two notes up an octave),
//   spread (every second note of the close chord up an octave).

import { KEY_NAMES, SCALES, snap, type ScaleId } from './scales';

export const CHORD_TYPES = ['triad', 'seventh', 'sus2', 'sus4', 'add9', 'power'] as const;
export type ChordType = (typeof CHORD_TYPES)[number];
export const CHORD_TYPE_NAMES: Record<ChordType, string> = {
  triad: 'TRIAD',
  seventh: '7TH',
  sus2: 'SUS2',
  sus4: 'SUS4',
  add9: 'ADD9',
  power: 'POWER',
};

export const CHORD_VOICINGS = ['close', 'inv1', 'inv2', 'spread'] as const;
export type ChordVoicing = (typeof CHORD_VOICINGS)[number];
export const CHORD_VOICING_NAMES: Record<ChordVoicing, string> = {
  close: 'ROOT',
  inv1: '1ST INV',
  inv2: '2ND INV',
  spread: 'SPREAD',
};

/** Fixed-interval chords (semitones above the root). */
const FIXED: Partial<Record<ChordType, number[]>> = {
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7, 12],
};

/** The scale degree (0-based index into the scale's steps) of an in-scale note, or -1. */
export function degreeOf(note: number, key: number, scale: ScaleId): number {
  const pc = (((note - key) % 12) + 12) % 12;
  return (SCALES[scale].steps as readonly number[]).indexOf(pc);
}

/** The in-scale note `n` scale steps above the in-scale note `note` (n ≥ 0). */
function stepUp(note: number, key: number, scale: ScaleId, n: number): number {
  const steps = SCALES[scale].steps as readonly number[];
  const len = steps.length;
  const d = degreeOf(note, key, scale);
  const target = d + n;
  const octaves = Math.floor(target / len);
  return note - steps[d] + steps[target % len] + 12 * octaves;
}

/** The 7-note scale chords are stacked on (pentatonic and blues use their parent). */
export function chordScale(scale: ScaleId): ScaleId {
  return scale === 'pentMajor' ? 'major' : scale === 'pentMinor' || scale === 'blues' ? 'minor' : scale;
}

/** Root-position chord on `root` (snapped into the scale first), low to high. */
function closeChord(root: number, key: number, scale: ScaleId, type: ChordType): number[] {
  const r = snap(root, key, scale);
  const fixed = FIXED[type];
  if (fixed) return fixed.map((i) => r + i);
  const degrees = type === 'seventh' ? [0, 2, 4, 6] : type === 'add9' ? [0, 2, 4, 8] : [0, 2, 4];
  const parent = chordScale(scale);
  const base = snap(r, key, parent); // the blues ♭5 isn't in natural minor: it stacks from the 4th
  return degrees.map((n) => stepUp(base, key, parent, n));
}

/**
 * The notes a KEYS note `root` plays with CHORD on, low to high, all within MIDI 0–127 (notes that
 * would fall outside are left out). The first note is always the snapped root's chord's bass.
 */
export function chordNotes(root: number, key: number, scale: ScaleId, type: ChordType, voicing: ChordVoicing): number[] {
  const close = closeChord(root, key, scale, type);
  let notes: number[];
  if (voicing === 'inv1') notes = [...close.slice(1), close[0] + 12];
  else if (voicing === 'inv2') notes = [...close.slice(2), close[0] + 12, close[1] + 12];
  else if (voicing === 'spread') notes = close.map((n, i) => (i % 2 ? n + 12 : n));
  else notes = close;
  return [...new Set(notes)].filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
}

/**
 * The CH pad bank (src/pads/chordPads.ts): pad number `pad` (1–16, MPC numbering: 1 = bottom-left).
 * The bottom row plays the triads on scale degrees I–IV, the second row V–vii and I an octave up,
 * and the top two rows the same chords as 7ths. Degrees are counted in the 7-note scale chords are
 * built on (chordScale), so pentatonic and blues get all seven. The tonic sits in the octave below
 * the keyboard's left-most C (KEYS octave 4 → C3–B3), so the chords sit around middle C.
 */
export function chordPad(pad: number, key: number, scale: ScaleId, octave: number, voicing: ChordVoicing): { notes: number[]; name: string; degree: number; type: ChordType } {
  const row = Math.floor((pad - 1) / 4);
  const degree = (row % 2) * 4 + ((pad - 1) % 4);
  const type: ChordType = row < 2 ? 'triad' : 'seventh';
  const parent = chordScale(scale);
  const steps = SCALES[parent].steps;
  const root = octave * 12 + key + steps[degree % 7] + 12 * Math.floor(degree / 7);
  return { notes: chordNotes(root, key, parent, type, voicing), name: chordName(root, key, parent, type), degree, type };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** "vi", "V7", "vii°", "I" (an octave up is still I): the degree in Roman numerals, lower case for minor. */
export function romanOf(degree: number, name: string, type: ChordType): string {
  const r = ROMAN[degree % 7];
  const minor = /m(?!aj)|dim/.test(name.slice(1).replace(/^#/, ''));
  return `${minor ? r.toLowerCase() : r}${name.includes('dim') || name.includes('m7b5') ? '°' : ''}${type === 'seventh' ? '7' : ''}`;
}

/** Chord symbol for the chord built on `root`, e.g. "Am7", "Bdim", "Fsus2", "C5", "Gadd9". */
export function chordName(root: number, key: number, scale: ScaleId, type: ChordType): string {
  const close = closeChord(root, key, scale, type);
  const name = KEY_NAMES[((close[0] % 12) + 12) % 12];
  if (type === 'sus2' || type === 'sus4') return `${name}${type}`;
  if (type === 'power') return `${name}5`;
  const third = close[1] - close[0];
  const fifth = close[2] - close[0];
  const triad = third === 4 && fifth === 7 ? '' : third === 3 && fifth === 7 ? 'm' : third === 3 && fifth === 6 ? 'dim' : third === 4 && fifth === 8 ? 'aug' : '?';
  if (type === 'add9') return `${name}${triad === '?' ? '' : triad}add9`;
  if (type === 'seventh') {
    const seventh = close[3] - close[0];
    const q = `${triad}:${seventh}`;
    const sevenths: Record<string, string> = {
      ':11': 'maj7', ':10': '7', 'm:10': 'm7', 'm:11': 'mMaj7', 'dim:10': 'm7b5', 'dim:9': 'dim7', 'aug:11': 'augMaj7', 'aug:10': 'aug7',
    };
    return `${name}${sevenths[q] ?? `${triad === '?' ? '' : triad}(${seventh})`}`;
  }
  return triad === '?' ? `${name}(${third},${fifth})` : `${name}${triad}`; // '?' can't happen in the 5 parent scales
}
