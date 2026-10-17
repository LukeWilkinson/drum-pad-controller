// Default kit (bank A). Samples are CC0 from Sonic Pi — see CREDITS.md.
// Pad order follows the screen: index 0 is the top-left pad (Crash), index 15 is bottom-right.
// Pad numbers follow the MPC layout: pad 1 is bottom-left, pad 16 is top-right.

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

export const SOFT_LAYER_BELOW = 72;
export const SAMPLE_DIR = `${import.meta.env.BASE_URL}samples/sonicpi/`;

export const KIT_NAME = 'KIT 01 · SONIC PI CC0';

export const PADS: PadDef[] = [
  { name: 'Crash', group: 'cym', soft: 'drum_splash_soft', hard: 'drum_splash_hard' },
  { name: 'Ride', group: 'cym', soft: 'drum_cymbal_soft', hard: 'drum_cymbal_hard' },
  { name: 'Tom Hi', group: 'tom', soft: 'drum_tom_hi_soft', hard: 'drum_tom_hi_hard' },
  { name: 'Tom Lo', group: 'tom', soft: 'drum_tom_lo_soft', hard: 'drum_tom_lo_hard' },

  { name: 'Open Hat', group: 'hat', hard: 'drum_cymbal_open', choke: 'hat', chokedOnly: true },
  { name: 'Closed Hat', group: 'hat', hard: 'drum_cymbal_closed', choke: 'hat' },
  { name: 'Pedal Hat', group: 'hat', hard: 'drum_cymbal_pedal', choke: 'hat' },
  { name: 'Shaker', group: 'perc', hard: 'perc_swash' },

  { name: 'Snare', group: 'snare', soft: 'drum_snare_soft', hard: 'drum_snare_hard' },
  { name: 'Rim', group: 'snare', hard: 'elec_wood' },
  { name: 'Clap', group: 'snare', hard: 'perc_snap2' },
  { name: 'Snap', group: 'perc', hard: 'perc_snap' },

  { name: 'Kick', group: 'kick', hard: 'drum_heavy_kick' },
  { name: 'Kick 2', group: 'kick', hard: 'bd_haus' },
  { name: '808', group: 'kick', hard: 'bd_808' },
  { name: 'Vox FX', group: 'fx', hard: 'elec_blip' },
];

export const GROUP_COLOUR: Record<PadGroup, string> = {
  kick: '#FF5A4E',
  snare: '#FF9F1C',
  hat: '#FFD447',
  tom: '#5FD38A',
  cym: '#5BC0EB',
  perc: '#B794F6',
  fx: '#F472B6',
};

/** MPC numbering: screen index 0 (top-left) is pad 13, index 12 (bottom-left) is pad 1. */
export function padNumber(index: number): number {
  return (3 - Math.floor(index / 4)) * 4 + (index % 4) + 1;
}

export function allSampleNames(): string[] {
  const names = new Set<string>();
  for (const p of PADS) {
    names.add(p.hard);
    if (p.soft) names.add(p.soft);
  }
  return [...names];
}
