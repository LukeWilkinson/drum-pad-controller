// KEYS pedalboards. This is the only code that changes state.pedals. Each preset has its own board
// (defaults in src/keys/pedals.ts); the board of the preset playing goes to the instrument's
// PedalChain whenever it or the preset changes. Only boards that differ from their defaults are kept,
// and saved as the `pedals` pref, 500 ms after the last change and at once when the page is hidden.

import type { KeysEngine } from '../audio/keys';
import type { PedalChain } from '../audio/pedals';
import { state, subscribe, update } from '../state';
import { getPref, setPref } from '../store/db';
import { PEDAL_IDS, clampKnob, cleanBoard, defaultBoard, pedalDef, presetKey, type Board, type Boards, type PedalId } from './pedals';
import { PRESETS, type KeysSource } from './types';

const PREF = 'pedals';
const SAVE_MS = 500;

let chain: PedalChain;
let saveTimer = 0;
/** What was last sent to the chain: the preset key and its saved board (undefined = defaults). */
let applied: { key: string; board: Board | undefined } | null = null;

const warn = (err: unknown) => console.warn('[store]', err);

/** The key of the preset playing now ("sampled:6"). */
export function currentKey(): string {
  const k = state.keys;
  return presetKey(k.source, k.preset[k.source]);
}

/** A preset's board: its saved one, or the defaults. */
export function boardOf(key = currentKey()): Board {
  return state.pedals[key] ?? defaultBoard(key);
}

export function initPedals(instrument: KeysEngine): Promise<void> {
  chain = instrument.pedals;
  apply(false);
  subscribe((_, changed) => (changed.has('keys') || changed.has('pedals')) && apply(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = 0;
    setPref(PREF, state.pedals).catch(warn);
  });
  return loadPedals();
}

/** Sends the current board to the chain if the preset or its board changed. */
function apply(smooth: boolean): void {
  const key = currentKey();
  const board = state.pedals[key];
  if (applied && applied.key === key && applied.board === board) return;
  applied = { key, board };
  chain.set(boardOf(key), smooth);
}

const same = (a: Board, b: Board) => PEDAL_IDS.every((id) => a[id].on === b[id].on && a[id].k[0] === b[id].k[0] && a[id].k[1] === b[id].k[1]);

function setBoard(board: Board, save = true): void {
  const key = currentKey();
  const pedals = { ...state.pedals };
  if (same(board, defaultBoard(key))) delete pedals[key];
  else pedals[key] = board;
  update({ pedals });
  if (!save) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    setPref(PREF, state.pedals).catch(warn);
  }, SAVE_MS);
}

/** Switches a pedal on the current preset's board. */
export function togglePedal(id: PedalId): void {
  const b = boardOf();
  setBoard({ ...b, [id]: { ...b[id], on: !b[id].on } });
}

/** Sets knob `i` (0 or 1) of a pedal, in the knob's units; out-of-range values are clamped. */
export function setPedalKnob(id: PedalId, i: 0 | 1, value: number): void {
  if (!Number.isFinite(value)) return;
  const b = boardOf();
  const k: [number, number] = [...b[id].k];
  k[i] = clampKnob(pedalDef(id).knobs[i], value);
  if (k[i] === b[id].k[i]) return;
  setBoard({ ...b, [id]: { ...b[id], k } });
}

/** The current preset's board back to its defaults. */
export function resetPedals(): void {
  setBoard(defaultBoard(currentKey()));
}

const SOURCES: KeysSource[] = ['synth', 'sampled'];

/** Restores the saved boards. Unknown presets are dropped; bad values keep the preset's defaults. */
async function loadPedals(): Promise<void> {
  const saved = await getPref<Record<string, unknown>>(PREF).catch(warn);
  if (!saved || typeof saved !== 'object') return;
  const pedals: Boards = {};
  for (const source of SOURCES) {
    PRESETS[source].forEach((_, i) => {
      const key = presetKey(source, i);
      if (!(key in saved)) return;
      const board = cleanBoard(saved[key], defaultBoard(key));
      if (!same(board, defaultBoard(key))) pedals[key] = board;
    });
  }
  update({ pedals });
}
