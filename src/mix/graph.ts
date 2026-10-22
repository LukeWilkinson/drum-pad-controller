// The mixer and effects as Web Audio nodes, built once on the engine's context.
//
//   pad voice ─┬─────────────────────────────→ strip dry (fader × mute) ─┬→ meter
//              ├→ reverb send (pad amount) ──→ strip rv  (fader × mute) ─┼→ reverb in
//              └→ delay send (pad amount) ───→ strip dl  (fader × mute) ─┼→ delay in
//   KEYS bus ──→ keys fader ─┬→ meter, master sum                       │
//                            ├→ keys reverb send ──────────────────────┘
//                            └→ keys delay send
//   strips dry ─→ master sum ←─ reverb return (MIX × on) ← convolver ← reverb in
//                     │      ←─ delay return  (MIX × on) ← delay line (+ feedback) ← delay in
//                     ├→ bypass gain ────┐
//                     └→ filter → filter gain ─┴→ master fader (× mute) ─┬→ meter, speakers
//                                                                        └→ recorder tap (src/audio/recorder.ts)
//   metronome click ──→ click fader (follows MASTER) ──→ meter, speakers (skips strips, FX and the recorder)
//
// Sends are post-fader, so pulling a strip down or muting it also quietens its reverb and delay.
// This file only builds and sets nodes; src/mix/mix.ts decides the values.

import { generateImpulse } from './impulse';
import { FILTER_TYPES, STRIPS, faderGain, type PadStrip, type StripId } from './types';

const RAMP = 0.015; // seconds; smoothing for level changes so they never click
const DELAY_MAX = 4; // seconds; 1/2 note at 40 BPM is 3 s
const DELAY_TONE = 5000; // Hz; repeats get a little darker each time round
const IR_WAIT = 120; // ms; a reverb knob being turned rebuilds the impulse once it rests

interface PadStripNodes {
  dry: GainNode;
  rv: GainNode;
  dl: GainNode;
}

export class MixGraph {
  /** Where pad voices go, per strip. */
  readonly pads: Record<PadStrip, PadStripNodes>;
  /** Where the KEYS instrument connects. */
  readonly keysIn: GainNode;
  /** Where the metronome click connects: its own fader that follows MASTER, so it is heard but never recorded. */
  readonly clickIn: AudioNode;
  /** Everything after the MASTER fader except the click: what WAV export records. */
  readonly recordTap: AudioNode;
  /** Plays straight into the master sum (sample previews in the Kits panel). */
  readonly previewIn: AudioNode;

  private keysFader: GainNode;
  private keysRv: GainNode;
  private keysDl: GainNode;
  private sum: GainNode;
  private bypass: GainNode;
  private filter: BiquadFilterNode;
  private filterGain: GainNode;
  private master: GainNode;
  private clickFader: GainNode;
  private meters = new Map<StripId, AnalyserNode>();
  /** About 43 ms at 48 kHz: longer than a screen frame, so a meter read each frame misses no peak. */
  private meterData = new Float32Array(2048);

  private reverbIn: GainNode;
  private convolver: ConvolverNode;
  private reverbReturn: GainNode;
  private reverbOn = false;
  private irTimer = 0;
  private irWanted = '';

  private delayIn: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private delayReturn: GainNode;
  private delayOn = false;

  constructor(private ctx: AudioContext) {
    const gain = (value = 1) => {
      const g = ctx.createGain();
      g.gain.value = value;
      return g;
    };

    this.master = gain();
    const masterMeter = this.meter('master');
    this.master.connect(masterMeter);
    this.master.connect(ctx.destination);
    this.recordTap = this.master;
    this.clickFader = gain();
    this.clickFader.connect(masterMeter);
    this.clickFader.connect(ctx.destination);
    this.clickIn = this.clickFader;

    this.sum = gain();
    this.previewIn = this.sum;
    this.bypass = gain(1);
    this.filter = ctx.createBiquadFilter();
    this.filterGain = gain(0);
    this.sum.connect(this.bypass).connect(this.master);
    this.sum.connect(this.filter).connect(this.filterGain).connect(this.master);

    this.reverbIn = gain();
    this.convolver = ctx.createConvolver();
    this.reverbReturn = gain(0);
    this.convolver.connect(this.reverbReturn).connect(this.sum);

    this.delayIn = gain();
    this.delay = ctx.createDelay(DELAY_MAX);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = DELAY_TONE;
    this.feedback = gain(0);
    this.delayReturn = gain(0);
    this.delay.connect(tone).connect(this.feedback).connect(this.delay);
    this.delay.connect(this.delayReturn).connect(this.sum);

    const pads = {} as Record<PadStrip, PadStripNodes>;
    for (const id of ['kicks', 'snare', 'hats', 'perc'] as const) {
      const nodes = { dry: gain(), rv: gain(), dl: gain() };
      nodes.dry.connect(this.meter(id));
      nodes.dry.connect(this.sum);
      nodes.rv.connect(this.reverbIn);
      nodes.dl.connect(this.delayIn);
      pads[id] = nodes;
    }
    this.pads = pads;

    this.keysIn = gain();
    this.keysFader = gain();
    this.keysRv = gain(0);
    this.keysDl = gain(0);
    this.keysIn.connect(this.keysFader);
    this.keysFader.connect(this.meter('keys'));
    this.keysFader.connect(this.sum);
    this.keysFader.connect(this.keysRv).connect(this.reverbIn);
    this.keysFader.connect(this.keysDl).connect(this.delayIn);
  }

  /** A strip's fader and mute. */
  setStrip(id: StripId, level: number, mute: boolean): void {
    const g = mute ? 0 : faderGain(level);
    if (id === 'master') {
      this.ramp(this.master.gain, g);
      this.ramp(this.clickFader.gain, g);
    }
    else if (id === 'keys') this.ramp(this.keysFader.gain, g);
    else for (const node of Object.values(this.pads[id])) this.ramp(node.gain, g);
  }

  /** The KEYS bus's reverb and delay send amounts, 0–1. */
  setKeysSends(reverb: number, delay: number): void {
    this.ramp(this.keysRv.gain, reverb);
    this.ramp(this.keysDl.gain, delay);
  }

  /**
   * Reverb on/off, room size (index into REVERB_SIZES), decay in seconds and return level.
   * Off disconnects the convolver's input, which saves CPU on slow phones; tails are faded out.
   */
  setReverb(on: boolean, size: number, decay: number, mix: number): void {
    this.ramp(this.reverbReturn.gain, on ? mix : 0);
    if (on !== this.reverbOn) {
      if (on) this.reverbIn.connect(this.convolver);
      else this.reverbIn.disconnect(this.convolver);
      this.reverbOn = on;
    }
    const wanted = `${size}/${decay}`;
    if (wanted === this.irWanted) return;
    this.irWanted = wanted;
    // The first impulse is built at once; later ones wait for the knob to rest.
    clearTimeout(this.irTimer);
    const build = () => (this.convolver.buffer = generateImpulse(this.ctx, size, decay));
    if (!this.convolver.buffer) build();
    else this.irTimer = window.setTimeout(build, IR_WAIT);
  }

  /** Delay on/off, time in seconds, feedback 0–0.9 and return level. Off also stops the repeats. */
  setDelay(on: boolean, seconds: number, feedback: number, mix: number): void {
    this.ramp(this.delayReturn.gain, on ? mix : 0);
    this.ramp(this.feedback.gain, on ? feedback : 0);
    // A slower glide for the time, so a tempo change bends the repeats instead of clicking.
    this.delay.delayTime.setTargetAtTime(Math.min(seconds, DELAY_MAX), this.ctx.currentTime, 0.05);
    if (on !== this.delayOn) {
      if (on) this.delayIn.connect(this.delay);
      else this.delayIn.disconnect(this.delay);
      this.delayOn = on;
    }
  }

  /** Master filter on/off (crossfaded with the bypass), type index, cutoff in Hz and resonance (Q factor). */
  setFilter(on: boolean, type: number, cutoff: number, res: number): void {
    const t = FILTER_TYPES[type]?.type ?? 'lowpass';
    if (this.filter.type !== t) this.filter.type = t;
    this.ramp(this.filter.frequency, cutoff);
    // Low- and high-pass take Q in dB; band-pass takes the Q factor itself.
    this.ramp(this.filter.Q, t === 'bandpass' ? res : 20 * Math.log10(res));
    this.ramp(this.bypass.gain, on ? 0 : 1);
    this.ramp(this.filterGain.gain, on ? 1 : 0);
  }

  /** Peak level of each strip over the last ~43 ms, in dB (−Infinity when silent). Post-fader. */
  levels(): Record<StripId, number> {
    const out = {} as Record<StripId, number>;
    for (const id of STRIPS) {
      const a = this.meters.get(id)!;
      a.getFloatTimeDomainData(this.meterData);
      let peak = 0;
      for (const v of this.meterData) peak = Math.max(peak, Math.abs(v));
      out[id] = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    }
    return out;
  }

  private meter(id: StripId): AnalyserNode {
    const a = this.ctx.createAnalyser();
    a.fftSize = this.meterData.length;
    this.meters.set(id, a);
    return a;
  }

  private ramp(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.ctx.currentTime, RAMP / 3);
  }
}
