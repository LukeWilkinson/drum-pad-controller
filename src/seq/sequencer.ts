// Sequencer: plays the current loop on the clock and records pad hits and KEYS notes into it.
// This is the only code that changes patterns, the recording mode, quantise and swing
// (like kitControl.ts is for kits), so undo history never misses a change.
//
// Loops run from the bar line where they took over (startStep), not from the transport's
// own start, so a queued loop can take over at any bar line and still begin at its bar 1.

import * as clock from '../audio/clock';
import type { AudioEngine } from '../audio/engine';
import { PAD_COUNT } from '../audio/kit';
import type { KeysEngine } from '../audio/keys';
import { state, subscribe, update, type Change, type RecMode } from '../state';
import { getPref, setPref } from '../store/db';
import {
  BAR_TICKS,
  BEATS_PER_BAR,
  LENGTHS,
  PATTERN_COUNT,
  QUANTS,
  STEP_TICKS,
  SWING_MAX,
  SWING_MIN,
  clonePattern,
  emptyPattern,
  insertEvent,
  lengthTicks,
  quantise,
  swingTicks,
  wrap,
  type Bars,
  type NoteEvent,
  type Pattern,
  type Quant,
  type SeqEvent,
} from './pattern';

const UNDO_LEVELS = 50;
export const STEP_VELOCITY = 100; // hits added on the step grid
const STEPS_PER_BAR = BEATS_PER_BAR * 4;
const COUNT_IN_LEAD = 0.05; // seconds between pressing REC and the first count-in click

let engine: AudioEngine;
/** Plays recorded KEYS notes; set by attachKeys() once the keys engine exists. */
let instrument: KeysEngine | undefined;
/** 16th count (since the transport started) at which the current loop's bar 1 began. */
let startStep = 0;
/** Undo snapshots across all loops, oldest first: the loop's index and its contents before the change. */
const history: { index: number; pattern: Pattern }[] = [];
/** True until the first hit or note of a take, which is when that take's undo snapshot is taken. */
let takeOpen = false;
/** REC replaces only what is played: the take's first hit clears the old drums, its first note the old notes. */
let clearDrums = false;
let clearNotes = false;
/**
 * Hits and notes recorded this pass, with the transport tick they were played at. The scheduler skips
 * them until the loop comes round, so one quantised forward isn't heard twice (live, then sequenced).
 */
const fresh = new WeakMap<SeqEvent | NoteEvent, number>();
/** Notes being recorded (still held), by note number: the event, its loop and the context time its tick maps to. */
const open = new Map<number, { ev: NoteEvent; p: Pattern; start: number }>();
/** Loop notes handed to the keys engine, so Stop can end them. */
let loopNotes: { until: number; cancel: () => void }[] = [];
/** Context time the transport starts at after a count-in. */
let countEndsAt = 0;
let countTimer = 0;

export function initSequencer(e: AudioEngine): void {
  engine = e;
  clock.onSixteenth(scheduleStep);
  subscribe((s, changed) => {
    if (!changed.has('playing') || s.playing) return;
    // Stopped: recording ends, a queued loop takes over, and the next start begins at bar 1.
    clearTimeout(countTimer);
    startStep = 0;
    for (const n of loopNotes) n.cancel(); // loop notes still sounding end now
    loopNotes = [];
    const patch: Partial<typeof state> = {};
    if (s.recMode !== 'off') patch.recMode = 'off';
    if (s.queued !== null) Object.assign(patch, { pattern: s.queued, queued: null });
    if (Object.keys(patch).length) update(patch);
  });
  subscribe((s, changed) => {
    if (!changed.has('recMode') || s.recMode !== 'off') return;
    // Recording ended: notes still held are recorded up to now.
    endNotes();
    clearDrums = clearNotes = false;
  });
  subscribe((_, changed) => {
    if (songLoaded && SONG_FIELDS.some((f) => changed.has(f))) saveSoon();
  });
  // A phone may close the app without warning once it is hidden, so a pending save goes now.
  document.addEventListener('visibilitychange', () => document.hidden && flushSave());
  window.addEventListener('pagehide', flushSave);
}

/** Recorded KEYS notes play on `keysEngine` (with the current KEYS preset). */
export function attachKeys(keysEngine: KeysEngine): void {
  instrument = keysEngine;
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
  if (!instrument) return;
  const now = engine.ctx.currentTime;
  loopNotes = loopNotes.filter((n) => n.until > now);
  for (const n of p.notes) {
    if (n.tick < from) continue;
    if (n.tick >= to) break;
    if (!n.len) continue; // still being recorded
    const playedAt = fresh.get(n);
    if (playedAt !== undefined && absTick - playedAt < len / 2) continue;
    const when = time + (n.tick - from + swingTicks(n.tick, state.swing)) * spt;
    const length = Math.min(n.len, len) * spt;
    loopNotes.push({ until: when + length, cancel: instrument.playAt(n.note, n.vel, when, length) });
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
 * REC: records over the current loop. The take's first pad hit clears the old drums and its first
 * KEYS note the old notes, so recording one part keeps the other; the take is one undo step.
 * Again: stop recording. Pressed during DUB: carries on as REC without clearing.
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

/** REC ↔ DUB while recording: keeps the hits so far (nothing more is cleared); what comes next is its own undo step. */
function switchTake(mode: 'rec' | 'dub'): void {
  takeOpen = true;
  clearDrums = clearNotes = false;
  update({ recMode: mode });
}

function beginTake(mode: 'rec' | 'dub'): void {
  takeOpen = true;
  clearDrums = clearNotes = mode === 'rec';

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
}

function stopRecording(): void {
  if (state.recMode === 'count') {
    clock.stop(); // cancelled before it began; the stop handler clears recMode
    return;
  }
  update({ recMode: 'off' });
}

/**
 * Called for every live pad hit (and each note repeat). Records it when REC or DUB is on.
 * `heard` is the context time the hit belongs to: by default what the listener hears now;
 * note repeats pass the exact time they were scheduled for.
 */
export function recordHit(pad: number, vel: number, heard = clock.heardTime()): void {
  const at = place(heard);
  if (!at) return;
  if (clearDrums) {
    at.p.events = [];
    clearDrums = false;
  }
  const ev: SeqEvent = { tick: at.tick, pad, vel };
  insertEvent(at.p.events, ev);
  fresh.set(ev, at.abs);
  update({}, 'patterns');
}

/**
 * A KEYS note started (the note as it sounds, after scale snap). Recorded when REC or DUB is on; its
 * length is set by recordNoteOff(). The same note already being recorded ends first.
 */
export function recordNoteOn(note: number, vel: number, heard = clock.heardTime()): void {
  recordNoteOff(note, heard);
  const at = place(heard);
  if (!at) return;
  const ev = addNote(at, note, vel, 0);
  // Its length counts from the moment its tick stands for (the downbeat, if played during the count-in).
  open.set(note, { ev, p: at.p, start: state.recMode === 'count' ? countEndsAt : heard });
}

/** A KEYS note ended: its length is the time it was held, cut just short of the loop length. */
export function recordNoteOff(note: number, heard = clock.heardTime()): void {
  const o = open.get(note);
  if (!o) return;
  open.delete(note);
  o.ev.len = noteLength(o.p, heard - o.start);
  update({}, 'patterns');
}

/** A whole KEYS note at once (ARP steps): `seconds` long, heard at context time `when`. */
export function recordNote(note: number, vel: number, when: number, seconds: number): void {
  const at = place(when);
  if (at) addNote(at, note, vel, noteLength(at.p, seconds));
}

/** Ends every note still being recorded, as if its key came up now. */
export function endNotes(): void {
  const now = clock.heardTime();
  for (const note of [...open.keys()]) recordNoteOff(note, now);
}

function addNote(at: { p: Pattern; abs: number; tick: number }, note: number, vel: number, len: number): NoteEvent {
  if (clearNotes) {
    at.p.notes = [];
    clearNotes = false;
  }
  const ev: NoteEvent = { tick: at.tick, note, vel, len };
  insertEvent(at.p.notes, ev);
  fresh.set(ev, at.abs);
  update({}, 'patterns');
  return ev;
}

/** `seconds` in ticks at the current tempo: at least 1, and at most one tick short of the loop. */
function noteLength(p: Pattern, seconds: number): number {
  return Math.max(1, Math.min(lengthTicks(p) - 1, Math.round(seconds / clock.secondsPerTick())));
}

/**
 * Where something heard at context time `heard` goes in the current loop: its transport tick and
 * its (quantised) tick in the loop. Null when not recording, or too early in the count-in.
 * The first one of a take takes that take's undo snapshot.
 */
function place(heard: number): { p: Pattern; abs: number; tick: number } | null {
  if (state.recMode === 'off') return null;
  let abs: number;
  if (state.recMode === 'count') {
    // A hit just before the downbeat (within half a beat) belongs on beat 1; earlier ones are ignored.
    if (heard < countEndsAt - (60 / state.bpm) / 2) return null;
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
  return { p, abs, tick };
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
  // A note still being recorded when the snapshot was taken has no length; it is dropped.
  last.pattern.notes = last.pattern.notes.filter((n) => n.len > 0);
  state.patterns[last.index] = last.pattern;
  // A take still running starts a fresh undo step with its next hit.
  takeOpen = state.recMode !== 'off';
  update({}, 'patterns');
  return true;
}

export function canUndo(): boolean {
  return history.length > 0;
}

export function clearPattern(index = state.pattern): void {
  const p = state.patterns[index];
  if (!p.events.length && !p.notes.length) return;
  pushHistory(index);
  p.events = [];
  p.notes = [];
  update({}, 'patterns');
}

/**
 * Step grid tap: if `pad` has any hit inside the 16th starting at `tick`, removes them all;
 * otherwise adds one there at velocity `vel`. One undo step either way.
 */
export function toggleStep(pad: number, tick: number, vel = STEP_VELOCITY): void {
  const p = current();
  const inCell = (e: SeqEvent) => e.pad === pad && e.tick >= tick && e.tick < tick + STEP_TICKS;
  pushHistory();
  if (p.events.some(inCell)) p.events = p.events.filter((e) => !inCell(e));
  else insertEvent(p.events, { tick, pad, vel });
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

// ---------- Saving ----------
// The song (loops and their settings) autosaves to IndexedDB as one 'song' pref, a short while
// after any change. Undo history is not saved.

const SONG_KEY = 'song';
const SAVE_DELAY = 500; // ms; a burst of edits (or a recorded take) becomes one write
const SONG_FIELDS = ['patterns', 'pattern', 'bpm', 'click', 'quant', 'swing', 'countIn', 'noteRepeat'] as const satisfies readonly Change[];

/** The loops and their settings: what autosaves, and what a shared song file carries. */
export interface Song {
  patterns: Pattern[];
  pattern: number;
  bpm: number;
  click: boolean;
  quant: Quant;
  swing: number;
  countIn: boolean;
  noteRepeat: boolean;
}

/** False until loadSong() has run, so the defaults never overwrite a saved song. */
let songLoaded = false;
let saveTimer = 0;

const warn = (err: unknown) => console.warn('[store]', err);

function saveSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSave, SAVE_DELAY);
}

function flushSave(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  setPref(SONG_KEY, currentSong()).catch(warn); // IndexedDB copies the data straight away
}

/** The song as it is now (shares the live loops; IndexedDB and JSON.stringify copy them). */
export function currentSong(): Song {
  const { patterns, pattern, bpm, click, quant, swing, countIn, noteRepeat } = state;
  return { patterns, pattern, bpm, click, quant, swing, countIn, noteRepeat };
}

/** Restores the saved song, if any. Call once at boot, while stopped. Bad or missing fields keep their defaults. */
export async function loadSong(): Promise<void> {
  try {
    const song = await getPref<Partial<Song>>(SONG_KEY).catch(warn);
    if (song && typeof song === 'object') applySong(song);
  } finally {
    songLoaded = true;
  }
}

/**
 * Replaces the song with `song` (a saved or shared one), checking every field: bad or missing
 * fields keep their current value, bad hits and notes are dropped. Must be called while stopped.
 * Undo history is cleared, since it belonged to the old loops.
 */
export function applySong(song: Partial<Song>): void {
  const patch: Partial<typeof state> = {};
  if (Array.isArray(song.patterns)) {
    patch.patterns = Array.from({ length: PATTERN_COUNT }, (_, i) => cleanPattern(song.patterns![i]));
    history.length = 0;
  }
  if (Number.isInteger(song.pattern) && song.pattern! >= 0 && song.pattern! < PATTERN_COUNT) patch.pattern = song.pattern;
  if (QUANTS.includes(song.quant as Quant)) patch.quant = song.quant;
  if (typeof song.swing === 'number') patch.swing = Math.min(SWING_MAX, Math.max(SWING_MIN, Math.round(song.swing)));
  if (typeof song.countIn === 'boolean') patch.countIn = song.countIn;
  // Nothing is held while stopped, so Note Repeat can be set directly (repeat.ts imports this file).
  if (typeof song.noteRepeat === 'boolean') patch.noteRepeat = song.noteRepeat;
  if (Object.keys(patch).length) update(patch);
  if (typeof song.bpm === 'number' && Number.isFinite(song.bpm)) clock.setBpm(song.bpm);
  if (typeof song.click === 'boolean') clock.setClick(song.click);
}

/** A saved loop, with anything out of range dropped. */
function cleanPattern(raw: unknown): Pattern {
  const r = raw as Partial<Pattern> | undefined;
  const bars = LENGTHS.includes(r?.bars as Bars) ? (r!.bars as Bars) : undefined;
  if (!bars || !Array.isArray(r!.events)) return emptyPattern();
  const maxTick = LENGTHS[LENGTHS.length - 1] * BAR_TICKS;
  const events: SeqEvent[] = [];
  for (const e of r!.events as Partial<SeqEvent>[]) {
    const { tick, pad, vel } = e ?? {};
    if (!Number.isInteger(tick) || tick! < 0 || tick! >= maxTick) continue;
    if (!Number.isInteger(pad) || pad! < 0 || pad! >= PAD_COUNT) continue;
    if (!Number.isInteger(vel) || vel! < 1 || vel! > 127) continue;
    insertEvent(events, { tick: tick!, pad: pad!, vel: vel! });
  }
  // Saves from before KEYS recording have no notes.
  const notes: NoteEvent[] = [];
  for (const n of (Array.isArray(r!.notes) ? r!.notes : []) as Partial<NoteEvent>[]) {
    const { tick, note, vel, len } = n ?? {};
    if (!Number.isInteger(tick) || tick! < 0 || tick! >= maxTick) continue;
    if (!Number.isInteger(note) || note! < 0 || note! > 127) continue;
    if (!Number.isInteger(vel) || vel! < 1 || vel! > 127) continue;
    if (!Number.isInteger(len) || len! < 1 || len! > maxTick) continue; // 0: still held when saved
    insertEvent(notes, { tick: tick!, note: note!, vel: vel!, len: len! });
  }
  return { bars, events, notes };
}

/** LCD label for the recording / transport state. */
export function modeLabel(mode: RecMode = state.recMode): string {
  if (mode === 'count') return 'COUNT';
  if (mode === 'rec') return 'REC';
  if (mode === 'dub') return 'DUB';
  return state.playing ? 'PLAY' : 'READY';
}
