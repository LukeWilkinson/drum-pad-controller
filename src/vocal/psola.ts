// The vocal tuner: YIN tracking plus a streaming TD-PSOLA pitch shifter (pure; src/vocal/
// tune.worklet.ts runs it on the audio thread, scripts/vocal-check.mjs runs it offline).
//
// TD-PSOLA (time-domain pitch-synchronous overlap-add): the input is cut into Hann grains two
// periods long, centred one period apart (analysis marks). Each grain is laid down again at
// synthesis marks spaced period / ratio apart, so the output repeats faster (higher) or slower
// (lower) while the vowel's shape, carried inside each grain, stays put.
//
// Grains are read from the input sample by sample as they are played, so a grain only needs
// input up to the output's own time minus its offset. Each synthesis mark takes the newest
// analysis mark at least DELAY_MS behind it, so the added delay is DELAY_MS plus less than one
// period (20–24.5 ms at 220 Hz). Unvoiced sound gets ratio 1 with grains and marks in step, and
// Hann grains one period apart sum to exactly 1, so it passes through unchanged.

import { Corrector, DEFAULT_TUNE, hzToMidi, Yin, type TuneSettings } from './pitch';

/** The shortest added delay (ms). The pitch is read from a window centred 21 ms back, so a
 *  shorter delay would correct pitch the voice had a moment ago. */
export const DELAY_MS = 20;

const RING = 16384; // input samples kept (power of two)
const MASK = RING - 1;
const MAX_GRAINS = 8; // a 7-semitone shift up overlaps about 4
/** Voiced estimates kept for the pitch trend (one hop apart). Two followed vibrato best in
 *  scripts/vocal-check.mjs, also with a jittery voice (3, 4 and 6 lagged more). */
const TREND = 2;
/** A jump bigger than this (semitones) starts a new trend. */
const TREND_JUMP = 1;

interface Grain {
  centre: number; // output frame
  offset: number; // centre − analysis mark (the grain's delay)
  half: number; // samples each side of the centre
  gain: number;
}

export interface TuneInfo {
  /** The voice's pitch in Hz, 0 when unvoiced. */
  hz: number;
  /** The scale note aimed at (MIDI), −1 while unvoiced. */
  target: number;
  /** Correction now, in semitones. */
  shift: number;
}

export class Tuner {
  /** Added delay in frames, not counting the grain's part (under one period). */
  readonly delay: number;
  settings: TuneSettings = { ...DEFAULT_TUNE };
  readonly info: TuneInfo = { hz: 0, target: -1, shift: 0 };

  private x = new Float32Array(RING);
  private pos = 0; // frames written so far; the frame being worked on is pos − 1
  private yin: Yin;
  private frame: Float32Array;
  private hop: number;
  private nextAnalysis: number;
  private trend: { at: number; midi: number }[] = [];
  private voiced = false;
  private period: number; // samples, whole
  private corrector = new Corrector();
  private markPos: number;
  private markT: number;
  private nextSyn = 0;
  private nextHalf: number;
  private lastSyn = 0;
  private grains: Grain[] = [];

  /** `delayMs` is only changed by scripts/vocal-check.mjs. */
  constructor(readonly sampleRate: number, delayMs = DELAY_MS) {
    this.delay = Math.round((delayMs / 1000) * sampleRate);
    this.yin = new Yin(sampleRate);
    this.frame = new Float32Array(this.yin.size);
    this.hop = this.yin.size / 8; // 256 at 48 kHz: about 5 ms
    this.nextAnalysis = this.yin.size;
    this.period = Math.round(sampleRate / 200);
    this.markT = this.period;
    this.markPos = -this.delay;
    this.nextHalf = this.period;
  }

  /** Mono in, mono out, same length. */
  process(input: Float32Array, output: Float32Array): void {
    const { x } = this;
    for (let i = 0; i < input.length; i++) {
      x[this.pos & MASK] = input[i];
      const t = this.pos++;
      if (this.pos >= this.nextAnalysis) {
        this.analyse();
        this.nextAnalysis += this.hop;
      }
      while (t >= Math.round(this.nextSyn) - this.nextHalf) this.startGrain();

      let y = 0;
      const g = this.grains;
      for (let k = 0; k < g.length; k++) {
        const grain = g[k];
        const d = t - grain.centre;
        if (d >= grain.half) {
          g[k] = g[g.length - 1];
          g.pop();
          k--;
          continue;
        }
        const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / grain.half);
        y += w * grain.gain * x[(t - grain.offset) & MASK];
      }
      output[i] = y;
    }
  }

  private analyse(): void {
    const { frame, x } = this;
    const start = this.pos - frame.length;
    for (let i = 0; i < frame.length; i++) frame[i] = x[(start + i) & MASK];
    const est = this.yin.detect(frame);
    this.info.hz = est.hz;
    if (!est.hz) {
      this.voiced = false;
      this.trend.length = 0;
      return;
    }
    const midi = hzToMidi(est.hz);
    const last = this.trend[this.trend.length - 1];
    if (last && Math.abs(midi - last.midi) > TREND_JUMP) this.trend.length = 0;
    const tau = this.sampleRate / est.hz;
    this.trend.push({ at: start + (this.yin.w + tau) / 2, midi });
    if (this.trend.length > TREND) this.trend.shift();
    this.voiced = true;
    this.period = Math.round(tau);
  }

  /** The voice's pitch at input frame `at`: a straight line through the last estimates, so a
   *  vibrato or glide is read where the grain is, not where the window was. */
  private pitchAt(at: number): number | null {
    const tr = this.trend;
    if (!this.voiced || !tr.length) return null;
    const last = tr[tr.length - 1].midi;
    if (tr.length === 1) return last;
    let mx = 0;
    let my = 0;
    for (const p of tr) {
      mx += p.at;
      my += p.midi;
    }
    mx /= tr.length;
    my /= tr.length;
    let sxy = 0;
    let sxx = 0;
    for (const p of tr) {
      sxy += (p.at - mx) * (p.midi - my);
      sxx += (p.at - mx) ** 2;
    }
    const m = my + (sxx > 0 ? (sxy / sxx) * (at - mx) : 0);
    return Math.max(last - 0.5, Math.min(last + 0.5, m));
  }

  private startGrain(): void {
    const centre = Math.round(this.nextSyn);
    const half = this.nextHalf;
    // The newest analysis mark at least `delay` behind this grain.
    const from = centre - this.delay;
    while (this.markPos + this.markT <= from) {
      this.markPos += this.markT;
      this.markT = this.period;
    }
    const dt = (centre - this.lastSyn) / this.sampleRate;
    this.lastSyn = centre;
    const shift = this.corrector.step(this.pitchAt(this.markPos), dt, this.settings);
    const ratio = 2 ** (shift / 12);
    if (this.grains.length < MAX_GRAINS) {
      // Hann grains `period / ratio` apart sum to `ratio` on average, hence the gain.
      this.grains.push({ centre, offset: centre - this.markPos, half, gain: 1 / ratio });
    }
    this.nextSyn += this.markT / ratio;
    this.nextHalf = this.markT;
    this.info.target = this.corrector.target ?? -1;
    this.info.shift = shift;
  }
}
