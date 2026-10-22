// MIDI Learn mode. This is the only code that changes `state.learn`.
// While it is on, tapping a control with `data-learn` arms it instead of using it: a capture-phase
// listener on the window stops the tap before the control sees it. The next note-on or CC from the
// input (src/midi/in.ts calls capture()) is saved as a mapping. Learn mode stays on for the next
// control until DONE, the SETUP button, or MIDI going off.
// The tabs, the learn bar, the SETUP panel and the tablet header still work, so Luke can move
// between screens; every other tap is swallowed while learning.

import { state, subscribe, update } from '../state';
import type { ScreenRefs } from '../ui/screen';
import { addMapping } from './midi';
import { idOf, messageLabel, targetLabel } from './targets';
import type { LearnState, Mapping } from './types';

/** Taps here pass through while learning. */
const PASS = '.tabs, .learn-bar, .rec-bar, .setup-panel, .status, dialog';
/** Events a control could act on (range inputs move on mousedown/touchstart). pointerdown arms; the rest are only stopped. */
const STOPPED = ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'click', 'dblclick'] as const;

let app: HTMLElement;

function set(p: Partial<LearnState>): void {
  update({ learn: { ...state.learn, ...p } });
}

export function startLearn(): void {
  if (state.midi.status !== 'ready' || state.learn.on) return;
  set({ on: true, armed: null, last: null });
}

export function stopLearn(): void {
  if (state.learn.on) set({ on: false, armed: null, last: null });
}

export function toggleLearn(): void {
  if (state.learn.on) stopLearn();
  else startLearn();
}

/** Called by src/midi/in.ts for each note-on and CC. True if it was learned (so it doesn't also play). */
export function capture(kind: Mapping['kind'], num: number): boolean {
  const target = state.learn.armed;
  if (!state.learn.on || !target) return false;
  addMapping({ kind, num, target });
  set({ armed: null, last: `${messageLabel({ kind, num })} → ${targetLabel(target, kind)}` });
  return true;
}

export function initLearn(ui: ScreenRefs): void {
  app = ui.app;
  const text = ui.learnBar.querySelector<HTMLElement>('.learn-text')!;
  ui.learnBar.querySelector('.learn-done')!.addEventListener('click', stopLearn);

  const onEvent = (e: Event) => {
    if (!state.learn.on || !(e.target instanceof Element) || e.target.closest(PASS)) return;
    const el = e.target.closest<HTMLElement>('[data-learn]');
    // touchstart/mousedown are only stopped on controls (sliders), so panels still scroll.
    if (!el && (e.type === 'touchstart' || e.type === 'mousedown')) return;
    e.preventDefault();
    e.stopPropagation();
    const id = el && idOf(el);
    if (e.type === 'pointerdown' && id) set({ armed: id });
  };
  for (const type of STOPPED) window.addEventListener(type, onEvent, { capture: true, passive: false });

  const render = () => {
    const l = state.learn;
    app.toggleAttribute('data-learn-on', l.on);
    ui.learnBar.hidden = !l.on;
    text.textContent = l.armed
      ? `${targetLabel(l.armed)} · MOVE A CONTROL`
      : l.last
        ? `${l.last} · TAP THE NEXT CONTROL`
        : 'LEARN · TAP A PAD, KNOB OR BUTTON';
    for (const el of app.querySelectorAll<HTMLElement>('[data-learn]')) {
      el.classList.toggle('learn-armed', l.armed !== null && idOf(el) === l.armed);
    }
  };
  render();
  subscribe((s, changed) => {
    if (changed.has('midi') && s.midi.status !== 'ready') stopLearn();
    if (changed.has('learn') || changed.has('bank')) render();
  });
}
