// MIDI output: pad hits as notes on the chosen output and channel. The engine calls this through
// its hit hook (engine.setHitHook), so live hits, Note Repeat and sequenced loop hits all go out
// the same way, in step with the sound.
//
// Live hits send at once and the note-off when the pad is released (hold/release). Scheduled hits (loops, repeats)
// wait on a timer until just before their time, so cancelling them (a pad released, transport
// stopped) still works; they are then sent with a Web MIDI timestamp worked out from the audio
// clock, so they line up with what the listener hears. Their note-off follows NOTE_LENGTH later.
//
// KEYS notes go out the same way on the Keys channel (keysHook, from KeysEngine): live notes at once
// with a note-off on release, scheduled ones (ARP steps, loop notes) with a timestamped note-on and
// note-off, and the PITCH strip as pitch bend (±2 semitones).

import type { AudioEngine, HitHook } from '../audio/engine';
import type { KeysEngine, KeysHook } from '../audio/keys';
import { state, subscribe } from '../state';
import * as midi from './midi';
import { noteOfPad } from './notes';
import type { OutLike } from './types';

const SEND_LEAD = 0.025; // seconds before its time a scheduled note is handed to the browser
const NOTE_LENGTH = 60; // ms from a scheduled note-on to its note-off
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const CONTROL = 0xb0;
const ALL_NOTES_OFF = 123;

let engine: AudioEngine;
/** Scheduled notes not yet handed over, so they can be cancelled. */
const pending = new Set<{ timer: number }>();
/** Notes sent on and not yet off, and the timers that will turn the scheduled ones off. */
const sounding = new Set<number>();
const offTimers = new Map<number, number>();
/** Where the last message went, so a change of output or channel can turn its notes off first. */
let lastPort: OutLike | null = null;
let lastChannel = 0;
let prevOutput: string | null = null;
let warned = false;

// KEYS bookkeeping (see keysHook below).
const PITCH_BEND = 0xe0;
const BEND_RANGE = 2; // semitones, the usual synth default
const kPending = new Set<{ timer: number }>();
const kSounding = new Set<number>();
const kOffTimers = new Map<number, number>();
let lastKeysPort: OutLike | null = null;
let lastKeysChannel = 0;

export function initOut(e: AudioEngine, keysEngine: KeysEngine): void {
  engine = e;
  engine.setHitHook(hook);
  keysEngine.setHook(keysHook);
  prevOutput = state.midi.output;
  lastChannel = chan();
  lastKeysChannel = kchan();
  subscribe((_, changed) => changed.has('midi') && followSettings());
}

const hook: HitHook = {
  now(pad, vel) {
    // Short by default (auditions, step taps); a held pad calls hold() to keep it until release.
    const note = noteOfPad(pad);
    sendOn(note, vel);
    offTimers.set(note, window.setTimeout(() => sendOff(note), NOTE_LENGTH));
  },
  at(pad, vel, when) {
    const note = noteOfPad(pad);
    const delay = when - engine.ctx.currentTime - SEND_LEAD;
    if (delay <= 0) {
      sendScheduled(note, vel, when);
      return () => {};
    }
    const entry = { timer: 0 };
    entry.timer = window.setTimeout(() => {
      pending.delete(entry);
      sendScheduled(note, vel, when);
    }, delay * 1000);
    pending.add(entry);
    return () => {
      clearTimeout(entry.timer);
      pending.delete(entry);
    };
  },
  cancelAll,
};

/** The pad just hit stays on until release() (call right after the live hit). */
export function hold(pad: number): void {
  const note = noteOfPad(pad);
  clearTimeout(offTimers.get(note));
  offTimers.delete(note);
}

/** A pad came up: its note ends. */
export function release(pad: number): void {
  sendOff(noteOfPad(pad));
}

/** Drops notes not yet sent and turns every sounding note off (transport stop). */
export function cancelAll(): void {
  for (const p of pending) clearTimeout(p.timer);
  pending.clear();
  for (const t of offTimers.values()) clearTimeout(t);
  offTimers.clear();
  for (const note of sounding) send([NOTE_OFF | chan(), note, 0]);
  sounding.clear();
  send([CONTROL | chan(), ALL_NOTES_OFF, 0]);
}

/** Output or channel changed (or MIDI went off): finish the notes on the old one. */
function followSettings(): void {
  const m = state.midi;
  const outputGone = m.output !== prevOutput || m.status !== 'ready';
  if (outputGone || m.channel - 1 !== lastChannel) finishPadNotes(m);
  if (outputGone || m.keysChannel - 1 !== lastKeysChannel) finishKeysNotes();
  prevOutput = m.output;
}

function finishPadNotes(m: Readonly<typeof state.midi>): void {
  const port = lastPort;
  const ch = lastChannel;
  for (const p of pending) clearTimeout(p.timer);
  pending.clear();
  for (const t of offTimers.values()) clearTimeout(t);
  offTimers.clear();
  if (port) {
    try {
      for (const note of sounding) port.send([NOTE_OFF | ch, note, 0]);
      port.send([CONTROL | ch, ALL_NOTES_OFF, 0]);
    } catch {
      /* the device is gone */
    }
  }
  sounding.clear();
  lastPort = null;
  lastChannel = m.channel - 1;
}

const chan = () => state.midi.channel - 1;
const clampVel = (v: number) => Math.max(1, Math.min(127, Math.round(v)));

function send(data: number[], timestamp?: number): void {
  const port = midi.outputPort();
  if (!port) return;
  try {
    port.send(data, timestamp);
    lastPort = port;
    lastChannel = chan();
  } catch (err) {
    if (!warned) console.warn('[midi] send failed', err);
    warned = true;
  }
}

function sendOn(note: number, vel: number): void {
  clearTimeout(offTimers.get(note));
  offTimers.delete(note);
  if (sounding.has(note)) send([NOTE_OFF | chan(), note, 0]); // a retrigger ends the old note first
  send([NOTE_ON | chan(), note, clampVel(vel)]);
  sounding.add(note);
}

function sendOff(note: number): void {
  clearTimeout(offTimers.get(note));
  offTimers.delete(note);
  if (!sounding.delete(note)) return;
  send([NOTE_OFF | chan(), note, 0]);
}

/** Context time → the Web MIDI timestamp (performance.now() scale) at which it is heard. */
export function timestampOf(when: number): number {
  const t = engine.ctx.getOutputTimestamp();
  if (t.contextTime && t.performanceTime) return t.performanceTime + (when - t.contextTime) * 1000;
  return performance.now() + (when - engine.ctx.currentTime) * 1000;
}

function sendScheduled(note: number, vel: number, when: number): void {
  const ts = timestampOf(when);
  clearTimeout(offTimers.get(note));
  if (sounding.has(note)) send([NOTE_OFF | chan(), note, 0], ts);
  send([NOTE_ON | chan(), note, clampVel(vel)], ts);
  sounding.add(note);
  offTimers.set(note, window.setTimeout(() => sendOff(note), Math.max(0, ts - performance.now()) + NOTE_LENGTH));
}

// ---- KEYS (Keys channel) ----

const kchan = () => state.midi.keysChannel - 1;

const keysHook: KeysHook = {
  now(note, vel) {
    kOn(note, vel);
  },
  off(note) {
    kOff(note);
  },
  at(note, vel, when, length) {
    const delay = when - engine.ctx.currentTime - SEND_LEAD;
    const entry = { timer: 0 };
    let endTimer = 0;
    const fire = () => {
      kPending.delete(entry);
      const ts = timestampOf(when);
      const tsOff = timestampOf(when + length);
      clearTimeout(kOffTimers.get(note));
      if (kSounding.has(note)) ksend([NOTE_OFF | kchan(), note, 0], ts);
      ksend([NOTE_ON | kchan(), note, clampVel(vel)], ts);
      ksend([NOTE_OFF | kchan(), note, 0], tsOff);
      kSounding.add(note);
      // The note-off is already queued with its timestamp; this only forgets the note afterwards.
      endTimer = window.setTimeout(() => kSounding.delete(note), Math.max(0, tsOff - performance.now()));
      kOffTimers.set(note, endTimer);
    };
    if (delay <= 0) {
      fire();
    } else {
      entry.timer = window.setTimeout(fire, delay * 1000);
      kPending.add(entry);
    }
    return () => {
      clearTimeout(entry.timer);
      kPending.delete(entry);
      if (!endTimer) return; // never sent
      clearTimeout(endTimer);
      if (kSounding.delete(note)) ksend([NOTE_OFF | kchan(), note, 0]); // sounding: ends now
    };
  },
  bend(semitones) {
    const v = Math.max(0, Math.min(16383, 8192 + Math.round((semitones / BEND_RANGE) * 8191)));
    ksend([PITCH_BEND | kchan(), v & 127, v >> 7]);
  },
  allOff() {
    for (const p of kPending) clearTimeout(p.timer);
    kPending.clear();
    for (const t of kOffTimers.values()) clearTimeout(t);
    kOffTimers.clear();
    for (const note of kSounding) ksend([NOTE_OFF | kchan(), note, 0]);
    kSounding.clear();
    ksend([CONTROL | kchan(), ALL_NOTES_OFF, 0]);
  },
};

function ksend(data: number[], timestamp?: number): void {
  const port = midi.outputPort();
  if (!port) return;
  try {
    port.send(data, timestamp);
    lastKeysPort = port;
    lastKeysChannel = kchan();
  } catch (err) {
    if (!warned) console.warn('[midi] send failed', err);
    warned = true;
  }
}

function kOn(note: number, vel: number): void {
  clearTimeout(kOffTimers.get(note));
  kOffTimers.delete(note);
  if (kSounding.has(note)) ksend([NOTE_OFF | kchan(), note, 0]); // a retrigger ends the old note first
  ksend([NOTE_ON | kchan(), note, clampVel(vel)]);
  kSounding.add(note);
}

function kOff(note: number): void {
  clearTimeout(kOffTimers.get(note));
  kOffTimers.delete(note);
  if (!kSounding.delete(note)) return;
  ksend([NOTE_OFF | kchan(), note, 0]);
}

/** Keys channel or output changed (or MIDI went off): finish the keys notes on the old one. */
function finishKeysNotes(): void {
  const port = lastKeysPort;
  const ch = lastKeysChannel;
  for (const p of kPending) clearTimeout(p.timer);
  kPending.clear();
  for (const t of kOffTimers.values()) clearTimeout(t);
  kOffTimers.clear();
  if (port) {
    try {
      for (const note of kSounding) port.send([NOTE_OFF | ch, note, 0]);
      port.send([CONTROL | ch, ALL_NOTES_OFF, 0]);
    } catch {
      /* the device is gone */
    }
  }
  kSounding.clear();
  lastKeysPort = null;
  lastKeysChannel = kchan();
}
