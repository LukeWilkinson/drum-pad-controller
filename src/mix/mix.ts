// Mixer and FX settings. This is the only code that changes state.mix (as kitControl.ts is for kits).
// It keeps the engine's MixGraph in step with the store, follows the tempo for the delay and the
// KEYS sends (state.keys), and saves everything as one global `mix` pref, 500 ms after the last change.
// Master volume used to be its own `master` pref (a gain 0–1); it is read once if there is no `mix` pref.

import type { AudioEngine } from '../audio/engine';
import { state, subscribe, update } from '../state';
import { getPref, setPref } from '../store/db';
import {
  DELAY_TIMES,
  FILTER_TYPES,
  FX_RANGE,
  REVERB_SIZES,
  STRIPS,
  defaultMix,
  faderLevel,
  type DelayState,
  type FilterState,
  type FxId,
  type MixState,
  type ReverbState,
  type StripId,
} from './types';

const PREF = 'mix';
const SAVE_MS = 500;

let engine: AudioEngine;
let saveTimer = 0;

const warn = (err: unknown) => console.warn('[store]', err);
const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

/** Applies the defaults to the graph, then restores the saved settings. */
export function initMix(e: AudioEngine): Promise<void> {
  engine = e;
  applyAll(state.mix);
  subscribe((s, changed) => {
    if (changed.has('bpm')) applyDelay(s.mix.delay);
    if (changed.has('keys')) engine.mix.setKeysSends(s.keys.reverbSend, s.keys.delaySend);
  });
  // A phone may close the app without warning once it's hidden: save a pending change now.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = 0;
    setPref(PREF, state.mix).catch(warn);
  });
  return loadMix();
}

function set(mix: MixState, save = true): void {
  update({ mix });
  if (!save) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    setPref(PREF, state.mix).catch(warn);
  }, SAVE_MS);
}

// ---------- Strips ----------

/** Fader position 0–1 (faderGain in types.ts gives the gain). */
export function setLevel(id: StripId, level: number): void {
  const v = clamp(0, 1, level);
  const strip = state.mix.strips[id];
  if (v === strip.level) return;
  setStrip(id, { ...strip, level: v });
}

export function toggleMute(id: StripId): void {
  const strip = state.mix.strips[id];
  setStrip(id, { ...strip, mute: !strip.mute });
}

function setStrip(id: StripId, strip: MixState['strips'][StripId]): void {
  engine.mix.setStrip(id, strip.level, strip.mute);
  set({ ...state.mix, strips: { ...state.mix.strips, [id]: strip } });
}

// ---------- Effects ----------

export function toggleFx(fx: FxId): void {
  if (fx === 'reverb') setReverb({ on: !state.mix.reverb.on });
  else if (fx === 'delay') setDelay({ on: !state.mix.delay.on });
  else setFilter({ on: !state.mix.filter.on });
}

/** Changes any reverb settings; out-of-range values are clamped. */
export function setReverb(patch: Partial<ReverbState>): void {
  const reverb = cleanReverb({ ...state.mix.reverb, ...patch }, state.mix.reverb);
  applyReverb(reverb);
  set({ ...state.mix, reverb });
}

export function setDelay(patch: Partial<DelayState>): void {
  const delay = cleanDelay({ ...state.mix.delay, ...patch }, state.mix.delay);
  applyDelay(delay);
  set({ ...state.mix, delay });
}

export function setFilter(patch: Partial<FilterState>): void {
  const filter = cleanFilter({ ...state.mix.filter, ...patch }, state.mix.filter);
  applyFilter(filter);
  set({ ...state.mix, filter });
}

/** The delay time in seconds at the current tempo. */
export function delaySeconds(d: DelayState = state.mix.delay, bpm = state.bpm): number {
  return (DELAY_TIMES[d.time].beats * 60) / bpm;
}

function applyReverb(r: ReverbState): void {
  engine.mix.setReverb(r.on, r.size, r.decay, r.mix);
}

function applyDelay(d: DelayState): void {
  engine.mix.setDelay(d.on, delaySeconds(d), d.feedback, d.mix);
}

function applyFilter(f: FilterState): void {
  engine.mix.setFilter(f.on, f.type, f.cutoff, f.res);
}

function applyAll(mix: MixState): void {
  for (const id of STRIPS) engine.mix.setStrip(id, mix.strips[id].level, mix.strips[id].mute);
  applyReverb(mix.reverb);
  applyDelay(mix.delay);
  applyFilter(mix.filter);
  engine.mix.setKeysSends(state.keys.reverbSend, state.keys.delaySend);
}

// ---------- Checking values (from the UI, MIDI or an old save; a bad value keeps the fallback) ----------

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const index = (v: unknown, length: number, fallback: number) =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < length ? (v as number) : fallback;
const ranged = (key: keyof typeof FX_RANGE, v: unknown, fallback: number) =>
  clamp(FX_RANGE[key].min, FX_RANGE[key].max, num(v, fallback));

function cleanReverb(r: Partial<ReverbState>, d = defaultMix().reverb): ReverbState {
  return {
    on: bool(r.on, d.on),
    size: index(r.size, REVERB_SIZES.length, d.size),
    decay: ranged('decay', r.decay, d.decay),
    mix: ranged('mix', r.mix, d.mix),
  };
}

function cleanDelay(r: Partial<DelayState>, d = defaultMix().delay): DelayState {
  return {
    on: bool(r.on, d.on),
    time: index(r.time, DELAY_TIMES.length, d.time),
    feedback: ranged('feedback', r.feedback, d.feedback),
    mix: ranged('mix', r.mix, d.mix),
  };
}

function cleanFilter(r: Partial<FilterState>, d = defaultMix().filter): FilterState {
  return {
    on: bool(r.on, d.on),
    type: index(r.type, FILTER_TYPES.length, d.type),
    cutoff: ranged('cutoff', r.cutoff, d.cutoff),
    res: ranged('res', r.res, d.res),
  };
}

/** Restores the `mix` pref (or the old `master` pref). Missing or bad values keep their defaults. */
async function loadMix(): Promise<void> {
  const [saved, oldMaster] = await Promise.all([
    getPref<Partial<MixState>>(PREF).catch(warn),
    getPref<number>('master').catch(warn),
  ]);
  const mix = defaultMix();
  if (saved && typeof saved === 'object') {
    for (const id of STRIPS) {
      const s = saved.strips?.[id];
      if (s && typeof s === 'object') mix.strips[id] = { level: clamp(0, 1, num(s.level, mix.strips[id].level)), mute: bool(s.mute, false) };
    }
    if (saved.reverb) mix.reverb = cleanReverb(saved.reverb);
    if (saved.delay) mix.delay = cleanDelay(saved.delay);
    if (saved.filter) mix.filter = cleanFilter(saved.filter);
  } else if (typeof oldMaster === 'number' && Number.isFinite(oldMaster)) {
    mix.strips.master.level = faderLevel(oldMaster);
  }
  applyAll(mix);
  set(mix, false);
}
