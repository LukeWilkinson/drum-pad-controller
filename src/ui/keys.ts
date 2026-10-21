// KEYS panel (Keys.dc.html): the snap chip, SYNTH / SAMPLED, the presets (4 or 5), octave, HOLD / ARP, the
// pitch and mod strips, and the keyboard. Built once; render() updates it from the store. The keyboard
// has 15 white keys (two octaves, C to C); phones show the first 10 (C to E), as in the design.
// A dot marks the key's root on every octave; with snap on, keys outside the scale are dimmed.
// Controls marked data-todo are wired up in later M5 steps (or later milestones).

import * as keys from '../keys/keys';
import { inScale, scaleLabel } from '../keys/scales';
import {
  ARP_MODES,
  ARP_MODE_NAMES,
  ARP_RATES,
  PRESETS,
  PRESET_SLOTS,
  cOf,
  noteName,
  type ArpMode,
  type ArpRate,
  type KeysSource,
} from '../keys/types';
import { state, subscribe } from '../state';
import { openDialog } from './dialog';

const HOLD_MS = 500; // holding ARP this long opens its options
const THUMB_W = 28; // px, the strip thumb
const ARP_MODE_ARROWS: Record<ArpMode, string> = { up: '↑', down: '↓', updown: '↑↓', random: 'RND' };

/** Semitones above the left-most C of each white key, and the white keys only wide screens show. */
const WHITES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const NARROW_WHITES = 10;
/** Black keys: semitone offset and the white key they sit after (their position). */
const BLACKS: [offset: number, after: number][] = [
  [1, 0], [3, 1], [6, 3], [8, 4], [10, 5], [13, 7], [15, 8], [18, 10], [20, 11], [22, 12],
];

let keyEls = new Map<number, HTMLElement>(); // semitone offset → key
/** Notes shown pressed, so a change of octave can show them in their new place. */
const lit = new Set<number>();

export interface KeysPanelOptions {
  /** PITCH strip moved: −1 … 1 (0 = centre). */
  onBend(amount: number): void;
}

export function buildKeysPanel(app: HTMLElement, opts: KeysPanelOptions): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'keys-panel';
  panel.setAttribute('aria-label', 'Keys');
  const whites = WHITES.map((off, i) =>
    `<button class="kb-key kb-white${i >= NARROW_WHITES ? ' wide' : ''}" data-off="${off}" tabindex="-1"><span class="kb-root"></span><span class="kb-label"></span></button>`,
  ).join('');
  const blacks = BLACKS.map(([off, after]) =>
    `<button class="kb-key kb-black${after + 1 >= NARROW_WHITES ? ' wide' : ''}" data-off="${off}" tabindex="-1" style="--p:${after + 1}"><span class="kb-root"></span></button>`,
  ).join('');
  panel.innerHTML = `
    <header class="ky-head">
      <h1>KEYS</h1>
      <div class="ky-src" role="group" aria-label="Instrument type">
        <button class="ky-seg" data-src="synth" data-learn="src:synth" aria-pressed="true">SYNTH</button>
        <button class="ky-seg" data-src="sampled" data-learn="src:sampled" aria-pressed="false">SAMPLED</button>
      </div>
      <button class="ky-snap" data-learn="snap" aria-pressed="false"><span class="ky-snap-dot"></span><span class="ky-snap-text"></span><span class="ky-snap-short"></span></button>
    </header>
    <div class="ky-presets" role="group" aria-label="Presets">
      ${Array.from({ length: PRESET_SLOTS }, (_, i) => `<button class="ky-preset" data-i="${i}" data-learn="preset:${i}" aria-pressed="false"><span class="ky-pname"></span><span class="ky-pmeta"></span></button>`).join('')}
    </div>
    <div class="ky-oct">
      <span class="ky-label">OCTAVE</span>
      <button class="ky-btn ky-oct-down" data-learn="oct-down" aria-label="Octave down">−</button>
      <span class="ky-oct-val"></span>
      <button class="ky-btn ky-oct-up" data-learn="oct-up" aria-label="Octave up">+</button>
      <span class="ky-spacer"></span>
      <button class="ky-toggle ky-hold" data-learn="hold" aria-pressed="false">HOLD</button>
      <button class="ky-toggle ky-arp" data-learn="arp" aria-pressed="false" aria-haspopup="dialog" title="Tap: on / off. Hold: options">ARP<span class="ky-arp-info"></span></button>
    </div>
    <div class="ky-strips">
      <div class="ky-strip ky-pitch" role="slider" aria-label="Pitch bend" aria-valuemin="-2" aria-valuemax="2" aria-valuenow="0">
        <span class="ky-strip-label">PITCH</span><span class="ky-pitch-centre"></span><span class="ky-thumb"></span>
      </div>
      <div class="ky-strip ky-mod" data-todo="LATER" aria-label="Modulation strip (not working yet)">
        <span class="ky-strip-label">MOD</span><span class="ky-thumb"></span>
      </div>
    </div>
    <div class="ky-board" role="group" aria-label="Keyboard">${whites}${blacks}</div>`;
  app.appendChild(panel);

  const board = panel.querySelector<HTMLElement>('.ky-board')!;
  keyEls = new Map([...board.querySelectorAll<HTMLElement>('.kb-key')].map((el) => [Number(el.dataset.off), el]));
  const segs = [...panel.querySelectorAll<HTMLButtonElement>('.ky-seg')];
  const presets = [...panel.querySelectorAll<HTMLButtonElement>('.ky-preset')];
  const octVal = panel.querySelector<HTMLElement>('.ky-oct-val')!;
  const snapBtn = panel.querySelector<HTMLButtonElement>('.ky-snap')!;
  const snapText = panel.querySelector<HTMLElement>('.ky-snap-text')!;
  const snapShort = panel.querySelector<HTMLElement>('.ky-snap-short')!;

  snapBtn.addEventListener('click', keys.toggleSnap);

  const holdBtn = panel.querySelector<HTMLButtonElement>('.ky-hold')!;
  const arpBtn = panel.querySelector<HTMLButtonElement>('.ky-arp')!;
  const arpInfo = panel.querySelector<HTMLElement>('.ky-arp-info')!;
  holdBtn.addEventListener('click', keys.toggleHold);
  onTapOrHold(arpBtn, keys.toggleArp, openArpOptions);
  attachPitchStrip(panel.querySelector<HTMLElement>('.ky-pitch')!, opts.onBend);

  for (const seg of segs) seg.addEventListener('click', () => keys.setSource(seg.dataset.src as KeysSource));
  presets.forEach((btn, i) => btn.addEventListener('click', () => keys.selectPreset(i)));
  panel.querySelector('.ky-oct-down')!.addEventListener('click', () => keys.nudgeOctave(-1));
  panel.querySelector('.ky-oct-up')!.addEventListener('click', () => keys.nudgeOctave(1));

  function render(): void {
    const k = state.keys;
    for (const seg of segs) seg.setAttribute('aria-pressed', String(seg.dataset.src === k.source));
    const load = state.keysLoad;
    presets.forEach((btn, i) => {
      const p = PRESETS[k.source][i];
      btn.hidden = !p; // SYNTH has one preset fewer than SAMPLED
      if (!p) return;
      const current = i === k.preset[k.source];
      const loading = current && load ? (load.failed ? "Couldn't load samples" : `Loading ${load.done}/${load.total}`) : '';
      btn.querySelector('.ky-pname')!.textContent = p.name;
      btn.querySelector('.ky-pmeta')!.textContent = loading || p.meta;
      btn.setAttribute('aria-pressed', String(current));
    });
    octVal.textContent = `C${k.octave}`;
    holdBtn.setAttribute('aria-pressed', String(k.hold));
    arpBtn.setAttribute('aria-pressed', String(k.arp));
    arpInfo.textContent = k.arp ? ` ${ARP_MODE_ARROWS[k.arpMode]} ${k.arpRate}` : '';
    arpBtn.setAttribute('aria-label', `Arpeggiator ${k.arp ? 'on' : 'off'}, ${ARP_MODE_NAMES[k.arpMode].toLowerCase()}, ${k.arpRate}. Hold for options`);
    snapBtn.setAttribute('aria-pressed', String(k.snap));
    snapText.textContent = k.snap ? `SNAP · ${scaleLabel(k.key, k.scale)}` : 'SNAP OFF';
    snapShort.textContent = k.snap ? scaleLabel(k.key, k.scale, true) : 'SNAP OFF';
    snapBtn.setAttribute('aria-label', k.snap ? `Scale snap on, ${scaleLabel(k.key, k.scale).toLowerCase()}` : 'Scale snap off');
    const base = cOf(k.octave);
    for (const [off, el] of keyEls) {
      const note = base + off;
      const out = k.snap && !inScale(note, k.key, k.scale);
      const name = noteName(note);
      el.setAttribute('aria-label', out ? `${name}, snaps to the scale` : name);
      const label = el.querySelector('.kb-label');
      if (label) label.textContent = name;
      el.classList.toggle('down', lit.has(note));
      el.classList.toggle('out', out);
      el.classList.toggle('root', note % 12 === k.key);
    }
  }

  render();
  subscribe((_s, changed) => (changed.has('keys') || changed.has('keysLoad')) && render());
  return board;
}

/** Tap → `tap`; holding for HOLD_MS (or a right-click) → `hold` instead. Keyboard Enter/Space taps. */
function onTapOrHold(el: HTMLElement, tap: () => void, hold: () => void): void {
  let timer = 0;
  let held = false;
  el.addEventListener('pointerdown', () => {
    held = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      held = true;
      hold();
    }, HOLD_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, () => clearTimeout(timer));
  el.addEventListener('click', () => {
    if (!held) tap();
    held = false;
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    held = true;
    hold();
  });
}

/** ARP options: mode and rate, applied as they are tapped. */
async function openArpOptions(): Promise<void> {
  const k = state.keys;
  const btn = (kind: string, value: string, label: string, on: boolean) =>
    `<button type="button" class="kp-btn ky-opt" data-${kind}="${value}" aria-pressed="${on}">${label}</button>`;
  await openDialog(
    `<h2>ARP</h2>
    <p class="ky-opt-label">MODE</p>
    <div class="ky-opts">${ARP_MODES.map((m) => btn('mode', m, ARP_MODE_NAMES[m], m === k.arpMode)).join('')}</div>
    <p class="ky-opt-label">RATE</p>
    <div class="ky-opts">${(Object.keys(ARP_RATES) as ArpRate[]).map((r) => btn('rate', r, r, r === k.arpRate)).join('')}</div>
    <div class="dlg-btns"><button value="done" class="kp-btn primary">DONE</button></div>`,
    (b) => {
      if (b.dataset.mode) keys.setArpMode(b.dataset.mode as ArpMode);
      if (b.dataset.rate) keys.setArpRate(b.dataset.rate as ArpRate);
      const group = b.parentElement!;
      for (const o of group.querySelectorAll('.ky-opt')) o.setAttribute('aria-pressed', String(o === b));
    },
  );
}

/**
 * PITCH strip: drag sideways to bend (the thumb follows the finger); letting go springs back to
 * the centre. Reports −1 … 1.
 */
function attachPitchStrip(strip: HTMLElement, onBend: (amount: number) => void): void {
  const thumb = strip.querySelector<HTMLElement>('.ky-thumb')!;
  let active: number | null = null;
  const set = (amount: number) => {
    const half = strip.clientWidth / 2 - THUMB_W / 2;
    strip.style.setProperty('--x', `calc(50% + ${amount * half}px)`);
    strip.setAttribute('aria-valuenow', (amount * 2).toFixed(1));
    onBend(amount);
  };
  const amountAt = (clientX: number) => {
    const r = strip.getBoundingClientRect();
    const half = r.width / 2 - THUMB_W / 2;
    return Math.max(-1, Math.min(1, (clientX - (r.left + r.width / 2)) / half));
  };
  strip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    active = e.pointerId;
    try {
      strip.setPointerCapture(e.pointerId);
    } catch {
      /* not an active pointer (a scripted test event) */
    }
    thumb.classList.remove('spring');
    set(amountAt(e.clientX));
  });
  strip.addEventListener('pointermove', (e) => {
    if (e.pointerId === active) set(amountAt(e.clientX));
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    thumb.classList.add('spring');
    set(0);
  };
  strip.addEventListener('pointerup', end);
  strip.addEventListener('pointercancel', end);
  strip.addEventListener('lostpointercapture', end);
}

/** Lights or clears the key for `note`, if it is on screen at the current octave. */
export function showKey(note: number, down: boolean): void {
  if (down) lit.add(note);
  else lit.delete(note);
  keyEls.get(note - cOf(state.keys.octave))?.classList.toggle('down', down);
}
