// KEYS input: Pointer Events on the on-screen keyboard and the computer keyboard.
// Each pointer is tracked separately, so chords work. Sliding a finger across the keys plays each
// key it reaches (the one it leaves stops). Pressing lower on a key plays it harder.
// The computer keyboard plays a piano layout only while the KEYS tab shows:
//   A S D F G H J K L ; = white keys from C, W E T Y U O P = black keys, Z / X = octave down / up.

import { KEYBOARD_VELOCITY } from '../pads/input';
import { state } from '../state';
import { cOf } from './types';

export interface KeysInputHandlers {
  /** Called synchronously inside the input event: play audio first, draw second. */
  onDown(note: number, velocity: number): void;
  onUp(note: number): void;
  onOctave(delta: number): void;
}

/** Computer key → semitones above the keyboard's left-most C. */
const PIANO: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};

/** v = 40 + 87 * (y / height), clamped to 1–127: the front (bottom) of a key is the hardest. */
function velocityAt(clientY: number, rect: DOMRect): number {
  const y = (clientY - rect.top) / rect.height;
  return Math.max(1, Math.min(127, Math.round(40 + 87 * y)));
}

export function attachKeysInput(board: HTMLElement, handlers: KeysInputHandlers): void {
  /** pointerId → the note it holds, or null while it is off the keys. */
  const pointerNote = new Map<number, number | null>();

  const keyAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.kb-key');
    return el && board.contains(el) ? el : null;
  };
  const noteOf = (el: HTMLElement) => cOf(state.keys.octave) + Number(el.dataset.off);

  const release = (id: number) => {
    const note = pointerNote.get(id);
    if (note !== null && note !== undefined) handlers.onUp(note);
    pointerNote.set(id, null);
  };
  const pressAt = (id: number, e: PointerEvent) => {
    const el = keyAt(e.clientX, e.clientY);
    if (!el) return;
    const note = noteOf(el);
    pointerNote.set(id, note);
    handlers.onDown(note, velocityAt(e.clientY, el.getBoundingClientRect()));
  };

  board.addEventListener('pointerdown', (e) => {
    if (!keyAt(e.clientX, e.clientY)) return;
    e.preventDefault();
    if (pointerNote.has(e.pointerId)) release(e.pointerId); // a missed up event
    try {
      board.setPointerCapture(e.pointerId); // moves and the up event come here even off the keyboard
    } catch {
      /* not an active pointer (a scripted test event) */
    }
    pressAt(e.pointerId, e);
  });
  board.addEventListener('pointermove', (e) => {
    if (!pointerNote.has(e.pointerId)) return;
    const el = keyAt(e.clientX, e.clientY);
    const note = el ? noteOf(el) : null;
    if (note === pointerNote.get(e.pointerId)) return;
    release(e.pointerId);
    if (el) pressAt(e.pointerId, e);
  });
  const end = (e: PointerEvent) => {
    if (!pointerNote.has(e.pointerId)) return;
    release(e.pointerId);
    pointerNote.delete(e.pointerId);
  };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);
  board.addEventListener('lostpointercapture', end);
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  /** Computer key → the note it started (the octave may change while it is down). */
  const keysDown = new Map<string, number>();
  window.addEventListener('keydown', (e) => {
    if (state.view !== 'keys') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return; // Shift+R is record
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'x') {
      e.preventDefault();
      if (!e.repeat) handlers.onOctave(key === 'z' ? -1 : 1);
      return;
    }
    const off = PIANO[key];
    if (off === undefined) return;
    e.preventDefault();
    if (e.repeat || keysDown.has(key)) return;
    const note = cOf(state.keys.octave) + off;
    keysDown.set(key, note);
    handlers.onDown(note, KEYBOARD_VELOCITY);
  });
  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const note = keysDown.get(key);
    if (note === undefined) return;
    keysDown.delete(key);
    handlers.onUp(note);
  });
  // Losing focus (alt-tab) would leave keys stuck down.
  window.addEventListener('blur', () => {
    for (const note of keysDown.values()) handlers.onUp(note);
    keysDown.clear();
  });
}
