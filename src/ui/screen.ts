// Builds the pad screen DOM once. CSS (app.css) rearranges it for each layout.
// Controls marked data-todo are styled per the design but wired up in later milestones.

import { KIT_NAME } from '../audio/kit';

const ICON = {
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  undo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  metro: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8L14 4h-4z"/><path d="M12 16l6-9"/></svg>',
  play: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  pads: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  kits: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  seq: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h3M10 6h3M16 6h4M4 12h6M13 12h3M4 18h2M9 18h11"/></svg>',
  keys: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v10M12 4v16M16 4v10"/></svg>',
  mix: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="14" r="2" fill="#232220"/><circle cx="12" cy="8" r="2" fill="#232220"/><circle cx="18" cy="16" r="2" fill="#232220"/></svg>',
  setup: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
};

const TABS: [cls: string, icon: string, short: string, long: string, todo: string][] = [
  ['pads', ICON.pads, 'PADS', 'PADS', ''],
  ['kits', ICON.kits, 'KITS', 'KITS', 'M2'],
  ['seq', ICON.seq, 'SEQ', 'SEQUENCER', 'M3'],
  ['keys', ICON.keys, 'KEYS', 'KEYS', 'M5'],
  ['mix', ICON.mix, 'MIX/FX', 'MIX / FX', 'M6'],
  ['setup', ICON.setup, 'SETUP', 'SETUP', 'M4'],
];

// Static placeholder values for the selected-pad knobs (wired in M2/M6).
const KNOBS: [label: string, amount: number, value: string][] = [
  ['VOLUME', 0.78, '0.0 dB'],
  ['PITCH', 0.5, '+0 st'],
  ['PAN', 0.5, 'C'],
  ['REVERB SEND', 0, '0%'],
  ['DELAY SEND', 0, '0%'],
];

const ARC = 84.8; // 270° of a r=18 circle

function knob([label, amount, value]: (typeof KNOBS)[number]): string {
  return `
    <div class="knob" data-todo="M2">
      <svg width="52" height="52" viewBox="0 0 48 48" role="img" aria-label="${label} ${value}">
        <circle cx="24" cy="24" r="18" fill="none" stroke="#191816" stroke-width="4" stroke-linecap="round" stroke-dasharray="${ARC} 200" transform="rotate(135 24 24)"/>
        <circle cx="24" cy="24" r="18" fill="none" stroke="#FFB547" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(ARC * amount).toFixed(1)} 200" transform="rotate(135 24 24)"/>
        <circle cx="24" cy="24" r="12" fill="#4A4844"/>
      </svg>
      <div class="knob-text"><span class="knob-label">${label}</span><span class="knob-val">${value}</span></div>
    </div>`;
}

export interface ScreenRefs {
  padwell: HTMLElement;
  lastLine: HTMLElement;
  lastInline: HTMLElement;
  fullLevel: HTMLButtonElement;
  rec: HTMLButtonElement;
  selName: HTMLElement;
  master: HTMLInputElement;
}

export function buildScreen(root: HTMLElement): ScreenRefs {
  root.innerHTML = `
  <div class="app">
    <div class="controls">
      <section class="lcd" aria-label="Display">
        <div class="lcd-top">
          <button class="kit-btn" aria-label="Choose kit" data-todo="M2"><span>${KIT_NAME}</span>${ICON.chevron}</button>
          <div class="bpm">
            <button aria-label="Tempo down" data-todo="M3">−</button>
            <span class="bpm-val">120.0 <span class="bpm-unit">BPM</span></span>
            <button aria-label="Tempo up" data-todo="M3">+</button>
          </div>
        </div>
        <div class="lcd-status">
          <span>BAR 01.1</span><span>Q 1/16</span><span>SWING 50%</span>
          <span class="rec-state">READY</span><span class="last-inline"></span>
        </div>
        <div class="lcd-last" aria-live="polite"></div>
      </section>

      <div class="transport">
        <button class="key" aria-label="Undo" data-todo="M3">${ICON.undo}</button>
        <button class="key metro" aria-label="Metronome" data-todo="M3">${ICON.metro}</button>
        <button class="rec" aria-label="Record" aria-pressed="false"><span></span></button>
        <button class="key play" aria-label="Play" data-todo="M3">${ICON.play}</button>
        <button class="key dub" aria-label="Overdub" data-todo="M3">DUB</button>
      </div>

      <div class="loops" role="group" aria-label="Loop slots">
        ${[1, 2, 3, 4].map((n) => `<button class="loop" aria-label="Loop ${n}, empty" data-todo="M3">+ EMPTY</button>`).join('')}
      </div>

      <div class="bankrow">
        <div class="banks" role="group" aria-label="Pad banks">
          ${['A', 'B', 'C', 'D'].map((b) => `<button class="bank" aria-label="Pad bank ${b}" aria-pressed="${b === 'A'}"${b === 'A' ? '' : ' data-todo="M2"'}>${b}</button>`).join('')}
        </div>
        <div class="toggles">
          <button class="toggle" aria-pressed="false" data-todo="M3"><span class="lbl-short">NOTE RPT</span><span class="lbl-long">NOTE REPEAT</span></button>
          <button class="toggle full-level" aria-pressed="false"><span class="lbl-short">FULL LVL</span><span class="lbl-long">FULL LEVEL</span></button>
        </div>
      </div>
    </div>

    <div class="padwell" role="group" aria-label="Drum pads"></div>

    <nav class="tabs" aria-label="Sections">
      <span class="tabs-handle" aria-hidden="true"></span>
      <div class="tabs-list">
        ${TABS.map(([cls, icon, short, long, todo]) => `
          <button class="tab ${cls}"${cls === 'pads' ? ' aria-current="page"' : ''}${todo ? ` data-todo="${todo}"` : ''}>
            ${icon}<span class="lbl-short">${short}</span><span class="lbl-long">${long}</span>
          </button>`).join('')}
      </div>
    </nav>

    <div class="status">
      <span class="midi-chip"><span class="midi-dot"></span>MIDI OFF</span>
      <button class="icon-btn" aria-label="Settings" data-todo="M4">${ICON.setup}</button>
    </div>

    <aside class="rail-right" aria-label="Selected pad">
      <div style="display:flex;flex-direction:column;gap:2px">
        <span class="rail-label">SELECTED PAD</span>
        <span class="sel-name"></span>
      </div>
      ${KNOBS.map(knob).join('')}
      <label class="master">MASTER
        <input type="range" min="0" max="100" value="82" aria-label="Master volume">
      </label>
    </aside>
  </div>`;

  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  return {
    padwell: q('.padwell'),
    lastLine: q('.lcd-last'),
    lastInline: q('.last-inline'),
    fullLevel: q('.full-level'),
    rec: q('.rec'),
    selName: q('.sel-name'),
    master: q('.master input'),
  };
}
