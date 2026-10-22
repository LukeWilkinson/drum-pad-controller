// Pitch detection and correction for the vocal tuner (pure; the tune worklet runs it through
// src/vocal/psola.ts). YIN (de Cheveigné & Kawahara 2002) finds the period; its difference
// function is worked out with an FFT so a phone's audio thread can run it every 5 ms.
// Pitches are MIDI numbers with fractions (A4 = 69, 69.5 = 50 cents sharp).

import { inScale, type ScaleId } from '../keys/scales';

/** The lowest and highest voice pitch tracked. Below 80 Hz (a low E2) the voice passes through. */
export const MIN_HZ = 80;
export const MAX_HZ = 1000;
/** YIN's absolute threshold: a dip below it in the normalised difference counts as voiced. */
const THRESHOLD = 0.15;
/** Windows quieter than −50 dBFS RMS count as unvoiced (mic hiss, room noise). */
const GATE = 10 ** (-50 / 20);

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** The scale note nearest to a fractional pitch; exactly halfway goes down, as `snap()` does. */
export function nearestInScale(midi: number, key: number, scale: ScaleId): number {
  const lo = Math.floor(midi);
  let best = lo;
  let bestDist = Infinity;
  for (let n = lo - 6; n <= lo + 7; n++) {
    if (!inScale(n, key, scale)) continue;
    const d = Math.abs(n - midi);
    if (d < bestDist) {
      best = n; // ascending with a strict <, so a tie keeps the lower note
      bestDist = d;
    }
  }
  return best;
}

/** In-place radix-2 complex FFT of a fixed size. */
class Fft {
  private rev: Uint32Array;
  private cos: Float64Array;
  private sin: Float64Array;

  constructor(readonly size: number) {
    const bits = Math.log2(size);
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
  }

  /** `inverse` leaves the 1/size scaling to the caller. */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step];
          const wi = sign * this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

export interface PitchEstimate {
  /** 0 when unvoiced. */
  hz: number;
  /** 1 − the normalised difference at the chosen period (1 = a perfect repeat). */
  conf: number;
}

/** YIN pitch detector over a fixed window (2048 samples up to 48 kHz, 4096 above). */
export class Yin {
  /** Samples per window. */
  readonly size: number;
  readonly tauMin: number;
  readonly tauMax: number;
  /** Samples summed per lag (the window minus the longest lag). An estimate of period τ uses
   *  the first w + τ samples, so its time is (w + τ) / 2 from the window's start. */
  readonly w: number;
  private fft: Fft;
  private aRe: Float64Array;
  private aIm: Float64Array;
  private bRe: Float64Array;
  private bIm: Float64Array;
  private energy: Float64Array;
  private cmnd: Float64Array;

  constructor(readonly sampleRate: number) {
    this.size = sampleRate > 50000 ? 4096 : 2048;
    this.tauMax = Math.floor(sampleRate / MIN_HZ);
    this.tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
    this.w = this.size - this.tauMax;
    this.fft = new Fft(this.size);
    this.aRe = new Float64Array(this.size);
    this.aIm = new Float64Array(this.size);
    this.bRe = new Float64Array(this.size);
    this.bIm = new Float64Array(this.size);
    this.energy = new Float64Array(this.size + 1);
    this.cmnd = new Float64Array(this.tauMax + 1);
  }

  /** `x` holds the last `size` samples, oldest first. */
  detect(x: ArrayLike<number>): PitchEstimate {
    const { size, w, tauMin, tauMax, energy, cmnd } = this;
    energy[0] = 0;
    for (let i = 0; i < size; i++) energy[i + 1] = energy[i] + x[i] * x[i];
    if (Math.sqrt(energy[size] / size) < GATE) return { hz: 0, conf: 0 };

    // r(τ) = Σ x[j]·x[j+τ] for j < w: the correlation of the first w samples with the whole
    // window. j + τ never passes the end, so the FFT's wrap-around never reaches it.
    const { aRe, aIm, bRe, bIm } = this;
    for (let i = 0; i < size; i++) {
      aRe[i] = i < w ? x[i] : 0;
      bRe[i] = x[i];
      aIm[i] = 0;
      bIm[i] = 0;
    }
    this.fft.transform(aRe, aIm);
    this.fft.transform(bRe, bIm);
    for (let i = 0; i < size; i++) {
      // conj(A)·B
      const re = aRe[i] * bRe[i] + aIm[i] * bIm[i];
      const im = aRe[i] * bIm[i] - aIm[i] * bRe[i];
      aRe[i] = re;
      aIm[i] = im;
    }
    this.fft.transform(aRe, aIm, true);

    // d(τ) = E(0..w) + E(τ..τ+w) − 2r(τ), then the cumulative mean normalised difference.
    const e0 = energy[w];
    cmnd[0] = 1;
    let sum = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      const d = Math.max(0, e0 + energy[tau + w] - energy[tau] - (2 * aRe[tau]) / size);
      sum += d;
      cmnd[tau] = sum > 0 ? (d * tau) / sum : 1;
    }

    // The first dip under the threshold, followed down to its bottom.
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cmnd[t] < THRESHOLD) {
        while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return { hz: 0, conf: 0 };

    // Parabola through the three points around the dip for a fractional period.
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const den = a - 2 * b + c;
    const frac = den > 0 ? Math.max(-1, Math.min(1, (a - c) / (2 * den))) : 0;
    return { hz: this.sampleRate / (tau + frac), conf: 1 - b };
  }
}

export interface TuneSettings {
  /** Pitch class 0–11 (C = 0). */
  key: number;
  scale: ScaleId;
  /** 0–1: how much of the way to the scale note the voice is pulled. */
  strength: number;
  /** Milliseconds the correction takes to settle (one-pole time constant). 0 = hard. */
  speed: number;
}

export const DEFAULT_TUNE: TuneSettings = { key: 0, scale: 'major', strength: 1, speed: 20 };
/** Fastest and slowest SPEED (ms). */
export const SPEED_MAX = 200;

/** How far past halfway the voice must go before the target note changes (semitones). */
const HYSTERESIS = 0.15;
/** Largest correction applied (semitones). */
const MAX_SHIFT = 7;
/** Time constant for easing the correction back to none when the voice stops (s). */
const RELEASE = 0.03;

/** Picks the target note and smooths the correction (semitones) the shifter applies. */
export class Corrector {
  /** The scale note being aimed at, or null while unvoiced. */
  target: number | null = null;
  /** The correction now, in semitones. */
  shift = 0;

  /** `midi` is the voice's pitch (null when unvoiced); `dt` the seconds since the last step. */
  step(midi: number | null, dt: number, s: TuneSettings): number {
    if (midi === null) {
      this.target = null;
      this.shift *= Math.exp(-dt / RELEASE);
      if (Math.abs(this.shift) < 1e-3) this.shift = 0; // exactly 1:1, so the shifter passes the input through
      return this.shift;
    }
    let target = nearestInScale(midi, s.key, s.scale);
    const prev = this.target;
    if (
      prev !== null &&
      prev !== target &&
      inScale(prev, s.key, s.scale) &&
      Math.abs(midi - prev) < Math.abs(midi - target) + HYSTERESIS
    ) {
      target = prev;
    }
    this.target = target;
    const want = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, (target - midi) * s.strength));
    const a = s.speed <= 0 ? 1 : 1 - Math.exp(-dt / (s.speed / 1000));
    this.shift += (want - this.shift) * a;
    return this.shift;
  }
}
