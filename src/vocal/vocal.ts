// Vocal pitch correction from the mic. This is the only code that changes state.vocal (as mix.ts
// is for state.mix). Switching it on asks for the mic (src/audio/mic.ts: the raw voice), runs it through the tune worklet (src/vocal/
// tune.worklet.ts) into the VOX strip, and switching it off stops the mic. The settings (not the
// switch) are saved as the `vocal` pref, 500 ms after the last change.
//
//   mic ─→ source ─┬→ analyser (the card's input meter)
//                  └→ tune worklet ─→ VOX strip (engine.mix.voxIn)

import type { AudioEngine } from '../audio/engine';
import { micStatusOf, micSupported, openMic } from '../audio/mic';
import { KEY_NAMES } from '../keys/scales';
import { state, update } from '../state';
import { getPref, setPref } from '../store/db';
import type { TuneInfo } from './psola';
import workletUrl from './tune.worklet.ts?worker&url';
import { SPEED_MAX, VOCAL_SCALES, type MicStatus, type VocalState } from './types';
import type { VocalScale } from './pitch';

const PREF = 'vocal';
const SAVE_MS = 500;
type Saved = Pick<VocalState, 'key' | 'scale' | 'strength' | 'speed' | 'reverbSend' | 'delaySend'>;

let engine: AudioEngine;
let saveTimer = 0;
let moduleReady: Promise<void> | null = null;
/** Counts starts, so a mic that arrives after the switch went off again is let go. */
let token = 0;
let mic: { stream: MediaStream; source: MediaStreamAudioSourceNode; node: AudioWorkletNode } | null = null;
let analyser: AnalyserNode | null = null;
const meterData = new Float32Array(1024);
let info: TuneInfo = { hz: 0, target: -1, shift: 0 };

const warn = (err: unknown) => console.warn('[vocal]', err);
const clamp = (min: number, max: number, v: number) => Math.min(max, Math.max(min, v));

export function initVocal(e: AudioEngine): void {
  engine = e;
  // A phone app that's hidden shouldn't keep listening.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.vocal.on) stop('off');
    if (document.visibilityState === 'hidden' && saveTimer) {
      clearTimeout(saveTimer);
      save();
    }
  });
  void load();
}

function saved(v: VocalState): Saved {
  const { key, scale, strength, speed, reverbSend, delaySend } = v;
  return { key, scale, strength, speed, reverbSend, delaySend };
}

function save(): void {
  saveTimer = 0;
  setPref(PREF, saved(state.vocal)).catch(warn);
}

function set(patch: Partial<VocalState>, keep = true): void {
  update({ vocal: { ...state.vocal, ...patch } });
  sendSettings();
  if (!keep) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, SAVE_MS);
}

function sendSettings(): void {
  const { key, scale, strength, speed } = state.vocal;
  mic?.node.port.postMessage({ type: 'settings', key, scale, strength, speed });
}

// ---------- Switch and mic ----------

export function toggleVocal(): void {
  if (state.vocal.on) stop('off');
  else void start();
}

async function start(): Promise<void> {
  if (!micSupported() || !engine.ctx.audioWorklet) {
    set({ on: false, mic: 'unsupported' }, false);
    return;
  }
  const mine = ++token;
  set({ on: true, mic: 'asking' }, false);
  try {
    moduleReady ??= engine.ctx.audioWorklet.addModule(workletUrl).catch((err: unknown) => {
      moduleReady = null;
      throw err;
    });
    const [stream] = await Promise.all([openMic(), moduleReady, engine.unlock()]);
    if (mine !== token) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    const ctx = engine.ctx;
    const node = new AudioWorkletNode(ctx, 'drumpad-tune', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = (e: MessageEvent<{ type: string } & TuneInfo>) => {
      if (e.data.type === 'info') info = { hz: e.data.hz, target: e.data.target, shift: e.data.shift };
    };
    const source = ctx.createMediaStreamSource(stream);
    analyser ??= Object.assign(ctx.createAnalyser(), { fftSize: meterData.length });
    source.connect(node);
    source.connect(analyser);
    node.connect(engine.mix.voxIn);
    mic = { stream, source, node };
    sendSettings();
    // The mic unplugged, or taken by another app.
    for (const t of stream.getAudioTracks()) t.addEventListener('ended', () => mine === token && stop('nomic'));
    set({ mic: 'on' }, false);
  } catch (err) {
    if (mine !== token) return;
    warn(err);
    stop(micStatusOf(err));
  }
}

function stop(status: MicStatus): void {
  token++;
  if (mic) {
    for (const t of mic.stream.getTracks()) t.stop();
    mic.source.disconnect();
    mic.node.port.postMessage({ type: 'end' });
    mic.node.disconnect();
    mic = null;
  }
  info = { hz: 0, target: -1, shift: 0 };
  set({ on: false, mic: status }, false);
}

/** Peak level of the mic over the last ~21 ms in dB (−Infinity while off or silent). */
export function inputLevel(): number {
  if (!mic || !analyser) return -Infinity;
  analyser.getFloatTimeDomainData(meterData);
  let peak = 0;
  for (const v of meterData) peak = Math.max(peak, Math.abs(v));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** The pitch heard and the note it's pulled to (from the worklet, about every 50 ms). */
export function pitchInfo(): Readonly<TuneInfo> {
  return info;
}

/** "A3" for a MIDI note. */
export function noteName(midi: number): string {
  return `${KEY_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

// ---------- Settings ----------

export function setKey(key: number): void {
  if (Number.isInteger(key) && key >= 0 && key < 12 && key !== state.vocal.key) set({ key });
}

export function setScale(scale: VocalScale): void {
  if (VOCAL_SCALES.includes(scale) && scale !== state.vocal.scale) set({ scale });
}

/** Copies the KEYS scale snap key and scale. */
export function matchSnap(): void {
  set({ key: state.keys.key, scale: state.keys.scale });
}

/** 0–1. */
export function setStrength(v: number): void {
  if (Number.isFinite(v)) set({ strength: clamp(0, 1, Math.round(v * 100) / 100) });
}

/** ms, 0–SPEED_MAX. */
export function setSpeed(ms: number): void {
  if (Number.isFinite(ms)) set({ speed: clamp(0, SPEED_MAX, Math.round(ms)) });
}

/** VOX reverb or delay send, 0–1. */
export function setSend(fx: 'reverb' | 'delay', v: number): void {
  if (!Number.isFinite(v)) return;
  set({ [fx === 'reverb' ? 'reverbSend' : 'delaySend']: clamp(0, 1, Math.round(v * 100) / 100) });
}

/** Restores the `vocal` pref. Missing or bad values keep their defaults. */
async function load(): Promise<void> {
  const s = await getPref<Partial<Saved>>(PREF).catch(warn);
  if (!s || typeof s !== 'object') return;
  const v = state.vocal;
  const num = (x: unknown, min: number, max: number, fallback: number) =>
    typeof x === 'number' && Number.isFinite(x) ? clamp(min, max, x) : fallback;
  update({
    vocal: {
      ...v,
      key: Number.isInteger(s.key) && s.key! >= 0 && s.key! < 12 ? s.key! : v.key,
      scale: VOCAL_SCALES.includes(s.scale as VocalScale) ? (s.scale as VocalScale) : v.scale,
      strength: num(s.strength, 0, 1, v.strength),
      speed: num(s.speed, 0, SPEED_MAX, v.speed),
      reverbSend: num(s.reverbSend, 0, 1, v.reverbSend),
      delaySend: num(s.delaySend, 0, 1, v.delaySend),
    },
  });
  sendSettings();
}
