// MIDI input → KEYS, pads and learned controls. A learned mapping (MIDI Learn, src/midi/learn.ts,
// any channel) wins. Otherwise, on the Keys channel, notes play KEYS (src/keys/notes.ts), pitch
// bend bends it and CC 64 (sustain) is HOLD. On every other channel notes 36–99 play pads A1–D16
// (src/midi/notes.ts; with the CH bank on screen, notes 36–51 play its chord pads) and other CCs are ignored. A pad hit from MIDI plays like a touch (sound, recording, Note Repeat, LCD) but is
// not sent back out as MIDI, so a port used both ways can't feed back. Note-off (or note-on with
// velocity 0) releases it. While learn mode has a control armed, the next note-on or CC is learned
// instead of played. The MIDI chip blinks on any incoming message.

import * as keys from '../keys/keys';
import * as notes from '../keys/notes';
import { PADS_PER_BANK } from '../audio/kit';
import * as chordPads from '../pads/chordPads';
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
const PITCH_BEND = 0xe0;
const SUSTAIN = 64;
/** A CC counts as pressed at this value and above. */
const CC_ON = 64;
/** Keys in `held` for pads held by a CC (notes use 0–127). */
const CC_KEY = 128;
const BLINK_MS = 120;

/** KEYS notes held by incoming notes on the Keys channel, by note. */
const heldKeys = new Set<number>();
/** Pads held by incoming notes (by note) or CCs (by CC_KEY + number). */
const held = new Map<number, number>();
/** Last value of each CC, to spot a button CC rising past CC_ON. */
const lastCc = new Map<number, number>();
let blinkTimer = 0;
let prevInput: string | null = null;
let prevKeysChannel = 0;

export function initIn(ui: ScreenRefs): void {
  prevInput = state.midi.input;
  prevKeysChannel = state.midi.keysChannel;
  onMidiMessage((data) => {
    blink(ui.midiChip);
    handle(data);
  });
  // A changed or lost input must not leave pads held.
  subscribe((s, changed) => {
    if (!changed.has('midi')) return;
    if (s.midi.input !== prevInput || s.midi.status !== 'ready' || s.midi.keysChannel !== prevKeysChannel) releaseAll();
    prevInput = s.midi.input;
    prevKeysChannel = s.midi.keysChannel;
  });
}

function handle(data: Uint8Array): void {
  const type = data[0] & 0xf0;
  const num = data[1];
  const value = data[2];
  const onKeys = (data[0] & 0x0f) === state.midi.keysChannel - 1;
  if (type === PITCH_BEND) {
    if (onKeys) notes.bend(((value << 7) | num) / 8192 - 1, false); // 14-bit, 8192 = centre
    return;
  }
  if (type === NOTE_ON && value > 0) {
    if (capture('note', num)) return;
    const mapped = mappedTarget('note', num);
    if (mapped?.press) return mapped.press();
    if (!mapped && onKeys) return pressKey(num, value);
    const pad = mapped ? mapped.pad : padOfNote(num);
    if (pad === undefined || pad === null) return;
    // With the CH bank on screen, the bank A notes (36–51) play its chord pads instead.
    if (!mapped && state.chordPads && pad < PADS_PER_BANK) return press(num, chordKey(pad), value);
    press(num, pad, value);
  } else if (type === NOTE_OFF || type === NOTE_ON) {
    if (onKeys && heldKeys.has(num)) releaseKey(num);
    else unpress(num);
  } else if (type === CC) {
    const prev = lastCc.get(num) ?? 0;
    lastCc.set(num, value);
    if (capture('cc', num)) return;
    const t = mappedTarget('cc', num);
    if (!t) {
      if (onKeys && num === SUSTAIN) keys.setHold(value >= CC_ON);
      return;
    }
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

/** `held` value for chord pad `screen` (negative, so it can't be a drum pad index). */
const chordKey = (screen: number) => -1 - screen;

/** `pad` is a drum pad index, or a chordKey(). */
function press(key: number, pad: number, vel: number): void {
  if (held.has(key)) releasePad(held.get(key)!); // a retrigger without a note-off
  held.set(key, pad);
  if (pad < 0) chordPads.hit(-1 - pad, vel, true);
  else hits.hit(pad, vel, true);
}

function unpress(key: number): void {
  const pad = held.get(key);
  if (pad === undefined) return;
  held.delete(key);
  releasePad(pad);
}

function releasePad(pad: number): void {
  if (pad < 0) chordPads.release(-1 - pad);
  else hits.release(pad, true);
}

function pressKey(note: number, vel: number): void {
  if (heldKeys.has(note)) notes.noteOff(note); // a retrigger without a note-off
  heldKeys.add(note);
  notes.noteOn(note, vel, false);
}

function releaseKey(note: number): void {
  heldKeys.delete(note);
  notes.noteOff(note);
}

function releaseAll(): void {
  for (const note of heldKeys) notes.noteOff(note);
  heldKeys.clear();
  for (const pad of held.values()) releasePad(pad);
  held.clear();
}

function blink(chip: HTMLElement): void {
  chip.classList.add('active');
  clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(() => chip.classList.remove('active'), BLINK_MS);
}
