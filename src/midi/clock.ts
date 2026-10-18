// MIDI clock out: 24 clocks per beat while the transport plays, with Song Position 0 + Start when
// it starts (after a count-in too, because the transport itself starts then). Stop when it stops.
// Clocks are timed like scheduled notes: handed over ~25 ms ahead with a Web MIDI timestamp, on
// timers that Stop can cancel. Switching the clock on mid-play sends clocks only (no Start).

import { getTransport } from 'tone';
import type { AudioEngine } from '../audio/engine';
import { state, subscribe } from '../state';
import * as midi from './midi';
import { timestampOf } from './out';

const CLOCK = 0xf8;
const START = 0xfa;
const STOP = 0xfc;
const SONG_POSITION = 0xf2;
const CLOCKS_PER_BEAT = 24;
const SEND_LEAD = 0.025; // seconds before its time a clock is handed to the browser

let engine: AudioEngine;
const pending = new Set<number>();
/** True from the Start we sent until the Stop, so Stop is only sent for a Start (or running clocks). */
let running = false;

export function initMidiClock(e: AudioEngine): void {
  engine = e;
  const transport = getTransport();
  transport.scheduleRepeat(
    (time) => {
      if (!wanted()) return;
      const at = timestampOf(time);
      if (transport.getTicksAtTime(time) < 1) {
        send([SONG_POSITION, 0, 0], at);
        send([START], at);
      }
      later(time, () => send([CLOCK], timestampOf(time)));
      running = true;
    },
    `${transport.PPQ / CLOCKS_PER_BEAT}i`,
    0,
  );
  subscribe((_, changed) => {
    if ((changed.has('playing') || changed.has('midi')) && running && !wanted()) halt();
  });
}

const wanted = () => state.playing && state.midi.clock && state.midi.status === 'ready';

function send(data: number[], timestamp?: number): void {
  try {
    midi.outputPort()?.send(data, timestamp);
  } catch {
    /* the device is gone */
  }
}

/** Runs `fn` just before context time `when`, on a timer Stop can cancel. */
function later(when: number, fn: () => void): void {
  const delay = when - engine.ctx.currentTime - SEND_LEAD;
  if (delay <= 0) return fn();
  const id = window.setTimeout(() => {
    pending.delete(id);
    fn();
  }, delay * 1000);
  pending.add(id);
}

function halt(): void {
  for (const id of pending) clearTimeout(id);
  pending.clear();
  running = false;
  send([STOP]);
}
