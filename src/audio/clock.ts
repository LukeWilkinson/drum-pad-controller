// Transport clock: the Tone.js Transport running on the engine's own AudioContext, plus tempo,
// tap tempo and the metronome. Only scheduled playback goes through Tone (with its look-ahead);
// live pad hits never do. This is the only code that changes the transport fields in the store.

import { Context, getTransport, setContext } from 'tone';
import type { AudioEngine } from './engine';
import { BEATS_PER_BAR, PPQ } from '../seq/pattern';
import { state, update } from '../state';

export const BPM_MIN = 40;
export const BPM_MAX = 240;
const LOOK_AHEAD = 0.1; // seconds Tone schedules ahead; covers main-thread hiccups
const TAP_RESET = 2; // seconds without a tap start a new tap-tempo count
const TAP_INTERVALS = 4; // how many recent intervals tap tempo averages

let engine: AudioEngine;
let transport: ReturnType<typeof getTransport>;
const taps: number[] = [];

export function initClock(e: AudioEngine): void {
  engine = e;
  setContext(new Context({ context: e.ctx, lookAhead: LOOK_AHEAD }));
  transport = getTransport();
  transport.timeSignature = BEATS_PER_BAR;
  transport.bpm.value = state.bpm;
  transport.scheduleRepeat(
    (time) => {
      if (!state.click) return;
      const beat = Math.round(transport.getTicksAtTime(time) / transport.PPQ);
      engine.click(time, beat % BEATS_PER_BAR === 0);
    },
    '4n',
    0,
  );
}

/** Starts the transport now, or at context time `at` (used after a count-in). */
export function start(at?: number): void {
  if (state.playing) return;
  transport.start(at);
  update({ playing: true });
}

export function stop(): void {
  if (!state.playing) return;
  transport.stop();
  engine.cancelScheduled();
  update({ playing: false });
}

export function togglePlay(): void {
  if (state.playing) stop();
  else start();
}

/** Sets the tempo, clamped to BPM_MIN–BPM_MAX and rounded to 0.1. Takes effect straight away. */
export function setBpm(bpm: number): void {
  const v = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm * 10) / 10));
  transport.bpm.value = v;
  update({ bpm: v });
}

/** −/+ buttons: steps to the next whole BPM. */
export function nudgeBpm(delta: number): void {
  setBpm(Math.round(state.bpm + delta));
}

/** Call on each tap; from the second tap on, sets the tempo to the average of the recent intervals. */
export function tapTempo(): void {
  const t = performance.now() / 1000;
  if (taps.length && t - taps[taps.length - 1] > TAP_RESET) taps.length = 0;
  taps.push(t);
  if (taps.length > TAP_INTERVALS + 1) taps.shift();
  if (taps.length < 2) return;
  const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
  setBpm(60 / avg);
}

export function toggleClick(): void {
  setClick(!state.click);
}

export function setClick(click: boolean): void {
  if (click !== state.click) update({ click });
}

/**
 * The context time of what the listener hears when a tap lands: currentTime minus the output delay.
 * The delay is the calibrated value if there is one, else the browser's report, plus the manual
 * offset (src/audio/latency.ts). A pad hit lines up with this (Luke plays along to what he hears).
 */
export function heardTime(): number {
  const ctx = engine.ctx;
  const { measured, offset } = state.latency;
  const delay = measured !== null ? measured / 1000 : ctx.outputLatency || ctx.baseLatency || 0;
  return ctx.currentTime - delay - offset / 1000;
}

/** Transport position at context time `time`, in pattern ticks (PPQ per beat, fractional). 0 when stopped. */
export function ticksAt(time: number): number {
  if (!state.playing) return 0;
  return Math.max(0, transport.getTicksAtTime(time)) * (PPQ / transport.PPQ);
}

export function secondsPerTick(): number {
  return 60 / transport.bpm.value / PPQ;
}

/** Calls `fn` ahead of time for every 16th while playing, with its context time and 16th count since start. */
export function onSixteenth(fn: (time: number, step: number) => void): void {
  transport.scheduleRepeat(
    (time) => fn(time, Math.round(transport.getTicksAtTime(time) / (transport.PPQ / 4))),
    '16n',
    0,
  );
}
