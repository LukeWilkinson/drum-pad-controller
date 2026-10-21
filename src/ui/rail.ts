// Tablet right rail: the selected pad's Volume / Pitch / Pan / Decay / Reverb send / Delay send knobs.
// Turning works as in knob.ts. They edit the same state as the Kits panel sliders, so both always agree.

import type { AudioEngine } from '../audio/engine';
import { DEFAULT_PARAMS, PARAM_RANGE, type ParamKey } from '../audio/kit';
import { setParam } from '../kitControl';
import { state, subscribe } from '../state';
import { formatParam } from './format';
import { bindKnob, setKnobArc } from './knob';

export function initRail(rail: HTMLElement, engine: AudioEngine): void {
  const knobs = [...rail.querySelectorAll<HTMLElement>('.knob[data-key]')];

  for (const el of knobs) {
    const key = el.dataset.key as ParamKey;
    const { min, max, step } = PARAM_RANGE[key];
    el.setAttribute('aria-valuemin', String(min));
    el.setAttribute('aria-valuemax', String(max));

    const current = () => state.kit?.params[state.selectedPad][key] ?? DEFAULT_PARAMS[key];
    bindKnob(el, {
      get: () => (current() - min) / (max - min),
      set: (v) => setParam(state.selectedPad, key, Math.round((min + v * (max - min)) / step) * step),
      step: step / (max - min),
      reset: () => setParam(state.selectedPad, key, DEFAULT_PARAMS[key]),
      onEnd: (moved) => {
        if (moved) engine.play(state.selectedPad, 100); // hear the change
      },
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
      setKnobArc(el, (p[key] - min) / (max - min));
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
