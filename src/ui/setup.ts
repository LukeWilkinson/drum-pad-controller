// SETUP panel (Settings.dc.html): for now the MIDI card only. Built once; render() updates it from
// the store. Also drives the tablet header's MIDI chip. The MIDI code does the work (src/midi/midi.ts,
// and src/midi/learn.ts for the MIDI LEARN button and the mappings list).

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
          <label class="su-row">Channel
            <select class="su-chan">${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${channelLabel(i + 1)}</option>`).join('')}</select>
          </label>
          <div class="su-row">Play sounds in app<button class="su-sw su-local" role="switch" aria-checked="true" aria-label="Play sounds in app"></button></div>
          <div class="su-row">Send MIDI clock<button class="su-sw su-clock" role="switch" aria-checked="false" aria-label="Send MIDI clock"></button></div>
          <button class="su-learn" aria-pressed="false">MIDI LEARN</button>
          <p class="su-hint">Tap MIDI Learn, touch a pad, knob or button in the app, then move a control on your hardware.</p>
          <ul class="su-maps" aria-label="MIDI mappings"></ul>
          <p class="su-hint">Notes 36–99 play the pads: A1–A16 are 36–51, then B, C and D. A learned note takes over from this. Output goes out on the channel above. Input is read on every channel.</p>
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
  const local = q<HTMLButtonElement>('.su-local');
  const clock = q<HTMLButtonElement>('.su-clock');
  const learnBtn = q<HTMLButtonElement>('.su-learn');
  const maps = q<HTMLUListElement>('.su-maps');

  power.addEventListener('click', () => {
    const { status } = state.midi;
    if (status === 'ready' || status === 'requesting') midi.disableMidi();
    else void midi.enableMidi();
  });
  out.addEventListener('change', () => midi.setOutput(out.value || null));
  inp.addEventListener('change', () => midi.setInput(inp.value || null));
  chan.addEventListener('change', () => midi.setChannel(Number(chan.value)));
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
    for (const el of [out, inp, chan, local, clock, learnBtn]) el.toggleAttribute('disabled', !ready);

    // Rebuild the lists only when they changed, so an open dropdown isn't disturbed.
    const outHtml = deviceOptions(m.outputs, m.output);
    if (out.innerHTML !== outHtml) out.innerHTML = outHtml;
    const inHtml = deviceOptions(m.inputs, m.input);
    if (inp.innerHTML !== inHtml) inp.innerHTML = inHtml;
    chan.value = String(m.channel);
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

  render(state.midi);
  renderLearn();
  subscribe((s, changed) => {
    if (changed.has('midi')) render(s.midi);
    if (changed.has('learn')) renderLearn();
  });
}
