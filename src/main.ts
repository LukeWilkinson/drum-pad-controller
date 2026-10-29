import './styles/tokens.css';
import './styles/app.css';
import './styles/kits.css';
import './styles/seq.css';
import './styles/setup.css';
import './styles/keys.css';
import './styles/mix.css';
import './styles/audio.css';
import './styles/micPanel.css';
import { registerSW } from 'virtual:pwa-register';
import { AudioEngine } from './audio/engine';
import * as clock from './audio/clock';
import * as latency from './audio/latency';
import * as userSamples from './audio/userSamples';
import * as recorder from './audio/recorder';
import * as vocal from './vocal/vocal';
import { initRecordUi } from './ui/record';
import * as seq from './seq/sequencer';
import * as repeat from './seq/repeat';
import * as midi from './midi/midi';
import * as midiOut from './midi/out';
import * as midiClock from './midi/clock';
import * as midiIn from './midi/in';
import * as learn from './midi/learn';
import * as hits from './pads/hits';
import { initHits } from './pads/hits';
import * as chordPads from './pads/chordPads';
import { PADS_PER_BANK } from './audio/kit';
import { KITS, factoryKit } from './audio/kits';
import * as kitControl from './kitControl';
import { bootKits, kitLabel } from './kitControl';
import * as mix from './mix/mix';
import { attachPadInput } from './pads/input';
import * as keys from './keys/keys';
import * as notes from './keys/notes';
import * as arp from './keys/arp';
import { attachKeysInput } from './keys/input';
import { buildKeysPanel } from './ui/keys';
import { state, subscribe } from './state';
import { applyKit, buildPads } from './ui/pads';
import { buildKitsPanel } from './ui/kits';
import { buildMixPanel } from './ui/mix';
import { buildAudioPanel } from './ui/audio';
import { initMicRec } from './ui/micRec';
import { buildScreen } from './ui/screen';
import { buildSeqPanel } from './ui/seq';
import { buildSetupPanel } from './ui/setup';
import { initRail } from './ui/rail';
import { initTransport } from './ui/transport';
import { initViews } from './ui/views';
import { applyTheme } from './ui/theme';

const HINT = 'HIT A PAD — PRESS HIGHER TO HIT HARDER';

applyTheme(); // before anything is drawn, so there is no flash of the wrong theme
const ui = buildScreen(document.getElementById('app')!);
const padEls = buildPads(ui.padwell);
const engine = new AudioEngine();
void mix.initMix(engine); // the saved mixer and FX settings
void userSamples.initUserSamples(engine); // the imported samples list (kits load their audio themselves)
clock.initClock(engine);
latency.initLatency(engine);
seq.initSequencer(engine);
seq.loadSong(); // the saved loops and tempo; independent of the kit loading below
repeat.initRepeat(engine);
initTransport(ui);
applyKit(padEls, KITS[0].pads); // colours straight away; replaced if a different kit is restored
buildKitsPanel(ui.app, engine);
buildSeqPanel(ui.app, engine);
buildSetupPanel(ui.app, ui);
buildMixPanel(ui.app, engine);
buildAudioPanel(ui.app);
recorder.initRecorder(engine);
vocal.initVocal(engine); // the saved vocal settings; the mic stays off until its switch
initRecordUi(ui.app); // after the MIX and AUDIO panels: it wires their REC OUT buttons
const keysBoard = buildKeysPanel(ui.app, { onBend: notes.bend });
const instrument = keys.initKeys(engine); // after initClock: Tone runs on the engine's context
seq.attachKeys(instrument); // loops play their KEYS notes on it
notes.initNotes(instrument);
arp.initArp(engine, instrument);
initHits(engine, ui, padEls);
chordPads.initChordPads(padEls);
initMicRec(engine, ui); // REC MIC can take pad hits, so after initHits
midiOut.initOut(engine, instrument);
midiClock.initMidiClock(engine);
midiIn.initIn(ui);
learn.initLearn(ui);
void midi.initMidi(); // the saved MIDI settings; reconnects if MIDI was on last time
initViews(ui);
initRail(ui.app.querySelector('.rail-right')!, engine);

/** Pad index each screen pad was pressed as (bank × 16 + screen index), or CHORD_HELD for a chord pad. */
const heldPad: number[] = [];
const CHORD_HELD = -1;
let kitReady = false;

subscribe((s, changed) => {
  if (changed.has('kit') || changed.has('edited')) ui.kitName.textContent = kitLabel(s.kit, s.edited);
  if (s.chordPads) {
    if (changed.has('chordPads') || changed.has('keys')) chordPads.showLabels();
  } else if (s.kit && (changed.has('kit') || changed.has('pads') || changed.has('bank') || changed.has('chordPads'))) applyKit(padEls, s.kit.pads, s.bank);
  if (changed.has('kit') || changed.has('pads') || changed.has('selectedPad')) ui.selName.textContent = hits.padTitle(s.selectedPad);
  if (changed.has('bank') || changed.has('chordPads')) {
    ui.banks.forEach((b, i) => b.setAttribute('aria-pressed', String(!s.chordPads && i === s.bank)));
    ui.chordBank.setAttribute('aria-pressed', String(s.chordPads));
  }
});

ui.banks.forEach((b, i) => b.addEventListener('click', () => kitControl.selectBank(i)));
ui.chordBank.addEventListener('click', kitControl.selectChordPads);

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
      if (state.chordPads) {
        heldPad[screenIndex] = CHORD_HELD;
        chordPads.hit(screenIndex, velocity);
        return;
      }
      const index = state.bank * PADS_PER_BANK + screenIndex;
      heldPad[screenIndex] = index; // a bank switch mid-hold still releases the right pad
      hits.hit(index, velocity);
    },
    onRelease(screenIndex) {
      if (heldPad[screenIndex] === CHORD_HELD) chordPads.release(screenIndex);
      else hits.release(heldPad[screenIndex]);
    },
    onMove(screenIndex, velocity) {
      if (heldPad[screenIndex] !== CHORD_HELD) hits.move(heldPad[screenIndex], velocity);
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

// The rail's master slider is the MASTER strip's fader (0–100 = fader position).
ui.master.addEventListener('input', () => mix.setLevel('master', Number(ui.master.value) / 100));
subscribe((s, changed) => {
  if (changed.has('mix')) ui.master.value = String(Math.round(s.mix.strips.master.level * 100));
});

// Stop the browser zooming / scrolling the page on double-tap or pinch.
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

bootKits(engine, (done, total) => hits.setLast(`LOADING KIT ${done}/${total}`, `LOADING ${done}/${total}`))
  .then(() => {
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
if (import.meta.env.DEV) Object.assign(window, { __drum: { engine, clock, latency, seq, repeat, midi, learn, state, KITS, factoryKit, keys, notes, arp, instrument, mix, userSamples, recorder, vocal, ...kitControl } });
