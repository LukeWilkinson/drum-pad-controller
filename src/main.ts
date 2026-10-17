import './styles/tokens.css';
import './styles/app.css';
import './styles/kits.css';
import { registerSW } from 'virtual:pwa-register';
import { AudioEngine } from './audio/engine';
import * as clock from './audio/clock';
import * as seq from './seq/sequencer';
import { padNumber } from './audio/kit';
import { KITS, factoryKit } from './audio/kits';
import * as kitControl from './kitControl';
import { bootKits, kitLabel, saveMasterVolume } from './kitControl';
import { attachPadInput } from './pads/input';
import { state, subscribe, update } from './state';
import { applyKit, buildPads, showHit, showRelease } from './ui/pads';
import { buildKitsPanel } from './ui/kits';
import { buildScreen } from './ui/screen';
import { initRail } from './ui/rail';
import { initTransport } from './ui/transport';
import { initViews } from './ui/views';

const HINT = 'HIT A PAD — PRESS HIGHER TO HIT HARDER';

const ui = buildScreen(document.getElementById('app')!);
const padEls = buildPads(ui.padwell);
const engine = new AudioEngine();
clock.initClock(engine);
seq.initSequencer(engine);
initTransport(ui);
applyKit(padEls, KITS[0].pads); // colours straight away; replaced if a different kit is restored
buildKitsPanel(ui.app, engine);
initViews(ui);
initRail(ui.app.querySelector('.rail-right')!, engine);

let fullLevel = false;
let kitReady = false;
let hasHit = false;

function setLast(text: string, inline = text): void {
  ui.lastLine.textContent = text;
  ui.lastInline.textContent = inline;
}

function padTitle(index: number): string {
  const name = state.kit?.pads[index].name ?? '';
  return `PAD ${String(padNumber(index)).padStart(2, '0')} · ${name.toUpperCase()}`;
}

subscribe((s, changed) => {
  if (changed.has('kit') || changed.has('edited')) ui.kitName.textContent = kitLabel(s.kit, s.edited);
  if (s.kit && (changed.has('kit') || changed.has('pads'))) applyKit(padEls, s.kit.pads);
  if (changed.has('kit') || changed.has('pads') || changed.has('selectedPad')) ui.selName.textContent = padTitle(s.selectedPad);
});

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
    onHit(index, velocity) {
      engine.play(index, velocity); // audio first
      seq.recordHit(index, velocity);
      showHit(padEls[index], velocity);
      hasHit = true;
      const name = state.kit?.pads[index].name.toUpperCase() ?? '';
      setLast(`${padTitle(index)} · VEL ${velocity}`, `${name} · VEL ${velocity}`);
      update({ selectedPad: index });
    },
    onRelease(index) {
      showRelease(padEls[index]);
    },
  },
  () => fullLevel,
);

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
if (import.meta.env.DEV) Object.assign(window, { __drum: { engine, clock, seq, state, KITS, factoryKit, ...kitControl } });
