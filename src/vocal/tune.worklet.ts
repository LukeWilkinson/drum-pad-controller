// AudioWorklet that pitch-corrects the mic (src/vocal/psola.ts does the work). Mono in; the
// result goes to every output channel. Loaded with Vite `?worker&url`, which bundles the
// imports into one file.
//
// Messages in:  { type: 'settings', key, scale, strength, speed }   (see TuneSettings)
// Messages out: { type: 'info', hz, target, shift } about every 50 ms, and
//               { type: 'ready', delay } once, with the added delay in frames.

import { SCALES, type ScaleId } from '../keys/scales';
import { SPEED_MAX, type TuneSettings } from './pitch';
import { Tuner } from './psola';

// The worklet scope's globals (TypeScript's DOM types don't include them).
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

const INFO_EVERY = 0.05; // s

class TuneProcessor extends AudioWorkletProcessor {
  private tuner = new Tuner(sampleRate);
  private out = new Float32Array(128);
  private silence = new Float32Array(128);
  private sinceInfo = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: string } & Partial<TuneSettings>>) => {
      if (e.data.type === 'settings') this.apply(e.data);
    };
    this.port.postMessage({ type: 'ready', delay: this.tuner.delay });
  }

  /** Bad or missing values keep what was there. */
  private apply(d: Partial<TuneSettings>): void {
    const s = this.tuner.settings;
    if (Number.isInteger(d.key) && d.key! >= 0 && d.key! < 12) s.key = d.key!;
    if (typeof d.scale === 'string' && d.scale in SCALES) s.scale = d.scale as ScaleId;
    if (Number.isFinite(d.strength)) s.strength = Math.max(0, Math.min(1, d.strength!));
    if (Number.isFinite(d.speed)) s.speed = Math.max(0, Math.min(SPEED_MAX, d.speed!));
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const outs = outputs[0];
    const n = outs[0]?.length ?? 128;
    if (this.out.length !== n) {
      this.out = new Float32Array(n);
      this.silence = new Float32Array(n);
    }
    // No input connected (or the mic not started yet) arrives as an empty list.
    const input = inputs[0]?.[0] ?? this.silence;
    this.tuner.process(input, this.out);
    for (const ch of outs) ch.set(this.out);

    this.sinceInfo += n / sampleRate;
    if (this.sinceInfo >= INFO_EVERY) {
      this.sinceInfo = 0;
      const { hz, target, shift } = this.tuner.info;
      this.port.postMessage({ type: 'info', hz, target, shift });
    }
    return true;
  }
}

registerProcessor('drumpad-tune', TuneProcessor);
