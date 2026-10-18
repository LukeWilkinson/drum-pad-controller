// A pad hit, whatever its source: touch and keyboard (src/main.ts) or MIDI input (src/midi/in.ts).
// Audio first, then the recording, Note Repeat and visuals. Pads are indexes 0–63 (bank × 16 + screen index).

import type { AudioEngine } from '../audio/engine';
import { PADS_PER_BANK, padLabel } from '../audio/kit';
import * as midiOut from '../midi/out';
import * as repeat from '../seq/repeat';
import * as seq from '../seq/sequencer';
import { state, update } from '../state';
import { showHit, showRelease } from '../ui/pads';
import type { ScreenRefs } from '../ui/screen';

let engine: AudioEngine;
let ui: ScreenRefs;
let padEls: HTMLElement[];
let anyHit = false;

export function initHits(e: AudioEngine, refs: ScreenRefs, els: HTMLElement[]): void {
  engine = e;
  ui = refs;
  padEls = els;
}

/** True once any pad or key has been played (the LCD hint then stays out of the way). */
export function hasHit(): boolean {
  return anyHit;
}

/** A KEYS note was played (src/keys/notes.ts): the LCD now shows it, not the hint. */
export function markPlayed(): void {
  anyHit = true;
}

export function setLast(text: string, inline = text): void {
  ui.lastLine.textContent = text;
  ui.lastInline.textContent = inline;
}

export function padTitle(index: number): string {
  const name = state.kit?.pads[index].name ?? '';
  return `PAD ${padLabel(index)} · ${name.toUpperCase()}`;
}

/** `fromMidi` hits are not sent back out as MIDI. */
export function hit(index: number, velocity: number, fromMidi = false): void {
  engine.play(index, velocity, !fromMidi); // audio first
  if (!fromMidi) midiOut.hold(index);
  seq.recordHit(index, velocity);
  repeat.press(index, velocity, !fromMidi);
  if (Math.floor(index / PADS_PER_BANK) === state.bank) showHit(padEls[index % PADS_PER_BANK], velocity);
  anyHit = true;
  const name = state.kit?.pads[index].name.toUpperCase() ?? '';
  setLast(`${padTitle(index)} · VEL ${velocity}`, `${name} · VEL ${velocity}`);
  update({ selectedPad: index });
}

export function release(index: number, fromMidi = false): void {
  repeat.release(index);
  if (!fromMidi) midiOut.release(index);
  showRelease(padEls[index % PADS_PER_BANK]);
}

/** FULL LEVEL: touch hits play at velocity 127. MIDI velocity is always used as sent. */
export function toggleFullLevel(): void {
  update({ fullLevel: !state.fullLevel });
}

/** A finger moved on a held pad: later Note Repeat hits use the new velocity. */
export function move(index: number, velocity: number): void {
  if (!state.noteRepeat) return;
  repeat.move(index, velocity);
  if (Math.floor(index / PADS_PER_BANK) === state.bank) showHit(padEls[index % PADS_PER_BANK], velocity); // the fill follows the finger
}
