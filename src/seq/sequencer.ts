// Sequencer: plays the current loop on the clock and records pad hits into it.
// This is the only code that changes patterns, the recording mode, quantise and swing
// (like kitControl.ts is for kits), so undo history never misses a change.
//
// Loops run from the bar line where they took over (startStep), not from the transport's
// own start, so a queued loop can take over at any bar line and still begin at its bar 1.

import * as clock from '../audio/clock';
import type { AudioEngine } from '../audio/engine';
import { state, subscribe, update, type RecMode } from '../state';
import {
  BEATS_PER_BAR,
  STEP_TICKS,
  SWING_MAX,
  SWING_MIN,
  clonePattern,
  insertEvent,
  lengthTicks,
  quantise,
  swingTicks,
  wrap,
  type Bars,
  type Pattern,
  type Quant,
  type SeqEvent,
} from './pattern';

const UNDO_LEVELS = 50;
const STEPS_PER_BAR = BEATS_PER_BAR * 4;
const COUNT_IN_LEAD = 0.05; // seconds between pressing REC and the first count-in click

let engine: AudioEngine;
/** 16th count (since the transport started) at which the current loop's bar 1 began. */
let startStep = 0;
/** Undo snapshots across all loops, oldest first: the loop's index and its contents before the change. */
const history: { index: number; pattern: Pattern }[] = [];
/** True until the first hit of a DUB take, which is when that take's undo snapshot is taken. */
let takeOpen = false;
/**
 * Hits recorded this pass, with the transport tick they were played at. The scheduler skips them
 * until the loop comes round, so a hit quantised forward isn't heard twice (live, then sequenced).
 */
const fresh = new WeakMap<SeqEvent, number>();
/** Context time the transport starts at after a count-in. */
let countEndsAt = 0;
let countTimer = 0;
/** What the count-in turns into when it ends. */
let pendingMode: 'rec' | 'dub' = 'rec';

export function initSequencer(e: AudioEngine): void {
  engine = e;
  clock.onSixteenth(scheduleStep);
  subscribe((s, changed) => {
    if (!changed.has('playing') || s.playing) return;
    // Stopped: recording ends, a queued loop takes over, and the next start begins at bar 1.
    clearTimeout(countTimer);
    startStep = 0;
    const patch: Partial<typeof state> = {};
    if (s.recMode !== 'off') patch.recMode = 'off';
    if (s.queued !== null) Object.assign(patch, { pattern: s.queued, queued: null });
    if (Object.keys(patch).length) update(patch);
  });
}

function current(): Pattern {
  return state.patterns[state.pattern];
}

// ---------- Playback ----------

function scheduleStep(time: number, step: number): void {
  if (step % STEPS_PER_BAR === 0 && state.queued !== null) {
    startStep = step;
    update({ pattern: state.queued, queued: null });
  }
  const p = current();
  const len = lengthTicks(p);
  const from = wrap((step - startStep) * STEP_TICKS, len);
  const to = from + STEP_TICKS;
  const absTick = step * STEP_TICKS;
  const spt = clock.secondsPerTick();
  for (const ev of p.events) {
    if (ev.tick < from) continue;
    if (ev.tick >= to) break;
    const playedAt = fresh.get(ev);
    if (playedAt !== undefined && absTick - playedAt < len / 2) continue;
    engine.playAt(ev.pad, ev.vel, time + (ev.tick - from + swingTicks(ev.tick, state.swing)) * spt);
  }
}

/** Where the listener is in the current loop: tick and 0–1 progress. Null when stopped. */
export function playhead(): { tick: number; progress: number } | null {
  if (!state.playing) return null;
  const len = lengthTicks(current());
  const tick = state.recMode === 'count' ? 0 : wrap(clock.ticksAt(clock.heardTime()) - startStep * STEP_TICKS, len);
  return { tick, progress: tick / len };
}

// ---------- Recording ----------

/**
 * REC: records over the current loop (its old hits are cleared, as one undo step). Again: stop
 * recording. Pressed during DUB: carries on as REC without clearing.
 */
export function toggleRec(): void {
  if (state.recMode === 'rec' || state.recMode === 'count') stopRecording();
  else if (state.recMode === 'dub') switchTake('rec');
  else beginTake('rec');
}

/** DUB: adds hits to the current loop. Again: stop recording. Pressed during REC: carries on as DUB. */
export function toggleDub(): void {
  if (state.recMode === 'dub') stopRecording();
  else if (state.recMode === 'rec') switchTake('dub');
  else if (state.recMode === 'off') beginTake('dub');
}

/** REC ↔ DUB while recording: keeps the hits so far; what comes next is its own undo step. */
function switchTake(mode: 'rec' | 'dub'): void {
  takeOpen = true;
  update({ recMode: mode });
}

function beginTake(mode: 'rec' | 'dub'): void {
  const p = current();
  if (mode === 'rec' && p.events.length) {
    pushHistory();
    p.events = [];
    update({}, 'patterns');
  }
  takeOpen = mode === 'dub';

  if (state.playing) return update({ recMode: mode });
  if (!state.countIn) {
    clock.start();
    return update({ recMode: mode });
  }
  // Count-in: one bar of clicks, then the transport starts on the downbeat.
  const beat = 60 / state.bpm;
  const t0 = engine.ctx.currentTime + COUNT_IN_LEAD;
  for (let i = 0; i < BEATS_PER_BAR; i++) engine.click(t0 + i * beat, i === 0);
  countEndsAt = t0 + BEATS_PER_BAR * beat;
  clock.start(countEndsAt);
  update({ recMode: 'count' });
  countTimer = window.setTimeout(
    () => state.recMode === 'count' && update({ recMode: mode }),
    (countEndsAt - engine.ctx.currentTime) * 1000,
  );
  pendingMode = mode;
}

function stopRecording(): void {
  if (state.recMode === 'count') {
    clock.stop(); // cancelled before it began; the stop handler clears recMode
    return;
  }
  update({ recMode: 'off' });
}

/** Called for every live pad hit. Records it when REC or DUB is on. */
export function recordHit(pad: number, vel: number): void {
  if (state.recMode === 'off') return;
  const heard = clock.heardTime();
  let abs: number;
  if (state.recMode === 'count') {
    // A hit just before the downbeat (within half a beat) belongs on beat 1; earlier ones are ignored.
    if (heard < countEndsAt - (60 / state.bpm) / 2) return;
    abs = 0;
  } else {
    abs = clock.ticksAt(heard);
  }
  const p = current();
  const len = lengthTicks(p);
  const rel = abs - startStep * STEP_TICKS;
  const tick = state.quant === 'OFF' ? wrap(Math.round(rel), len) : quantise(rel, state.quant, len);
  if (takeOpen) {
    pushHistory();
    takeOpen = false;
  }
  const ev: SeqEvent = { tick, pad, vel };
  insertEvent(p.events, ev);
  fresh.set(ev, abs);
  update({}, 'patterns');
}

// ---------- Editing ----------

function pushHistory(index = state.pattern): void {
  history.push({ index, pattern: clonePattern(state.patterns[index]) });
  if (history.length > UNDO_LEVELS) history.shift();
}

/** Undoes the last change to any loop. Returns false when there is nothing to undo. */
export function undo(): boolean {
  const last = history.pop();
  if (!last) return false;
  state.patterns[last.index] = last.pattern;
  // A take still running starts a fresh undo step with its next hit.
  takeOpen = state.recMode === 'rec' || state.recMode === 'dub' || (state.recMode === 'count' && pendingMode === 'dub');
  update({}, 'patterns');
  return true;
}

export function canUndo(): boolean {
  return history.length > 0;
}

export function clearPattern(index = state.pattern): void {
  const p = state.patterns[index];
  if (!p.events.length) return;
  pushHistory(index);
  p.events = [];
  update({}, 'patterns');
}

export function setLength(bars: Bars, index = state.pattern): void {
  const p = state.patterns[index];
  if (p.bars === bars) return;
  pushHistory(index);
  p.bars = bars;
  update({}, 'patterns');
}

/**
 * Tap on a loop slot. Stopped: that loop becomes current. Playing: it is queued to take over at
 * the next bar line (tapping the queued slot again, or the current one, cancels the queue).
 */
export function selectPattern(index: number): void {
  if (!state.playing) {
    if (index !== state.pattern) update({ pattern: index, queued: null });
    return;
  }
  const queued = index === state.pattern || index === state.queued ? null : index;
  if (queued !== state.queued) update({ queued });
}

export function setQuant(quant: Quant): void {
  update({ quant });
}

export function setSwing(swing: number): void {
  update({ swing: Math.min(SWING_MAX, Math.max(SWING_MIN, Math.round(swing))) });
}

export function toggleCountIn(): void {
  update({ countIn: !state.countIn });
}

/** LCD label for the recording / transport state. */
export function modeLabel(mode: RecMode = state.recMode): string {
  if (mode === 'count') return 'COUNT';
  if (mode === 'rec') return 'REC';
  if (mode === 'dub') return 'DUB';
  return state.playing ? 'PLAY' : 'READY';
}
