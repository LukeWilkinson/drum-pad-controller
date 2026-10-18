// Tiny app store, so the pads, LCD, Kits panel and right rail stay in sync without a framework.
// update() merges a patch and tells subscribers what changed. In-place edits to the active kit
// (pad settings, swapped samples) are announced with the extra change names 'params' and 'pads'.

import type { ActiveKit, UserKit } from './audio/kit';
import { DEFAULT_KEYS, type KeysState } from './keys/types';
import { DEFAULT_CHANNEL, type LearnState, type MidiState } from './midi/types';
import { PATTERN_COUNT, emptyPattern, type Pattern, type Quant } from './seq/pattern';

export type View = 'pads' | 'kits' | 'seq' | 'keys' | 'setup';

export interface AppState {
  /** The kit playing now (null until the first kit has loaded). */
  kit: ActiveKit | null;
  /** True when the active kit has unsaved changes. */
  edited: boolean;
  /** Pad bank on screen, 0–3 (A–D). */
  bank: number;
  /** Pad (bank × 16 + screen index, 0–63) being edited / last hit. */
  selectedPad: number;
  view: View;
  /** Saved kits, newest first. */
  userKits: UserKit[];
  /** Transport (changed only by src/audio/clock.ts). */
  playing: boolean;
  bpm: number;
  /** Metronome on/off. It only sounds while the transport plays. */
  click: boolean;
  /** Loops 1–4 (changed only by src/seq/sequencer.ts; edits in place are announced as 'patterns'). */
  patterns: Pattern[];
  /** Index of the loop playing / being edited. */
  pattern: number;
  /** Loop waiting to take over at the next bar line, or null. */
  queued: number | null;
  recMode: RecMode;
  quant: Quant;
  /** Swing percent, SWING_MIN–SWING_MAX. */
  swing: number;
  /** One bar of clicks before recording starts from stop. */
  countIn: boolean;
  /** Held pads retrigger at the quantise rate (src/seq/repeat.ts). */
  noteRepeat: boolean;
  /** Touch hits play at full velocity. */
  fullLevel: boolean;
  /** MIDI devices and settings (changed only by src/midi/midi.ts). */
  midi: MidiState;
  /** MIDI Learn mode (changed only by src/midi/learn.ts). */
  learn: LearnState;
  /** KEYS instrument settings (changed only by src/keys/keys.ts). */
  keys: KeysState;
}

/** 'count' = count-in bar before recording starts. */
export type RecMode = 'off' | 'count' | 'rec' | 'dub';

export type Change = keyof AppState | 'params' | 'pads';
type Listener = (s: Readonly<AppState>, changed: ReadonlySet<Change>) => void;

export const state: AppState = {
  kit: null,
  edited: false,
  bank: 0,
  selectedPad: 12, // Kick
  view: 'pads',
  userKits: [],
  playing: false,
  bpm: 120,
  click: true,
  patterns: Array.from({ length: PATTERN_COUNT }, () => emptyPattern()),
  pattern: 0,
  queued: null,
  recMode: 'off',
  quant: '1/16',
  swing: 50,
  countIn: true,
  noteRepeat: false,
  fullLevel: false,
  midi: {
    status: 'off',
    outputs: [],
    inputs: [],
    output: null,
    input: null,
    channel: DEFAULT_CHANNEL,
    localSound: true,
    clock: false,
    mappings: [],
  },
  learn: { on: false, armed: null, last: null },
  keys: { ...DEFAULT_KEYS, preset: { ...DEFAULT_KEYS.preset } },
};

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Merges `patch` into the state and notifies. `extra` names in-place changes ('params', 'pads'). */
export function update(patch: Partial<AppState>, ...extra: Change[]): void {
  Object.assign(state, patch);
  const changed = new Set<Change>([...(Object.keys(patch) as Change[]), ...extra]);
  for (const fn of listeners) fn(state, changed);
}
