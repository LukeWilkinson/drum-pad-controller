// MIDI input → pads. Notes 36–99 play pads A1–D16 (src/midi/notes.ts), on every channel.
// A note-on plays the pad like a touch does (sound, recording, Note Repeat, LCD) but is not sent
// back out as MIDI, so a port used both ways can't feed back. Note-off (or note-on with velocity 0)
// releases it. The MIDI chip blinks on any incoming message.

import * as hits from '../pads/hits';
import { state, subscribe } from '../state';
import type { ScreenRefs } from '../ui/screen';
import { onMidiMessage } from './midi';
import { padOfNote } from './notes';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const BLINK_MS = 120;

/** Pads held by incoming notes, by note. */
const held = new Map<number, number>();
let blinkTimer = 0;
let prevInput: string | null = null;

export function initIn(ui: ScreenRefs): void {
  prevInput = state.midi.input;
  onMidiMessage((data) => {
    blink(ui.midiChip);
    handle(data);
  });
  // A changed or lost input must not leave pads held.
  subscribe((s, changed) => {
    if (!changed.has('midi')) return;
    if (s.midi.input !== prevInput || s.midi.status !== 'ready') releaseAll();
    prevInput = s.midi.input;
  });
}

function handle(data: Uint8Array): void {
  const type = data[0] & 0xf0;
  const note = data[1];
  const vel = data[2];
  if (type === NOTE_ON && vel > 0) {
    const pad = padOfNote(note);
    if (pad === null) return;
    if (held.has(note)) hits.release(held.get(note)!, true); // a retrigger without a note-off
    held.set(note, pad);
    hits.hit(pad, vel, true);
  } else if (type === NOTE_OFF || type === NOTE_ON) {
    const pad = held.get(note);
    if (pad === undefined) return;
    held.delete(note);
    hits.release(pad, true);
  }
}

function releaseAll(): void {
  for (const pad of held.values()) hits.release(pad, true);
  held.clear();
}

function blink(chip: HTMLElement): void {
  chip.classList.add('active');
  clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(() => chip.classList.remove('active'), BLINK_MS);
}
