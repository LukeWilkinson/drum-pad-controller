// Web MIDI access, devices and settings. This is the only code that changes `state.midi`
// (like kitControl.ts is for kits). Output and input are chosen by device name, because port ids
// can change between sessions. Settings are saved as one `midi` pref in IndexedDB.
//
// The app asks for MIDI only when Luke taps ENABLE MIDI (the browser then shows its permission
// prompt). Once enabled, it reconnects at boot, and plugging devices in or out is picked up live.

import { state, update } from '../state';
import { getPref, setPref } from '../store/db';
import type { AccessLike, InLike, Mapping, MidiState, OutLike } from './types';

const PREF = 'midi';

interface Saved {
  enabled: boolean;
  output: string | null;
  input: string | null;
  channel: number;
  keysChannel: number;
  localSound: boolean;
  clock: boolean;
  mappings: Mapping[];
}

const isMapping = (m: unknown): m is Mapping => {
  const x = m as Partial<Mapping> | null;
  return !!x && (x.kind === 'note' || x.kind === 'cc') && Number.isInteger(x.num) && x.num! >= 0 && x.num! <= 127 && typeof x.target === 'string';
};

let access: AccessLike | null = null;
/** True when Luke has turned MIDI on (saved, so the next boot reconnects). */
let enabled = false;
/** False until initMidi() has read the pref, so the defaults never overwrite a saved choice. */
let loaded = false;
/** With no saved choice, the first device that shows up is picked once (output and input apart). */
let autoOut = true;
let autoIn = true;
let outPort: OutLike | null = null;
let inPort: InLike | null = null;
const listeners = new Set<(data: Uint8Array) => void>();

const warn = (err: unknown) => console.warn('[midi]', err);

function patch(p: Partial<MidiState>): void {
  update({ midi: { ...state.midi, ...p } });
  save();
}

function save(): void {
  if (!loaded) return;
  const { output, input, channel, keysChannel, localSound, clock, mappings } = state.midi;
  const saved: Saved = { enabled, output, input, channel, keysChannel, localSound, clock, mappings };
  setPref(PREF, saved).catch(warn);
}

/** Reads the saved settings and, if MIDI was on last time, reconnects. Call once at boot. */
export async function initMidi(): Promise<void> {
  try {
    const saved = await getPref<Partial<Saved>>(PREF).catch(warn);
    if (saved && typeof saved === 'object') {
      const p: Partial<MidiState> = {};
      if (typeof saved.output === 'string' || saved.output === null) {
        p.output = saved.output;
        autoOut = false;
      }
      if (typeof saved.input === 'string' || saved.input === null) {
        p.input = saved.input;
        autoIn = false;
      }
      if (Number.isInteger(saved.channel) && saved.channel! >= 1 && saved.channel! <= 16) p.channel = saved.channel;
      if (Number.isInteger(saved.keysChannel) && saved.keysChannel! >= 1 && saved.keysChannel! <= 16) p.keysChannel = saved.keysChannel;
      if (typeof saved.localSound === 'boolean') p.localSound = saved.localSound;
      if (typeof saved.clock === 'boolean') p.clock = saved.clock;
      if (Array.isArray(saved.mappings)) p.mappings = saved.mappings.filter(isMapping);
      if (Object.keys(p).length) update({ midi: { ...state.midi, ...p } });
      enabled = saved.enabled === true;
    }
  } finally {
    loaded = true;
  }
  if (enabled) await enableMidi();
}

async function getAccess(): Promise<AccessLike> {
  // Dev only: ?fakemidi swaps in a fake that logs sends and lets a script inject input.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fakemidi')) {
    return (await import('./fake')).createFakeAccess();
  }
  return (await navigator.requestMIDIAccess({ sysex: false })) as unknown as AccessLike;
}

/** Asks the browser for MIDI access (it may show a permission prompt). */
export async function enableMidi(): Promise<void> {
  if (state.midi.status === 'requesting' || state.midi.status === 'ready') return;
  if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('fakemidi')) {
    if (typeof navigator.requestMIDIAccess !== 'function') {
      enabled = false;
      return patch({ status: 'unsupported' });
    }
  }
  enabled = true;
  patch({ status: 'requesting' });
  try {
    access = await getAccess();
  } catch (err) {
    warn(err);
    enabled = false;
    return patch({ status: 'denied' });
  }
  access.onstatechange = refresh;
  refresh();
}

export function disableMidi(): void {
  enabled = false;
  if (access) access.onstatechange = null;
  access = null;
  resolvePorts();
  patch({ status: 'off', outputs: [], inputs: [] });
}

const connectedNames = (ports: Iterable<{ name: string | null; state: string }>): string[] => {
  const names = new Set<string>();
  for (const p of ports) if (p.state === 'connected' && p.name) names.add(p.name);
  return [...names];
};

/** Re-reads the device lists (on access, and whenever a device is plugged in or out). */
function refresh(): void {
  if (!access) return;
  const outputs = connectedNames(access.outputs.values());
  const inputs = connectedNames(access.inputs.values());
  const p: Partial<MidiState> = { status: 'ready', outputs, inputs };
  if (autoOut && outputs.length) {
    p.output = outputs[0];
    autoOut = false;
  }
  if (autoIn && inputs.length) {
    p.input = inputs[0];
    autoIn = false;
  }
  patch(p);
  resolvePorts();
}

/** Finds the ports for the chosen device names and listens to the input. */
function resolvePorts(): void {
  const { output, input } = state.midi;
  outPort = null;
  let nextIn: InLike | null = null;
  if (access) {
    for (const o of access.outputs.values()) if (o.state === 'connected' && o.name === output) outPort = o;
    for (const i of access.inputs.values()) if (i.state === 'connected' && i.name === input) nextIn = i;
  }
  if (inPort === nextIn) return;
  if (inPort) inPort.onmidimessage = null;
  inPort = nextIn;
  if (inPort) inPort.onmidimessage = (e) => e.data && listeners.forEach((fn) => fn(e.data!));
}

export function setOutput(name: string | null): void {
  autoOut = false;
  patch({ output: name });
  resolvePorts();
}

export function setInput(name: string | null): void {
  autoIn = false;
  patch({ input: name });
  resolvePorts();
}

export function setChannel(channel: number): void {
  if (Number.isInteger(channel) && channel >= 1 && channel <= 16) patch({ channel });
}

export function setKeysChannel(keysChannel: number): void {
  if (Number.isInteger(keysChannel) && keysChannel >= 1 && keysChannel <= 16) patch({ keysChannel });
}

export function setLocalSound(localSound: boolean): void {
  patch({ localSound });
}

export function setClockOut(clock: boolean): void {
  patch({ clock });
}

/** Adds a learned control. An older mapping of the same message is replaced. */
export function addMapping(m: Mapping): void {
  const rest = state.midi.mappings.filter((x) => x.kind !== m.kind || x.num !== m.num);
  patch({ mappings: [...rest, m] });
}

export function removeMapping(index: number): void {
  patch({ mappings: state.midi.mappings.filter((_, i) => i !== index) });
}

/** The learned mapping for a note or CC number, if any. */
export function mappingFor(kind: Mapping['kind'], num: number): Mapping | undefined {
  return state.midi.mappings.find((m) => m.kind === kind && m.num === num);
}

/** The output port to send to, or null (no device chosen, unplugged, or MIDI off). */
export function outputPort(): OutLike | null {
  return outPort;
}

/** Calls `fn` with the bytes of every message from the chosen input. Returns an unsubscribe. */
export function onMidiMessage(fn: (data: Uint8Array) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
