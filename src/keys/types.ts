// KEYS types, preset names and note helpers. This file imports only a type from scales.ts (which
// imports nothing), so state.ts, the audio code and the UI can all use it.

import type { ScaleId } from './scales';

export type KeysSource = 'synth' | 'sampled';

export interface PresetInfo {
  name: string;
  /** Second line on the preset button. */
  meta: string;
}

/** Four presets per source, in screen order (Keys.dc.html). */
export const PRESETS: Record<KeysSource, PresetInfo[]> = {
  synth: [
    { name: 'Warm Pad', meta: 'Poly · slow attack' },
    { name: 'Saw Lead', meta: 'Mono · glide' },
    { name: 'Sub Bass', meta: 'Mono · sine + drive' },
    { name: 'Glass Pluck', meta: 'Poly · short' },
  ],
  sampled: [
    { name: 'Grand Piano', meta: 'Sampled · Kawai grand' },
    { name: 'FM Piano', meta: 'Sampled · TX81Z' },
    { name: 'Strings', meta: 'Sampled · ensemble' },
    { name: 'Concert Harp', meta: 'Sampled · plucked' },
  ],
};

/** KEYS settings (changed only by src/keys/keys.ts). */
export interface KeysState {
  source: KeysSource;
  /** The preset picked on each source, 0–3, so switching SYNTH/SAMPLED keeps each choice. */
  preset: Record<KeysSource, number>;
  /** Octave of the keyboard's left-most C (C4 = middle C). */
  octave: number;
  /** Scale snap: played notes move to the nearest note of the key and scale. */
  snap: boolean;
  /** Key of the scale, a pitch class 0–11 (C = 0). */
  key: number;
  scale: ScaleId;
  /** HOLD: notes keep sounding after their key comes up (not restored at boot). */
  hold: boolean;
  /** ARP: held notes play one at a time (not restored at boot). */
  arp: boolean;
  arpMode: ArpMode;
  arpRate: ArpRate;
}

export const ARP_MODES = ['up', 'down', 'updown', 'random'] as const;
export type ArpMode = (typeof ARP_MODES)[number];
export const ARP_MODE_NAMES: Record<ArpMode, string> = { up: 'UP', down: 'DOWN', updown: 'UP-DOWN', random: 'RANDOM' };

/** ARP rates and their length in pattern ticks (96 per beat; 1/8T = a triplet eighth). */
export const ARP_RATES = { '1/8': 48, '1/16': 24, '1/32': 12, '1/8T': 32 } as const;
export type ArpRate = keyof typeof ARP_RATES;

export const OCTAVE_MIN = 1;
export const OCTAVE_MAX = 7;

export const DEFAULT_KEYS: KeysState = {
  source: 'synth',
  preset: { synth: 0, sampled: 0 },
  octave: 4,
  snap: false,
  key: 9, // A
  scale: 'minor',
  hold: false,
  arp: false,
  arpMode: 'up',
  arpRate: '1/16',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note → "C#4" (C4 = 60). */
export function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

/** The MIDI note of C in `octave` (C4 = 60). */
export function cOf(octave: number): number {
  return (octave + 1) * 12;
}

export function presetOf(k: Readonly<KeysState>): PresetInfo {
  return PRESETS[k.source][k.preset[k.source]];
}
