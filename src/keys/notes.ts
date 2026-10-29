// A KEYS note, whatever its source: the on-screen keyboard and the computer keyboard
// (src/keys/input.ts) now; MIDI input later in M5. Sound first, then the key and the LCD.
// Notes are MIDI numbers (C4 = 60). With REC or DUB on, each note is recorded into the loop as it
// sounds (src/seq/sequencer.ts), from start() to end(); with ARP on, the arp records its steps instead.
// - Scale snap: a pressed key plays the nearest note of the scale (src/keys/scales.ts); that note is
//   what sounds, lights and shows on the LCD.
// - HOLD: a note keeps sounding after its key comes up ("latched") until its key is tapped again or
//   HOLD goes off.
// - ARP: notes go to the arpeggiator (src/keys/arp.ts) instead of sounding together.
// - CHORD: a pressed key plays a chord in the key and scale (src/keys/chords.ts). Each chord note is
//   counted, latched, arpeggiated and recorded like a note of its own, so chords that share a note
//   keep it sounding until the last key holding it lets go.

import type { KeysEngine } from '../audio/keys';
import * as hits from '../pads/hits';
import * as seq from '../seq/sequencer';
import { state, subscribe } from '../state';
import { showKey } from '../ui/keys';
import * as arp from './arp';
import { CHORD_TYPE_NAMES, chordName, chordNotes } from './chords';
import { snap } from './scales';
import { noteName, presetOf } from './types';

const BEND_RANGE = 2; // semitones at the ends of the PITCH strip

let instrument: KeysEngine;
/** How many presses hold each sounding note. */
const held = new Map<number, number>();
/** Each pressed key (as pressed) → the notes it plays (one, or a chord) and how many presses hold it. */
const pressed = new Map<number, { notes: number[]; count: number; unlatched: boolean }>();
/** Notes HOLD keeps sounding after their keys came up. */
const latched = new Set<number>();
/** Whether each sounding note goes out as MIDI (false for notes that came in as MIDI). */
const echoOf = new Map<number, boolean>();

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

/** The notes key `key` plays now: a chord with CHORD on (src/keys/chords.ts), else one note (snapped if SNAP is on). */
function notesFor(key: number): number[] {
  const k = state.keys;
  if (k.chord) return chordNotes(key, k.key, k.scale, k.chordType, k.chordVoicing);
  const note = k.snap ? snap(key, k.key, k.scale) : key;
  return note >= 0 && note <= 127 ? [note] : [];
}

/**
 * A key `key` went down. A second press of a key already held plays its notes again; they then end
 * when both have let go. Snap and the chord are decided on the first press, so a release always ends
 * the notes that press started. With HOLD on, tapping the key whose notes are all latched ends them
 * instead.
 */
export function noteOn(key: number, velocity: number, echo = true): void {
  if (key < 0 || key > 127) return;
  let p = pressed.get(key);
  if (!p) {
    const notes = notesFor(key);
    if (!notes.length) return;
    const unlatch = notes.every((n) => latched.has(n) && !held.has(n));
    pressed.set(key, (p = { notes, count: 0, unlatched: unlatch }));
    if (unlatch) {
      for (const n of notes) {
        latched.delete(n);
        end(n);
      }
    }
  }
  p.count++;
  if (p.unlatched) return;
  for (const n of p.notes) start(n, velocity, echo);
  showLast(key, p.notes, velocity);
}

export function noteOff(key: number): void {
  const p = pressed.get(key);
  if (!p) return;
  if (--p.count === 0) pressed.delete(key);
  if (p.unlatched) return;
  for (const note of p.notes) {
    const n = held.get(note);
    if (!n) continue;
    if (n > 1) {
      held.set(note, n - 1);
      continue;
    }
    held.delete(note);
    if (state.keys.hold) latched.add(note); // keeps sounding (or arpeggiating)
    else end(note);
  }
}

/** LCD: the note, or the chord's name and notes. */
function showLast(key: number, notes: number[], velocity: number): void {
  const k = state.keys;
  const what = k.chord ? chordName(key, k.key, k.scale, k.chordType) : noteName(notes[0]);
  const detail = k.chord ? notes.map(noteName).join(' ') : `VEL ${velocity}`;
  hits.setLast(`KEYS · ${what} · ${detail} · ${presetOf(k).name.toUpperCase()}`, `${what} · ${k.chord ? CHORD_TYPE_NAMES[k.chordType] : `VEL ${velocity}`}`);
  hits.markPlayed();
}

/** PITCH strip: −1 … 1 bends down or up by up to BEND_RANGE semitones; 0 is no bend. */
export function bend(amount: number, echo = true): void {
  instrument.bend(Math.max(-1, Math.min(1, amount)) * BEND_RANGE, echo);
}

function start(note: number, velocity: number, echo: boolean): void {
  latched.delete(note);
  echoOf.set(note, echo); // held by a key again; latched again when it comes up
  if (state.keys.arp) arp.add(note, velocity, echo); // the arp records its own steps
  else {
    instrument.noteOn(note, velocity, echo); // sound first
    seq.recordNoteOn(note, velocity);
  }
  held.set(note, (held.get(note) ?? 0) + 1);
  showKey(note, true);
}

function end(note: number): void {
  const echo = echoOf.get(note) ?? true;
  echoOf.delete(note);
  if (state.keys.arp) arp.remove(note);
  else {
    instrument.noteOff(note, echo);
    seq.recordNoteOff(note);
  }
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
  seq.endNotes();
  for (const note of new Set([...held.keys(), ...latched])) showKey(note, false);
  held.clear();
  pressed.clear();
  latched.clear();
  echoOf.clear();
}
