// KEYS panel (Keys.dc.html): the snap chip, SYNTH / SAMPLED, four presets, octave, HOLD / ARP, the
// pitch and mod strips, and the keyboard. Built once; render() updates it from the store. The keyboard
// has 15 white keys (two octaves, C to C); phones show the first 10 (C to E), as in the design.
// A dot marks the key's root on every octave; with snap on, keys outside the scale are dimmed.
// Controls marked data-todo are wired up in later M5 steps (or later milestones).

import * as keys from '../keys/keys';
import { inScale, scaleLabel } from '../keys/scales';
import { PRESETS, cOf, noteName, type KeysSource } from '../keys/types';
import { state, subscribe } from '../state';

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

export function buildKeysPanel(app: HTMLElement): HTMLElement {
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
        <button class="ky-seg" data-src="synth" aria-pressed="true">SYNTH</button>
        <button class="ky-seg" data-src="sampled" aria-pressed="false">SAMPLED</button>
      </div>
      <button class="ky-snap" aria-pressed="false"><span class="ky-snap-dot"></span><span class="ky-snap-text"></span><span class="ky-snap-short"></span></button>
    </header>
    <div class="ky-presets" role="group" aria-label="Presets">
      ${[0, 1, 2, 3].map((i) => `<button class="ky-preset" data-i="${i}" aria-pressed="false"><span class="ky-pname"></span><span class="ky-pmeta"></span></button>`).join('')}
    </div>
    <div class="ky-oct">
      <span class="ky-label">OCTAVE</span>
      <button class="ky-btn ky-oct-down" aria-label="Octave down">−</button>
      <span class="ky-oct-val"></span>
      <button class="ky-btn ky-oct-up" aria-label="Octave up">+</button>
      <span class="ky-spacer"></span>
      <button class="ky-toggle ky-hold" data-todo="M5" aria-pressed="false">HOLD</button>
      <button class="ky-toggle ky-arp" data-todo="M5" aria-pressed="false">ARP</button>
    </div>
    <div class="ky-strips">
      <div class="ky-strip ky-pitch" data-todo="M5" aria-label="Pitch bend strip">
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

  for (const seg of segs) seg.addEventListener('click', () => keys.setSource(seg.dataset.src as KeysSource));
  presets.forEach((btn, i) => btn.addEventListener('click', () => keys.selectPreset(i)));
  panel.querySelector('.ky-oct-down')!.addEventListener('click', () => keys.nudgeOctave(-1));
  panel.querySelector('.ky-oct-up')!.addEventListener('click', () => keys.nudgeOctave(1));

  function render(): void {
    const k = state.keys;
    for (const seg of segs) seg.setAttribute('aria-pressed', String(seg.dataset.src === k.source));
    const load = state.keysLoad;
    PRESETS[k.source].forEach((p, i) => {
      const current = i === k.preset[k.source];
      const loading = current && load ? (load.failed ? "Couldn't load samples" : `Loading ${load.done}/${load.total}`) : '';
      presets[i].querySelector('.ky-pname')!.textContent = p.name;
      presets[i].querySelector('.ky-pmeta')!.textContent = loading || p.meta;
      presets[i].setAttribute('aria-pressed', String(current));
    });
    octVal.textContent = `C${k.octave}`;
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

/** Lights or clears the key for `note`, if it is on screen at the current octave. */
export function showKey(note: number, down: boolean): void {
  if (down) lit.add(note);
  else lit.delete(note);
  keyEls.get(note - cOf(state.keys.octave))?.classList.toggle('down', down);
}
