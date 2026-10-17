// SEQ panel (Seq.dc.html): loop picker, loop length, REC / OVERDUB / COUNT-IN / CLICK, quantise,
// swing, step pages, bar picker, row pages and the 8 × 8 step grid.
// Built once; render functions only touch what a change affects. While playing, onFrame() moves the
// playhead column and keeps the shown page on the playhead, until a page or bar is picked by hand.

import type { AudioEngine } from '../audio/engine';
import * as clock from '../audio/clock';
import { BANK_NAMES, GROUP_COLOUR, PADS_PER_BANK } from '../audio/kit';
import { BAR_TICKS, LENGTHS, QUANTS, STEP_TICKS, SWING_MAX, SWING_MIN, hasHits, lengthTicks, type Bars, type Quant } from '../seq/pattern';
import * as seq from '../seq/sequencer';
import { state, subscribe, type Change } from '../state';
import { selectBank } from '../kitControl';
import { openDialog } from './dialog';
import { onFrame } from './transport';

/** Screen indexes of the pads on each row page: the design's 8 rows first, then the other 8 pads. */
const ROW_PAGES = [
  [12, 8, 10, 5, 4, 2, 7, 15], // Kick, Snare, Clap, Closed Hat, Open Hat, Tom Hi, Shaker, Vox FX (Studio Acoustic)
  [13, 14, 9, 11, 6, 3, 1, 0],
];
const STEPS_PER_PAGE = 8;
const STEPS_PER_BAR = BAR_TICKS / STEP_TICKS;
const SWING_DRAG_PX = 150; // drag distance for the whole swing range
const CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

const CONTROLS: Change[] = ['patterns', 'pattern', 'queued', 'recMode', 'countIn', 'click', 'quant', 'swing', 'playing', 'bank'];
const GRID: Change[] = ['patterns', 'pattern', 'kit', 'pads', 'bank'];

export function buildSeqPanel(app: HTMLElement, engine: AudioEngine): void {
  const panel = document.createElement('section');
  panel.className = 'seq-panel';
  panel.setAttribute('aria-label', 'Sequencer');
  panel.innerHTML = `
    <header class="sq-head">
      <h1>SEQUENCER</h1>
      <div class="sq-head-btns">
        <button class="sq-btn sq-rows"></button>
        <button class="sq-btn sq-loop"><span class="sq-loop-name"></span>${CHEVRON}</button>
      </div>
    </header>
    <div class="sq-len">
      <div class="sq-len-top"><span>LOOP LENGTH</span><span class="sq-pos"></span></div>
      <div class="sq-seg" role="group" aria-label="Loop length in bars">
        ${LENGTHS.map((n) => `<button data-bars="${n}" aria-pressed="false">${n} BAR${n > 1 ? 'S' : ''}</button>`).join('')}
      </div>
    </div>
    <div class="sq-toggles">
      <button class="sq-rec" aria-pressed="false"><span class="sq-dot" aria-hidden="true"></span>REC</button>
      <button class="sq-dub" aria-pressed="false">OVERDUB</button>
      <button class="sq-count" aria-pressed="false">COUNT-IN</button>
      <button class="sq-click" aria-pressed="false">CLICK</button>
    </div>
    <div class="sq-qrow">
      <span class="sq-label">QNT</span>
      <div class="sq-quant" role="group" aria-label="Quantise">
        ${QUANTS.map((q) => `<button data-q="${q}" aria-pressed="false">${q}</button>`).join('')}
      </div>
      <div class="sq-swing" role="slider" tabindex="0" aria-label="Swing" aria-valuemin="${SWING_MIN}" aria-valuemax="${SWING_MAX}">
        <span class="sq-swing-label">SWING</span><span class="sq-swing-val"></span>
      </div>
    </div>
    <div class="sq-pages" role="group" aria-label="Step page">
      <button data-page="0" aria-pressed="true">STEPS 1–8</button>
      <button data-page="1" aria-pressed="false">STEPS 9–16</button>
      <button class="sq-bar"></button>
    </div>
    <div class="sq-grid" role="grid" aria-label="Step grid">
      ${ROW_PAGES[0].map(() => `
        <div class="sq-row" role="row">
          <button class="sq-name"><span class="sq-strip" aria-hidden="true"></span><span class="sq-name-text"></span></button>
          ${Array.from({ length: STEPS_PER_PAGE }, (_, k) => `<button class="sq-cell" role="gridcell" data-k="${k}" aria-pressed="false"></button>`).join('')}
        </div>`).join('')}
    </div>`;
  app.appendChild(panel);

  const $ = <T extends Element>(sel: string) => panel.querySelector(sel) as T;
  const $$ = <T extends Element>(sel: string) => [...panel.querySelectorAll<T>(sel)];
  const rows = $$<HTMLElement>('.sq-row');
  const lenBtns = $$<HTMLButtonElement>('[data-bars]');
  const quantBtns = $$<HTMLButtonElement>('[data-q]');
  const pageBtns = $$<HTMLButtonElement>('[data-page]');
  const swingEl = $<HTMLElement>('.sq-swing');
  const barBtn = $<HTMLButtonElement>('.sq-bar');
  const posEl = $<HTMLElement>('.sq-pos');

  let rowPage = 0;
  let page = 0; // 0 = steps 1–8, 1 = steps 9–16
  let bar = 0; // bar of the loop shown, 0-based
  let follow = true; // shown page and bar track the playhead
  let playCol = -1; // cell index (0–7) outlined as the playhead, -1 for none

  const bars = () => state.patterns[state.pattern].bars;
  const padAt = (row: number) => state.bank * PADS_PER_BANK + ROW_PAGES[rowPage][row]; // rows show the bank on screen
  const tickAt = (k: number) => bar * BAR_TICKS + (page * STEPS_PER_PAGE + k) * STEP_TICKS;

  // ---------- controls ----------

  $('.sq-loop').addEventListener('click', pickLoop);
  // Steps through every row page of every bank: A 1–8, A 9–16, B 1–8 … D 9–16, then back to A.
  $('.sq-rows').addEventListener('click', () => {
    rowPage = 1 - rowPage;
    if (rowPage === 0) selectBank((state.bank + 1) % BANK_NAMES.length); // re-renders via the store
    renderControls();
    renderGrid();
  });
  for (const b of lenBtns) b.addEventListener('click', () => seq.setLength(Number(b.dataset.bars) as Bars));
  $('.sq-rec').addEventListener('click', seq.toggleRec);
  $('.sq-dub').addEventListener('click', seq.toggleDub);
  $('.sq-count').addEventListener('click', seq.toggleCountIn);
  $('.sq-click').addEventListener('click', clock.toggleClick);
  for (const b of quantBtns) b.addEventListener('click', () => seq.setQuant(b.dataset.q as Quant));
  for (const b of pageBtns) b.addEventListener('click', () => showPage(Number(b.dataset.page), bar));
  barBtn.addEventListener('click', () => showPage(page, (bar + 1) % bars()));

  function showPage(p: number, b: number): void {
    follow = false;
    page = p;
    bar = b;
    renderControls();
    renderGrid();
  }

  // Swing: drag up/down, arrow keys, double-tap resets to straight time.
  let drag: { id: number; y: number; start: number } | null = null;
  swingEl.addEventListener('pointerdown', (e) => {
    drag = { id: e.pointerId, y: e.clientY, start: state.swing };
    try {
      swingEl.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  });
  swingEl.addEventListener('pointermove', (e) => {
    if (drag?.id !== e.pointerId) return;
    seq.setSwing(drag.start + ((drag.y - e.clientY) / SWING_DRAG_PX) * (SWING_MAX - SWING_MIN));
  });
  const endDrag = (e: PointerEvent) => { if (drag?.id === e.pointerId) drag = null; };
  swingEl.addEventListener('pointerup', endDrag);
  swingEl.addEventListener('pointercancel', endDrag);
  swingEl.addEventListener('dblclick', () => seq.setSwing(SWING_MIN));
  swingEl.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation(); // keep arrow keys off the pad keyboard shortcuts
    seq.setSwing(state.swing + dir * (e.shiftKey ? 5 : 1));
  });

  async function pickLoop(): Promise<void> {
    const res = await openDialog(`
      <h2>CHOOSE LOOP</h2>
      <div class="sq-loop-list">
        ${state.patterns.map((p, i) => `
          <button value="${i}" class="kp-btn${i === state.pattern ? ' primary' : ''}">
            LOOP ${i + 1} · ${hasHits(p) ? `${p.bars} BAR${p.bars > 1 ? 'S' : ''}` : 'EMPTY'}
          </button>`).join('')}
      </div>
      <div class="dlg-btns"><button value="cancel" class="kp-btn">CANCEL</button></div>`);
    const i = Number(res.value);
    if (res.value !== 'cancel' && Number.isInteger(i)) seq.selectPattern(i);
  }

  // ---------- grid ----------

  rows.forEach((row, r) => {
    row.querySelector('.sq-name')!.addEventListener('click', () => engine.play(padAt(r), seq.STEP_VELOCITY));
    row.querySelectorAll<HTMLButtonElement>('.sq-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const pad = padAt(r);
        const adding = cell.getAttribute('aria-pressed') !== 'true';
        seq.toggleStep(pad, tickAt(Number(cell.dataset.k)));
        if (adding && !state.playing) engine.play(pad, seq.STEP_VELOCITY); // hear what was added
      });
    });
  });

  function renderControls(): void {
    const n = bars();
    bar = Math.min(bar, n - 1);
    const queued = state.queued === null ? '' : ` → ${state.queued + 1}`;
    $('.sq-loop-name').textContent = `LOOP ${state.pattern + 1}${queued}`;
    $('.sq-loop').setAttribute('aria-label', `Loop ${state.pattern + 1}${queued ? `, loop ${state.queued! + 1} starts at the next bar` : ''}. Choose loop`);
    $('.sq-rows').textContent = `PADS ${BANK_NAMES[state.bank]} ${rowPage === 0 ? '1–8' : '9–16'}`;
    $('.sq-rows').setAttribute('aria-label', `Showing pads ${rowPage === 0 ? '1 to 8' : '9 to 16'} of bank ${BANK_NAMES[state.bank]}. Next pads`);
    for (const b of lenBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.bars) === n));
    $('.sq-rec').setAttribute('aria-pressed', String(state.recMode === 'rec' || state.recMode === 'count'));
    $('.sq-rec').classList.toggle('counting', state.recMode === 'count');
    $('.sq-dub').setAttribute('aria-pressed', String(state.recMode === 'dub'));
    $('.sq-count').setAttribute('aria-pressed', String(state.countIn));
    $('.sq-click').setAttribute('aria-pressed', String(state.click));
    for (const b of quantBtns) b.setAttribute('aria-pressed', String(b.dataset.q === state.quant));
    $('.sq-swing-val').textContent = `${state.swing}%`;
    swingEl.setAttribute('aria-valuenow', String(state.swing));
    swingEl.setAttribute('aria-valuetext', `${state.swing}%`);
    for (const b of pageBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.page) === page));
    barBtn.hidden = n === 1;
    barBtn.textContent = `BAR ${bar + 1}/${n}`;
    barBtn.setAttribute('aria-label', `Showing bar ${bar + 1} of ${n}. Next bar`);
    panel.querySelector('.sq-pages')!.classList.toggle('with-bar', n > 1);
    showPosition(seq.playhead());
  }

  function renderGrid(): void {
    const p = state.patterns[state.pattern];
    const len = lengthTicks(p);
    // Loudest hit per pad per 16th cell.
    const vel = new Map<string, number>();
    for (const e of p.events) {
      if (e.tick >= len) break;
      const key = `${e.pad}:${Math.floor(e.tick / STEP_TICKS)}`;
      vel.set(key, Math.max(vel.get(key) ?? 0, e.vel));
    }
    rows.forEach((row, r) => {
      const pad = padAt(r);
      const def = state.kit?.pads[pad];
      const name = def?.name ?? '';
      const colour = def ? GROUP_COLOUR[def.group] : 'transparent';
      row.style.setProperty('--c', colour);
      row.querySelector('.sq-name-text')!.textContent = name.toUpperCase();
      row.querySelector('.sq-name')!.setAttribute('aria-label', `Play ${name}`);
      row.querySelectorAll<HTMLButtonElement>('.sq-cell').forEach((cell, k) => {
        const step = page * STEPS_PER_PAGE + k;
        const v = vel.get(`${pad}:${bar * STEPS_PER_BAR + step}`);
        cell.setAttribute('aria-pressed', String(v !== undefined));
        cell.classList.toggle('beat', step % 4 === 0);
        if (v !== undefined) cell.style.setProperty('--a', (0.45 + 0.55 * (v / 127)).toFixed(2));
        cell.setAttribute('aria-label', `${name} step ${step + 1}${p.bars > 1 ? `, bar ${bar + 1}` : ''}`);
      });
    });
    playCol = -1;
    showPosition(seq.playhead());
  }

  /** LCD-style position text, the playhead column, and following the playhead. */
  function showPosition(head: ReturnType<typeof seq.playhead>): void {
    const n = bars();
    if (!head) {
      posEl.textContent = `${n} BAR${n > 1 ? 'S' : ''}`;
      setPlayCol(-1);
      return;
    }
    const step = Math.floor(head.tick / STEP_TICKS);
    const headBar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    posEl.textContent = `BAR ${headBar + 1} / ${n} · STEP ${String(inBar + 1).padStart(2, '0')}`;
    const headPage = Math.floor(inBar / STEPS_PER_PAGE);
    if (follow && (headBar !== bar || headPage !== page)) {
      bar = headBar;
      page = headPage;
      renderControls();
      renderGrid();
      return;
    }
    setPlayCol(headBar === bar && headPage === page ? inBar % STEPS_PER_PAGE : -1);
  }

  function setPlayCol(k: number): void {
    if (k === playCol) return;
    playCol = k;
    for (const row of rows) {
      row.querySelectorAll('.sq-cell').forEach((cell, i) => cell.classList.toggle('playhead', i === k));
    }
  }

  onFrame(showPosition);
  subscribe((_s, changed) => {
    if (changed.has('playing') && state.playing) follow = true;
    if (CONTROLS.some((k) => changed.has(k))) renderControls();
    if (GRID.some((k) => changed.has(k))) renderGrid();
  });
  renderControls();
  renderGrid();
}
