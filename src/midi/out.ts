// MIDI output: pad hits as notes on the chosen output and channel. The engine calls this through
// its hit hook (engine.setHitHook), so live hits, Note Repeat and sequenced loop hits all go out
// the same way, in step with the sound.
//
// Live hits send at once and the note-off when the pad is released (hold/release). Scheduled hits (loops, repeats)
// wait on a timer until just before their time, so cancelling them (a pad released, transport
// stopped) still works; they are then sent with a Web MIDI timestamp worked out from the audio
// clock, so they line up with what the listener hears. Their note-off follows NOTE_LENGTH later.

import type { AudioEngine, HitHook } from '../audio/engine';
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

export function initOut(e: AudioEngine): void {
  engine = e;
  engine.setHitHook(hook);
  prevOutput = state.midi.output;
  lastChannel = chan();
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
  if (m.output === prevOutput && m.channel - 1 === lastChannel && m.status === 'ready') return;
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
  prevOutput = m.output;
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
function timestampOf(when: number): number {
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
