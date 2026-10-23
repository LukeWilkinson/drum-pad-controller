// REC MIC: record a sound from the mic onto a pad. The only code that changes `state.micArm`.
// The mic button in the LCD (or RECORD… on the AUDIO tab) arms it; the next pad tapped (touch or PC
// key, not MIDI) records the mic for that pad instead of playing (src/pads/hits.ts setClaim). Tapping
// that pad again, the mic button or STOP on the status bar ends the take (src/audio/recorder.ts).
// The take is trimmed and levelled like an import (src/audio/userSamples.ts addRecording), then a
// review dialog offers PLAY / RETRY / CANCEL / USE ON PAD, and USE offers to save the kit as new.

import type { AudioEngine } from '../audio/engine';
import { PADS_PER_BANK, padLabel } from '../audio/kit';
import * as recorder from '../audio/recorder';
import { ImportError, addRecording, removeSample } from '../audio/userSamples';
import { swapSample } from '../kitControl';
import * as hits from '../pads/hits';
import { state, subscribe, update } from '../state';
import { escapeHtml, openDialog } from './dialog';
import { openSaveKitDialog } from './saveKit';
import type { ScreenRefs } from './screen';

let engine: AudioEngine;
let ui: ScreenRefs;

export function initMicRec(e: AudioEngine, refs: ScreenRefs): void {
  engine = e;
  ui = refs;
  hits.setClaim(claimHit);
  ui.micBtn.addEventListener('click', toggleMic);
  recorder.onMicTake((take) => void review(take));
  subscribe((s, changed) => {
    // The pads aren't on screen in the other views, so arming ends there.
    if (changed.has('view') && s.view !== 'pads' && s.micArm) armMic(false);
    if (changed.has('micArm') || changed.has('recorder') || changed.has('bank')) render();
  });
  render();
}

/** The LCD mic button and the `rec-mic` learn target: arm, disarm, or end the take. */
export function toggleMic(): void {
  if (state.recorder.mode === 'mic') recorder.stopRecording();
  else armMic(!state.micArm);
}

/** Arms (or disarms) REC MIC. Arming shows the pads first and is refused while another recording runs. */
export function armMic(on: boolean): void {
  if (on && state.recorder.mode !== 'off') {
    void notice('A recording is already running. Stop it first.');
    return;
  }
  if (on && state.view !== 'pads') update({ view: 'pads' });
  if (on === state.micArm) return;
  update({ micArm: on });
  if (on) hits.setLast('REC MIC · TAP THE PAD TO RECORD ONTO', 'TAP A PAD');
  else hits.setLast('REC MIC OFF', 'MIC OFF');
}

/** A touch / key pad hit: true when REC MIC took it (so it doesn't play). */
function claimHit(index: number): boolean {
  if (state.recorder.mode === 'mic') {
    if (state.recorder.pad !== index) return false; // other pads still play during a take
    recorder.stopRecording();
    return true;
  }
  if (!state.micArm) return false;
  update({ micArm: false });
  void start(index); // inside the tap, so the browser may show its mic prompt
  return true;
}

async function start(pad: number): Promise<void> {
  hits.setLast(`REC MIC → PAD ${padLabel(pad)} · ASKING FOR THE MIC…`, 'MIC…');
  try {
    await recorder.recordMic(pad);
    if (state.recorder.mode === 'mic') hits.setLast(`REC MIC → PAD ${padLabel(pad)} · TAP IT AGAIN TO STOP`, 'RECORDING');
    else hits.setLast('REC MIC OFF', 'MIC OFF'); // stopped while the browser asked for the mic
  } catch (err) {
    if (!(err instanceof recorder.RecordError)) console.error(err);
    hits.setLast('REC MIC OFF', 'MIC OFF');
    await notice(err instanceof recorder.RecordError ? err.message : "The mic couldn't start.");
  }
}

async function review(take: recorder.MicTake): Promise<void> {
  const pad = take.pad;
  // A dialog already open waits to close first (the dialog is shared).
  while (document.querySelector('dialog[open]')) await new Promise((r) => setTimeout(r, 300));

  let result;
  try {
    result = await addRecording(take.channels, take.rate);
  } catch (err) {
    if (!(err instanceof ImportError)) console.error(err);
    hits.setLast('REC MIC · NOTHING KEPT', 'NOTHING KEPT');
    const res = await openDialog(`
      <h2>MIC TAKE</h2>
      <p>${escapeHtml(err instanceof ImportError ? err.message : "The take couldn't be stored.")}</p>
      <div class="dlg-btns">
        <button value="cancel" class="kp-btn">CANCEL</button>
        <button value="retry" class="kp-btn primary">RETRY</button>
      </div>`);
    if (res.value === 'retry') void start(pad);
    return;
  }

  const { sample, added } = result;
  hits.setLast(`REC MIC → PAD ${padLabel(pad)} · ${sample.name.toUpperCase()} READY`, 'TAKE READY');
  const res = await openDialog(
    `<h2>MIC TAKE → PAD ${padLabel(pad)}</h2>
    <p class="rec-file">${escapeHtml(sample.name)} · ${sample.seconds.toFixed(1)} s</p>
    <p class="sh-hint">Silence trimmed and the level evened out. Use headphones, or the pads and the click get recorded too.</p>
    <div class="dlg-btns">
      <button value="cancel" class="kp-btn">CANCEL</button>
      <button value="retry" class="kp-btn">RETRY</button>
      <button type="button" class="kp-btn mr-play">PLAY</button>
      <button value="use" class="kp-btn primary">USE ON PAD</button>
    </div>`,
    (btn) => {
      if (btn.classList.contains('mr-play')) engine.preview(sample.id).catch(console.error);
    },
  );

  if (res.value === 'use') {
    await swapSample(pad, sample.id, sample.name);
    engine.play(pad, 100);
    hits.setLast(`${hits.padTitle(pad)} · NEW SOUND`, `${sample.name.toUpperCase()}`);
    await openSaveKitDialog(true);
    return;
  }
  // CANCEL or RETRY: the take is dropped (unless the same sound was already stored for something else).
  if (added) await removeSample(sample.id).catch((err: unknown) => console.warn('[mic]', err));
  if (res.value === 'retry') void start(pad);
  else hits.setLast('REC MIC · TAKE DROPPED', 'DROPPED');
}

function render(): void {
  const recording = state.recorder.mode === 'mic';
  ui.micBtn.setAttribute('aria-pressed', String(state.micArm || recording));
  ui.micBtn.classList.toggle('recording', recording);
  ui.micBtn.setAttribute('aria-label', recording ? 'Stop the mic recording' : 'Record a sound from the mic onto a pad');
  ui.app.toggleAttribute('data-mic-arm', state.micArm);
  const pad = recording ? state.recorder.pad : undefined;
  [...ui.padwell.children].forEach((el, i) => {
    el.classList.toggle('mic-rec', pad !== undefined && pad === state.bank * PADS_PER_BANK + i);
  });
}

async function notice(text: string): Promise<void> {
  await openDialog(`<h2>REC MIC</h2><p>${escapeHtml(text)}</p><div class="dlg-btns"><button value="ok" class="kp-btn primary">OK</button></div>`);
}
