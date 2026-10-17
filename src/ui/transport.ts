// Transport controls on the pad screen: Play/Stop, metronome, BPM −/+ (hold to repeat), tap tempo,
// the LCD bar counter, and the Space / M / T shortcuts. The clock (src/audio/clock.ts) does the work.

import * as clock from '../audio/clock';
import { state, subscribe } from '../state';
import type { ScreenRefs } from './screen';

const REPEAT_DELAY = 400; // ms before a held −/+ starts repeating
const REPEAT_EVERY = 70; // ms between repeats

export function initTransport(ui: ScreenRefs): void {
  ui.play.addEventListener('click', clock.togglePlay);
  ui.metro.addEventListener('click', clock.toggleClick);
  ui.bpmTap.addEventListener('pointerdown', clock.tapTempo);
  ui.bpmTap.addEventListener('click', (e) => { if (e.detail === 0) clock.tapTempo(); }); // keyboard
  holdToRepeat(ui.bpmDown, () => clock.nudgeBpm(-1));
  holdToRepeat(ui.bpmUp, () => clock.nudgeBpm(1));

  const shortcuts: Record<string, () => void> = { ' ': clock.togglePlay, m: clock.toggleClick, t: clock.tapTempo };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    const action = shortcuts[e.key.toLowerCase()];
    if (!action) return;
    e.preventDefault(); // Space would otherwise also press the focused button
    action();
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') e.preventDefault(); });

  const render = () => {
    ui.play.setAttribute('aria-pressed', String(state.playing));
    ui.play.setAttribute('aria-label', state.playing ? 'Stop' : 'Play');
    ui.metro.setAttribute('aria-pressed', String(state.click));
    ui.bpmNum.textContent = state.bpm.toFixed(1);
    ui.bpmTap.setAttribute('aria-label', `Tempo ${state.bpm} BPM. Tap repeatedly to set the tempo`);
  };
  render();
  subscribe((_s, changed) => {
    if (changed.has('playing') || changed.has('bpm') || changed.has('click')) render();
    if (changed.has('playing') && state.playing) requestAnimationFrame(tick);
    if (changed.has('playing') && !state.playing) showBar();
  });

  let shown = '';
  function showBar(): void {
    const p = clock.position();
    const text = `BAR ${String(p.bar).padStart(2, '0')}.${p.beat}`;
    if (text !== shown) ui.lcdBar.textContent = shown = text;
  }
  function tick(): void {
    showBar();
    if (state.playing) requestAnimationFrame(tick);
  }
}

/** Fires on press, then repeats while held. Keyboard activation (Enter/Space) fires once. */
function holdToRepeat(el: HTMLElement, fire: () => void): void {
  let timer = 0;
  const end = () => {
    clearTimeout(timer);
    clearInterval(timer);
  };
  el.addEventListener('pointerdown', () => {
    end();
    fire();
    timer = window.setTimeout(() => (timer = window.setInterval(fire, REPEAT_EVERY)), REPEAT_DELAY);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, end);
  el.addEventListener('click', (e) => { if (e.detail === 0) fire(); });
}
