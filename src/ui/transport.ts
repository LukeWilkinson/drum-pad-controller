// Transport controls on the pad screen: Play/Stop, REC, DUB, Undo, metronome, BPM −/+ (hold to
// repeat), tap tempo, the LCD status line, and the keyboard shortcuts:
// Space play/stop · Shift+R record · O overdub · Ctrl+Z undo · M metronome · T tap tempo.
// (Plain R plays a pad, so record needs Shift.) The clock and sequencer do the work.

import * as clock from '../audio/clock';
import { BAR_TICKS, BEATS_PER_BAR, PPQ } from '../seq/pattern';
import * as seq from '../seq/sequencer';
import { state, subscribe, type Change } from '../state';
import { initLoops, showLoopProgress } from './loops';
import type { ScreenRefs } from './screen';

const REPEAT_DELAY = 400; // ms before a held −/+ starts repeating
const REPEAT_EVERY = 70; // ms between repeats
/** Store fields the transport controls and LCD status line show. */
const SHOWN: Change[] = ['playing', 'bpm', 'click', 'recMode', 'quant', 'swing'];

export function initTransport(ui: ScreenRefs): void {
  ui.play.addEventListener('click', clock.togglePlay);
  ui.rec.addEventListener('click', seq.toggleRec);
  ui.dub.addEventListener('click', seq.toggleDub);
  ui.undo.addEventListener('click', () => seq.undo());
  ui.metro.addEventListener('click', clock.toggleClick);
  ui.bpmTap.addEventListener('pointerdown', clock.tapTempo);
  ui.bpmTap.addEventListener('click', (e) => { if (e.detail === 0) clock.tapTempo(); }); // keyboard
  holdToRepeat(ui.bpmDown, () => clock.nudgeBpm(-1));
  holdToRepeat(ui.bpmUp, () => clock.nudgeBpm(1));
  initLoops(ui.loops);

  const plain: Record<string, () => void> = { ' ': clock.togglePlay, o: seq.toggleDub, m: clock.toggleClick, t: clock.tapTempo };
  const shifted: Record<string, () => void> = { r: seq.toggleRec };
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'z') {
      e.preventDefault();
      seq.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const action = (e.shiftKey ? shifted : plain)[key];
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
    ui.rec.setAttribute('aria-pressed', String(state.recMode === 'rec' || state.recMode === 'count'));
    ui.rec.classList.toggle('counting', state.recMode === 'count');
    ui.dub.setAttribute('aria-pressed', String(state.recMode === 'dub'));
    ui.lcdQ.textContent = `Q ${state.quant}`;
    ui.lcdSwing.textContent = `SWING ${state.swing}%`;
    ui.recState.textContent = seq.modeLabel();
    ui.recState.classList.toggle('live', state.recMode !== 'off');
  };
  render();
  subscribe((_s, changed) => {
    if (SHOWN.some((k) => changed.has(k))) render();
    if (changed.has('playing') && state.playing) requestAnimationFrame(tick);
    if (changed.has('playing') && !state.playing) showPosition();
  });

  let shown = '';
  function showPosition(): void {
    const head = seq.playhead();
    const t = head?.tick ?? 0;
    const text = `BAR ${String(Math.floor(t / BAR_TICKS) + 1).padStart(2, '0')}.${(Math.floor(t / PPQ) % BEATS_PER_BAR) + 1}`;
    if (text !== shown) ui.lcdBar.textContent = shown = text;
    showLoopProgress(head?.progress ?? 0);
  }
  function tick(): void {
    showPosition();
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
