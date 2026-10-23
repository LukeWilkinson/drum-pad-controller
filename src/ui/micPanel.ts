// The REC MIC panel (src/ui/micRec.ts opens it after the pad tap). Nothing records until RECORD is
// pressed; RECORD again drops the take and records a new one. While recording the button is a red
// STOP with a REC badge, a timer and a live waveform. A finished take shows its whole waveform with
// trim handles at the auto-trim bounds (src/audio/sampleEdit.ts findSound); PLAY plays the part
// between them at the level it will be saved at, and SAVE TO PAD stores just that part
// (src/audio/userSamples.ts addRecording). Nothing is stored before SAVE, so CANCEL leaves nothing.

import type { AudioEngine } from '../audio/engine';
import { padLabel } from '../audio/kit';
import * as recorder from '../audio/recorder';
import { type Bounds, TARGET_PEAK_DB, findSound, peakOf, peaks } from '../audio/sampleEdit';
import { ImportError, MAX_SECONDS, addRecording } from '../audio/userSamples';
import { swapSample } from '../kitControl';
import * as hits from '../pads/hits';
import { state, subscribe } from '../state';
import { escapeHtml, openDialog } from './dialog';
import { openSaveKitDialog } from './saveKit';

type Phase = 'idle' | 'asking' | 'recording' | 'ready' | 'saving';

const MIN_KEEP = 0.02; // seconds: the handles never get closer than this
const LIVE_SECONDS = 3; // the live waveform fills the width over this long, then squeezes
const STEP = 0.01; // seconds per arrow key on a handle (Shift: ×10)

const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const STOP_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

interface Panel {
  pad: number;
  phase: Phase;
  closed: boolean;
  /** The finished take (mono), and its AudioBuffer for PLAY once made. */
  take?: { data: Float32Array; rate: number; buffer?: AudioBuffer };
  /** Trim handles in frames (`end` not included). */
  start: number;
  end: number;
  /** Live waveform while recording: min / max of each block, and the frames so far. */
  live: number[];
  liveFrames: number;
  liveRate: number;
  stopPlay?: () => void;
  /** Context time PLAY started and the frame it started from, for the playhead. */
  playAt: number;
  playFrom: number;
  timer: number;
  el: {
    root: HTMLElement;
    time: HTMLElement;
    badge: HTMLElement;
    wave: HTMLElement;
    canvas: HTMLCanvasElement;
    empty: HTMLElement;
    hStart: HTMLElement;
    hEnd: HTMLElement;
    head: HTMLElement;
    info: HTMLElement;
    msg: HTMLElement;
    rec: HTMLButtonElement;
    recLabel: HTMLElement;
    play: HTMLButtonElement;
    save: HTMLButtonElement;
  };
}

let engine: AudioEngine;
let panel: Panel | null = null;

export function initMicPanel(e: AudioEngine): void {
  engine = e;
  recorder.onMicTake(onTake);
  recorder.onMicData(onData);
  subscribe((s, changed) => {
    // STOP while the browser was still asking for the mic: back to idle with nothing recorded.
    if (changed.has('recorder') && panel?.phase === 'asking' && s.recorder.mode === 'off') setPhase(panel, 'idle');
  });
  window.addEventListener('resize', () => panel && draw(panel));
}

/** Opens the panel for `pad`. Nothing records until its RECORD button is pressed. */
export function openMicPanel(pad: number): void {
  if (panel) return;
  const label = padLabel(pad);
  const done = openDialog(
    `<div class="mp">
      <div class="mp-top">
        <h2>MIC → PAD ${label}</h2>
        <span class="mp-badge" hidden><span class="rec-dot" aria-hidden="true"></span>REC</span>
        <span class="mp-time" aria-live="off">0:00.0</span>
      </div>
      <p class="mp-pad">${escapeHtml(hits.padTitle(pad))}</p>
      <div class="mp-wave">
        <canvas aria-hidden="true"></canvas>
        <p class="mp-empty">Tap RECORD, then make the sound.</p>
        <div class="mp-h mp-h-start" role="slider" tabindex="0" aria-label="Trim start" hidden></div>
        <div class="mp-h mp-h-end" role="slider" tabindex="0" aria-label="Trim end" hidden></div>
        <div class="mp-head" hidden></div>
      </div>
      <p class="mp-info"></p>
      <p class="mp-msg" role="status"></p>
      <div class="mp-ctrls">
        <button type="button" class="mp-rec" aria-label="Record"><span class="mp-rec-dot" aria-hidden="true"></span><span class="mp-rec-label">RECORD</span></button>
        <button type="button" class="kp-btn mp-play" disabled>${PLAY_SVG}<span>PLAY</span></button>
      </div>
      <p class="sh-hint">Use headphones, or the pads and the click get recorded too. Up to ${MAX_SECONDS} s.</p>
      <div class="dlg-btns">
        <button value="cancel" class="kp-btn">CANCEL</button>
        <button type="button" class="kp-btn primary mp-save" disabled>SAVE TO PAD</button>
      </div>
    </div>`,
    (btn) => {
      if (!panel) return;
      if (btn.classList.contains('mp-rec')) void pressRecord(panel);
      else if (btn.classList.contains('mp-play')) togglePlay(panel);
      else if (btn.classList.contains('mp-save')) void save(panel);
    },
  );

  const root = document.querySelector<HTMLElement>('dialog.dlg .mp')!;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const p: Panel = {
    pad,
    phase: 'idle',
    closed: false,
    start: 0,
    end: 0,
    live: [],
    liveFrames: 0,
    liveRate: engine.ctx.sampleRate,
    playAt: 0,
    playFrom: 0,
    timer: 0,
    el: {
      root,
      time: q('.mp-time'),
      badge: q('.mp-badge'),
      wave: q('.mp-wave'),
      canvas: q('canvas'),
      empty: q('.mp-empty'),
      hStart: q('.mp-h-start'),
      hEnd: q('.mp-h-end'),
      head: q('.mp-head'),
      info: q('.mp-info'),
      msg: q('.mp-msg'),
      rec: q('.mp-rec'),
      recLabel: q('.mp-rec-label'),
      play: q('.mp-play'),
      save: q('.mp-save'),
    },
  };
  panel = p;
  dragHandle(p, p.el.hStart, 'start');
  dragHandle(p, p.el.hEnd, 'end');
  hits.setLast(`REC MIC → PAD ${label} · PRESS RECORD`, 'MIC PANEL');
  setPhase(p, 'idle');

  void done.then((res) => {
    p.closed = true;
    panel = null;
    stopPlayback(p);
    clearInterval(p.timer);
    // CANCEL, Esc or a tap outside while recording: stop, and the take is dropped (onTake ignores it).
    if (state.recorder.mode === 'mic') recorder.stopRecording();
    if (res.value !== 'saved') hits.setLast('REC MIC · NOTHING SAVED', 'MIC OFF');
  });
}

/** RECORD (idle / take ready: record a new take) or STOP (asking / recording). */
async function pressRecord(p: Panel): Promise<void> {
  if (p.phase === 'asking' || p.phase === 'recording') {
    recorder.stopRecording();
    return;
  }
  if (p.phase === 'saving') return;
  stopPlayback(p);
  p.take = undefined;
  p.live = [];
  p.liveFrames = 0;
  setMsg(p, '');
  setPhase(p, 'asking');
  try {
    await recorder.recordMic(p.pad); // inside the tap, so the browser may show its mic prompt
    if (p.closed) return;
    if (state.recorder.mode === 'mic') setPhase(p, 'recording');
    else setPhase(p, 'idle'); // stopped while the browser asked
  } catch (err) {
    if (!(err instanceof recorder.RecordError)) console.error(err);
    if (p.closed) return;
    setPhase(p, 'idle');
    setMsg(p, err instanceof recorder.RecordError ? err.message : "The mic couldn't start.");
  }
}

function onData(chunk: Float32Array, rate: number): void {
  const p = panel;
  if (!p || p.phase !== 'recording') return;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] < lo) lo = chunk[i];
    if (chunk[i] > hi) hi = chunk[i];
  }
  p.live.push(lo, hi);
  p.liveFrames += chunk.length;
  p.liveRate = rate;
  draw(p);
}

function onTake(take: recorder.MicTake): void {
  const p = panel;
  if (!p || p.closed || take.pad !== p.pad) return; // a cancelled panel's take is dropped
  const data = take.channels[0];
  const found = findSound([data], take.rate);
  if (!found) {
    p.take = undefined;
    setPhase(p, 'idle');
    setMsg(p, 'Nothing was heard. Check the mic, get closer and try again.');
    return;
  }
  p.take = { data, rate: take.rate };
  p.start = found.start;
  p.end = found.end;
  setPhase(p, 'ready');
  hits.setLast(`REC MIC → PAD ${padLabel(p.pad)} · TRIM, PLAY OR SAVE`, 'TAKE READY');
}

function setPhase(p: Panel, phase: Phase): void {
  p.phase = phase;
  const { el } = p;
  const busy = phase === 'asking' || phase === 'recording';
  el.root.dataset.phase = phase;
  el.rec.classList.toggle('on', busy);
  el.recLabel.textContent = busy ? 'STOP' : p.take ? 'RECORD AGAIN' : 'RECORD';
  el.rec.setAttribute('aria-label', busy ? 'Stop recording' : p.take ? 'Record again (drops this take)' : 'Record');
  el.rec.disabled = phase === 'saving';
  el.badge.hidden = phase !== 'recording';
  el.play.disabled = phase !== 'ready';
  el.save.disabled = phase !== 'ready';
  el.hStart.hidden = el.hEnd.hidden = !p.take;
  el.empty.hidden = phase !== 'idle' || !!p.take;
  el.empty.textContent = 'Tap RECORD, then make the sound.';
  if (phase === 'asking') {
    el.empty.hidden = false;
    el.empty.textContent = 'Asking for the mic…';
  }

  clearInterval(p.timer);
  if (phase === 'recording') {
    hits.setLast(`REC MIC → PAD ${padLabel(p.pad)} · RECORDING`, 'RECORDING');
    p.timer = window.setInterval(() => (el.time.textContent = clock((performance.now() - state.recorder.since) / 1000)), 100);
  }
  el.time.textContent = p.take ? clock(p.take.data.length / p.take.rate) : '0:00.0';
  updateTrim(p);
  draw(p);
}

function updateTrim(p: Panel): void {
  const { el } = p;
  if (!p.take) {
    el.info.textContent = p.phase === 'recording' ? 'Recording… press STOP when done.' : '';
    return;
  }
  const { rate, data } = p.take;
  const total = data.length;
  const pos = (f: number) => `${((f / total) * 100).toFixed(3)}%`;
  el.hStart.style.left = pos(p.start);
  el.hEnd.style.left = pos(p.end);
  el.wave.style.setProperty('--trim-a', pos(p.start));
  el.wave.style.setProperty('--trim-b', pos(p.end));
  const s = p.start / rate;
  const e = p.end / rate;
  el.info.textContent = `KEEP ${s.toFixed(2)} s → ${e.toFixed(2)} s · ${(e - s).toFixed(2)} s`;
  for (const [h, f] of [
    [el.hStart, p.start],
    [el.hEnd, p.end],
  ] as const) {
    h.setAttribute('aria-valuemin', '0');
    h.setAttribute('aria-valuemax', (total / rate).toFixed(2));
    h.setAttribute('aria-valuenow', (f / rate).toFixed(2));
    h.setAttribute('aria-valuetext', `${(f / rate).toFixed(2)} seconds`);
  }
  draw(p);
}

/** Drag (finger or mouse) and arrow keys for one trim handle. */
function dragHandle(p: Panel, h: HTMLElement, which: 'start' | 'end'): void {
  const set = (frame: number) => {
    if (!p.take) return;
    const gap = Math.round(MIN_KEEP * p.take.rate);
    const total = p.take.data.length;
    if (which === 'start') p.start = clamp(Math.round(frame), 0, p.end - gap);
    else p.end = clamp(Math.round(frame), p.start + gap, total);
    updateTrim(p);
    if (p.stopPlay) play(p); // playing: restart from the new trim
  };
  let dragging: number | null = null; // the pointer moving this handle
  h.addEventListener('pointerdown', (e) => {
    if (!p.take || dragging !== null) return;
    e.preventDefault();
    dragging = e.pointerId;
    try {
      h.setPointerCapture(e.pointerId); // keeps the moves coming when the finger leaves the handle
    } catch {
      // not a live pointer (e.g. a scripted event): the moves still arrive on the handle
    }
    h.classList.add('drag');
  });
  h.addEventListener('pointermove', (e) => {
    if (!p.take || e.pointerId !== dragging) return;
    const r = p.el.wave.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * p.take.data.length);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== dragging) return;
    dragging = null;
    if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId);
    h.classList.remove('drag');
  };
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
  h.addEventListener('keydown', (e) => {
    if (!p.take) return;
    const step = Math.round(STEP * p.take.rate * (e.shiftKey ? 10 : 1));
    const now = which === 'start' ? p.start : p.end;
    let to: number | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') to = now - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') to = now + step;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = p.take.data.length;
    if (to === undefined) return;
    e.preventDefault();
    set(to);
  });
}

function togglePlay(p: Panel): void {
  if (p.stopPlay) stopPlayback(p);
  else play(p);
}

/** Plays the part between the handles at the level SAVE will store it at. */
function play(p: Panel): void {
  const take = p.take;
  if (!take) return;
  stopPlayback(p);
  if (!take.buffer) {
    take.buffer = engine.ctx.createBuffer(1, take.data.length, take.rate);
    take.buffer.copyToChannel(take.data as Float32Array<ArrayBuffer>, 0);
  }
  void engine.unlock();
  const peak = peakOf([take.data], p.start, p.end);
  const gain = peak > 0 ? Math.pow(10, TARGET_PEAK_DB / 20) / peak : 1;
  const mine = engine.previewBuffer(take.buffer, p.start / take.rate, (p.end - p.start) / take.rate, gain, () => {
    if (p.stopPlay === mine) stopPlayback(p);
  });
  p.stopPlay = mine;
  p.playAt = engine.ctx.currentTime;
  p.playFrom = p.start;
  p.el.play.classList.add('on');
  p.el.play.innerHTML = `${STOP_SVG}<span>STOP</span>`;
  p.el.head.hidden = false;
  const frame = () => {
    if (p.stopPlay !== mine || !p.take) return;
    const f = p.playFrom + (engine.ctx.currentTime - p.playAt) * p.take.rate;
    p.el.head.style.left = `${((Math.min(f, p.end) / p.take.data.length) * 100).toFixed(3)}%`;
    requestAnimationFrame(frame);
  };
  frame();
}

function stopPlayback(p: Panel): void {
  const stop = p.stopPlay;
  p.stopPlay = undefined;
  stop?.();
  p.el.play.classList.remove('on');
  p.el.play.innerHTML = `${PLAY_SVG}<span>PLAY</span>`;
  p.el.head.hidden = true;
}

async function save(p: Panel): Promise<void> {
  const take = p.take;
  if (!take || p.phase !== 'ready') return;
  stopPlayback(p);
  setPhase(p, 'saving');
  const bounds: Bounds = { start: p.start, end: p.end };
  let sample;
  try {
    ({ sample } = await addRecording([take.data], take.rate, bounds));
  } catch (err) {
    if (!(err instanceof ImportError)) console.error(err);
    if (p.closed) return;
    setPhase(p, 'ready');
    setMsg(p, err instanceof ImportError ? err.message : "The take couldn't be stored.");
    return;
  }
  document.querySelector<HTMLDialogElement>('dialog.dlg')?.close('saved');
  await swapSample(p.pad, sample.id, sample.name);
  engine.play(p.pad, 100);
  hits.setLast(`${hits.padTitle(p.pad)} · NEW SOUND`, `${sample.name.toUpperCase()}`);
  await openSaveKitDialog(true);
}

function setMsg(p: Panel, text: string): void {
  p.el.msg.textContent = text;
}

/** Draws the take (or the live recording) on the LCD-coloured canvas; dim outside the handles. */
function draw(p: Panel): void {
  const c = p.el.canvas;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(c.clientWidth * dpr));
  const h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  if (!g) return;
  const css = getComputedStyle(p.el.root);
  const bright = css.getPropertyValue('--lcd-text').trim();
  const dim = css.getPropertyValue('--lcd-line').trim();
  const recCol = css.getPropertyValue('--rec').trim();
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  g.fillStyle = dim;
  g.fillRect(0, Math.floor(mid), w, Math.max(1, Math.round(dpr)));

  let pairs: ArrayLike<number>;
  let cols: number;
  let colour: (x: number) => string;
  if (p.take) {
    cols = w;
    pairs = peaks(p.take.data, cols);
    const a = (p.start / p.take.data.length) * w;
    const b = (p.end / p.take.data.length) * w;
    colour = (x) => (x >= a && x <= b ? bright : dim);
  } else if (p.phase === 'recording' && p.live.length) {
    // Each block gets its share of the width, squeezed once the take is longer than LIVE_SECONDS.
    const span = Math.max(p.liveFrames, LIVE_SECONDS * p.liveRate);
    const blocks = p.live.length / 2;
    cols = Math.max(1, Math.round((p.liveFrames / span) * w));
    const out = new Float32Array(cols * 2);
    for (let i = 0; i < blocks; i++) {
      const x = Math.min(cols - 1, Math.floor((i / blocks) * cols));
      out[x * 2] = Math.min(out[x * 2], p.live[i * 2]);
      out[x * 2 + 1] = Math.max(out[x * 2 + 1], p.live[i * 2 + 1]);
    }
    pairs = out;
    colour = () => recCol;
  } else return;

  for (let x = 0; x < cols; x++) {
    const lo = pairs[x * 2];
    const hi = pairs[x * 2 + 1];
    const top = mid - hi * mid * 0.95;
    const bot = mid - lo * mid * 0.95;
    g.fillStyle = colour(x);
    g.fillRect(x, top, 1, Math.max(1, bot - top));
  }
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
