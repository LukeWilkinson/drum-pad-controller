import './styles/tokens.css';
import './styles/app.css';
import './styles/kits.css';
import './styles/seq.css';
import { registerSW } from 'virtual:pwa-register';
import { AudioEngine } from './audio/engine';
import * as clock from './audio/clock';
import * as seq from './seq/sequencer';
import * as repeat from './seq/repeat';
import { PADS_PER_BANK, padLabel } from './audio/kit';
import { KITS, factoryKit } from './audio/kits';
import * as kitControl from './kitControl';
import { bootKits, kitLabel, saveMasterVolume } from './kitControl';
import { attachPadInput } from './pads/input';
import { state, subscribe, update } from './state';
import { applyKit, buildPads, showHit, showRelease } from './ui/pads';
import { buildKitsPanel } from './ui/kits';
import { buildScreen } from './ui/screen';
import { buildSeqPanel } from './ui/seq';
import { initRail } from './ui/rail';
import { initTransport } from './ui/transport';
import { initViews } from './ui/views';

const HINT = 'HIT A PAD — PRESS HIGHER TO HIT HARDER';

const ui = buildScreen(document.getElementById('app')!);
const padEls = buildPads(ui.padwell);
const engine = new AudioEngine();
clock.initClock(engine);
seq.initSequencer(engine);
seq.loadSong(); // the saved loops and tempo; independent of the kit loading below
repeat.initRepeat(engine);
initTransport(ui);
applyKit(padEls, KITS[0].pads); // colours straight away; replaced if a different kit is restored
buildKitsPanel(ui.app, engine);
buildSeqPanel(ui.app, engine);
initViews(ui);
initRail(ui.app.querySelector('.rail-right')!, engine);

let fullLevel = false;
/** Pad index each screen pad was pressed as (bank × 16 + screen index). */
const heldPad: number[] = [];
let kitReady = false;
let hasHit = false;

function setLast(text: string, inline = text): void {
  ui.lastLine.textContent = text;
  ui.lastInline.textContent = inline;
}

function padTitle(index: number): string {
  const name = state.kit?.pads[index].name ?? '';
  return `PAD ${padLabel(index)} · ${name.toUpperCase()}`;
}

subscribe((s, changed) => {
  if (changed.has('kit') || changed.has('edited')) ui.kitName.textContent = kitLabel(s.kit, s.edited);
  if (s.kit && (changed.has('kit') || changed.has('pads') || changed.has('bank'))) applyKit(padEls, s.kit.pads, s.bank);
  if (changed.has('kit') || changed.has('pads') || changed.has('selectedPad')) ui.selName.textContent = padTitle(s.selectedPad);
  if (changed.has('bank')) ui.banks.forEach((b, i) => b.setAttribute('aria-pressed', String(i === s.bank)));
});

ui.banks.forEach((b, i) => b.addEventListener('click', () => kitControl.selectBank(i)));

setLast('LOADING KIT…', 'LOADING…');

// Mobile browsers only start audio after a user gesture. Any tap or key unlocks it.
const unlock = () => {
  engine.unlock().then(() => {
    if (kitReady && !hasHit) setLast(HINT, 'READY');
  });
};
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

attachPadInput(
  padEls,
  {
    onHit(screenIndex, velocity) {
      const index = state.bank * PADS_PER_BANK + screenIndex;
      heldPad[screenIndex] = index; // a bank switch mid-hold still releases the right pad
      engine.play(index, velocity); // audio first
      seq.recordHit(index, velocity);
      repeat.press(index, velocity);
      showHit(padEls[screenIndex], velocity);
      hasHit = true;
      const name = state.kit?.pads[index].name.toUpperCase() ?? '';
      setLast(`${padTitle(index)} · VEL ${velocity}`, `${name} · VEL ${velocity}`);
      update({ selectedPad: index });
    },
    onRelease(screenIndex) {
      repeat.release(heldPad[screenIndex]);
      showRelease(padEls[screenIndex]);
    },
    onMove(screenIndex, velocity) {
      if (!state.noteRepeat) return;
      repeat.move(heldPad[screenIndex], velocity);
      showHit(padEls[screenIndex], velocity); // the fill follows the finger
    },
  },
  () => fullLevel,
);

ui.noteRepeat.addEventListener('click', repeat.toggleNoteRepeat);
subscribe((s, changed) => {
  if (changed.has('noteRepeat')) ui.noteRepeat.setAttribute('aria-pressed', String(s.noteRepeat));
});

ui.fullLevel.addEventListener('click', () => {
  fullLevel = !fullLevel;
  ui.fullLevel.setAttribute('aria-pressed', String(fullLevel));
});

ui.master.addEventListener('input', () => engine.setMasterVolume(Number(ui.master.value) / 100));
ui.master.addEventListener('change', () => saveMasterVolume(Number(ui.master.value) / 100));

// Stop the browser zooming / scrolling the page on double-tap or pinch.
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

bootKits(engine, (done, total) => setLast(`LOADING KIT ${done}/${total}`, `LOADING ${done}/${total}`))
  .then((master) => {
    if (master !== undefined) {
      ui.master.value = String(Math.round(master * 100));
      engine.setMasterVolume(master);
    }
    kitReady = true;
    if (engine.running) setLast(HINT, 'READY');
    else setLast('TAP A PAD TO START AUDIO', 'TAP TO START');
  })
  .catch((err: unknown) => {
    console.error(err);
    setLast('KIT FAILED TO LOAD — SEE CONSOLE', 'KIT ERROR');
  });

registerSW({ immediate: true });

// Dev-only handle for checking the engine and store from the browser console.
if (import.meta.env.DEV) Object.assign(window, { __drum: { engine, clock, seq, repeat, state, KITS, factoryKit, ...kitControl } });
