// SETUP panel (Settings.dc.html): the MIDI card and the Scale snap card (AUTO-TUNE; the vocal card
// is M7). Built once; render() updates it from the store. Also drives the tablet header's MIDI chip.
// The MIDI code does the work (src/midi/midi.ts, and src/midi/learn.ts for the MIDI LEARN button and
// the mappings list); src/keys/keys.ts owns the snap settings.

import * as latency from '../audio/latency';
import { OFFSET_MAX, OFFSET_MIN } from '../audio/latencyTypes';
import * as keys from '../keys/keys';
import { KEY_NAMES, SCALES, SCALE_IDS, type ScaleId } from '../keys/scales';
import { toggleLearn } from '../midi/learn';
import * as midi from '../midi/midi';
import { messageLabel, targetLabel } from '../midi/targets';
import type { MidiState } from '../midi/types';
import { state, subscribe } from '../state';
import { escapeHtml } from './dialog';
import type { ScreenRefs } from './screen';

const MESSAGES: Partial<Record<MidiState['status'], string>> = {
  unsupported: "Web MIDI isn't available in this browser. Use Chrome or Edge.",
  denied: 'MIDI was blocked. Allow MIDI for this site in the browser settings, then switch it on again.',
  requesting: 'Waiting for the browser to allow MIDI…',
};

const channelLabel = (n: number) => (n === 10 ? '10 · DRUMS' : String(n));

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

  render(state.midi);
  renderLatency();
  renderCal(latency.calibration());
  renderLearn();
  renderSnap();
  subscribe((s, changed) => {
    if (changed.has('midi')) render(s.midi);
    if (changed.has('latency')) renderLatency();
    if (changed.has('learn')) renderLearn();
    if (changed.has('keys')) renderSnap();
  });
}
