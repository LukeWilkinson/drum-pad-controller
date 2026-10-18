// MIDI input → pads and learned controls, on every channel. A learned mapping (MIDI Learn,
// src/midi/learn.ts) wins; otherwise notes 36–99 play pads A1–D16 (src/midi/notes.ts) and CCs
// are ignored. A pad hit from MIDI plays like a touch (sound, recording, Note Repeat, LCD) but is
// not sent back out as MIDI, so a port used both ways can't feed back. Note-off (or note-on with
// velocity 0) releases it. While learn mode has a control armed, the next note-on or CC is learned
// instead of played. The MIDI chip blinks on any incoming message.

import * as hits from '../pads/hits';
import { state, subscribe } from '../state';
import type { ScreenRefs } from '../ui/screen';
import { capture } from './learn';
import { mappingFor, onMidiMessage } from './midi';
import { padOfNote } from './notes';
import { findTarget, type Target } from './targets';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CC = 0xb0;
/** A CC counts as pressed at this value and above. */
const CC_ON = 64;
/** Keys in `held` for pads held by a CC (notes use 0–127). */
const CC_KEY = 128;
const BLINK_MS = 120;

/** Pads held by incoming notes (by note) or CCs (by CC_KEY + number). */
const held = new Map<number, number>();
/** Last value of each CC, to spot a button CC rising past CC_ON. */
const lastCc = new Map<number, number>();
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
  const num = data[1];
  const value = data[2];
  if (type === NOTE_ON && value > 0) {
    if (capture('note', num)) return;
    const mapped = mappedTarget('note', num);
    if (mapped?.press) return mapped.press();
    const pad = mapped ? mapped.pad : padOfNote(num);
    if (pad === undefined || pad === null) return;
    press(num, pad, value);
  } else if (type === NOTE_OFF || type === NOTE_ON) {
    unpress(num);
  } else if (type === CC) {
    const prev = lastCc.get(num) ?? 0;
    lastCc.set(num, value);
    if (capture('cc', num)) return;
    const t = mappedTarget('cc', num);
    if (!t) return;
    if (t.set) return t.set(value / 127);
    const rose = prev < CC_ON && value >= CC_ON;
    const fell = prev >= CC_ON && value < CC_ON;
    if (t.pad !== undefined) {
      if (rose) press(CC_KEY + num, t.pad, value);
      else if (fell) unpress(CC_KEY + num);
    } else if (rose) t.press?.();
  }
}

/** The learned target for a note or CC, or undefined (unmapped, or an unknown target id). */
function mappedTarget(kind: 'note' | 'cc', num: number): Target | undefined {
  const m = mappingFor(kind, num);
  return (m && findTarget(m.target)) ?? undefined;
}

function press(key: number, pad: number, vel: number): void {
  if (held.has(key)) hits.release(held.get(key)!, true); // a retrigger without a note-off
  held.set(key, pad);
  hits.hit(pad, vel, true);
}

function unpress(key: number): void {
  const pad = held.get(key);
  if (pad === undefined) return;
  held.delete(key);
  hits.release(pad, true);
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
