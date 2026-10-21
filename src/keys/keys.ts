// KEYS settings: SYNTH / SAMPLED, the preset, the octave, scale snap, HOLD and ARP. This is the only code that changes
// state.keys and state.keysLoad (as kitControl.ts is for kits). It keeps the instrument on the
// chosen preset and saves the settings as the 'keys' pref.

import type { AudioEngine } from '../audio/engine';
import { KeysEngine } from '../audio/keys';
import { state, update, type AppState } from '../state';
import { getPref, setPref } from '../store/db';
import { SCALE_IDS, type ScaleId } from './scales';
import {
  ARP_MODES,
  ARP_RATES,
  OCTAVE_MAX,
  OCTAVE_MIN,
  PRESETS,
  type ArpMode,
  type ArpRate,
  type KeysSource,
  type KeysState,
} from './types';

const PREF = 'keys';
const SOURCES: KeysSource[] = ['synth', 'sampled'];

let instrument: KeysEngine;

const warn = (err: unknown) => console.warn('[store]', err);

/** Builds the instrument on the default preset, then restores the saved settings. */
export function initKeys(engine: AudioEngine): KeysEngine {
  instrument = new KeysEngine(engine);
  usePreset(state.keys.source, state.keys.preset[state.keys.source]);
  void loadKeys();
  return instrument;
}

function set(patch: Partial<KeysState>, save = true): void {
  const before = state.keys;
  const keys = { ...before, ...patch };
  const from = before.preset[before.source];
  const to = keys.preset[keys.source];
  if (keys.source !== before.source || to !== from) usePreset(keys.source, to);
  update({ keys });
  if (save) setPref(PREF, keys).catch(warn);
}

/** Counts picks, so a slow load doesn't report over the instrument picked after it. */
let pick = 0;

/** Switches the instrument. A sampled one shows its loading progress (state.keysLoad) until ready. */
function usePreset(source: KeysSource, index: number): void {
  const mine = ++pick;
  const report = (load: AppState['keysLoad']) => {
    if (mine === pick && JSON.stringify(load) !== JSON.stringify(state.keysLoad)) update({ keysLoad: load });
  };
  instrument
    .setPreset(source, index, (done, total) => report(done < total ? { done, total, failed: false } : null))
    .then(() => report(null))
    .catch((err: unknown) => {
      console.warn('[keys] samples', err);
      report({ done: 0, total: 0, failed: true });
    });
}

export function setSource(source: KeysSource): void {
  if (source !== state.keys.source) set({ source });
}

/** Picks a preset on the current source (ignored if that source has no preset `index`). */
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

export function toggleSnap(): void {
  set({ snap: !state.keys.snap });
}

/** Key of the scale, 0–11 (C = 0). */
export function setKey(key: number): void {
  if (Number.isInteger(key) && key >= 0 && key < 12 && key !== state.keys.key) set({ key });
}

export function setScale(scale: ScaleId): void {
  if (SCALE_IDS.includes(scale) && scale !== state.keys.scale) set({ scale });
}

/** HOLD off lets go of the notes it was keeping (src/keys/notes.ts follows the store). */
export function toggleHold(): void {
  set({ hold: !state.keys.hold });
}

/** HOLD on or off (a sustain pedal, MIDI CC 64). */
export function setHold(hold: boolean): void {
  if (hold !== state.keys.hold) set({ hold });
}

/** ARP on or off. Notes sounding are stopped either way (src/keys/notes.ts). */
export function toggleArp(): void {
  set({ arp: !state.keys.arp });
}

export function setArpMode(arpMode: ArpMode): void {
  if (ARP_MODES.includes(arpMode) && arpMode !== state.keys.arpMode) set({ arpMode });
}

export function setArpRate(arpRate: ArpRate): void {
  if (arpRate in ARP_RATES && arpRate !== state.keys.arpRate) set({ arpRate });
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
  if (typeof saved.snap === 'boolean') patch.snap = saved.snap;
  if (Number.isInteger(saved.key) && saved.key! >= 0 && saved.key! < 12) patch.key = saved.key;
  if (SCALE_IDS.includes(saved.scale as ScaleId)) patch.scale = saved.scale;
  if (ARP_MODES.includes(saved.arpMode as ArpMode)) patch.arpMode = saved.arpMode;
  if (typeof saved.arpRate === 'string' && saved.arpRate in ARP_RATES) patch.arpRate = saved.arpRate;
  // HOLD and ARP start off: nothing is held at boot.
  set(patch, false);
}
