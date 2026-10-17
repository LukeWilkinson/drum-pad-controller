// Pad elements and their hit visuals. Visual updates only touch a class and one CSS
// variable per pad, so a hit never re-renders the grid.

import { GROUP_COLOUR, padNumber, type PadDef } from '../audio/kit';

const HOT_ABOVE = 75; // text turns dark above this velocity

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Creates the 16 pad buttons. Names and colours are filled in by applyKit(). */
export function buildPads(well: HTMLElement): HTMLButtonElement[] {
  return Array.from({ length: 16 }, (_, i) => {
    const el = document.createElement('button');
    el.className = 'pad';
    el.innerHTML = `
      <span class="pad-fill" aria-hidden="true"></span>
      <span class="pad-led" aria-hidden="true"></span>
      <span class="pad-num">${String(padNumber(i)).padStart(2, '0')}</span>
      <span class="pad-name"></span>`;
    well.appendChild(el);
    return el;
  });
}

/** Shows a kit's pad names and group colours. */
export function applyKit(els: HTMLElement[], pads: PadDef[]): void {
  els.forEach((el, i) => {
    const pad = pads[i];
    const colour = GROUP_COLOUR[pad.group];
    el.setAttribute('aria-label', `Pad ${String(padNumber(i)).padStart(2, '0')}, ${pad.name}`);
    el.style.setProperty('--c', colour);
    el.style.setProperty('--c-tint', rgba(colour, 0.16));
    el.style.setProperty('--c-glow', rgba(colour, 0.7));
    el.querySelector('.pad-name')!.textContent = pad.name;
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
