// The KEYS pedalboard: eight pedals in a fixed order, two knobs each, and the settings each preset
// starts with. Pure (imports only the knob scales and preset names), so the store, the audio chain
// (src/audio/pedals.ts), the PEDALS sheet (src/ui/pedals.ts) and MIDI Learn share it. Knob values are
// in their own units (Hz, dB, bits); `scale` maps them onto the knob's 0–1 turn.

import { ints, linear, log, type Scale } from '../mix/scale';
import { PRESETS } from './types';

export const PEDAL_IDS = ['comp', 'drive', 'amp', 'wah', 'chorus', 'phaser', 'tremolo', 'crush'] as const;
export type PedalId = (typeof PEDAL_IDS)[number];

export interface PedalKnob {
  label: string;
  scale: Scale;
  default: number;
  text(v: number): string;
}

export interface PedalDef {
  id: PedalId;
  name: string;
  knobs: [PedalKnob, PedalKnob];
}

/** One pedal on one preset's board. */
export interface PedalSetting {
  on: boolean;
  /** The two knob values, in the knob's units. */
  k: [number, number];
}

export type Board = Record<PedalId, PedalSetting>;
/** Saved boards by preset key ("synth:3"); a preset with none uses defaultBoard(). */
export type Boards = Record<string, Board>;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${v < 10 ? v.toFixed(1) : Math.round(v)} Hz`);
const db = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} dB`;

export const PEDALS: PedalDef[] = [
  { id: 'comp', name: 'COMP', knobs: [
    { label: 'SUSTAIN', scale: linear(0, 1), default: 0.5, text: pct },
    { label: 'LEVEL', scale: linear(-12, 12), default: 0, text: db },
  ] },
  { id: 'drive', name: 'DRIVE', knobs: [
    { label: 'DRIVE', scale: linear(0, 1), default: 0.4, text: pct },
    { label: 'TONE', scale: log(800, 12000), default: 4000, text: hz },
  ] },
  { id: 'amp', name: 'AMP', knobs: [
    { label: 'GAIN', scale: linear(0, 1), default: 0.3, text: pct },
    { label: 'TONE', scale: log(1500, 8000), default: 4000, text: hz },
  ] },
  { id: 'wah', name: 'WAH', knobs: [
    { label: 'FREQ', scale: log(80, 800), default: 200, text: hz },
    { label: 'SENS', scale: linear(0, 1), default: 0.5, text: pct },
  ] },
  { id: 'chorus', name: 'CHORUS', knobs: [
    { label: 'RATE', scale: log(0.1, 8), default: 1.2, text: hz },
    { label: 'DEPTH', scale: linear(0, 1), default: 0.5, text: pct },
  ] },
  { id: 'phaser', name: 'PHASER', knobs: [
    { label: 'RATE', scale: log(0.05, 5), default: 0.4, text: hz },
    { label: 'DEPTH', scale: linear(0, 1), default: 0.5, text: pct },
  ] },
  { id: 'tremolo', name: 'TREMOLO', knobs: [
    { label: 'RATE', scale: log(1, 12), default: 5, text: hz },
    { label: 'DEPTH', scale: linear(0, 1), default: 0.6, text: pct },
  ] },
  { id: 'crush', name: 'CRUSH', knobs: [
    { label: 'BITS', scale: ints(2, 12), default: 6, text: (v) => `${v} bit` },
    { label: 'MIX', scale: linear(0, 1), default: 0.5, text: pct },
  ] },
];

export const pedalDef = (id: PedalId): PedalDef => PEDALS.find((p) => p.id === id)!;

/** The key a preset's board is saved under: "synth:3", "sampled:6". */
export const presetKey = (source: string, index: number) => `${source}:${index}`;

const sampledKey = (name: string) => presetKey('sampled', PRESETS.sampled.findIndex((p) => p.name === name));

/** Presets that start with a pedal on. */
const PRESET_DEFAULTS: Record<string, Partial<Record<PedalId, PedalSetting>>> = {
  [sampledKey('Electric Guitar')]: { amp: { on: true, k: [0.3, 4000] } }, // a clean amp and cabinet
  [sampledKey('Drawbar Organ')]: { chorus: { on: true, k: [6.5, 0.35] } }, // chorus-vibrato
};

/** Every pedal off, knobs at their defaults. */
function plainBoard(): Board {
  return Object.fromEntries(PEDALS.map((p) => [p.id, { on: false, k: [p.knobs[0].default, p.knobs[1].default] }])) as Board;
}

/** The board a preset starts with (and goes back to on RESET). */
export function defaultBoard(key: string): Board {
  const board = plainBoard();
  for (const [id, s] of Object.entries(PRESET_DEFAULTS[key] ?? {})) board[id as PedalId] = { on: s.on, k: [...s.k] };
  return board;
}

/** A knob value kept within the knob's range (whole numbers on a whole-number knob). */
export function clampKnob(knob: PedalKnob, v: number): number {
  const a = knob.scale.from(0);
  const b = knob.scale.from(1);
  const c = Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));
  // A round trip through the scale rounds a whole-number knob; on the others it only adds float noise.
  const r = knob.scale.from(knob.scale.to(c));
  return Math.abs(r - c) < 1e-9 * Math.max(1, Math.abs(c)) ? c : r;
}

/** A saved board with bad or missing values replaced from `fallback`. */
export function cleanBoard(saved: unknown, fallback: Board): Board {
  const board = {} as Board;
  const s = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  for (const p of PEDALS) {
    const d = fallback[p.id];
    const v = s[p.id] && typeof s[p.id] === 'object' ? (s[p.id] as Partial<PedalSetting>) : {};
    const k = Array.isArray(v.k) ? v.k : [];
    board[p.id] = {
      on: typeof v.on === 'boolean' ? v.on : d.on,
      k: [0, 1].map((i) => (typeof k[i] === 'number' && Number.isFinite(k[i]) ? clampKnob(p.knobs[i], k[i]) : d.k[i])) as [number, number],
    };
  }
  return board;
}

export const anyOn = (board: Board) => PEDAL_IDS.some((id) => board[id].on);
