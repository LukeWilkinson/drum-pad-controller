// Kit types and helpers shared by the engine and the UI. The built-in kits live in kits.json / kits.ts.
// A kit has 4 banks (A–D) of 16 pads: pad index = bank × 16 + screen index (0–63).
// Within a bank, pad order follows the screen: screen index 0 is the top-left pad, 15 bottom-right.
// Pad numbers follow the MPC layout: pad 1 is bottom-left, pad 16 is top-right.

export const BANK_NAMES = ['A', 'B', 'C', 'D'] as const;
export const PADS_PER_BANK = 16;
export const PAD_COUNT = BANK_NAMES.length * PADS_PER_BANK;

export type PadGroup = 'kick' | 'snare' | 'hat' | 'tom' | 'cym' | 'perc' | 'fx';

export interface PadDef {
  name: string;
  group: PadGroup;
  /** Sample played for hard hits (and all hits when there is no soft layer). */
  hard: string;
  /** Optional softer sample for velocity below SOFT_LAYER_BELOW. */
  soft?: string;
  /** Pads in the same choke group cut each other off (hi-hats). */
  choke?: string;
  /** Whether this pad gets cut off by others in its choke group but doesn't cut them. */
  chokedOnly?: boolean;
}

/** Per-pad sound settings, edited on the Kits screen and the tablet right rail. */
export interface PadParams {
  /** Pad volume in dB, PARAM_RANGE.volumeDb. */
  volumeDb: number;
  /** Pitch in semitones, PARAM_RANGE.pitch. */
  pitch: number;
  /** Stereo pan, -1 (left) to 1 (right). */
  pan: number;
  /** How much of the sample plays, 0–1. 1 plays the whole sample. */
  decay: number;
}

export type ParamKey = keyof PadParams;

export const PARAM_RANGE: Record<ParamKey, { min: number; max: number; step: number }> = {
  volumeDb: { min: -24, max: 6, step: 0.5 },
  pitch: { min: -24, max: 24, step: 1 },
  pan: { min: -1, max: 1, step: 0.02 },
  decay: { min: 0.05, max: 1, step: 0.01 },
};

export const DEFAULT_PARAMS: Readonly<PadParams> = { volumeDb: 0, pitch: 0, pan: 0, decay: 1 };

/** What the engine plays: 64 pads (banks A–D) plus their settings. */
export interface ActiveKit {
  /** Factory kit id, or the user kit id when a saved kit is loaded. */
  id: string;
  name: string;
  /** The factory kit this one started from. */
  baseKitId: string;
  /** True when this is a saved user kit. */
  user: boolean;
  pads: PadDef[];
  params: PadParams[];
}

/** A kit Luke saved: the whole pad list (so swapped samples are kept) plus pad settings. Stored in IndexedDB. */
export interface UserKit {
  id: string;
  name: string;
  baseKitId: string;
  pads: PadDef[];
  params: PadParams[];
  /** Date.now() of the last save. */
  savedAt: number;
}

export const SOFT_LAYER_BELOW = 72;
export const SAMPLE_DIR = `${import.meta.env.BASE_URL}samples/sonicpi/`;

export const GROUP_COLOUR: Record<PadGroup, string> = {
  kick: '#FF5A4E',
  snare: '#FF9F1C',
  hat: '#FFD447',
  tom: '#5FD38A',
  cym: '#5BC0EB',
  perc: '#B794F6',
  fx: '#F472B6',
};

/** MPC numbering within a bank: screen index 0 (top-left) is pad 13, index 12 (bottom-left) is pad 1. */
export function padNumber(index: number): number {
  const i = index % PADS_PER_BANK;
  return (3 - Math.floor(i / 4)) * 4 + (i % 4) + 1;
}

/** "A13", "C01": bank letter plus the two-digit pad number. */
export function padLabel(index: number): string {
  return `${BANK_NAMES[Math.floor(index / PADS_PER_BANK)]}${String(padNumber(index)).padStart(2, '0')}`;
}

/** Every sample a set of pads needs (hard and soft layers). */
export function sampleNamesOf(pads: PadDef[]): string[] {
  const names = new Set<string>();
  for (const p of pads) {
    names.add(p.hard);
    if (p.soft) names.add(p.soft);
  }
  return [...names];
}
