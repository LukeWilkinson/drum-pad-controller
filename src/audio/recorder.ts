// WAV export: the only code that changes `state.recorder`.
// A worklet (recorder.worklet.ts) copies what comes out of the MASTER fader (src/mix/graph.ts
// recordTap; the metronome has its own path, so it is never recorded). Each chunk is turned into
// 16-bit samples as it arrives (a 10-minute stereo take is about 115 MB instead of 230 MB as floats),
// and a finished take is the WAV header plus those chunks as one Blob.
//
// RECORD OUT: records whatever is heard, from the tap until STOP (at most MAX_OUT_SECONDS).
// BOUNCE LOOP: stops the transport, plays the current loop from bar 1 for 1, 2 or 4 passes on the
// exact frames, then keeps recording until the reverb and delay tails have died away.
// REC MIC: records the mic (not the output) with a second node of the same worklet, for a pad's
// sample (src/ui/micRec.ts). The take is handed over as float samples, not a WAV.

import * as clock from './clock';
import type { AudioEngine } from './engine';
import { padLabel } from './kit';
import { MIC_TEXT, micStatusOf, micSupported, openMic } from './mic';
import { MAX_SECONDS } from './userSamples';
import { wavHeader, toPcm16 } from './wav';
import workletUrl from './recorder.worklet.ts?worker&url';
import { BEATS_PER_BAR, hasHits } from '../seq/pattern';
import * as seq from '../seq/sequencer';
import { state, subscribe, update } from '../state';

export type RecorderMode = 'off' | 'out' | 'bounce' | 'mic';

export interface RecorderState {
  mode: RecorderMode;
  /** performance.now() when the take began (for the elapsed time shown). */
  since: number;
  /** What the status bar says before the time, e.g. "REC OUT" or "BOUNCE LOOP 1". */
  label: string;
  /** REC MIC only: the pad (0–63) the take is for. */
  pad?: number;
}

/** A finished recording, ready to save. */
export interface Take {
  blob: Blob;
  name: string;
  seconds: number;
}

/** A finished REC MIC take: mono float samples for src/audio/userSamples.ts addRecording(). */
export interface MicTake {
  channels: Float32Array[];
  rate: number;
  pad: number;
}

export class RecordError extends Error {}

export const MAX_OUT_SECONDS = 600;
const START_LEAD = 0.15; // seconds between pressing BOUNCE and its first frame
const TAIL_QUIET_DB = -60; // a bounce's tail ends once the output stays below this…
const TAIL_QUIET_SECONDS = 0.5; // …for this long
const TAIL_MAX_SECONDS = 8;
const CHANNELS = 2;
const STOP_AFTER_MS = 50; // the transport stops this long after a bounce's last pass (timers aren't exact)

let engine: AudioEngine;
let moduleReady: Promise<void> | null = null;
let node: Promise<AudioWorkletNode> | null = null;
const takeListeners: ((take: Take) => void)[] = [];
const micListeners: ((take: MicTake) => void)[] = [];
const micDataListeners: ((chunk: Float32Array, rate: number) => void)[] = [];

/** The REC MIC take being recorded. */
let micTake: {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  parts: Float32Array[];
  frames: number;
  pad: number;
  stopping: boolean;
} | null = null;
/** Counts REC MIC starts, so a mic that arrives after STOP (pressed while the browser asked) is let go. */
let micAsk = 0;

/** The take being recorded. */
let take: {
  parts: Int16Array<ArrayBuffer>[];
  frames: number;
  name: string;
  /** Bounce only: context time and frame count where the last pass ends. */
  bounce?: { end: number; frames: number };
  /** Bounce only: set once the last pass has played; frames after it are the tail. */
  playFrames?: number;
  /** Quiet frames in a row in the tail. */
  quiet: number;
  stopping: boolean;
  keep: boolean;
} | null = null;

export function initRecorder(e: AudioEngine): void {
  engine = e;
  // When a bounce's transport stops: at the end of the last pass the tail starts; earlier (Stop
  // pressed) the bounce is dropped.
  subscribe((s, changed) => {
    const t = take;
    if (!changed.has('playing') || s.playing || s.recorder.mode !== 'bounce' || !t?.bounce || t.playFrames !== undefined) return;
    if (engine.ctx.currentTime >= t.bounce.end - 0.005) t.playFrames = t.bounce.frames;
    else cancel();
  });
  // A hidden phone app shouldn't keep listening: a mic take ends (and is kept) when the page hides.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && micTake) finishMic();
  });
}

/** Called with every finished take (src/ui/record.ts offers SAVE). */
export function onTake(fn: (take: Take) => void): void {
  takeListeners.push(fn);
}

/** Called with every finished REC MIC take (src/ui/micRec.ts), an empty one too. */
export function onMicTake(fn: (take: MicTake) => void): void {
  micListeners.push(fn);
}

/** Called with each block of mic samples while a REC MIC take records (the panel's live waveform). */
export function onMicData(fn: (chunk: Float32Array, rate: number) => void): void {
  micDataListeners.push(fn);
}

function loadModule(): Promise<void> {
  moduleReady ??= engine.ctx.audioWorklet.addModule(workletUrl).catch((err: unknown) => {
    moduleReady = null;
    console.error('[recorder]', err);
    throw new RecordError("Recording isn't available in this browser.");
  });
  return moduleReady;
}

function worklet(): Promise<AudioWorkletNode> {
  node ??= (async () => {
    await loadModule();
    const n = new AudioWorkletNode(engine.ctx, 'drumpad-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: CHANNELS,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    n.port.onmessage = (e: MessageEvent<{ type: 'data'; chans: Float32Array[] } | { type: 'done' }>) => {
      if (e.data.type === 'data') onData(e.data.chans);
      else onDone();
    };
    engine.mix.recordTap.connect(n);
    return n;
  })().catch((err: unknown) => {
    node = null;
    if (err instanceof RecordError) throw err;
    console.error('[recorder]', err);
    throw new RecordError("Recording isn't available in this browser.");
  });
  return node;
}

const BUSY = 'A recording is already running. Stop it first.';

/** RECORD OUT on/off. Off finishes the take (it is offered for saving). */
export async function toggleRecordOut(): Promise<void> {
  if (state.recorder.mode === 'out') return finish();
  if (state.recorder.mode !== 'off') throw new RecordError(BUSY);
  const n = await worklet();
  begin(n, 'out', 'REC OUT', engine.ctx.currentTime, `drumpad-rec-${stamp(true)}.wav`);
}

/**
 * Bounces the current loop: `passes` times round from bar 1, plus the effect tails.
 * Throws RecordError when the loop is empty or a recording is already running.
 */
export async function bounceLoop(passes: number): Promise<void> {
  if (state.recorder.mode !== 'off') throw new RecordError(BUSY);
  const p = state.patterns[state.pattern];
  const loop = state.pattern + 1;
  if (!hasHits(p)) throw new RecordError(`Loop ${loop} is empty. Record or step in some hits first.`);
  const n = await worklet();
  if (state.playing) clock.stop();
  const t0 = engine.ctx.currentTime + START_LEAD;
  const end = t0 + (passes * p.bars * BEATS_PER_BAR * 60) / state.bpm;
  begin(n, 'bounce', `BOUNCE LOOP ${loop}`, t0, `drumpad-loop${loop}-${Math.round(state.bpm)}bpm-${stamp(false)}.wav`);
  take!.bounce = { end, frames: Math.round((end - t0) * engine.ctx.sampleRate) };
  seq.playUntil(end); // nothing from the next pass on is scheduled…
  clock.start(t0);
  // …so the transport can stop any time after the end; the subscriber in initRecorder() then starts the tail.
  const t = take!;
  window.setTimeout(() => take === t && clock.stop(), (end - engine.ctx.currentTime) * 1000 + STOP_AFTER_MS);
}

/** STOP on the status bar: RECORD OUT and REC MIC are finished and kept; a bounce is dropped. */
export function stopRecording(): void {
  if (state.recorder.mode === 'out') void finish();
  else if (state.recorder.mode === 'bounce') cancel();
  else if (state.recorder.mode === 'mic') finishMic();
}

/**
 * REC MIC: records the mic for pad `pad` until stopRecording() (or MAX_SECONDS, or the page hiding).
 * Asks for the mic first; throws RecordError with a message for Luke when it can't start.
 */
export async function recordMic(pad: number): Promise<void> {
  if (state.recorder.mode !== 'off') throw new RecordError(BUSY);
  if (!micSupported() || !engine.ctx.audioWorklet) throw new RecordError(MIC_TEXT.unsupported[1]);
  const mine = ++micAsk;
  update({ recorder: { mode: 'mic', since: performance.now(), label: `MIC → PAD ${padLabel(pad)} · ASKING`, pad } });
  let stream: MediaStream;
  try {
    [stream] = await Promise.all([openMic(), loadModule(), engine.unlock()]);
  } catch (err) {
    if (mine !== micAsk) return; // stopped while asking
    micAsk++;
    update({ recorder: { mode: 'off', since: 0, label: '' } });
    if (err instanceof RecordError) throw err;
    console.warn('[recorder]', err);
    throw new RecordError(MIC_TEXT[micStatusOf(err)][1]);
  }
  if (mine !== micAsk) {
    // STOP was pressed while the browser was asking for the mic: nothing is recorded.
    for (const track of stream.getTracks()) track.stop();
    return;
  }
  micAsk++;
  const ctx = engine.ctx;
  const n = new AudioWorkletNode(ctx, 'drumpad-recorder', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const source = ctx.createMediaStreamSource(stream);
  source.connect(n); // nothing goes to the speakers
  const t = { stream, source, node: n, parts: [] as Float32Array[], frames: 0, pad, stopping: false };
  micTake = t;
  n.port.onmessage = (e: MessageEvent<{ type: 'data'; chans: Float32Array[] } | { type: 'done' }>) => {
    if (e.data.type === 'data') {
      t.parts.push(e.data.chans[0]);
      t.frames += e.data.chans[0].length;
      for (const fn of micDataListeners) fn(e.data.chans[0], ctx.sampleRate);
      if (t.frames >= MAX_SECONDS * ctx.sampleRate) finishMic();
    } else onMicDone(t);
  };
  // The mic unplugged, or taken by another app: keep what was recorded.
  for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => micTake === t && finishMic());
  n.port.postMessage({ type: 'start', frame: Math.round(ctx.currentTime * ctx.sampleRate) });
  update({ recorder: { mode: 'mic', since: performance.now(), label: `MIC → PAD ${padLabel(pad)}`, pad } });
}

function finishMic(): void {
  const t = micTake;
  if (!t && state.recorder.mode === 'mic') {
    // Still asking for the mic: drop the take before it starts.
    micAsk++;
    update({ recorder: { mode: 'off', since: 0, label: '' } });
    return;
  }
  if (!t || t.stopping) return;
  t.stopping = true;
  for (const track of t.stream.getTracks()) track.stop(); // the browser's mic light goes off now
  t.node.port.postMessage({ type: 'stop', frame: Math.round(engine.ctx.currentTime * engine.ctx.sampleRate) });
}

function onMicDone(t: NonNullable<typeof micTake>): void {
  t.source.disconnect();
  t.node.port.onmessage = null;
  if (micTake === t) micTake = null;
  update({ recorder: { mode: 'off', since: 0, label: '' } });
  const mono = new Float32Array(t.frames);
  let at = 0;
  for (const p of t.parts) {
    mono.set(p, at);
    at += p.length;
  }
  const done: MicTake = { channels: [mono], rate: engine.ctx.sampleRate, pad: t.pad };
  for (const fn of micListeners) fn(done);
}

function begin(n: AudioWorkletNode, mode: RecorderMode, label: string, at: number, name: string): void {
  take = { parts: [], frames: 0, name, quiet: 0, stopping: false, keep: true };
  n.port.postMessage({ type: 'start', frame: Math.round(at * engine.ctx.sampleRate) });
  update({ recorder: { mode, since: performance.now() + Math.max(0, at - engine.ctx.currentTime) * 1000, label } });
}

async function finish(keep = true): Promise<void> {
  if (!take || take.stopping) return;
  take.stopping = true;
  take.keep = keep;
  const n = await worklet();
  n.port.postMessage({ type: 'stop', frame: Math.round(engine.ctx.currentTime * engine.ctx.sampleRate) });
}

function cancel(): void {
  if (state.playing) clock.stop();
  void finish(false);
}

function onData(chans: Float32Array[]): void {
  const t = take;
  if (!t) return;
  t.parts.push(toPcm16(chans));
  t.frames += chans[0].length;
  const rate = engine.ctx.sampleRate;
  if (state.recorder.mode === 'out' && t.frames >= MAX_OUT_SECONDS * rate) void finish();
  if (t.playFrames === undefined || t.stopping || t.frames <= t.playFrames) return;

  let peak = 0;
  for (const c of chans) for (const v of c) peak = Math.max(peak, Math.abs(v));
  t.quiet = peak < Math.pow(10, TAIL_QUIET_DB / 20) ? t.quiet + chans[0].length : 0;
  if (t.quiet >= TAIL_QUIET_SECONDS * rate || t.frames - t.playFrames >= TAIL_MAX_SECONDS * rate) void finish();
}

function onDone(): void {
  const t = take;
  take = null;
  update({ recorder: { mode: 'off', since: 0, label: '' } });
  if (!t?.keep || !t.frames) return;
  const rate = engine.ctx.sampleRate;
  const blob = new Blob([wavHeader(t.frames, CHANNELS, rate), ...t.parts], { type: 'audio/wav' });
  const done: Take = { blob, name: t.name, seconds: t.frames / rate };
  for (const fn of takeListeners) fn(done);
}

/** "2026-10-22", or "2026-10-22-1530" with the time (local). */
function stamp(withTime: boolean): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${date}-${p(d.getHours())}${p(d.getMinutes())}` : date;
}
