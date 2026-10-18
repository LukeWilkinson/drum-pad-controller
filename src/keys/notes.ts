// A KEYS note, whatever its source: the on-screen keyboard and the computer keyboard
// (src/keys/input.ts) now; loops and MIDI input later in M5. Sound first, then the key and the LCD.
// Notes are MIDI numbers (C4 = 60). With scale snap on, a pressed key plays the nearest note of
// the scale (src/keys/scales.ts); that note is what sounds, lights and shows on the LCD.

import type { KeysEngine } from '../audio/keys';
import * as hits from '../pads/hits';
import { state } from '../state';
import { showKey } from '../ui/keys';
import { snap } from './scales';
import { noteName, presetOf } from './types';

let instrument: KeysEngine;
/** How many presses hold each sounding note. It sounds until the last one lets go. */
const held = new Map<number, number>();
/** Each pressed key (as pressed) → the note it plays and how many presses hold it. */
const pressed = new Map<number, { note: number; count: number }>();

export function initNotes(i: KeysEngine): void {
  instrument = i;
}

/**
 * A key `key` went down. A second press of a key already held plays its note again; the note then
 * ends when both have let go. Snap is decided on the first press, so a release always ends the
 * note that press started, even if snap or the scale changed meanwhile.
 */
export function noteOn(key: number, velocity: number): void {
  if (key < 0 || key > 127) return;
  let p = pressed.get(key);
  if (!p) {
    const k = state.keys;
    const note = k.snap ? snap(key, k.key, k.scale) : key;
    if (note < 0 || note > 127) return;
    pressed.set(key, (p = { note, count: 0 }));
  }
  p.count++;
  const note = p.note;
  instrument.noteOn(note, velocity); // sound first
  held.set(note, (held.get(note) ?? 0) + 1);
  showKey(note, true);
  const name = noteName(note);
  hits.setLast(`KEYS · ${name} · VEL ${velocity} · ${presetOf(state.keys).name.toUpperCase()}`, `${name} · VEL ${velocity}`);
  hits.markPlayed();
}

export function noteOff(key: number): void {
  const p = pressed.get(key);
  if (!p) return;
  if (--p.count === 0) pressed.delete(key);
  const n = held.get(p.note);
  if (!n) return;
  if (n > 1) {
    held.set(p.note, n - 1);
    return;
  }
  held.delete(p.note);
  instrument.noteOff(p.note);
  showKey(p.note, false);
}
