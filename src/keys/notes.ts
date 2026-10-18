// A KEYS note, whatever its source: the on-screen keyboard and the computer keyboard
// (src/keys/input.ts) now; loops and MIDI input later in M5. Sound first, then the key and the LCD.
// Notes are MIDI numbers (C4 = 60).

import type { KeysEngine } from '../audio/keys';
import * as hits from '../pads/hits';
import { state } from '../state';
import { showKey } from '../ui/keys';
import { noteName, presetOf } from './types';

let instrument: KeysEngine;
/** How many presses (fingers, keys) hold each note. It sounds until the last one lets go. */
const held = new Map<number, number>();

export function initNotes(i: KeysEngine): void {
  instrument = i;
}

/** A second press of a note already held plays it again; it then ends when both have let go. */
export function noteOn(note: number, velocity: number): void {
  if (note < 0 || note > 127) return;
  instrument.noteOn(note, velocity); // sound first
  held.set(note, (held.get(note) ?? 0) + 1);
  showKey(note, true);
  const name = noteName(note);
  hits.setLast(`KEYS · ${name} · VEL ${velocity} · ${presetOf(state.keys).name.toUpperCase()}`, `${name} · VEL ${velocity}`);
  hits.markPlayed();
}

export function noteOff(note: number): void {
  const n = held.get(note);
  if (!n) return;
  if (n > 1) {
    held.set(note, n - 1);
    return;
  }
  held.delete(note);
  instrument.noteOff(note);
  showKey(note, false);
}
