// Builds the pad screen DOM once. CSS (app.css) rearranges it for each layout.
// Controls marked data-todo are styled per the design but wired up in later milestones.

const ICON = {
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  undo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  metro: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8L14 4h-4z"/><path d="M12 16l6-9"/></svg>',
  play: '<svg class="i-play" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  stop: '<svg class="i-stop" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/></svg>',
  pads: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  kits: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  seq: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h3M10 6h3M16 6h4M4 12h6M13 12h3M4 18h2M9 18h11"/></svg>',
  keys: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v10M12 4v16M16 4v10"/></svg>',
  mix: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="14" r="2" fill="#232220"/><circle cx="12" cy="8" r="2" fill="#232220"/><circle cx="18" cy="16" r="2" fill="#232220"/></svg>',
  setup: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
};

const TABS: [cls: string, icon: string, short: string, long: string, todo: string][] = [
  ['pads', ICON.pads, 'PADS', 'PADS', ''],
  ['kits', ICON.kits, 'KITS', 'KITS', ''],
  ['seq', ICON.seq, 'SEQ', 'SEQUENCER', ''],
  ['keys', ICON.keys, 'KEYS', 'KEYS', 'M5'],
  ['mix', ICON.mix, 'MIX/FX', 'MIX / FX', 'M6'],
  ['setup', ICON.setup, 'SETUP', 'SETUP', ''],
];

// Selected-pad knobs on the tablet right rail. The first four are live (src/ui/rail.ts sets
// their arc and readout from the store); the FX sends arrive in M6.
const KNOBS: [label: string, key: string, todo: string][] = [
  ['VOLUME', 'volumeDb', ''],
  ['PITCH', 'pitch', ''],
  ['PAN', 'pan', ''],
  ['DECAY', 'decay', ''],
  ['REVERB SEND', '', 'M6'],
  ['DELAY SEND', '', 'M6'],
];

export const KNOB_ARC = 84.8; // 270° of a r=18 circle

function knob([label, key, todo]: (typeof KNOBS)[number]): string {
  const attrs = key
    ? `data-key="${key}" role="slider" tabindex="0" aria-label="${label}"`
    : `data-todo="${todo}"`;
  return `
    <div class="knob" ${attrs}>
      <svg width="52" height="52" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="18" fill="none" stroke="#191816" stroke-width="4" stroke-linecap="round" stroke-dasharray="${KNOB_ARC} 200" transform="rotate(135 24 24)"/>
        <circle class="knob-arc" cx="24" cy="24" r="18" fill="none" stroke="#FFB547" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 200" transform="rotate(135 24 24)"/>
        <circle cx="24" cy="24" r="12" fill="#4A4844"/>
      </svg>
      <div class="knob-text"><span class="knob-label">${label}</span><span class="knob-val">${key ? '' : '0%'}</span></div>
    </div>`;
}

export interface ScreenRefs {
  app: HTMLElement;
  padwell: HTMLElement;
  kitBtn: HTMLButtonElement;
  kitName: HTMLElement;
  lastLine: HTMLElement;
  lastInline: HTMLElement;
  fullLevel: HTMLButtonElement;
  noteRepeat: HTMLButtonElement;
  banks: HTMLButtonElement[];
  rec: HTMLButtonElement;
  dub: HTMLButtonElement;
  undo: HTMLButtonElement;
  loops: HTMLButtonElement[];
  lcdQ: HTMLElement;
  lcdSwing: HTMLElement;
  recState: HTMLElement;
  play: HTMLButtonElement;
  metro: HTMLButtonElement;
  bpmDown: HTMLButtonElement;
  bpmUp: HTMLButtonElement;
  bpmTap: HTMLButtonElement;
  bpmNum: HTMLElement;
  lcdBar: HTMLElement;
  selName: HTMLElement;
  master: HTMLInputElement;
  /** Tablet header: MIDI status chip and the gear. Both open the SETUP panel. */
  midiChip: HTMLButtonElement;
  midiText: HTMLElement;
  gear: HTMLButtonElement;
}

export function buildScreen(root: HTMLElement): ScreenRefs {
  root.innerHTML = `
  <div class="app" data-view="pads">
    <div class="controls">
      <section class="lcd" aria-label="Display">
        <div class="lcd-top">
          <button class="kit-btn" aria-label="Choose kit"><span class="kit-name">LOADING…</span>${ICON.chevron}</button>
          <div class="bpm">
            <button class="bpm-down" aria-label="Tempo down">−</button>
            <button class="bpm-tap" aria-label="Tempo 120 BPM. Tap repeatedly to set the tempo"><span class="bpm-num">120.0</span> <span class="bpm-unit">BPM</span></button>
            <button class="bpm-up" aria-label="Tempo up">+</button>
          </div>
        </div>
        <div class="lcd-status">
          <span class="lcd-bar">BAR 01.1</span><span class="lcd-q">Q 1/16</span><span class="lcd-swing">SWING 50%</span>
          <span class="rec-state">READY</span><span class="last-inline"></span>
        </div>
        <div class="lcd-last" aria-live="polite"></div>
      </section>

      <div class="transport">
        <button class="key undo" aria-label="Undo">${ICON.undo}</button>
        <button class="key metro" aria-label="Metronome" aria-pressed="true">${ICON.metro}</button>
        <button class="rec" aria-label="Record" aria-pressed="false"><span></span></button>
        <button class="key play" aria-label="Play" aria-pressed="false">${ICON.play}${ICON.stop}</button>
        <button class="key dub" aria-label="Overdub" aria-pressed="false">DUB</button>
      </div>

      <div class="loops" role="group" aria-label="Loop slots">
        ${[0, 1, 2, 3].map((i) => `<button class="loop" data-slot="${i}"><span class="loop-text">+ EMPTY</span><span class="loop-bar" aria-hidden="true"></span></button>`).join('')}
      </div>

      <div class="bankrow">
        <div class="banks" role="group" aria-label="Pad banks">
          ${['A', 'B', 'C', 'D'].map((b) => `<button class="bank" aria-label="Pad bank ${b}" aria-pressed="${b === 'A'}">${b}</button>`).join('')}
        </div>
        <div class="toggles">
          <button class="toggle note-repeat" aria-pressed="false"><span class="lbl-short">NOTE RPT</span><span class="lbl-long">NOTE REPEAT</span></button>
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
      <button class="midi-chip" aria-label="MIDI settings"><span class="midi-dot"></span><span class="midi-text">MIDI OFF</span></button>
      <button class="icon-btn" aria-label="Setup">${ICON.setup}</button>
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
    app: q('.app'),
    padwell: q('.padwell'),
    kitBtn: q('.kit-btn'),
    kitName: q('.kit-name'),
    lastLine: q('.lcd-last'),
    lastInline: q('.last-inline'),
    fullLevel: q('.full-level'),
    noteRepeat: q('.note-repeat'),
    banks: [...root.querySelectorAll<HTMLButtonElement>('.bank')],
    rec: q('.rec'),
    dub: q('.key.dub'),
    undo: q('.key.undo'),
    loops: [...root.querySelectorAll<HTMLButtonElement>('.loop')],
    lcdQ: q('.lcd-q'),
    lcdSwing: q('.lcd-swing'),
    recState: q('.rec-state'),
    play: q('.key.play'),
    metro: q('.key.metro'),
    bpmDown: q('.bpm-down'),
    bpmUp: q('.bpm-up'),
    bpmTap: q('.bpm-tap'),
    bpmNum: q('.bpm-num'),
    lcdBar: q('.lcd-bar'),
    selName: q('.sel-name'),
    master: q('.master input'),
    midiChip: q('.midi-chip'),
    midiText: q('.midi-text'),
    gear: q('.icon-btn'),
  };
}
