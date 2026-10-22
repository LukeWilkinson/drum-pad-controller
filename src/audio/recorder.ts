// WAV export: the only code that changes `state.recorder`.
// A worklet (recorder.worklet.ts) copies what comes out of the MASTER fader (src/mix/graph.ts
// recordTap; the metronome has its own path, so it is never recorded). Each chunk is turned into
// 16-bit samples as it arrives (a 10-minute stereo take is about 115 MB instead of 230 MB as floats),
// and a finished take is the WAV header plus those chunks as one Blob.
//
// RECORD OUT: records whatever is heard, from the tap until STOP (at most MAX_OUT_SECONDS).
// BOUNCE LOOP: stops the transport, plays the current loop from bar 1 for 1, 2 or 4 passes on the
// exact frames, then keeps recording until the reverb and delay tails have died away.

import * as clock from './clock';
import type { AudioEngine } from './engine';
import { wavHeader, toPcm16 } from './wav';
import workletUrl from './recorder.worklet.ts?worker&url';
import { BEATS_PER_BAR, hasHits } from '../seq/pattern';
import * as seq from '../seq/sequencer';
import { state, subscribe, update } from '../state';

export type RecorderMode = 'off' | 'out' | 'bounce';

export interface RecorderState {
  mode: RecorderMode;
  /** performance.now() when the take began (for the elapsed time shown). */
  since: number;
  /** What the status bar says before the time, e.g. "REC OUT" or "BOUNCE LOOP 1". */
  label: string;
}

/** A finished recording, ready to save. */
export interface Take {
  blob: Blob;
  name: string;
  seconds: number;
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
let node: Promise<AudioWorkletNode> | null = null;
const takeListeners: ((take: Take) => void)[] = [];

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
}

/** Called with every finished take (src/ui/record.ts offers SAVE). */
export function onTake(fn: (take: Take) => void): void {
  takeListeners.push(fn);
}

function worklet(): Promise<AudioWorkletNode> {
  node ??= (async () => {
    await engine.ctx.audioWorklet.addModule(workletUrl);
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
    console.error('[recorder]', err);
    throw new RecordError("Recording isn't available in this browser.");
  });
  return node;
}

/** RECORD OUT on/off. Off finishes the take (it is offered for saving). */
export async function toggleRecordOut(): Promise<void> {
  if (state.recorder.mode === 'out') return finish();
  if (state.recorder.mode !== 'off') return;
  const n = await worklet();
  begin(n, 'out', 'REC OUT', engine.ctx.currentTime, `drumpad-rec-${stamp(true)}.wav`);
}

/**
 * Bounces the current loop: `passes` times round from bar 1, plus the effect tails.
 * Throws RecordError when the loop is empty or a recording is already running.
 */
export async function bounceLoop(passes: number): Promise<void> {
  if (state.recorder.mode !== 'off') throw new RecordError('A recording is already running. Stop it first.');
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

/** STOP on the status bar: RECORD OUT is finished and kept; a bounce is dropped. */
export function stopRecording(): void {
  if (state.recorder.mode === 'out') void finish();
  else if (state.recorder.mode === 'bounce') cancel();
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
