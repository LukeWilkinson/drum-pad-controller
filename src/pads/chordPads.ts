// The CH bank: with it on screen the 16 pads play chords of the KEYS key and scale on the current
// KEYS preset (src/keys/chords.ts chordPad(): triads I–vii and I' on the bottom two rows, the same as
// 7ths on the top two). Hits go through the KEYS note path (src/keys/notes.ts), so they are held,
// latched (HOLD), arpeggiated (ARP), recorded into the loop as KEYS notes and sent out as MIDI on the
// Keys channel like keyboard chords. Note Repeat doesn't apply. The KEYS voicing (CHORD options) is used.
// state.chordPads is changed only by kitControl.selectChordPads() / selectBank().

import { padNumber } from '../audio/kit';
import { chordPad, romanOf } from '../keys/chords';
import * as notes from '../keys/notes';
import { noteName, presetOf } from '../keys/types';
import { state } from '../state';
import { applyChordLabels, showHit, showRelease } from '../ui/pads';
import * as hits from './hits';

let padEls: HTMLElement[];

export function initChordPads(els: HTMLElement[]): void {
  padEls = els;
}

/** Labels the 16 pads with their chords (call while the CH bank is on screen, and when the KEYS key, scale, octave or voicing changes). */
export function showLabels(): void {
  applyChordLabels(
    padEls,
    padEls.map((_, screen) => {
      const c = chordOf(screen);
      return { name: c.name, roman: romanOf(c.degree, c.name, c.type), seventh: c.type === 'seventh' };
    }),
  );
}

/** The chord screen pad `screen` (0–15, 0 = top-left) plays now. */
export function chordOf(screen: number): ReturnType<typeof chordPad> {
  const k = state.keys;
  return chordPad(padNumber(screen), k.key, k.scale, k.octave, k.chordVoicing);
}

/** `fromMidi` chords are not sent back out as MIDI. */
export function hit(screen: number, velocity: number, fromMidi = false): void {
  const c = chordOf(screen);
  const started = notes.chordPadOn(screen, c.notes, velocity, !fromMidi); // sound first
  if (!fromMidi && state.theme.vibrate) navigator.vibrate?.(8);
  if (state.chordPads) showHit(padEls[screen], velocity);
  if (!started) return; // HOLD: this tap ended the latched chord
  const preset = presetOf(state.keys).name.toUpperCase();
  hits.setLast(`CHORD ${romanOf(c.degree, c.name, c.type)} · ${c.name} · ${c.notes.map(noteName).join(' ')} · ${preset}`, `${c.name} · VEL ${velocity}`);
  hits.markPlayed();
}

export function release(screen: number): void {
  notes.chordPadOff(screen);
  showRelease(padEls[screen]);
}
