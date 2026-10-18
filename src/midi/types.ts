// MIDI types. This file imports nothing, so state.ts and the MIDI modules can all use it.

/**
 * off = MIDI not enabled · unsupported = browser has no Web MIDI · requesting = waiting for the
 * permission prompt · denied = permission refused · ready = access granted.
 */
export type MidiStatus = 'off' | 'unsupported' | 'requesting' | 'denied' | 'ready';

export interface MidiState {
  status: MidiStatus;
  /** Names of the connected output and input devices. */
  outputs: string[];
  inputs: string[];
  /** The chosen device names (null = None). The device may be unplugged: it is then not in the lists. */
  output: string | null;
  input: string | null;
  /** Pad output channel, 1–16. Pad notes come in on every channel except the Keys channel. */
  channel: number;
  /** KEYS channel, 1–16: keys notes and pitch bend go out on it, and notes, pitch bend and CC 64 on it play KEYS. */
  keysChannel: number;
  /** False mutes the app's own sound, so a DAW can play the sounds from the MIDI notes. */
  localSound: boolean;
  /** Send MIDI clock (step 5). */
  clock: boolean;
  /** Learned controls (MIDI Learn), oldest first. A message appears at most once. */
  mappings: Mapping[];
}

/** One learned control: a note or CC number (any channel) → a target id from src/midi/targets.ts. */
export interface Mapping {
  kind: 'note' | 'cc';
  num: number;
  target: string;
}

/** MIDI Learn mode (changed only by src/midi/learn.ts). */
export interface LearnState {
  on: boolean;
  /** Target id waiting for a hardware control, or null. */
  armed: string | null;
  /** The last mapping made, as shown on the learn bar ("CC 21 → SWING"), or null. */
  last: string | null;
}

export const DEFAULT_CHANNEL = 10; // General MIDI drums
export const DEFAULT_KEYS_CHANNEL = 1;

/** The part of MIDIAccess the app uses. The dev-only fake (fake.ts) implements the same shape. */
export interface PortLike {
  id: string;
  name: string | null;
  state: 'connected' | 'disconnected';
}
export interface OutLike extends PortLike {
  send(data: number[] | Uint8Array, timestamp?: number): void;
}
export interface InLike extends PortLike {
  onmidimessage: ((e: { data: Uint8Array | null }) => void) | null;
}
export interface AccessLike {
  outputs: { values(): Iterable<OutLike> };
  inputs: { values(): Iterable<InLike> };
  onstatechange: (() => void) | null;
}
