// A KEYS note, whatever its source: the on-screen keyboard and the computer keyboard
// (src/keys/input.ts) now; loops and MIDI input later in M5. Sound first, then the key and the LCD.
// Notes are MIDI numbers (C4 = 60).
// - Scale snap: a pressed key plays the nearest note of the scale (src/keys/scales.ts); that note is
//   what sounds, lights and shows on the LCD.
// - HOLD: a note keeps sounding after its key comes up ("latched") until its key is tapped again or
//   HOLD goes off.
// - ARP: notes go to the arpeggiator (src/keys/arp.ts) instead of sounding together.

import type { KeysEngine } from '../audio/keys';
import * as hits from '../pads/hits';
import { state, subscribe } from '../state';
import { showKey } from '../ui/keys';
import * as arp from './arp';
import { snap } from './scales';
import { noteName, presetOf } from './types';

const BEND_RANGE = 2; // semitones at the ends of the PITCH strip

let instrument: KeysEngine;
/** How many presses hold each sounding note. */
const held = new Map<number, number>();
/** Each pressed key (as pressed) → the note it plays and how many presses hold it. */
const pressed = new Map<number, { note: number; count: number; unlatched: boolean }>();
/** Notes HOLD keeps sounding after their keys came up. */
const latched = new Set<number>();

export function initNotes(i: KeysEngine): void {
  instrument = i;
  let hold = state.keys.hold;
  let arpOn = state.keys.arp;
  subscribe((s, changed) => {
    if (!changed.has('keys')) return;
    if (s.keys.arp !== arpOn) allOff(); // a note can't carry over between playing together and arpeggiated
    else if (hold && !s.keys.hold) releaseLatched();
    hold = s.keys.hold;
    arpOn = s.keys.arp;
  });
}

/**
 * A key `key` went down. A second press of a key already held plays its note again; the note then
 * ends when both have let go. Snap is decided on the first press, so a release always ends the
 * note that press started. With HOLD on, tapping the key of a latched note ends it instead.
 */
export function noteOn(key: number, velocity: number): void {
  if (key < 0 || key > 127) return;
  let p = pressed.get(key);
  if (!p) {
    const k = state.keys;
    const note = k.snap ? snap(key, k.key, k.scale) : key;
    if (note < 0 || note > 127) return;
    const unlatch = latched.has(note) && !held.has(note);
    pressed.set(key, (p = { note, count: 0, unlatched: unlatch }));
    if (unlatch) {
      latched.delete(note);
      end(note);
    }
  }
  p.count++;
  if (p.unlatched) return;
  start(p.note, velocity);
}

export function noteOff(key: number): void {
  const p = pressed.get(key);
  if (!p) return;
  if (--p.count === 0) pressed.delete(key);
  if (p.unlatched) return;
  const n = held.get(p.note);
  if (!n) return;
  if (n > 1) {
    held.set(p.note, n - 1);
    return;
  }
  held.delete(p.note);
  if (state.keys.hold) latched.add(p.note); // keeps sounding (or arpeggiating)
  else end(p.note);
}

/** PITCH strip: −1 … 1 bends down or up by up to BEND_RANGE semitones; 0 is no bend. */
export function bend(amount: number): void {
  instrument.bend(Math.max(-1, Math.min(1, amount)) * BEND_RANGE);
}

function start(note: number, velocity: number): void {
  latched.delete(note); // held by a key again; latched again when it comes up
  if (state.keys.arp) arp.add(note, velocity);
  else instrument.noteOn(note, velocity); // sound first
  held.set(note, (held.get(note) ?? 0) + 1);
  showKey(note, true);
  const name = noteName(note);
  hits.setLast(`KEYS · ${name} · VEL ${velocity} · ${presetOf(state.keys).name.toUpperCase()}`, `${name} · VEL ${velocity}`);
  hits.markPlayed();
}

function end(note: number): void {
  if (state.keys.arp) arp.remove(note);
  else instrument.noteOff(note);
  showKey(note, false);
}

/** HOLD went off: latched notes end (keys still down keep theirs). */
function releaseLatched(): void {
  for (const note of latched) if (!held.has(note)) end(note);
  latched.clear();
}

/** Ends everything: sounding, latched and arpeggiated notes. Keys still down then do nothing on release. */
function allOff(): void {
  arp.clear();
  instrument.cancelScheduled();
  instrument.allOff();
  for (const note of new Set([...held.keys(), ...latched])) showKey(note, false);
  held.clear();
  pressed.clear();
  latched.clear();
}
