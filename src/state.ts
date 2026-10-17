// Tiny app store, so the pads, LCD, Kits panel and right rail stay in sync without a framework.
// update() merges a patch and tells subscribers what changed. In-place edits to the active kit
// (pad settings, swapped samples) are announced with the extra change names 'params' and 'pads'.

import type { ActiveKit, UserKit } from './audio/kit';

export type View = 'pads' | 'kits';

export interface AppState {
  /** The kit playing now (null until the first kit has loaded). */
  kit: ActiveKit | null;
  /** True when the active kit has unsaved changes. */
  edited: boolean;
  /** Screen index (0–15) of the pad being edited / last hit. */
  selectedPad: number;
  view: View;
  /** Saved kits, newest first. */
  userKits: UserKit[];
  /** Transport (changed only by src/audio/clock.ts). */
  playing: boolean;
  bpm: number;
  /** Metronome on/off. It only sounds while the transport plays. */
  click: boolean;
}

export type Change = keyof AppState | 'params' | 'pads';
type Listener = (s: Readonly<AppState>, changed: ReadonlySet<Change>) => void;

export const state: AppState = {
  kit: null,
  edited: false,
  selectedPad: 12, // Kick
  view: 'pads',
  userKits: [],
  playing: false,
  bpm: 120,
  click: true,
};

const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Merges `patch` into the state and notifies. `extra` names in-place changes ('params', 'pads'). */
export function update(patch: Partial<AppState>, ...extra: Change[]): void {
  Object.assign(state, patch);
  const changed = new Set<Change>([...(Object.keys(patch) as Change[]), ...extra]);
  for (const fn of listeners) fn(state, changed);
}
