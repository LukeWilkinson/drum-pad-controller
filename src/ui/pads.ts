// Pad elements and their hit visuals. Visual updates only touch a class and one CSS
// variable per pad, so a hit never re-renders the grid.

import { GROUP_COLOUR, PADS_PER_BANK, padLabel, padNumber, type PadDef } from '../audio/kit';

const HOT_ABOVE = 75; // text turns dark above this velocity

/** Creates the 16 pad buttons. Names and colours are filled in by applyKit(). */
export function buildPads(well: HTMLElement): HTMLButtonElement[] {
  return Array.from({ length: 16 }, (_, i) => {
    const el = document.createElement('button');
    el.className = 'pad';
    el.dataset.learn = 'pad'; // MIDI Learn: the pad of the bank on screen (src/midi/targets.ts)
    el.dataset.screen = String(i);
    el.innerHTML = `
      <span class="pad-fill" aria-hidden="true"></span>
      <span class="pad-led" aria-hidden="true"></span>
      <span class="pad-num">${String(padNumber(i)).padStart(2, '0')}</span>
      <span class="pad-name"></span>`;
    well.appendChild(el);
    return el;
  });
}

/** Shows the pad names and group colours of one bank (0–3) of a kit's 64 pads. */
export function applyKit(els: HTMLElement[], pads: PadDef[], bank = 0): void {
  els.forEach((el, i) => {
    const index = bank * PADS_PER_BANK + i;
    const pad = pads[index];
    el.setAttribute('aria-label', `Pad ${padLabel(index)}, ${pad.name}`);
    el.style.setProperty('--c', GROUP_COLOUR[pad.group]);
    el.querySelector('.pad-name')!.textContent = pad.name;
    el.querySelector('.pad-num')!.textContent = String(padNumber(i)).padStart(2, '0'); // the CH bank shows degrees there
    el.classList.remove('chord');
  });
}

/** The CH bank (src/pads/chordPads.ts): each pad shows its chord, its degree, and a colour per row type. */
export function applyChordLabels(els: HTMLElement[], chords: { name: string; roman: string; seventh: boolean }[]): void {
  els.forEach((el, i) => {
    const c = chords[i];
    el.setAttribute('aria-label', `Chord pad ${padNumber(i)}, ${c.roman}, ${c.name}`);
    el.style.setProperty('--c', GROUP_COLOUR[c.seventh ? 'cym' : 'tom']);
    el.querySelector('.pad-name')!.textContent = c.name;
    el.querySelector('.pad-num')!.textContent = c.roman;
    el.classList.add('chord'); // chord symbols keep their case (Am7 is not AM7)
  });
}

export function showHit(el: HTMLElement, velocity: number): void {
  el.style.setProperty('--v', (velocity / 127).toFixed(3));
  el.classList.add('hit');
  el.classList.toggle('hot', velocity > HOT_ABOVE);
}

export function showRelease(el: HTMLElement): void {
  el.classList.remove('hit', 'hot');
}
