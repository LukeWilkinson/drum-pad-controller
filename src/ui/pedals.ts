// The KEYS pedalboard: eight stomp cards in chain order, each with an LED, two knobs and a footswitch,
// plus RESET for the current instrument. It opens inside the KEYS panel in place of the preset, octave,
// sends and strip rows, so the keyboard stays playable while the knobs turn (src/ui/keys.ts opens it).
// Every footswitch and knob is a MIDI Learn target (src/midi/targets.ts).

import * as pedalboard from '../keys/pedalboard';
import { PEDALS, type PedalId } from '../keys/pedals';
import { presetOf } from '../keys/types';
import { state, subscribe } from '../state';
import { bindKnob, knobSvg, setKnobArc } from './knob';

/** Card colours, like real stomp boxes. Tokens only. */
const COLOUR: Record<PedalId, string> = {
  comp: 'var(--cym)',
  drive: 'var(--tom)',
  amp: 'var(--amber)',
  wah: 'var(--snare)',
  chorus: 'var(--perc)',
  phaser: 'var(--kick)',
  tremolo: 'var(--hat)',
  crush: 'var(--fx)',
};

/** Builds the board, hidden. While shown it redraws on every pedals or keys change. */
export function buildPedalboard(): { root: HTMLElement; show(open: boolean): void } {
  const root = document.createElement('div');
  root.className = 'ky-pb';
  root.hidden = true;
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Pedalboard');
  root.innerHTML = `
    <div class="pb-head">
      <span class="ky-label pb-title"></span>
      <button class="ky-toggle pb-reset">RESET</button>
    </div>
    <div class="pb-cards">
      ${PEDALS.map(
        (p) => `<section class="pb-card off" data-pedal="${p.id}" style="--pc:${COLOUR[p.id]}" aria-label="${p.name}">
        <div class="pb-top"><span class="pb-name">${p.name}</span><span class="pb-led"></span></div>
        <div class="pb-knobs">
          ${p.knobs
            .map(
              (k, i) => `<div class="knob pb-knob" data-i="${i}" data-learn="pedalk:${p.id}:${i}" role="slider" tabindex="0" aria-label="${p.name} ${k.label}" aria-valuemin="0" aria-valuemax="1">
            ${knobSvg(40)}<span class="pb-k-label">${k.label}</span><span class="pb-k-val"></span>
          </div>`,
            )
            .join('')}
        </div>
        <button class="pb-switch" data-learn="pedal:${p.id}" aria-pressed="false"><span class="pb-switch-text">OFF</span></button>
      </section>`,
      ).join('')}
    </div>`;

  const title = root.querySelector<HTMLElement>('.pb-title')!;
  root.querySelector('.pb-reset')!.addEventListener('click', pedalboard.resetPedals);

  const cards = PEDALS.map((p) => {
    const el = root.querySelector<HTMLElement>(`.pb-card[data-pedal="${p.id}"]`)!;
    const sw = el.querySelector<HTMLButtonElement>('.pb-switch')!;
    sw.addEventListener('click', () => pedalboard.togglePedal(p.id));
    const knobs = [...el.querySelectorAll<HTMLElement>('.pb-knob')].map((k, i) => {
      const def = p.knobs[i];
      const n = i as 0 | 1;
      bindKnob(k, {
        get: () => def.scale.to(pedalboard.boardOf()[p.id].k[n]),
        set: (v) => pedalboard.setPedalKnob(p.id, n, def.scale.from(v)),
        step: def.scale.step,
        reset: () => pedalboard.setPedalKnob(p.id, n, def.default),
      });
      return k;
    });
    return { p, el, sw, text: sw.querySelector<HTMLElement>('.pb-switch-text')!, knobs };
  });

  function render(): void {
    if (root.hidden) return;
    const board = pedalboard.boardOf();
    title.textContent = `PEDALS · ${presetOf(state.keys).name.toUpperCase()}`;
    for (const c of cards) {
      const s = board[c.p.id];
      c.el.classList.toggle('off', !s.on);
      c.sw.setAttribute('aria-pressed', String(s.on));
      c.sw.setAttribute('aria-label', `${c.p.name} ${s.on ? 'on' : 'off'}`);
      c.text.textContent = s.on ? 'ON' : 'OFF';
      c.knobs.forEach((el, i) => {
        const def = c.p.knobs[i];
        const v = s.k[i];
        const text = def.text(v);
        setKnobArc(el, def.scale.to(v));
        el.querySelector('.pb-k-val')!.textContent = text;
        el.setAttribute('aria-valuenow', def.scale.to(v).toFixed(3));
        el.setAttribute('aria-valuetext', text);
      });
    }
  }

  subscribe((_, changed) => (changed.has('pedals') || changed.has('keys')) && render());
  return {
    root,
    /** Shows or hides the board (it skips drawing while hidden, so showing draws it). */
    show(open: boolean) {
      root.hidden = !open;
      render();
    },
  };
}
