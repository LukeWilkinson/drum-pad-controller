// SETUP panel (Settings.dc.html): the MIDI, latency, AUTO-TUNE (Scale snap and Vocal pitch correction)
// and theme cards. Built once; render() updates it from the store. Also drives the tablet header's MIDI
// chip. The MIDI code does the work (src/midi/midi.ts, and src/midi/learn.ts for the MIDI LEARN button
// and the mappings list); src/keys/keys.ts owns the snap settings and src/vocal/vocal.ts the vocal ones.

import * as latency from '../audio/latency';
import * as theme from './theme';
import { THEMES, THEME_NAMES, type PadColours, type ThemeId } from './themeTypes';
import { OFFSET_MAX, OFFSET_MIN } from '../audio/latencyTypes';
import * as keys from '../keys/keys';
import { KEY_NAMES, SCALES, SCALE_IDS, type ScaleId } from '../keys/scales';
import { toggleLearn } from '../midi/learn';
import * as midi from '../midi/midi';
import { messageLabel, targetLabel } from '../midi/targets';
import type { MidiState } from '../midi/types';
import { state, subscribe } from '../state';
import { hzToMidi, type VocalScale } from '../vocal/pitch';
import { SPEED_MAX, VOCAL_SCALES, vocalScaleName, type MicStatus } from '../vocal/types';
import * as vocal from '../vocal/vocal';
import { escapeHtml } from './dialog';
import type { ScreenRefs } from './screen';

const MESSAGES: Partial<Record<MidiState['status'], string>> = {
  unsupported: "Web MIDI isn't available in this browser. Use Chrome or Edge.",
  denied: 'MIDI was blocked. Allow MIDI for this site in the browser settings, then switch it on again.',
  requesting: 'Waiting for the browser to allow MIDI…',
};

const channelLabel = (n: number) => (n === 10 ? '10 · DRUMS' : String(n));

/** The vocal card's mic row text, and a longer note under it when something is wrong. */
const MIC_TEXT: Record<MicStatus, [string, string]> = {
  off: ['Mic off', ''],
  asking: ['Asking for the mic…', ''],
  on: ['Mic on', ''],
  denied: ['Mic blocked', 'The mic was blocked. Allow the microphone for this site in the browser settings, then switch this on again.'],
  nomic: ['No mic', 'No microphone was found, or another app is using it.'],
  unsupported: ['Not available', "This browser can't use the mic here."],
  error: ['Mic error', "The mic couldn't start. Switch it off and on again."],
};
const METER_FLOOR = -60; // dB at the left of the mic meter; the right is 0 dBFS

/** <option>s for a device list: None, the connected devices, and the chosen one if it is unplugged. */
function deviceOptions(names: string[], chosen: string | null): string {
  const missing = chosen !== null && !names.includes(chosen);
  const opt = (value: string, label: string, selected: boolean) =>
    `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  return [
    opt('', 'None', chosen === null),
    ...names.map((n) => opt(n, n, n === chosen)),
    ...(missing ? [opt(chosen!, `${chosen} (not connected)`, true)] : []),
  ].join('');
}

export function buildSetupPanel(app: HTMLElement, ui: ScreenRefs): void {
  const panel = document.createElement('section');
  panel.className = 'setup-panel';
  panel.setAttribute('aria-label', 'Setup');
  panel.innerHTML = `
    <header class="su-head"><h1>SETUP</h1></header>
    <section class="su-section" aria-labelledby="su-midi-h">
      <h2 id="su-midi-h">MIDI</h2>
      <div class="su-card">
        <div class="su-row">MIDI<button class="su-sw" role="switch" aria-checked="false" aria-label="MIDI"></button></div>
        <p class="su-msg" role="status" hidden></p>
        <div class="su-devices">
          <label class="su-row">Output<select class="su-out"></select></label>
          <label class="su-row">Input<select class="su-in"></select></label>
          <label class="su-row">Pads channel
            <select class="su-chan">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${channelLabel(i + 1)}</option>`).join('')}</select>
          </label>
          <label class="su-row">Keys channel
            <select class="su-kchan">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${channelLabel(i + 1)}</option>`).join('')}</select>
          </label>
          <div class="su-row">Play sounds in app<button class="su-sw su-local" role="switch" aria-checked="true" aria-label="Play sounds in app"></button></div>
          <div class="su-row">Send MIDI clock<button class="su-sw su-clock" role="switch" aria-checked="false" aria-label="Send MIDI clock"></button></div>
          <button class="su-learn" aria-pressed="false">MIDI LEARN</button>
          <p class="su-hint">Tap MIDI Learn, touch a pad, knob or button in the app, then move a control on your hardware.</p>
          <ul class="su-maps" aria-label="MIDI mappings"></ul>
          <p class="su-hint">Notes 36–99 play the pads: A1–A16 are 36–51, then B, C and D. A learned note takes over from this. Pads go out on the Pads channel. Notes, pitch bend and sustain (CC 64) on the Keys channel play KEYS, and KEYS goes out on that channel; every other channel plays pads.</p>
        </div>
      </div>
    </section>
    <section class="su-section" aria-labelledby="su-lat-h">
      <h2 id="su-lat-h">AUDIO &amp; LATENCY</h2>
      <div class="su-card">
        <div class="su-row">
          <div class="su-title"><span class="su-name">Measured</span><span class="su-sub su-lat-src"></span></div>
          <output class="su-lcd" aria-live="polite"></output>
        </div>
        <button class="su-learn su-cal" aria-pressed="false">CALIBRATE · TAP ALONG TO 8 CLICKS</button>
        <button class="su-tap" hidden>TAP ON EACH CLICK</button>
        <p class="su-hint su-cal-msg" role="status" hidden></p>
        <button class="su-link su-reset" hidden>Reset to automatic</button>
        <label class="su-slider">
          <span class="su-row">Manual offset<output class="su-off-val"></output></span>
          <input type="range" class="su-off" min="${OFFSET_MIN}" max="${OFFSET_MAX}" step="1" value="0" aria-label="Manual offset in milliseconds">
        </label>
        <p class="su-hint">Raise it if recorded hits land late. Double-tap the slider to reset it to 0.</p>
        <div class="su-row">
          <div class="su-title"><span class="su-name">Low-latency mode</span><span class="su-sub">Off uses a bigger buffer: fewer crackles on slow phones</span></div>
          <button class="su-sw su-low" role="switch" aria-checked="true" aria-label="Low-latency mode"></button>
        </div>
        <div class="su-row su-reload" hidden>Applies after a reload<button class="su-learn su-reload-btn">RELOAD</button></div>
      </div>
    </section>
    <section class="su-section" aria-labelledby="su-tune-h">
      <h2 id="su-tune-h">AUTO-TUNE</h2>
      <div class="su-card">
        <div class="su-row">
          <div class="su-title"><span class="su-name">Scale snap</span><span class="su-sub">Notes played on KEYS snap to the key and scale</span></div>
          <button class="su-sw su-snap" role="switch" aria-checked="false" aria-label="Scale snap"></button>
        </div>
        <div class="su-pair">
          <label>KEY<select class="su-key">${KEY_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select></label>
          <label>SCALE<select class="su-scale">${SCALE_IDS.map((id) => `<option value="${id}">${SCALES[id].name}</option>`).join('')}</select></label>
        </div>
      </div>
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
    </section>
    <section class="su-section" aria-labelledby="su-theme-h">
      <h2 id="su-theme-h">THEME</h2>
      <div class="su-card">
        <div class="su-opts su-themes" role="group" aria-label="Theme">${THEMES.map((id) => `<button class="su-opt" data-theme-id="${id}" aria-pressed="false">${THEME_NAMES[id]}</button>`).join('')}</div>
        <div class="su-title"><span class="su-name">Pad colours</span></div>
        <div class="su-opts" role="group" aria-label="Pad colours">
          <button class="su-opt su-padc" data-pads="type" aria-pressed="true">By drum type</button>
          <button class="su-opt su-padc" data-pads="single" aria-pressed="false">Single colour</button>
        </div>
        <div class="su-row">
          <div class="su-title"><span class="su-name">Vibrate on hit</span><span class="su-sub su-vib-sub">A short buzz when a pad is touched</span></div>
          <button class="su-sw su-vib" role="switch" aria-checked="false" aria-label="Vibrate on hit"></button>
        </div>
      </div>
    </section>`;
  app.appendChild(panel);

  const q = <T extends Element>(sel: string) => panel.querySelector(sel) as T;
  const power = q<HTMLButtonElement>('.su-sw');
  const msg = q<HTMLElement>('.su-msg');
  const devices = q<HTMLElement>('.su-devices');
  const out = q<HTMLSelectElement>('.su-out');
  const inp = q<HTMLSelectElement>('.su-in');
  const chan = q<HTMLSelectElement>('.su-chan');
  const kchan = q<HTMLSelectElement>('.su-kchan');
  const local = q<HTMLButtonElement>('.su-local');
  const clock = q<HTMLButtonElement>('.su-clock');
  const learnBtn = q<HTMLButtonElement>('.su-learn');
  const maps = q<HTMLUListElement>('.su-maps');
  const snapSw = q<HTMLButtonElement>('.su-snap');
  const snapPair = q<HTMLElement>('.su-pair');
  const keySel = q<HTMLSelectElement>('.su-key');
  const scaleSel = q<HTMLSelectElement>('.su-scale');

  const themeBtns = [...panel.querySelectorAll<HTMLButtonElement>('.su-opt[data-theme-id]')];
  const padBtns = [...panel.querySelectorAll<HTMLButtonElement>('.su-padc')];
  const vibSw = q<HTMLButtonElement>('.su-vib');

  const calBtn = q<HTMLButtonElement>('.su-cal');
  const tapBtn = q<HTMLButtonElement>('.su-tap');
  const calMsg = q<HTMLElement>('.su-cal-msg');
  const resetBtn = q<HTMLButtonElement>('.su-reset');
  const lcd = q<HTMLElement>('.su-lcd');
  const latSrc = q<HTMLElement>('.su-lat-src');
  const offSlider = q<HTMLInputElement>('.su-off');
  const offVal = q<HTMLElement>('.su-off-val');
  const lowSw = q<HTMLButtonElement>('.su-low');
  const reloadRow = q<HTMLElement>('.su-reload');
  const runningLow = state.latency.low; // what the audio context was created with

  calBtn.addEventListener('click', () => void latency.startCalibration());
  tapBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    latency.tap(e.timeStamp);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || latency.calibration().phase !== 'running') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    latency.tap(e.timeStamp);
  }, true);
  resetBtn.addEventListener('click', latency.resetMeasured);
  offSlider.addEventListener('input', () => latency.setOffset(Number(offSlider.value)));
  let lastOffTap = 0;
  offSlider.addEventListener('pointerdown', (e) => {
    if (e.timeStamp - lastOffTap < 350) {
      latency.setOffset(0);
      e.preventDefault();
    }
    lastOffTap = e.timeStamp;
  });
  lowSw.addEventListener('click', () => latency.setLow(!state.latency.low));
  q<HTMLButtonElement>('.su-reload-btn').addEventListener('click', () => location.reload());

  const renderLatency = () => {
    const l = state.latency;
    const eng = Math.round((state.latency.measured === null ? latency.browserDelay() : 0) * 1000);
    lcd.textContent = l.measured !== null ? `${l.measured} ms` : `${eng} ms`;
    latSrc.textContent = l.measured !== null ? 'From calibration' : 'Automatic (from the browser)';
    resetBtn.hidden = l.measured === null;
    offSlider.value = String(l.offset);
    offVal.textContent = `${l.offset > 0 ? '+' : ''}${l.offset} ms`;
    setSwitch(lowSw, l.low);
    reloadRow.hidden = l.low === runningLow;
  };
  const renderCal = (c: latency.CalState) => {
    const running = c.phase === 'running';
    calBtn.hidden = running;
    tapBtn.hidden = !running;
    if (c.phase === 'running') tapBtn.textContent = `TAP ON EACH CLICK · ${c.taps}/${latency.CLICKS}`;
    calMsg.hidden = c.phase !== 'failed' && c.phase !== 'done';
    if (c.phase === 'failed') calMsg.textContent = c.reason;
    if (c.phase === 'done') calMsg.textContent = `Measured ${c.ms} ms. Recorded hits now use it.`;
  };
  latency.onCalibration(renderCal);

  for (const b of themeBtns) b.addEventListener('click', () => theme.setTheme(b.dataset.themeId as ThemeId));
  for (const b of padBtns) b.addEventListener('click', () => theme.setPads(b.dataset.pads as PadColours));
  vibSw.addEventListener('click', () => theme.setVibrate(!state.theme.vibrate));
  if (!theme.canVibrate()) {
    vibSw.disabled = true;
    q<HTMLElement>('.su-vib-sub').textContent = 'Not supported by this browser (iPhones cannot vibrate)';
  }

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

  voxSw.addEventListener('click', vocal.toggleVocal);
  vkey.addEventListener('change', () => vocal.setKey(Number(vkey.value)));
  vscale.addEventListener('change', () => vocal.setScale(vscale.value as VocalScale));
  q<HTMLButtonElement>('.su-match').addEventListener('click', vocal.matchSnap);
  for (const s of vSliders) s.input.addEventListener('input', () => s.set(Number(s.input.value)));

  const renderVocal = () => {
    const v = state.vocal;
    setSwitch(voxSw, v.on);
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
    const want = state.view === 'setup' && state.vocal.mic === 'on' && document.visibilityState === 'visible';
    if (want && !frame) frame = requestAnimationFrame(tick);
    else if (!want && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      micFill.style.width = '0%';
      micNote.textContent = noteText = '';
    }
  }
  document.addEventListener('visibilitychange', syncMeter);

  snapSw.addEventListener('click', keys.toggleSnap);
  keySel.addEventListener('change', () => keys.setKey(Number(keySel.value)));
  scaleSel.addEventListener('change', () => keys.setScale(scaleSel.value as ScaleId));

  power.addEventListener('click', () => {
    const { status } = state.midi;
    if (status === 'ready' || status === 'requesting') midi.disableMidi();
    else void midi.enableMidi();
  });
  out.addEventListener('change', () => midi.setOutput(out.value || null));
  inp.addEventListener('change', () => midi.setInput(inp.value || null));
  chan.addEventListener('change', () => midi.setChannel(Number(chan.value)));
  kchan.addEventListener('change', () => midi.setKeysChannel(Number(kchan.value)));
  local.addEventListener('click', () => midi.setLocalSound(!state.midi.localSound));
  clock.addEventListener('click', () => midi.setClockOut(!state.midi.clock));
  learnBtn.addEventListener('click', toggleLearn);
  maps.addEventListener('click', (e) => {
    const x = (e.target as Element).closest<HTMLElement>('.su-map-x');
    if (x) midi.removeMapping(Number(x.dataset.i));
  });

  const setSwitch = (el: HTMLElement, on: boolean) => el.setAttribute('aria-checked', String(on));

  function render(m: Readonly<MidiState>): void {
    const ready = m.status === 'ready';
    setSwitch(power, m.status === 'ready' || m.status === 'requesting');
    power.disabled = m.status === 'unsupported';
    msg.hidden = !MESSAGES[m.status];
    msg.textContent = MESSAGES[m.status] ?? '';
    devices.classList.toggle('off', !ready);
    for (const el of [out, inp, chan, kchan, local, clock, learnBtn]) el.toggleAttribute('disabled', !ready);

    // Rebuild the lists only when they changed, so an open dropdown isn't disturbed.
    const outHtml = deviceOptions(m.outputs, m.output);
    if (out.innerHTML !== outHtml) out.innerHTML = outHtml;
    const inHtml = deviceOptions(m.inputs, m.input);
    if (inp.innerHTML !== inHtml) inp.innerHTML = inHtml;
    chan.value = String(m.channel);
    kchan.value = String(m.keysChannel);
    setSwitch(local, m.localSound);
    setSwitch(clock, m.clock);

    const mapsHtml = m.mappings.length
      ? m.mappings.map((x, i) => {
          const text = `${messageLabel(x)} → ${targetLabel(x.target, x.kind)}`;
          return `<li class="su-map"><span>${escapeHtml(text)}</span><button class="su-map-x" data-i="${i}" aria-label="Remove ${escapeHtml(text)}">×</button></li>`;
        }).join('')
      : '<li class="su-map empty">No mappings yet.</li>';
    if (maps.innerHTML !== mapsHtml) maps.innerHTML = mapsHtml;

    // Tablet header chip.
    const connected = ready && m.output !== null && m.outputs.includes(m.output);
    ui.midiChip.dataset.on = String(connected);
    ui.midiText.textContent = connected ? `MIDI · ${m.output!.toUpperCase()}` : ready ? 'MIDI ON' : 'MIDI OFF';
  }

  const renderLearn = () => {
    learnBtn.setAttribute('aria-pressed', String(state.learn.on));
    learnBtn.textContent = state.learn.on ? 'LISTENING… MOVE A HARDWARE CONTROL' : 'MIDI LEARN';
  };

  const renderSnap = () => {
    const k = state.keys;
    setSwitch(snapSw, k.snap);
    snapPair.classList.toggle('off', !k.snap);
    keySel.value = String(k.key);
    scaleSel.value = k.scale;
  };

  const renderTheme = () => {
    const t = state.theme;
    for (const b of themeBtns) b.setAttribute('aria-pressed', String(b.dataset.themeId === t.theme));
    for (const b of padBtns) b.setAttribute('aria-pressed', String(b.dataset.pads === t.pads));
    setSwitch(vibSw, t.vibrate);
  };

  render(state.midi);
  renderTheme();
  renderLatency();
  renderCal(latency.calibration());
  renderLearn();
  renderSnap();
  renderVocal();
  subscribe((s, changed) => {
    if (changed.has('vocal')) renderVocal();
    if (changed.has('view')) syncMeter();
    if (changed.has('midi')) render(s.midi);
    if (changed.has('theme')) renderTheme();
    if (changed.has('latency')) renderLatency();
    if (changed.has('learn')) renderLearn();
    if (changed.has('keys')) renderSnap();
  });
}
