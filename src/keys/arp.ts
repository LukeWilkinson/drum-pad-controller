// ARP: while it is on, the notes held on KEYS (or kept by HOLD) play one at a time at the ARP rate,
// in the ARP mode's order. Built like Note Repeat (src/seq/repeat.ts): the first note sounds at
// once; then, while playing, steps land on the transport's grid (with swing at 1/16); stopped, the
// grid starts at the first note. A small look-ahead timer schedules each step with
// KeysEngine.playAt(), so stopping cancels any step not yet heard.

import * as clock from '../audio/clock';
import type { AudioEngine } from '../audio/engine';
import type { KeysEngine } from '../audio/keys';
import { swingTicks } from '../seq/pattern';
import { state, subscribe } from '../state';
import { ARP_RATES } from './types';

const LOOK_AHEAD = 0.05; // seconds scheduled ahead
const TIMER_MS = 15;
/** A grid point closer to the first note than this share of the rate is skipped (no flam). */
const MIN_GAP = 1 / 3;
/** Each step sounds for this share of the rate. */
const GATE = 0.8;

let engine: AudioEngine;
let instrument: KeysEngine;
/** Notes in the arp, low to high, with the velocity each was played at. */
const notes: { note: number; vel: number }[] = [];
let timer = 0;
/** Tick of the next step and the context time tick 0 maps to (as in repeat.ts). */
let nextTick = 0;
let zeroTime = 0;
let grid = 24;
/** The note played last (each step goes on from it), and UP-DOWN's direction. */
let lastNote = -1;
let dir = 1;
const pending: { when: number; cancel: () => void }[] = [];

export function initArp(e: AudioEngine, keysEngine: KeysEngine): void {
  engine = e;
  instrument = keysEngine;
  // Re-lock to the grid when the transport starts or stops, and pick up a new rate.
  subscribe((s, changed) => {
    if (changed.has('playing') || (changed.has('keys') && ARP_RATES[s.keys.arpRate] !== grid)) restart();
  });
}

/** Adds a note (or updates its velocity). The first note starts the arp. */
export function add(note: number, vel: number): void {
  const i = notes.findIndex((n) => n.note === note);
  if (i >= 0) notes[i].vel = vel;
  else {
    notes.push({ note, vel });
    notes.sort((a, b) => a.note - b.note);
  }
  if (!timer) start();
}

/** Takes a note out. The last one out stops the arp. */
export function remove(note: number): void {
  const i = notes.findIndex((n) => n.note === note);
  if (i < 0) return;
  notes.splice(i, 1);
  if (!notes.length) stop();
}

/** Stops and empties the arp. */
export function clear(): void {
  notes.length = 0;
  stop();
}

/** A new rate or transport state takes effect from the next step (the grid restarts there). */
function restart(): void {
  if (!timer) return;
  stop(true);
  start(true);
}

export function running(): boolean {
  return timer !== 0;
}

function start(quiet = false): void {
  const now = engine.ctx.currentTime;
  grid = ARP_RATES[state.keys.arpRate];
  const spt = clock.secondsPerTick();
  if (!quiet) {
    // A fresh run starts at the bottom (UP, UP-DOWN) or the top (DOWN).
    lastNote = state.keys.arpMode === 'down' ? 128 : -1;
    dir = 1;
  }
  if (state.playing && state.recMode !== 'count') {
    const tickNow = clock.ticksAt(now);
    nextTick = Math.ceil(tickNow / grid) * grid;
    if (!quiet && nextTick - tickNow < grid * MIN_GAP) nextTick += grid;
    zeroTime = now - tickNow * spt;
  } else {
    nextTick = quiet ? 0 : grid;
    zeroTime = now;
  }
  if (!quiet) play(now, grid * spt); // the first note at once, like a live note
  schedule();
  timer = window.setInterval(schedule, TIMER_MS);
}

/** `keepSounding`: steps already heard ring on (a rate change); otherwise they end now. */
function stop(keepSounding = false): void {
  clearInterval(timer);
  timer = 0;
  const now = engine.ctx.currentTime;
  for (const p of pending) if (!keepSounding || p.when > now) p.cancel();
  pending.length = 0;
}

function schedule(): void {
  const now = engine.ctx.currentTime;
  const spt = clock.secondsPerTick();
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i].when + grid * spt < now) pending.splice(i, 1);
  for (;;) {
    const swing = state.keys.arpRate === '1/16' ? swingTicks(nextTick, state.swing) : 0;
    const when = zeroTime + (nextTick + swing) * spt;
    if (when >= now + LOOK_AHEAD) break;
    nextTick += grid;
    if (when < now) continue; // the tab was busy and this one is already late: skip it
    play(when, grid * spt);
  }
}

function play(when: number, stepLength: number): void {
  if (!notes.length) return;
  const n = notes[pick()];
  pending.push({ when, cancel: instrument.playAt(n.note, n.vel, when, stepLength * GATE) });
}

/**
 * Index of the next note, by the ARP mode. Steps go from the last note played (not a step count),
 * so notes joining or leaving mid-run fit straight in: UP takes the next higher note (then wraps to
 * the lowest), DOWN the next lower, UP-DOWN bounces at the ends, RANDOM avoids repeating a note.
 */
function pick(): number {
  const n = notes.length;
  const above = notes.findIndex((x) => x.note > lastNote);
  const belowAt = (): number => {
    for (let i = n - 1; i >= 0; i--) if (notes[i].note < lastNote) return i;
    return -1;
  };
  let i: number;
  switch (state.keys.arpMode) {
    case 'down': {
      const b = belowAt();
      i = b >= 0 ? b : n - 1;
      break;
    }
    case 'updown': {
      if (dir > 0 && above < 0) dir = -1;
      else if (dir < 0 && belowAt() < 0) dir = 1;
      const next = dir > 0 ? above : belowAt();
      i = next >= 0 ? next : 0; // a single note
      break;
    }
    case 'random':
      i = Math.floor(Math.random() * n);
      if (n > 1 && notes[i].note === lastNote) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
      break;
    default:
      i = above >= 0 ? above : 0;
  }
  lastNote = notes[i].note;
  return i;
}
