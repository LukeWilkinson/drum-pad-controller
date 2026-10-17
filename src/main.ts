import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { AudioEngine } from './audio/engine';
import { PADS, padNumber } from './audio/kit';
import { attachPadInput } from './pads/input';
import { buildPads, showHit, showRelease } from './ui/pads';
import { buildScreen } from './ui/screen';

const HINT = 'HIT A PAD — PRESS HIGHER TO HIT HARDER';

const ui = buildScreen(document.getElementById('app')!);
const padEls = buildPads(ui.padwell);
const engine = new AudioEngine();

let fullLevel = false;
let kitReady = false;
let hasHit = false;

function setLast(text: string, inline = text): void {
  ui.lastLine.textContent = text;
  ui.lastInline.textContent = inline;
}

function setSelected(index: number): void {
  const num = String(padNumber(index)).padStart(2, '0');
  ui.selName.textContent = `PAD ${num} · ${PADS[index].name.toUpperCase()}`;
}

setLast('LOADING KIT…', 'LOADING…');
setSelected(12); // Kick

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
      showHit(padEls[index], velocity);
      hasHit = true;
      const name = PADS[index].name.toUpperCase();
      const num = String(padNumber(index)).padStart(2, '0');
      setLast(`PAD ${num} · ${name} · VEL ${velocity}`, `${name} · VEL ${velocity}`);
      setSelected(index);
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

// REC only toggles its look in milestone 1; recording arrives in milestone 3.
ui.rec.addEventListener('click', () => {
  ui.rec.setAttribute('aria-pressed', String(ui.rec.getAttribute('aria-pressed') !== 'true'));
});

ui.master.addEventListener('input', () => engine.setMasterVolume(Number(ui.master.value) / 100));

// Stop the browser zooming / scrolling the page on double-tap or pinch.
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

engine
  .loadKit((done, total) => setLast(`LOADING KIT ${done}/${total}`, `LOADING ${done}/${total}`))
  .then(() => {
    kitReady = true;
    if (engine.running) setLast(HINT, 'READY');
    else setLast('TAP A PAD TO START AUDIO', 'TAP TO START');
  })
  .catch((err: unknown) => {
    console.error(err);
    setLast('KIT FAILED TO LOAD — SEE CONSOLE', 'KIT ERROR');
  });

registerSW({ immediate: true });
