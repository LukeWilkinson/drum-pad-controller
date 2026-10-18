// Pad input: Pointer Events (multi-touch, mouse, pen) and the desktop keyboard.
// Each pointer is tracked separately so many pads can be held at once.
// While the KEYS tab shows, the letter keys play notes instead (src/keys/input.ts).

import { state } from '../state';

export interface PadInputHandlers {
  /** Screen index (0–15). Called synchronously inside the input event — play audio first, draw second. */
  onHit(index: number, velocity: number): void;
  onRelease(index: number): void;
  /** A finger or mouse moved while holding a pad: the velocity at its new position. */
  onMove(index: number, velocity: number): void;
}

/** Top row to bottom row, matching screen order (index 0 = top-left). */
const KEY_ROWS = ['1234', 'qwer', 'asdf', 'zxcv'];
const KEY_TO_INDEX = new Map<string, number>();
KEY_ROWS.forEach((row, r) => [...row].forEach((k, c) => KEY_TO_INDEX.set(k, r * 4 + c)));

export const KEYBOARD_VELOCITY = 100;

/** v = 40 + 87 * (1 - y/height), clamped to 1–127. Higher on the pad = harder. */
export function velocityFromPosition(clientY: number, rect: DOMRect): number {
  const y = (clientY - rect.top) / rect.height;
  return Math.max(1, Math.min(127, Math.round(40 + 87 * (1 - y))));
}

export function attachPadInput(
  pads: HTMLElement[],
  handlers: PadInputHandlers,
  isFullLevel: () => boolean,
): void {
  const pointerPad = new Map<number, number>(); // pointerId → pad index
  const heldCount = new Array<number>(pads.length).fill(0); // pointers + keys holding each pad

  const press = (index: number, velocity: number) => {
    heldCount[index]++;
    handlers.onHit(index, isFullLevel() ? 127 : velocity);
  };
  const release = (index: number) => {
    if (heldCount[index] === 0) return;
    if (--heldCount[index] === 0) handlers.onRelease(index);
  };

  pads.forEach((el, index) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // A pointer that is somehow still mapped (missed up event) is released first.
      const prev = pointerPad.get(e.pointerId);
      if (prev !== undefined) release(prev);
      pointerPad.set(e.pointerId, index);
      press(index, velocityFromPosition(e.clientY, el.getBoundingClientRect()));
    });
    el.addEventListener('pointermove', (e) => {
      if (pointerPad.get(e.pointerId) !== index) return;
      handlers.onMove(index, isFullLevel() ? 127 : velocityFromPosition(e.clientY, el.getBoundingClientRect()));
    });
    const end = (e: PointerEvent) => {
      if (pointerPad.get(e.pointerId) !== index) return;
      pointerPad.delete(e.pointerId);
      release(index);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  const keysDown = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (state.view === 'keys') return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return; // Shift+R is record
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    const index = KEY_TO_INDEX.get(key);
    if (index === undefined) return;
    e.preventDefault();
    if (e.repeat || keysDown.has(key)) return;
    keysDown.add(key);
    press(index, KEYBOARD_VELOCITY);
  });
  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (!keysDown.delete(key)) return;
    const index = KEY_TO_INDEX.get(key);
    if (index !== undefined) release(index);
  });
  // Losing focus (alt-tab) would leave keys stuck down.
  window.addEventListener('blur', () => {
    for (const key of keysDown) {
      const index = KEY_TO_INDEX.get(key);
      if (index !== undefined) release(index);
    }
    keysDown.clear();
  });
}
