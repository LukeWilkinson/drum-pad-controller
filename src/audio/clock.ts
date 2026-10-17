// Transport clock: the Tone.js Transport running on the engine's own AudioContext, plus tempo,
// tap tempo and the metronome. Only scheduled playback goes through Tone (with its look-ahead);
// live pad hits never do. This is the only code that changes the transport fields in the store.

import { Context, getTransport, setContext } from 'tone';
import type { AudioEngine } from './engine';
import { state, update } from '../state';

export const BPM_MIN = 40;
export const BPM_MAX = 240;
export const BEATS_PER_BAR = 4;
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

export function start(): void {
  if (state.playing) return;
  transport.start();
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
  update({ click: !state.click });
}

export interface Position {
  /** 1-based bar. */
  bar: number;
  /** 1-based beat in the bar. */
  beat: number;
  /** 16th note within the beat, 0–3. */
  sixteenth: number;
}

/** Where the listener is now: Transport time minus the device's output latency. */
export function position(): Position {
  const ctx = engine.ctx;
  const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  const ticks = state.playing ? Math.max(0, transport.getTicksAtTime(heard)) : 0;
  const sixteenths = Math.floor(ticks / (transport.PPQ / 4));
  return {
    bar: Math.floor(sixteenths / (BEATS_PER_BAR * 4)) + 1,
    beat: (Math.floor(sixteenths / 4) % BEATS_PER_BAR) + 1,
    sixteenth: sixteenths % 4,
  };
}
