// Loop slots 1–4 on the pad screen. Tap: select (stopped) or queue for the next bar line (playing).
// Long-press a loop that has hits: clear it (asks first; undoable). The playing slot shows a
// progress bar, set each frame by showLoopProgress() from the transport's animation loop.

import * as seq from '../seq/sequencer';
import { hasHits } from '../seq/pattern';
import { state, subscribe } from '../state';
import { openDialog } from './dialog';

const LONG_PRESS = 600; // ms

let slots: HTMLButtonElement[] = [];

export function initLoops(els: HTMLButtonElement[]): void {
  slots = els;
  slots.forEach((el, i) => {
    let timer = 0;
    let longFired = false;
    el.addEventListener('pointerdown', () => {
      longFired = false;
      clearTimeout(timer);
      if (!hasHits(state.patterns[i])) return;
      timer = window.setTimeout(() => {
        longFired = true;
        confirmClear(i);
      }, LONG_PRESS);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, () => clearTimeout(timer));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', () => {
      if (longFired) longFired = false;
      else seq.selectPattern(i);
    });
  });

  render();
  subscribe((_s, changed) => {
    if (changed.has('patterns') || changed.has('pattern') || changed.has('queued') || changed.has('recMode') || changed.has('playing')) render();
  });
}

function render(): void {
  slots.forEach((el, i) => {
    const p = state.patterns[i];
    const full = hasHits(p);
    const isCurrent = i === state.pattern;
    const bars = `${p.bars} BAR${p.bars > 1 ? 'S' : ''}`;
    el.querySelector('.loop-text')!.textContent = full ? `${i + 1} · ${bars}` : '+ EMPTY';
    el.classList.toggle('full', full);
    el.classList.toggle('current', isCurrent);
    el.classList.toggle('queued', i === state.queued);
    el.classList.toggle('recording', isCurrent && state.recMode !== 'off');
    if (!isCurrent || !state.playing) el.style.setProperty('--p', '0');
    el.setAttribute('aria-pressed', String(isCurrent));
    const what = full ? bars : 'empty';
    const extra = i === state.queued ? ', starts at the next bar' : isCurrent ? ', current' : '';
    el.setAttribute('aria-label', `Loop ${i + 1}, ${what}${extra}${full ? '. Hold to clear' : ''}`);
  });
}

/** 0–1 progress of the playing loop. */
export function showLoopProgress(progress: number): void {
  slots[state.pattern]?.style.setProperty('--p', progress.toFixed(3));
}

async function confirmClear(i: number): Promise<void> {
  const res = await openDialog(`
    <h2>CLEAR LOOP ${i + 1}</h2>
    <p>Remove every hit from loop ${i + 1}? UNDO brings it back.</p>
    <div class="dlg-btns">
      <button value="cancel" class="kp-btn">CANCEL</button>
      <button value="ok" class="kp-btn danger">CLEAR</button>
    </div>`);
  if (res.value === 'ok') seq.clearPattern(i);
}
