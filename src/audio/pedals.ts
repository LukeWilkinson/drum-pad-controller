// The KEYS pedalboard as audio: KEYS bus → the pedals that are on, in a fixed order → fade → KEYS strip.
//
//   head ─→ comp → drive → amp → wah → chorus → phaser → tremolo → crush ─→ fade ─→ tail
//           (only the pedals that are on are wired in; with none on: head → fade → tail)
//
// A pedal is built the first time it is turned on and then kept. A pedal that is off is unwired, not
// set to wet 0, so nothing pulls audio through it. Its LFO (chorus, phaser, tremolo) is started once.
// Rewiring is hidden behind a short fade so a pedal switched while notes sound doesn't click.
// Knob values arrive in their own units (src/keys/pedals.ts); this file only builds and sets nodes.

import {
  AutoWah,
  BitCrusher,
  Chorus,
  Compressor,
  Filter,
  Gain,
  Phaser,
  Tremolo,
  WaveShaper,
  getContext,
  type BaseContext,
} from 'tone';
import { PEDAL_IDS, type Board, type PedalId } from '../keys/pedals';

const RAMP = 0.03; // seconds; smoothing for knob changes
const FADE = 0.012; // seconds; the dip that hides a rewire
const CURVE_SIZE = 4096;
/** Level (peak) the drive and amp are matched at: a signal this loud comes out about as loud. */
const MATCH = 0.12;

const dbGain = (db: number) => Math.pow(10, db / 20);

/**
 * Glides a Tone param to `v` starting now. Tone's own rampTo starts after its look-ahead (0.1 s in
 * this app), which a knob being turned would feel, and picks an exponential ramp for dB and Hz
 * params, which throws on a threshold of 0 dB.
 */
function glide(param: { linearRampTo(v: number, ramp: number, start: number): unknown; context: BaseContext }, v: number): void {
  param.linearRampTo(v, RAMP, param.context.currentTime);
}

/** One pedal: native input and output, so the chain is wired with plain Web Audio connects. */
interface Unit {
  input: AudioNode;
  output: AudioNode;
  set(k: readonly [number, number]): void;
}

/** A Tone gain whose native node is the unit's input or output. */
const io = (context: BaseContext) => new Gain({ context });

/**
 * A soft clipper over the WaveShaper's −1…1 input: tanh(HARD · (x + bias)), DC removed and scaled so
 * the curve ends at ±1. Inputs past ±1 stay at the end value (already flat at HARD = 4).
 */
function clipCurve(bias: number): Float32Array {
  const HARD = 4;
  const curve = new Float32Array(CURVE_SIZE);
  const f = (x: number) => Math.tanh(HARD * (x + bias)) - Math.tanh(HARD * bias);
  const peak = Math.max(Math.abs(f(1)), Math.abs(f(-1)));
  for (let i = 0; i < CURVE_SIZE; i++) curve[i] = f((i / (CURVE_SIZE - 1)) * 2 - 1) / peak;
  return curve;
}

/**
 * Pre-gain into a clipCurve and the gain after it, so a MATCH-level peak comes out at about MATCH.
 * `amount` 0–1 adds up to `rangeDb` of drive on top of a nearly clean start. Clipping also squares
 * the sound off (more power for the same peak), so `trimDb` × amount² comes off as well; trimDb
 * was measured by scripts/pedal-check.js.
 */
function driveGains(curve: Float32Array, amount: number, rangeDb: number, trimDb: number): { pre: number; post: number } {
  const pre = 0.25 * dbGain(amount * rangeDb);
  const x = Math.min(1, pre * MATCH);
  const y = Math.abs(curve[Math.round(((x + 1) / 2) * (CURVE_SIZE - 1))]);
  return { pre, post: (MATCH / Math.max(y, 1e-6)) * dbGain(-trimDb * amount * amount) };
}

/** Tone's crossfades are equal-power, so a 50 / 50 mix of two alike signals is 3 dB up; this undoes it. */
const mixTrim = (wet: number) => 1 / (Math.cos((wet * Math.PI) / 2) + Math.sin((wet * Math.PI) / 2));

/**
 * How much louder the compressor node makes a KEYS-level chord at SUSTAIN 0, 0.25 … 1 (dB, measured
 * by scripts/pedal-check.js). The node adds its own make-up gain, which outgrows the gain it takes
 * until the threshold passes below the chord's peaks.
 */
const COMP_LIFT = [0, 2.9, 6.7, 5.4, 3.1];
const compLift = (s: number) => {
  const x = Math.min(1, Math.max(0, s)) * (COMP_LIFT.length - 1);
  const i = Math.min(COMP_LIFT.length - 2, Math.floor(x));
  return COMP_LIFT[i] + (x - i) * (COMP_LIFT[i + 1] - COMP_LIFT[i]);
};

function comp(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const c = new Compressor({ context, attack: 0.008, release: 0.18, knee: 8, ratio: 4 });
  input.chain(c, output);
  return {
    input: input.input,
    output: output.output,
    set([sustain, level]) {
      // SUSTAIN lowers the threshold to −40 dB; LEVEL is on top of the measured lift taken back off.
      glide(c.threshold, -40 * sustain);
      glide(output.gain, dbGain(level - compLift(sustain)));
    },
  };
}

function drive(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const curve = clipCurve(0);
  const shaper = new WaveShaper({ context, mapping: curve });
  shaper.oversample = '4x';
  const tone = new Filter({ context, type: 'lowpass', rolloff: -12, Q: 0.5 });
  input.chain(shaper, tone, output);
  return {
    input: input.input,
    output: output.output,
    set([amount, freq]) {
      const g = driveGains(curve, amount, 36, 5);
      glide(input.gain, g.pre);
      glide(output.gain, g.post);
      glide(tone.frequency, freq);
    },
  };
}

/** A small valve amp: asymmetric clipping (even harmonics) into a 1×12 cabinet's curve. */
function amp(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const curve = clipCurve(0.15);
  const shaper = new WaveShaper({ context, mapping: curve });
  shaper.oversample = '4x';
  const low = new Filter({ context, type: 'highpass', frequency: 90, rolloff: -12, Q: 0.7 });
  const thump = new Filter({ context, type: 'peaking', frequency: 120, Q: 1, gain: 3 });
  const scoop = new Filter({ context, type: 'peaking', frequency: 700, Q: 0.8, gain: -3 });
  const cab = new Filter({ context, type: 'lowpass', rolloff: -24, Q: 0.7 });
  input.chain(shaper, low, thump, scoop, cab, output);
  return {
    input: input.input,
    output: output.output,
    set([gain, freq]) {
      const g = driveGains(curve, gain, 30, 10);
      glide(input.gain, g.pre);
      glide(output.gain, g.post);
      glide(cab.frequency, freq);
    },
  };
}

/** Auto-wah: the playing level sweeps a resonant band up from FREQ; SENS is how far a note pushes it. */
function wah(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const w = new AutoWah({ context, octaves: 3.5, Q: 3, gain: 6, follower: 0.08, wet: 0.8 });
  input.chain(w, output);
  output.gain.value = dbGain(-5.8); // the band's peak lifts the notes under it (measured)
  return {
    input: input.input,
    output: output.output,
    set([freq, sens]) {
      w.baseFrequency = freq;
      w.sensitivity = -30 * sens; // up to +30 dB into the envelope follower
    },
  };
}

function chorus(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const c = new Chorus({ context, delayTime: 3.5, spread: 180, wet: 0.5 }).start();
  input.chain(c, output);
  return {
    input: input.input,
    output: output.output,
    set([rate, depth]) {
      glide(c.frequency, rate);
      c.depth = depth;
    },
  };
}

function phaser(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  // Half wet: the notches come from adding the phase-shifted copy to the dry sound.
  const p = new Phaser({ context, baseFrequency: 300, stages: 4, Q: 0.6, wet: 0.5 });
  input.chain(p, output);
  return {
    input: input.input,
    output: output.output,
    set([rate, depth]) {
      glide(p.frequency, rate);
      p.octaves = 1 + 4 * depth;
    },
  };
}

/**
 * Tremolo that dips from full level: DEPTH 0.6 swings the gain between 0.4 and 1. Tone's Tremolo swings
 * around 0.5 (0.5 ± depth / 2), so its depth is set to d / (2 − d) and the output scaled back to 1 at the top.
 */
function tremolo(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const t = new Tremolo({ context, spread: 0 }).start();
  input.chain(t, output);
  return {
    input: input.input,
    output: output.output,
    set([rate, depth]) {
      const d = depth / (2 - depth);
      glide(t.frequency, rate);
      glide(t.depth, d);
      glide(output.gain, 2 / (1 + d));
    },
  };
}

/**
 * Bit crusher (Tone's AudioWorklet; silent for a moment the first time while the worklet loads).
 * KEYS peaks sit around 0.1–0.25, where a few bits would round everything to silence, so the signal
 * is raised by CRUSH_LIFT into the crusher and lowered again after it.
 */
const CRUSH_LIFT = 4;
function crush(context: BaseContext): Unit {
  const input = io(context);
  const output = io(context);
  const b = new BitCrusher({ context });
  input.chain(b, output);
  input.gain.value = CRUSH_LIFT;
  return {
    input: input.input,
    output: output.output,
    set([bits, mix]) {
      b.bits.value = bits;
      glide(b.wet, mix);
      glide(output.gain, mixTrim(mix) / CRUSH_LIFT);
    },
  };
}

const BUILD: Record<PedalId, (context: BaseContext) => Unit> = { comp, drive, amp, wah, chorus, phaser, tremolo, crush };

export class PedalChain {
  private units: Partial<Record<PedalId, Unit>> = {};
  private fade: GainNode;
  /** Pedals wired in now, and the ones the last set() asked for (comma-joined, in chain order). */
  private wired = '';
  private wanted = '';
  private timer = 0;

  /** Wires `head` → `tail` with every pedal off. `context` is Tone's (the app's, unless a test passes its own). */
  constructor(
    private head: AudioNode,
    tail: AudioNode,
    private context: BaseContext = getContext(),
  ) {
    this.fade = context.createGain();
    this.fade.connect(tail);
    head.connect(this.fade);
  }

  /**
   * Applies a board: knob values at once (smoothed), the wiring after a short fade. `smooth` false
   * rewires at once (an offline render, or nothing sounding).
   */
  set(board: Readonly<Board>, smooth = true): void {
    for (const id of PEDAL_IDS) {
      if (board[id].on && !this.units[id]) this.units[id] = BUILD[id](this.context);
      this.units[id]?.set(board[id].k);
    }
    this.wanted = PEDAL_IDS.filter((id) => board[id].on).join();
    if (this.wanted === this.wired && !this.timer) return;
    if (!smooth) {
      clearTimeout(this.timer);
      this.timer = 0;
      this.rewire();
      this.fade.gain.cancelScheduledValues(0);
      this.fade.gain.value = 1;
      return;
    }
    if (this.timer) return; // a rewire is already waiting; it picks up `wanted`
    const g = this.fade.gain;
    const now = this.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.rewire();
      const t = this.context.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(1, t + FADE);
    }, FADE * 1000 + 5);
  }

  /** The pedals wired in now, in chain order (for checks). */
  get active(): PedalId[] {
    return this.wired ? (this.wired.split(',') as PedalId[]) : [];
  }

  private rewire(): void {
    if (this.wanted === this.wired) return;
    this.head.disconnect();
    for (const u of Object.values(this.units)) u.output.disconnect();
    let from = this.head;
    for (const id of this.wanted ? (this.wanted.split(',') as PedalId[]) : []) {
      const u = this.units[id]!;
      from.connect(u.input);
      from = u.output;
    }
    from.connect(this.fade);
    this.wired = this.wanted;
  }
}
