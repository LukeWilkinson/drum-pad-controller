// Keys, scales and scale snap (pure; imports nothing). A key is a pitch class 0–11 (C = 0).

export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** `short` is for the snap chip where space is tight (phone landscape). */
export const SCALES = {
  major: { name: 'Major', short: 'MAJ', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Minor', short: 'MIN', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: 'Harmonic minor', short: 'HARM MIN', steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { name: 'Dorian', short: 'DOR', steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { name: 'Mixolydian', short: 'MIXO', steps: [0, 2, 4, 5, 7, 9, 10] },
  pentMajor: { name: 'Pentatonic major', short: 'PENT MAJ', steps: [0, 2, 4, 7, 9] },
  pentMinor: { name: 'Pentatonic minor', short: 'PENT MIN', steps: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', short: 'BLUES', steps: [0, 3, 5, 6, 7, 10] },
} as const;

export type ScaleId = keyof typeof SCALES;
export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

/** True when MIDI note `note` is in `scale` on `key`. */
export function inScale(note: number, key: number, scale: ScaleId): boolean {
  return (SCALES[scale].steps as readonly number[]).includes((((note - key) % 12) + 12) % 12);
}

/** The nearest note in the scale; an out-of-scale note halfway between two goes down. */
export function snap(note: number, key: number, scale: ScaleId): number {
  for (let d = 0; d < 12; d++) {
    if (inScale(note - d, key, scale)) return note - d; // below first, so a tie goes down
    if (inScale(note + d, key, scale)) return note + d;
  }
  return note;
}

/** "A MINOR" (or "A MIN" when `short`) for the snap chip. */
export function scaleLabel(key: number, scale: ScaleId, short = false): string {
  return `${KEY_NAMES[key]} ${short ? SCALES[scale].short : SCALES[scale].name.toUpperCase()}`;
}
