// KEYS settings: SYNTH / SAMPLED, the preset and the octave. This is the only code that changes
// state.keys (as kitControl.ts is for kits). It keeps the instrument on the chosen preset and
// saves the settings as the 'keys' pref.

import type { AudioEngine } from '../audio/engine';
import { KeysEngine } from '../audio/keys';
import { state, update } from '../state';
import { getPref, setPref } from '../store/db';
import { OCTAVE_MAX, OCTAVE_MIN, PRESETS, type KeysSource, type KeysState } from './types';

const PREF = 'keys';
const SOURCES: KeysSource[] = ['synth', 'sampled'];

let instrument: KeysEngine;

const warn = (err: unknown) => console.warn('[store]', err);

/** Builds the instrument on the default preset, then restores the saved settings. */
export function initKeys(engine: AudioEngine): KeysEngine {
  instrument = new KeysEngine(engine);
  instrument.setPreset(state.keys.source, state.keys.preset[state.keys.source]);
  void loadKeys();
  return instrument;
}

function set(patch: Partial<KeysState>, save = true): void {
  const before = state.keys;
  const keys = { ...before, ...patch };
  const from = before.preset[before.source];
  const to = keys.preset[keys.source];
  if (keys.source !== before.source || to !== from) instrument.setPreset(keys.source, to);
  update({ keys });
  if (save) setPref(PREF, keys).catch(warn);
}

export function setSource(source: KeysSource): void {
  if (source !== state.keys.source) set({ source });
}

/** Picks preset 0–3 on the current source. */
export function selectPreset(index: number): void {
  const { source, preset } = state.keys;
  if (index === preset[source] || !PRESETS[source][index]) return;
  set({ preset: { ...preset, [source]: index } });
}

export function setOctave(octave: number): void {
  const o = Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, Math.round(octave)));
  if (o !== state.keys.octave) set({ octave: o });
}

export function nudgeOctave(delta: number): void {
  setOctave(state.keys.octave + delta);
}

/** Restores the saved settings. Missing or out-of-range values keep their defaults. */
async function loadKeys(): Promise<void> {
  const saved = await getPref<Partial<KeysState>>(PREF).catch(warn);
  if (!saved || typeof saved !== 'object') return;
  const patch: Partial<KeysState> = {};
  if (SOURCES.includes(saved.source as KeysSource)) patch.source = saved.source;
  const preset = { ...state.keys.preset };
  for (const s of SOURCES) {
    const i = saved.preset?.[s];
    if (Number.isInteger(i) && PRESETS[s][i!]) preset[s] = i!;
  }
  patch.preset = preset;
  if (Number.isInteger(saved.octave) && saved.octave! >= OCTAVE_MIN && saved.octave! <= OCTAVE_MAX) patch.octave = saved.octave;
  set(patch, false);
}
