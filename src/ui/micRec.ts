// REC MIC: record a sound from the mic onto a pad. The only code that changes `state.micArm`.
// The mic button in the LCD (or RECORD… on the AUDIO tab) arms it; the next pad tapped (touch or PC
// key, not MIDI) opens the record panel for that pad instead of playing (src/pads/hits.ts setClaim).
// The panel (src/ui/micPanel.ts) records, plays, trims and saves the take; the mic button or the
// `rec-mic` learn target stops a take that is recording.

import type { AudioEngine } from '../audio/engine';
import { PADS_PER_BANK } from '../audio/kit';
import * as recorder from '../audio/recorder';
import * as hits from '../pads/hits';
import { state, subscribe, update } from '../state';
import { escapeHtml, openDialog } from './dialog';
import { initMicPanel, openMicPanel } from './micPanel';
import type { ScreenRefs } from './screen';

let ui: ScreenRefs;

export function initMicRec(e: AudioEngine, refs: ScreenRefs): void {
  ui = refs;
  initMicPanel(e);
  hits.setClaim(claimHit);
  ui.micBtn.addEventListener('click', toggleMic);
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
  if (!state.micArm) return false;
  update({ micArm: false });
  openMicPanel(index);
  return true;
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
