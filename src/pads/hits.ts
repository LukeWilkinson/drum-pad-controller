// A pad hit, whatever its source: touch and keyboard (src/main.ts) or MIDI input (src/midi/in.ts).
// Audio first, then the recording, Note Repeat and visuals. Pads are indexes 0–63 (bank × 16 + screen index).
// While REC MIC is armed or recording, a touch / key hit may be taken by it instead (setClaim()).

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
/** REC MIC (src/ui/micRec.ts) can take a touch / key hit instead of it playing. True = taken. */
let claim: ((index: number) => boolean) | null = null;
const claimed = new Set<number>();

export function setClaim(fn: (index: number) => boolean): void {
  claim = fn;
}

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
  if (!fromMidi && claim?.(index)) {
    claimed.add(index);
    return;
  }
  engine.play(index, velocity, !fromMidi); // audio first
  if (!fromMidi && state.theme.vibrate) navigator.vibrate?.(8);
  if (!fromMidi) midiOut.hold(index);
  seq.recordHit(index, velocity);
  repeat.press(index, velocity, !fromMidi);
  if (onScreen(index)) showHit(padEls[index % PADS_PER_BANK], velocity);
  anyHit = true;
  const name = state.kit?.pads[index].name.toUpperCase() ?? '';
  if (engine.padMissing(index)) setLast(`${padTitle(index)} · SAMPLE MISSING`, `${name} · MISSING`);
  else setLast(`${padTitle(index)} · VEL ${velocity}`, `${name} · VEL ${velocity}`);
  update({ selectedPad: index });
}

export function release(index: number, fromMidi = false): void {
  if (!fromMidi && claimed.delete(index)) return; // never played, so nothing to end
  repeat.release(index);
  if (!fromMidi) midiOut.release(index);
  showRelease(padEls[index % PADS_PER_BANK]); // also after a bank switch mid-hold
}

/** FULL LEVEL: touch hits play at velocity 127. MIDI velocity is always used as sent. */
export function toggleFullLevel(): void {
  update({ fullLevel: !state.fullLevel });
}

/** A finger moved on a held pad: later Note Repeat hits use the new velocity. */
export function move(index: number, velocity: number): void {
  if (!state.noteRepeat) return;
  repeat.move(index, velocity);
  if (onScreen(index)) showHit(padEls[index % PADS_PER_BANK], velocity); // the fill follows the finger
}

/** Pad `index` is one of the 16 on screen (its bank shows, and the CH bank doesn't). */
function onScreen(index: number): boolean {
  return !state.chordPads && Math.floor(index / PADS_PER_BANK) === state.bank;
}
