// Pad elements and their hit visuals. Visual updates only touch a class and one CSS
// variable per pad, so a hit never re-renders the grid.

import { GROUP_COLOUR, padNumber } from '../audio/kit';
import { PADS } from '../audio/kits';

const HOT_ABOVE = 75; // text turns dark above this velocity

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function buildPads(well: HTMLElement): HTMLButtonElement[] {
  return PADS.map((pad, i) => {
    const colour = GROUP_COLOUR[pad.group];
    const num = String(padNumber(i)).padStart(2, '0');
    const el = document.createElement('button');
    el.className = 'pad';
    el.setAttribute('aria-label', `Pad ${num}, ${pad.name}`);
    el.style.setProperty('--c', colour);
    el.style.setProperty('--c-tint', rgba(colour, 0.16));
    el.style.setProperty('--c-glow', rgba(colour, 0.7));
    el.innerHTML = `
      <span class="pad-fill" aria-hidden="true"></span>
      <span class="pad-led" aria-hidden="true"></span>
      <span class="pad-num">${num}</span>
      <span class="pad-name">${pad.name}</span>`;
    well.appendChild(el);
    return el;
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
