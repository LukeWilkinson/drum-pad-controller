// Note Repeat: while it is on, a held pad retriggers at the quantise rate (1/16 when quantise is OFF).
// Playing: repeats land on the transport's grid (with swing). Stopped or counting in: the grid
// starts at the press. The first hit is the normal live hit; repeats follow.
// A small look-ahead timer schedules each repeat with engine.playAt(); releasing the pad cancels
// any repeat not yet heard. Each repeat is recorded (REC/DUB) at the moment it sounds.

import * as clock from '../audio/clock';
import type { AudioEngine } from '../audio/engine';
import { state, update } from '../state';
import { QUANT_TICKS, swingTicks } from './pattern';
import * as seq from './sequencer';

const LOOK_AHEAD = 0.05; // seconds scheduled ahead; short, so a release cuts repeats quickly
const TIMER_MS = 15;
/** A grid point closer to the press than this share of the rate is skipped, so the first repeat never flams. */
const MIN_GAP = 1 / 3;

interface Pending {
  when: number;
  cancel: () => void;
  recordTimer: number;
}

interface Held {
  pad: number;
  vel: number;
  /** Grid step in ticks. */
  grid: number;
  /** Tick of the next repeat, and the context time that tick 0 maps to. */
  nextTick: number;
  zeroTime: number;
  pending: Pending[];
}

let engine: AudioEngine;
const held = new Map<number, Held>(); // by pad index (bank × 16 + screen index)
let timer = 0;

export function initRepeat(e: AudioEngine): void {
  engine = e;
}

export function toggleNoteRepeat(): void {
  update({ noteRepeat: !state.noteRepeat });
  if (!state.noteRepeat) for (const pad of [...held.keys()]) release(pad);
}

/** A pad went down (after its live hit). Starts repeating if Note Repeat is on. */
export function press(pad: number, vel: number): void {
  if (!state.noteRepeat) return;
  release(pad);
  const now = engine.ctx.currentTime;
  const grid = QUANT_TICKS[state.quant === 'OFF' ? '1/16' : state.quant];
  const spt = clock.secondsPerTick();
  let h: Held;
  if (state.playing && state.recMode !== 'count') {
    const tickNow = clock.ticksAt(now);
    let next = Math.ceil(tickNow / grid) * grid;
    if (next - tickNow < grid * MIN_GAP) next += grid;
    h = { pad, vel, grid, nextTick: next, zeroTime: now - tickNow * spt, pending: [] };
  } else {
    h = { pad, vel, grid, nextTick: grid, zeroTime: now, pending: [] };
  }
  held.set(pad, h);
  schedule();
  timer ||= window.setInterval(schedule, TIMER_MS);
}

/** The finger moved on a held pad: later repeats use the new velocity. */
export function move(pad: number, vel: number): void {
  const h = held.get(pad);
  if (h) h.vel = vel;
}

/** The pad came up: repeats not yet heard are cancelled. */
export function release(pad: number): void {
  const h = held.get(pad);
  if (!h) return;
  const now = engine.ctx.currentTime;
  for (const p of h.pending) {
    if (p.when > now) {
      p.cancel();
      clearTimeout(p.recordTimer);
    }
  }
  held.delete(pad);
  if (!held.size) {
    clearInterval(timer);
    timer = 0;
  }
}

function schedule(): void {
  const now = engine.ctx.currentTime;
  const spt = clock.secondsPerTick();
  for (const h of held.values()) {
    h.pending = h.pending.filter((p) => p.when > now);
    for (;;) {
      const when = h.zeroTime + (h.nextTick + swingTicks(h.nextTick, state.swing)) * spt;
      if (when >= now + LOOK_AHEAD) break;
      const { pad, vel } = h;
      h.nextTick += h.grid;
      if (when < now) continue; // the tab was busy and this one is already late: skip it
      h.pending.push({
        when,
        cancel: engine.playAt(pad, vel, when),
        recordTimer: window.setTimeout(() => seq.recordHit(pad, vel, when), (when - now) * 1000),
      });
    }
  }
}
