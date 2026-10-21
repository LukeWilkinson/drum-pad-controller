// MIX / FX panel (Fx.dc.html): six mixer strips (fader, level meter, dB readout, mute) and the REVERB, DELAY
// and FILTER cards (on/off switch and three knobs each). Built once; render() follows the store, and the
// meters redraw every frame while the tab is showing. All changes go through src/mix/mix.ts.

import type { AudioEngine } from '../audio/engine';
import * as mix from '../mix/mix';
import {
  DEFAULT_MIX,
  DELAY_TIMES,
  FILTER_TYPES,
  FX_RANGE,
  REVERB_SIZES,
  STRIPS,
  STRIP_LABEL,
  faderGain,
  faderLevel,
  gainDb,
  type FxId,
  type StripId,
} from '../mix/types';
import { state, subscribe } from '../state';
import { bindKnob, knobSvg, setKnobArc } from './knob';

const MINUS = '−';
const METER_FLOOR = -54; // dB at the bottom of the meter; the top is +6 dB (the fader's top)
const METER_RANGE = 60;
const METER_FALL = 40; // dB per second
const HOLD_MS = 1500; // how long the OUT readout holds a peak
const CAP_H = 18; // px, the fader cap (also in mix.css)
const FADER_STEP = 0.02;
const UNITY = faderLevel(1);
const SNAP = 0.02; // a fader dragged this close to 0 dB lands on it

const STRIP_COLOUR: Record<StripId, string> = {
  kicks: 'var(--kick)',
  snare: 'var(--snare)',
  hats: 'var(--hat)',
  perc: 'var(--perc)',
  keys: 'var(--cym)',
  master: 'var(--amber)',
};

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

function fmtDb(db: number): string {
  if (!Number.isFinite(db)) return `${MINUS}∞`;
  const r = Math.round(db * 10) / 10;
  if (r === 0) return '0.0';
  return `${r < 0 ? MINUS : '+'}${Math.abs(r).toFixed(1)}`;
}

// ---------- Knob definitions ----------

/** How a knob's value maps onto its 0–1 turn. */
interface Scale {
  to(v: number): number;
  from(n: number): number;
  /** One arrow-key step as a fraction of the turn. */
  step: number;
}

const linear = (min: number, max: number): Scale => ({
  to: (v) => (v - min) / (max - min),
  from: (n) => min + n * (max - min),
  step: 0.02,
});
const log = (min: number, max: number): Scale => ({
  to: (v) => Math.log(v / min) / Math.log(max / min),
  from: (n) => min * Math.pow(max / min, n),
  step: 0.02,
});
/** `count` values 0 … count − 1. */
const list = (count: number): Scale => ({
  to: (v) => v / (count - 1),
  from: (n) => Math.round(n * (count - 1)),
  step: 1 / (count - 1),
});

interface KnobDef {
  label: string;
  scale: Scale;
  value(): number;
  apply(v: number): void;
  default: number;
  text(v: number): string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const delayName = (i: number) => DELAY_TIMES[i].name.replace(/([DT])$/, ' $1'); // "1/8D" → "1/8 D"
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);

const FX: { id: FxId; name: string; knobs: KnobDef[] }[] = [
  {
    id: 'reverb',
    name: 'REVERB',
    knobs: [
      { label: 'SIZE', scale: list(REVERB_SIZES.length), value: () => state.mix.reverb.size, apply: (v) => mix.setReverb({ size: v }), default: DEFAULT_MIX.reverb.size, text: (v) => REVERB_SIZES[v] },
      { label: 'DECAY', scale: log(FX_RANGE.decay.min, FX_RANGE.decay.max), value: () => state.mix.reverb.decay, apply: (v) => mix.setReverb({ decay: v }), default: DEFAULT_MIX.reverb.decay, text: (v) => `${v.toFixed(1)} s` },
      { label: 'MIX', scale: linear(0, 1), value: () => state.mix.reverb.mix, apply: (v) => mix.setReverb({ mix: v }), default: DEFAULT_MIX.reverb.mix, text: pct },
    ],
  },
  {
    id: 'delay',
    name: 'DELAY',
    knobs: [
      { label: 'TIME', scale: list(DELAY_TIMES.length), value: () => state.mix.delay.time, apply: (v) => mix.setDelay({ time: v }), default: DEFAULT_MIX.delay.time, text: delayName },
      { label: 'FDBK', scale: linear(FX_RANGE.feedback.min, FX_RANGE.feedback.max), value: () => state.mix.delay.feedback, apply: (v) => mix.setDelay({ feedback: v }), default: DEFAULT_MIX.delay.feedback, text: pct },
      { label: 'MIX', scale: linear(0, 1), value: () => state.mix.delay.mix, apply: (v) => mix.setDelay({ mix: v }), default: DEFAULT_MIX.delay.mix, text: pct },
    ],
  },
  {
    id: 'filter',
    name: 'FILTER',
    knobs: [
      { label: 'TYPE', scale: list(FILTER_TYPES.length), value: () => state.mix.filter.type, apply: (v) => mix.setFilter({ type: v }), default: DEFAULT_MIX.filter.type, text: (v) => FILTER_TYPES[v].name },
      { label: 'CUTOFF', scale: log(FX_RANGE.cutoff.min, FX_RANGE.cutoff.max), value: () => state.mix.filter.cutoff, apply: (v) => mix.setFilter({ cutoff: v }), default: DEFAULT_MIX.filter.cutoff, text: hz },
      { label: 'RES', scale: log(FX_RANGE.res.min, FX_RANGE.res.max), value: () => state.mix.filter.res, apply: (v) => mix.setFilter({ res: v }), default: DEFAULT_MIX.filter.res, text: (v) => v.toFixed(v < 1 ? 2 : 1) },
    ],
  },
];

/** Shown on a send-fed card while nothing is sending to it (every send starts at 0). */
const HINT: Partial<Record<FxId, string>> = {
  reverb: "Nothing sends here yet. Turn up a pad's REVERB SEND (KITS tab) or the KEYS reverb knob.",
  delay: "Nothing sends here yet. Turn up a pad's DELAY SEND (KITS tab) or the KEYS delay knob.",
};

// ---------- Panel ----------

export function buildMixPanel(app: HTMLElement, engine: AudioEngine): void {
  const panel = document.createElement('section');
  panel.className = 'mix-panel';
  panel.setAttribute('aria-label', 'Mixer and effects');
  panel.innerHTML = `
    <header class="mx-head">
      <h1>MIX / FX</h1>
      <span class="mx-out" aria-label="Output level">OUT ${MINUS}∞ dB</span>
    </header>
    <section class="mx-well" aria-label="Mixer">
      ${STRIPS.map(
        (id) => `
      <div class="mx-strip${id === 'master' ? ' master' : ''}" data-strip="${id}" style="--c:${STRIP_COLOUR[id]}">
        <span class="mx-name">${STRIP_LABEL[id]}</span>
        <div class="mx-fm">
          <div class="mx-fader" role="slider" tabindex="0" aria-label="${STRIP_LABEL[id]} level" aria-valuemin="0" aria-valuemax="100">
            <span class="mx-rail"></span><span class="mx-cap"></span><span class="mx-line"></span>
          </div>
          <div class="mx-meter" aria-hidden="true"><span class="mx-fill"></span></div>
        </div>
        <span class="mx-db"></span>
        <button class="mx-mute" aria-pressed="false" aria-label="Mute ${STRIP_LABEL[id]}">M</button>
      </div>`,
      ).join('')}
    </section>
    ${FX.map(
      (fx) => `
    <section class="mx-fx" data-fx="${fx.id}" aria-label="${fx.name}">
      <div class="mx-fx-head">
        <span class="mx-fx-name">${fx.name}</span>
        <button class="mx-switch" role="switch" aria-checked="false" aria-label="${fx.name}"><span></span></button>
      </div>
      <div class="mx-fx-knobs">
        ${fx.knobs
          .map(
            (k, i) => `
        <div class="knob mx-knob" data-i="${i}" role="slider" tabindex="0" aria-label="${fx.name} ${k.label}" aria-valuemin="0" aria-valuemax="1">
          ${knobSvg(48)}<span class="mx-k-label">${k.label}</span><span class="mx-k-val"></span>
        </div>`,
          )
          .join('')}
      </div>
      ${HINT[fx.id] ? `<p class="mx-hint" hidden>${HINT[fx.id]}</p>` : ''}
    </section>`,
    ).join('')}`;
  app.appendChild(panel);

  const out = panel.querySelector<HTMLElement>('.mx-out')!;

  // ---------- strips ----------

  interface StripEls {
    root: HTMLElement;
    fader: HTMLElement;
    fill: HTMLElement;
    db: HTMLElement;
    mute: HTMLButtonElement;
  }
  const strips = {} as Record<StripId, StripEls>;
  for (const id of STRIPS) {
    const root = panel.querySelector<HTMLElement>(`.mx-strip[data-strip="${id}"]`)!;
    strips[id] = {
      root,
      fader: root.querySelector('.mx-fader')!,
      fill: root.querySelector('.mx-fill')!,
      db: root.querySelector('.mx-db')!,
      mute: root.querySelector('.mx-mute')!,
    };
    bindFader(id, strips[id].fader);
    strips[id].mute.addEventListener('click', () => mix.toggleMute(id));
  }

  /** Drag the cap, or touch the track to jump to that spot. Near 0 dB the fader snaps to it. */
  function bindFader(id: StripId, el: HTMLElement): void {
    let drag: { pointer: number; offset: number } | null = null;
    const level = (y: number, offset: number) => {
      const r = el.getBoundingClientRect();
      const travel = r.height - CAP_H;
      let v = clamp((r.bottom - CAP_H / 2 - (y - offset)) / travel);
      if (Math.abs(v - UNITY) < SNAP) v = UNITY;
      return v;
    };
    el.addEventListener('pointerdown', (e) => {
      const r = el.getBoundingClientRect();
      const centre = r.bottom - CAP_H / 2 - state.mix.strips[id].level * (r.height - CAP_H);
      // Grabbing the cap keeps it under the finger; touching the track moves it there.
      const onCap = Math.abs(e.clientY - centre) <= CAP_H;
      drag = { pointer: e.pointerId, offset: onCap ? e.clientY - centre : 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      mix.setLevel(id, level(e.clientY, drag.offset));
    });
    el.addEventListener('pointermove', (e) => {
      if (drag?.pointer === e.pointerId) mix.setLevel(id, level(e.clientY, drag.offset));
    });
    const end = (e: PointerEvent) => {
      if (drag?.pointer === e.pointerId) drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => mix.setLevel(id, DEFAULT_MIX.strips[id].level));
    el.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation(); // keep arrow keys off the pad keyboard shortcuts
      mix.setLevel(id, state.mix.strips[id].level + dir * FADER_STEP * (e.shiftKey ? 5 : 1));
    });
  }

  // ---------- effect cards ----------

  const cards = FX.map((fx) => {
    const root = panel.querySelector<HTMLElement>(`.mx-fx[data-fx="${fx.id}"]`)!;
    const sw = root.querySelector<HTMLButtonElement>('.mx-switch')!;
    sw.addEventListener('click', () => mix.toggleFx(fx.id));
    const knobs = [...root.querySelectorAll<HTMLElement>('.mx-knob')].map((el, i) => {
      const k = fx.knobs[i];
      bindKnob(el, {
        get: () => k.scale.to(k.value()),
        set: (n) => k.apply(k.scale.from(n)),
        step: k.scale.step,
        reset: () => k.apply(k.default),
      });
      return el;
    });
    return { fx, root, sw, knobs, hint: root.querySelector<HTMLElement>('.mx-hint') };
  });

  // ---------- drawing ----------

  function renderMix(): void {
    for (const id of STRIPS) {
      const s = state.mix.strips[id];
      const el = strips[id];
      const text = fmtDb(gainDb(faderGain(s.level)));
      el.fader.style.setProperty('--lv', s.level.toFixed(4));
      el.fader.setAttribute('aria-valuenow', String(Math.round(s.level * 100)));
      el.fader.setAttribute('aria-valuetext', `${text} dB`);
      el.db.textContent = text;
      el.mute.setAttribute('aria-pressed', String(s.mute));
      el.root.classList.toggle('muted', s.mute);
    }
    for (const c of cards) {
      const on = state.mix[c.fx.id].on;
      c.sw.setAttribute('aria-checked', String(on));
      c.sw.setAttribute('aria-label', `${c.fx.name} ${on ? 'on' : 'off'}`);
      c.root.classList.toggle('off', !on);
      c.knobs.forEach((el, i) => {
        const k = c.fx.knobs[i];
        const v = k.value();
        const n = k.scale.to(v);
        const text = k.text(v);
        setKnobArc(el, n);
        el.querySelector('.mx-k-val')!.textContent = text;
        el.setAttribute('aria-valuenow', n.toFixed(3));
        el.setAttribute('aria-valuetext', text);
      });
    }
  }

  /** True when no pad of the kit and not the KEYS bus sends to this effect. */
  function nothingSends(fx: FxId): boolean {
    const key = fx === 'reverb' ? 'reverbSend' : 'delaySend';
    if (state.keys[key] > 0) return false;
    const params = state.kit?.params;
    if (!params) return true;
    for (let i = 0; i < params.length; i++) if (params[i][key] > 0) return false;
    return true;
  }

  function renderHints(): void {
    for (const c of cards) if (c.hint) c.hint.hidden = !nothingSends(c.fx.id);
  }

  subscribe((_s, changed) => {
    if (changed.has('mix')) renderMix();
    if (changed.has('kit') || changed.has('params') || changed.has('keys')) renderHints();
  });
  renderMix();
  renderHints();

  // ---------- meters (only while the tab is showing) ----------

  const shown = Object.fromEntries(STRIPS.map((id) => [id, -Infinity])) as Record<StripId, number>;
  let frame = 0;
  let last = 0;
  let hold = -Infinity;
  let holdUntil = 0;
  let outText = '';

  function tick(now: number): void {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const levels = engine.mix.levels();
    for (const id of STRIPS) {
      shown[id] = Math.max(levels[id], shown[id] - METER_FALL * dt);
      strips[id].fill.style.height = `${(clamp((shown[id] - METER_FLOOR) / METER_RANGE) * 100).toFixed(1)}%`;
    }
    // OUT holds the master's peak for a moment so a short hit can be read.
    if (levels.master >= hold || now > holdUntil) {
      hold = levels.master;
      holdUntil = now + HOLD_MS;
    }
    const text = `OUT ${fmtDb(hold)} dB`;
    if (text !== outText) out.textContent = outText = text;
  }

  function syncMeters(): void {
    const want = state.view === 'mix' && document.visibilityState === 'visible';
    if (want && !frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (!want && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }
  subscribe((_s, changed) => {
    if (changed.has('view')) syncMeters();
  });
  document.addEventListener('visibilitychange', syncMeters);
}
