// AUDIO panel: the vocal pitch correction card (moved here from SETUP) and the WAV recording
// buttons (REC OUT and BOUNCE LOOP, the same as on MIX / FX and SEQ). Also drives the tablet
// header's VOX chip and the dot on the AUDIO tab while the mic is on or a recording runs.
// src/vocal/vocal.ts does the vocal work; src/ui/record.ts wires every REC OUT button.

import { KEY_NAMES } from '../keys/scales';
import { state, subscribe } from '../state';
import { hzToMidi, type VocalScale } from '../vocal/pitch';
import { SPEED_MAX, VOCAL_SCALES, vocalScaleName, type MicStatus } from '../vocal/types';
import * as vocal from '../vocal/vocal';
import { openBounceDialog } from './record';

/** The vocal card's mic row text, and a longer note under it when something is wrong. */
export const MIC_TEXT: Record<MicStatus, [string, string]> = {
  off: ['Mic off', ''],
  asking: ['Asking for the mic…', ''],
  on: ['Mic on', ''],
  denied: ['Mic blocked', 'The mic was blocked. Allow the microphone for this site in the browser settings, then switch this on again.'],
  nomic: ['No mic', 'No microphone was found, or another app is using it.'],
  unsupported: ['Not available', "This browser can't use the mic here."],
  error: ['Mic error', "The mic couldn't start. Switch it off and on again."],
};
const METER_FLOOR = -60; // dB at the left of the mic meter; the right is 0 dBFS

export function buildAudioPanel(app: HTMLElement): void {
  const panel = document.createElement('section');
  panel.className = 'audio-panel';
  panel.setAttribute('aria-label', 'Audio');
  panel.innerHTML = `
    <header class="su-head"><h1>AUDIO</h1></header>
    <section class="su-section" aria-labelledby="au-wav-h">
      <h2 id="au-wav-h">RECORD WAV</h2>
      <div class="su-card">
        <div class="su-row">
          <div class="su-title"><span class="su-name">Record what you hear</span><span class="su-sub">Pads, keys, loops and voice until you stop</span></div>
          <button class="mx-rec au-rec" data-learn="rec-out" aria-pressed="false" aria-label="Record the output to a WAV file"><span class="rec-dot" aria-hidden="true"></span>REC OUT</button>
        </div>
        <div class="su-row">
          <div class="su-title"><span class="su-name">Bounce a loop</span><span class="su-sub">The loop playing now, 1, 2 or 4 times, with the effect tails</span></div>
          <button class="mx-rec au-bounce">BOUNCE…</button>
        </div>
        <p class="su-hint">The metronome is never recorded. When a take ends, SAVE FILE or SHARE it.</p>
      </div>
    </section>
    <section class="su-section" aria-labelledby="au-vox-h">
      <h2 id="au-vox-h">AUTO-TUNE · VOICE</h2>
      <div class="su-card">
        <div class="su-row">
          <div class="su-title"><span class="su-name">Vocal pitch correction</span><span class="su-sub">Corrects your voice from the mic in real time</span></div>
          <button class="su-sw su-vox" data-learn="vocal" role="switch" aria-checked="false" aria-label="Vocal pitch correction"></button>
        </div>
        <div class="su-vbody">
          <div class="su-mic" data-mic="off">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg>
            <span class="su-mic-text" role="status">Mic off</span>
            <span class="su-mic-meter" aria-hidden="true"><span></span></span>
            <span class="su-mic-note" aria-label="Pitch heard and note it is pulled to"></span>
          </div>
          <p class="su-msg su-mic-msg" hidden></p>
          <p class="su-hint">Use headphones to stop the speaker feeding back into the mic.</p>
          <div class="su-pair">
            <label>KEY<select class="su-vkey">${KEY_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
            <label>SCALE<select class="su-vscale">${VOCAL_SCALES.map((id) => `<option value="${id}">${vocalScaleName(id)}</option>`).join('')}</select></label>
          </div>
          <button class="su-match">MATCH SCALE SNAP KEY</button>
          <label class="su-slider" data-learn="vocal-strength">
            <span class="su-row">Strength<output class="su-v-out su-str-val"></output></span>
            <input type="range" class="su-range su-str" min="0" max="100" step="1" aria-label="Strength in percent">
          </label>
          <label class="su-slider" data-learn="vocal-speed">
            <span class="su-row">Speed<output class="su-v-out su-spd-val"></output></span>
            <input type="range" class="su-range su-spd" min="0" max="${SPEED_MAX}" step="1" aria-label="Speed in milliseconds">
            <span class="su-ends"><span>Hard / robotic</span><span>Natural</span></span>
          </label>
          <label class="su-slider" data-learn="vox-send:reverb">
            <span class="su-row">VOX reverb send<output class="su-v-out su-vrv-val"></output></span>
            <input type="range" class="su-range su-vrv" min="0" max="100" step="1" aria-label="VOX reverb send in percent">
          </label>
          <label class="su-slider" data-learn="vox-send:delay">
            <span class="su-row">VOX delay send<output class="su-v-out su-vdl-val"></output></span>
            <input type="range" class="su-range su-vdl" min="0" max="100" step="1" aria-label="VOX delay send in percent">
          </label>
          <p class="su-hint">The voice plays through the VOX strip on MIX / FX, and REC OUT records it.</p>
        </div>
      </div>
    </section>`;
  app.appendChild(panel);

  const q = <T extends Element>(sel: string) => panel.querySelector(sel) as T;
  q<HTMLButtonElement>('.au-bounce').addEventListener('click', () => void openBounceDialog());

  // ---------- vocal card ----------

  const voxSw = q<HTMLButtonElement>('.su-vox');
  const vbody = q<HTMLElement>('.su-vbody');
  const micRow = q<HTMLElement>('.su-mic');
  const micText = q<HTMLElement>('.su-mic-text');
  const micMsg = q<HTMLElement>('.su-mic-msg');
  const micFill = q<HTMLElement>('.su-mic-meter span');
  const micNote = q<HTMLElement>('.su-mic-note');
  const vkey = q<HTMLSelectElement>('.su-vkey');
  const vscale = q<HTMLSelectElement>('.su-vscale');
  const vSliders = [
    { input: q<HTMLInputElement>('.su-str'), out: q<HTMLElement>('.su-str-val'), get: () => Math.round(state.vocal.strength * 100), text: (v: number) => `${v}%`, set: (v: number) => vocal.setStrength(v / 100) },
    { input: q<HTMLInputElement>('.su-spd'), out: q<HTMLElement>('.su-spd-val'), get: () => state.vocal.speed, text: (v: number) => `${v} ms`, set: vocal.setSpeed },
    { input: q<HTMLInputElement>('.su-vrv'), out: q<HTMLElement>('.su-vrv-val'), get: () => Math.round(state.vocal.reverbSend * 100), text: (v: number) => `${v}%`, set: (v: number) => vocal.setSend('reverb', v / 100) },
    { input: q<HTMLInputElement>('.su-vdl'), out: q<HTMLElement>('.su-vdl-val'), get: () => Math.round(state.vocal.delaySend * 100), text: (v: number) => `${v}%`, set: (v: number) => vocal.setSend('delay', v / 100) },
  ];

  // The tablet header's VOX chip is a second switch for the same thing.
  const voxChip = app.querySelector<HTMLButtonElement>('.vox-chip');
  const voxChipText = app.querySelector<HTMLElement>('.vox-text');
  const audioTab = app.querySelector<HTMLElement>('.tab.audio');

  for (const sw of [voxSw, voxChip]) sw?.addEventListener('click', vocal.toggleVocal);
  vkey.addEventListener('change', () => vocal.setKey(Number(vkey.value)));
  vscale.addEventListener('change', () => vocal.setScale(vscale.value as VocalScale));
  q<HTMLButtonElement>('.su-match').addEventListener('click', vocal.matchSnap);
  for (const s of vSliders) s.input.addEventListener('input', () => s.set(Number(s.input.value)));

  const renderVocal = () => {
    const v = state.vocal;
    voxSw.setAttribute('aria-checked', String(v.on));
    vbody.classList.toggle('off', !v.on);
    micRow.dataset.mic = v.mic;
    micText.textContent = MIC_TEXT[v.mic][0];
    micMsg.hidden = !MIC_TEXT[v.mic][1];
    micMsg.textContent = MIC_TEXT[v.mic][1];
    vkey.value = String(v.key);
    vscale.value = v.scale;
    for (const s of vSliders) {
      const n = s.get();
      if (document.activeElement !== s.input) s.input.value = String(n);
      s.out.textContent = s.text(n);
    }
    if (voxChip && voxChipText) {
      voxChip.setAttribute('aria-checked', String(v.on));
      voxChip.dataset.mic = v.mic;
      voxChipText.textContent = v.on ? 'VOX ON' : 'VOX OFF';
    }
    syncMeter();
  };

  // The mic meter and pitch readout redraw each frame while the card can be seen and the mic is on.
  let frame = 0;
  let noteText = '';
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const db = vocal.inputLevel();
    micFill.style.width = `${(Math.min(1, Math.max(0, (db - METER_FLOOR) / -METER_FLOOR)) * 100).toFixed(1)}%`;
    const { hz, target } = vocal.pitchInfo();
    const text = hz > 0 && target >= 0 ? `${vocal.noteName(Math.round(hzToMidi(hz)))}→${vocal.noteName(target)}` : '';
    if (text !== noteText) micNote.textContent = noteText = text;
  };
  function syncMeter(): void {
    const want = state.view === 'audio' && state.vocal.mic === 'on' && document.visibilityState === 'visible';
    if (want && !frame) frame = requestAnimationFrame(tick);
    else if (!want && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      micFill.style.width = '0%';
      micNote.textContent = noteText = '';
    }
  }
  document.addEventListener('visibilitychange', syncMeter);

  // A dot on the AUDIO tab while the mic is live or a recording runs, so it shows from every tab.
  const renderTabDot = () => audioTab?.toggleAttribute('data-live', state.vocal.on || state.recorder.mode !== 'off');

  renderVocal();
  renderTabDot();
  subscribe((_s, changed) => {
    if (changed.has('vocal')) renderVocal();
    if (changed.has('view')) syncMeter();
    if (changed.has('vocal') || changed.has('recorder')) renderTabDot();
  });
}
