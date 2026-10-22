// 270° arc knobs, shared by the tablet right rail, the MIX / FX cards and the KEYS send knobs.
// Drag up or down to turn (the full range is about 200px), arrow keys step (Shift = 10 steps),
// double-tap resets. A knob's value is always 0–1 here; callers map it to their own range.

export const KNOB_ARC = 84.8; // 270° of a r=18 circle
const DRAG_RANGE_PX = 200;

/** The knob drawing: a track, an amber arc (`.knob-arc`) and a cap. Colours come from CSS (.k-*). */
export function knobSvg(size: number): string {
  return `<svg class="knob-svg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <circle class="k-track" cx="24" cy="24" r="18" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${KNOB_ARC} 200" transform="rotate(135 24 24)"/>
    <circle class="knob-arc k-arc" cx="24" cy="24" r="18" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 200" transform="rotate(135 24 24)"/>
    <circle class="k-cap" cx="24" cy="24" r="12"/>
  </svg>`;
}

/** Fills the knob's arc to `value` (0–1). */
export function setKnobArc(el: Element, value: number): void {
  const v = Math.min(1, Math.max(0, value));
  el.querySelector('.knob-arc')!.setAttribute('stroke-dasharray', `${(KNOB_ARC * v).toFixed(1)} 200`);
}

export interface KnobOptions {
  /** The value now, 0–1. */
  get(): number;
  /** Turns to `value` (0–1, already clamped). The caller rounds it to its own steps. */
  set(value: number): void;
  /** One arrow-key step, as a fraction of the range (1 / (n − 1) for a list). */
  step: number;
  /** Double-tap: back to the default. */
  reset(): void;
  /** The finger let go (or reset happened); `moved` says whether the value changed. */
  onEnd?(moved: boolean): void;
}

/** Makes `el` a knob: drag, arrow keys and double-tap. The caller draws it (see setKnobArc). */
export function bindKnob(el: HTMLElement, opts: KnobOptions): void {
  let drag: { id: number; y: number; start: number } | null = null;
  const set = (v: number) => opts.set(Math.min(1, Math.max(0, v)));

  el.addEventListener('pointerdown', (e) => {
    drag = { id: e.pointerId, y: e.clientY, start: opts.get() };
    try {
      el.setPointerCapture(e.pointerId); // keep the drag when the finger leaves the knob
    } catch {
      /* pointer already gone */
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (drag?.id !== e.pointerId) return;
    set(drag.start + (drag.y - e.clientY) / DRAG_RANGE_PX);
  });
  const end = (e: PointerEvent) => {
    if (drag?.id !== e.pointerId) return;
    const moved = opts.get() !== drag.start;
    drag = null;
    opts.onEnd?.(moved);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => {
    opts.reset();
    opts.onEnd?.(true);
  });
  el.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation(); // keep arrow keys off the pad keyboard shortcuts
    set(opts.get() + dir * opts.step * (e.shiftKey ? 10 : 1));
  });
}
