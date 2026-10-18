import './styles/tokens.css';
import './styles/app.css';
import './styles/kits.css';
import './styles/seq.css';
import './styles/setup.css';
import './styles/keys.css';
import { registerSW } from 'virtual:pwa-register';
import { AudioEngine } from './audio/engine';
import * as clock from './audio/clock';
import * as seq from './seq/sequencer';
import * as repeat from './seq/repeat';
import * as midi from './midi/midi';
import * as midiOut from './midi/out';
import * as midiClock from './midi/clock';
import * as midiIn from './midi/in';
import * as learn from './midi/learn';
import { initTargets } from './midi/targets';
import * as hits from './pads/hits';
import { initHits } from './pads/hits';
import { PADS_PER_BANK } from './audio/kit';
import { KITS, factoryKit } from './audio/kits';
import * as kitControl from './kitControl';
import { bootKits, kitLabel, saveMasterVolume } from './kitControl';
import { attachPadInput } from './pads/input';
import * as keys from './keys/keys';
import * as notes from './keys/notes';
import * as arp from './keys/arp';
import { attachKeysInput } from './keys/input';
import { buildKeysPanel } from './ui/keys';
import { state, subscribe } from './state';
import { applyKit, buildPads } from './ui/pads';
import { buildKitsPanel } from './ui/kits';
import { buildScreen } from './ui/screen';
import { buildSeqPanel } from './ui/seq';
import { buildSetupPanel } from './ui/setup';
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
buildSetupPanel(ui.app, ui);
const keysBoard = buildKeysPanel(ui.app, { onBend: notes.bend });
const instrument = keys.initKeys(engine); // after initClock: Tone runs on the engine's context
notes.initNotes(instrument);
arp.initArp(engine, instrument);
initHits(engine, ui, padEls);
midiOut.initOut(engine);
midiClock.initMidiClock(engine);
midiIn.initIn(ui);
initTargets(engine, ui);
learn.initLearn(ui);
void midi.initMidi(); // the saved MIDI settings; reconnects if MIDI was on last time
initViews(ui);
initRail(ui.app.querySelector('.rail-right')!, engine);

/** Pad index each screen pad was pressed as (bank × 16 + screen index). */
const heldPad: number[] = [];
let kitReady = false;

subscribe((s, changed) => {
  if (changed.has('kit') || changed.has('edited')) ui.kitName.textContent = kitLabel(s.kit, s.edited);
  if (s.kit && (changed.has('kit') || changed.has('pads') || changed.has('bank'))) applyKit(padEls, s.kit.pads, s.bank);
  if (changed.has('kit') || changed.has('pads') || changed.has('selectedPad')) ui.selName.textContent = hits.padTitle(s.selectedPad);
  if (changed.has('bank')) ui.banks.forEach((b, i) => b.setAttribute('aria-pressed', String(i === s.bank)));
});

ui.banks.forEach((b, i) => b.addEventListener('click', () => kitControl.selectBank(i)));

hits.setLast('LOADING KIT…', 'LOADING…');

// Mobile browsers only start audio after a user gesture. Any tap or key unlocks it.
const unlock = () => {
  engine.unlock().then(() => {
    if (kitReady && !hits.hasHit()) hits.setLast(HINT, 'READY');
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
      hits.hit(index, velocity);
    },
    onRelease(screenIndex) {
      hits.release(heldPad[screenIndex]);
    },
    onMove(screenIndex, velocity) {
      hits.move(heldPad[screenIndex], velocity);
    },
  },
  () => state.fullLevel,
);

attachKeysInput(keysBoard, { onDown: notes.noteOn, onUp: notes.noteOff, onOctave: keys.nudgeOctave });

// With "Play sounds in app" off the app is silent, so only mute while an output device is connected.
subscribe((s, changed) => {
  if (!changed.has('midi')) return;
  const m = s.midi;
  const connected = m.status === 'ready' && m.output !== null && m.outputs.includes(m.output);
  engine.localSound = m.localSound || !connected;
});

ui.noteRepeat.addEventListener('click', repeat.toggleNoteRepeat);
subscribe((s, changed) => {
  if (changed.has('noteRepeat')) ui.noteRepeat.setAttribute('aria-pressed', String(s.noteRepeat));
});

ui.fullLevel.addEventListener('click', hits.toggleFullLevel);
subscribe((s, changed) => {
  if (changed.has('fullLevel')) ui.fullLevel.setAttribute('aria-pressed', String(s.fullLevel));
});

ui.master.addEventListener('input', () => engine.setMasterVolume(Number(ui.master.value) / 100));
ui.master.addEventListener('change', () => saveMasterVolume(Number(ui.master.value) / 100));

// Stop the browser zooming / scrolling the page on double-tap or pinch.
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

bootKits(engine, (done, total) => hits.setLast(`LOADING KIT ${done}/${total}`, `LOADING ${done}/${total}`))
  .then((master) => {
    if (master !== undefined) {
      ui.master.value = String(Math.round(master * 100));
      engine.setMasterVolume(master);
    }
    kitReady = true;
    if (engine.running) hits.setLast(HINT, 'READY');
    else hits.setLast('TAP A PAD TO START AUDIO', 'TAP TO START');
  })
  .catch((err: unknown) => {
    console.error(err);
    hits.setLast('KIT FAILED TO LOAD — SEE CONSOLE', 'KIT ERROR');
  });

registerSW({ immediate: true });

// Dev-only handle for checking the engine and store from the browser console.
if (import.meta.env.DEV) Object.assign(window, { __drum: { engine, clock, seq, repeat, midi, learn, state, KITS, factoryKit, keys, notes, arp, instrument, ...kitControl } });
