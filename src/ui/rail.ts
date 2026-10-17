// Tablet right rail: the selected pad's Volume / Pitch / Pan / Decay knobs.
// Drag up or down to turn (the full range is about 200px), arrow keys step, double-tap resets.
// They edit the same state as the Kits panel sliders, so both always agree.

import type { AudioEngine } from '../audio/engine';
import { DEFAULT_PARAMS, PARAM_RANGE, type ParamKey } from '../audio/kit';
import { setParam } from '../kitControl';
import { state, subscribe } from '../state';
import { formatParam } from './format';
import { KNOB_ARC } from './screen';

const DRAG_RANGE_PX = 200;

export function initRail(rail: HTMLElement, engine: AudioEngine): void {
  const knobs = [...rail.querySelectorAll<HTMLElement>('.knob[data-key]')];

  for (const el of knobs) {
    const key = el.dataset.key as ParamKey;
    const { min, max, step } = PARAM_RANGE[key];
    el.setAttribute('aria-valuemin', String(min));
    el.setAttribute('aria-valuemax', String(max));

    let drag: { id: number; y: number; start: number } | null = null;
    const current = () => state.kit?.params[state.selectedPad][key] ?? DEFAULT_PARAMS[key];
    const set = (v: number) => setParam(state.selectedPad, key, Math.round(v / step) * step);

    el.addEventListener('pointerdown', (e) => {
      drag = { id: e.pointerId, y: e.clientY, start: current() };
      try {
        el.setPointerCapture(e.pointerId); // keep the drag when the finger leaves the knob
      } catch {
        /* pointer already gone */
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      set(drag.start + ((drag.y - e.clientY) / DRAG_RANGE_PX) * (max - min));
    });
    const end = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      const moved = current() !== drag.start;
      drag = null;
      if (moved) engine.play(state.selectedPad, 100); // hear the change
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => {
      setParam(state.selectedPad, key, DEFAULT_PARAMS[key]);
      engine.play(state.selectedPad, 100);
    });
    el.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation(); // keep arrow keys off the pad keyboard shortcuts
      set(current() + dir * step * (e.shiftKey ? 10 : 1));
    });
  }

  function render(): void {
    const kit = state.kit;
    if (!kit) return;
    const p = kit.params[state.selectedPad];
    const seconds = engine.sampleDuration(kit.pads[state.selectedPad].hard);
    for (const el of knobs) {
      const key = el.dataset.key as ParamKey;
      const { min, max } = PARAM_RANGE[key];
      const text = formatParam(key, p, seconds);
      el.querySelector('.knob-arc')!.setAttribute('stroke-dasharray', `${(KNOB_ARC * (p[key] - min) / (max - min)).toFixed(1)} 200`);
      el.querySelector('.knob-val')!.textContent = text;
      el.setAttribute('aria-valuenow', String(p[key]));
      el.setAttribute('aria-valuetext', text);
    }
  }

  subscribe((_s, changed) => {
    if (changed.has('kit') || changed.has('params') || changed.has('pads') || changed.has('selectedPad')) render();
  });
  render();
}
