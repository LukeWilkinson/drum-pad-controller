// Latency calibration and settings. This is the only code that changes state.latency.
// Tap-along: 8 clicks 0.5 s apart are scheduled straight on the audio context (no Tone, no
// transport). Each tap is converted to context time and compared with the nearest click; the
// median difference is the delay between "the app plays it" and "Luke taps it" (output latency
// plus his tap habit), which is exactly the shift recorded hits need (clock.heardTime()).

import { state, update } from '../state';
import type { AudioEngine } from './engine';
import { MEASURED_MAX, OFFSET_MAX, OFFSET_MIN, saveLatency, type LatencyState } from './latencyTypes';

export const CLICKS = 8;
const GAP = 0.5; // seconds between clicks
const LEAD = 1; // seconds before the first click
const MAX_ERR = 0.25; // taps further than this from a click are ignored
const MIN_TAPS = 5;

export type CalState =
  | { phase: 'idle' }
  | { phase: 'running'; taps: number }
  | { phase: 'done'; ms: number }
  | { phase: 'failed'; reason: string };

let engine: AudioEngine;
let clicks: number[] = [];
let errors: number[] = [];
let timer = 0;
let cal: CalState = { phase: 'idle' };
const listeners = new Set<(c: CalState) => void>();

export const onCalibration = (fn: (c: CalState) => void) => listeners.add(fn);
export const calibration = () => cal;

function setCal(c: CalState): void {
  cal = c;
  for (const fn of listeners) fn(c);
}

export function initLatency(e: AudioEngine): void {
  engine = e;
}

/** The browser's own output delay in seconds (0 if it reports none). */
export function browserDelay(): number {
  return engine.ctx.outputLatency || engine.ctx.baseLatency || 0;
}

function set(patch: Partial<LatencyState>): void {
  const latency = { ...state.latency, ...patch };
  update({ latency });
  saveLatency(latency);
}

export function setOffset(ms: number): void {
  set({ offset: Math.round(Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, ms))) });
}

export function setLow(low: boolean): void {
  set({ low });
}

/** Forgets the calibration: the browser's own number is used again. */
export function resetMeasured(): void {
  set({ measured: null });
}

/** Starts the 8 clicks. Refused while the transport plays or a run is already going. */
export async function startCalibration(): Promise<void> {
  if (cal.phase === 'running') return;
  if (state.playing) return setCal({ phase: 'failed', reason: 'Stop playback first.' });
  await engine.unlock();
  const t0 = engine.ctx.currentTime + LEAD;
  clicks = Array.from({ length: CLICKS }, (_, i) => t0 + i * GAP);
  errors = [];
  clicks.forEach((t, i) => engine.click(t, i === 0));
  setCal({ phase: 'running', taps: 0 });
  window.clearTimeout(timer);
  timer = window.setTimeout(finish, (LEAD + (CLICKS - 1) * GAP + MAX_ERR + 0.3) * 1000);
}

/** Call from a pointerdown / keydown while running. `eventTime` is the event's timeStamp (ms). */
export function tap(eventTime: number): void {
  if (cal.phase !== 'running') return;
  // The event happened (now − eventTime) ms ago, on the performance clock.
  addTap(engine.ctx.currentTime - (performance.now() - eventTime) / 1000);
}

/** Adds a tap at context time `at`. Exported for checks. */
export function addTap(at: number): void {
  if (cal.phase !== 'running') return;
  let best = clicks[0];
  for (const c of clicks) if (Math.abs(at - c) < Math.abs(at - best)) best = c;
  const err = at - best;
  if (Math.abs(err) > MAX_ERR) return;
  errors.push(err);
  setCal({ phase: 'running', taps: errors.length });
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ends the run (also called by the timer): sets `measured` when there were enough good taps. */
export function finish(): void {
  window.clearTimeout(timer);
  if (cal.phase !== 'running') return;
  if (errors.length < MIN_TAPS) {
    return setCal({ phase: 'failed', reason: `Only ${errors.length} good taps. Tap on each click and try again.` });
  }
  const ms = Math.round(Math.min(MEASURED_MAX, Math.max(0, median(errors) * 1000)));
  set({ measured: ms });
  setCal({ phase: 'done', ms });
}

export function cancelCalibration(): void {
  window.clearTimeout(timer);
  if (cal.phase === 'running') setCal({ phase: 'idle' });
}
