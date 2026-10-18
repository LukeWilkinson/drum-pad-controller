// KEYS sound: the instrument played from the KEYS tab, the computer keyboard (later loops and MIDI).
// Synth presets are Tone.js instruments on the engine's AudioContext. Live notes are triggered at
// ctx.currentTime, so Tone's look-ahead never delays them. Sampled presets are raw Web Audio voices
// like the drums: the nearest recorded note, re-pitched with playbackRate (samples from
// src/audio/instruments.json, loaded into the engine's buffer cache when first picked).
// Scheduled notes (ARP, loops) go through playAt(), which hands them over just before their time so
// they can still be cancelled. bend() moves every sounding note. Every preset plays into one keys
// bus, which feeds the master.

import { Distortion, FMSynth, Filter, MonoSynth, PolySynth, Synth, type ToneAudioNode } from 'tone';
import type { AudioEngine } from './engine';
import data from './instruments.json';
import type { KeysSource } from '../keys/types';

/** A sampled instrument (src/audio/instruments.json). */
export interface InstrumentDef {
  id: string;
  name: string;
  /** Length of each file in seconds. */
  seconds: number;
  /** Fade-out after note-off, seconds. */
  release: number;
  /** Level in dB, to even out the instruments. */
  gain: number;
  /** Sustain loop [start, end] in seconds, for instruments that hold (strings). */
  loop?: number[];
  /** Recorded notes, low to high. */
  samples: { note: number }[];
}

export const INSTRUMENTS = data.instruments as InstrumentDef[];

/** The engine's sample name for a recorded note: samples/instruments/<id>/<note>.flac. */
const sampleName = (inst: InstrumentDef, note: number) => `instruments/${inst.id}/${note}`;
const LOOP_FADE = 0.3; // seconds of crossfade baked in before a loop's end

/** One preset's note handling. Times are context seconds; velocity is 0–1. */
interface Voice {
  noteOn(note: number, velocity: number, time: number): void;
  noteOff(note: number, time: number): void;
  allOff(time: number): void;
  /** Pitch bend in cents, for sounding notes and the ones that follow. */
  bend(cents: number, time: number): void;
}

interface Built {
  voice: Voice;
  /** The node that plays into the keys bus. */
  out: ToneAudioNode;
}

const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const MIN_STEP = 0.001; // seconds between two attacks on a mono voice
const BEND_RAMP = 0.015; // seconds; smooths pitch-bend steps so they don't zip
/** Scheduled notes (arp, loops) are handed to the voice this long before their time. */
const HANDOVER = 0.03;

/** Many notes at once. A note played again while it still sounds is ended first. */
class PolyVoice implements Voice {
  private sounding = new Set<number>();
  constructor(private synth: PolySynth<Synth> | PolySynth<FMSynth>) {}
  noteOn(note: number, velocity: number, time: number): void {
    if (this.sounding.has(note)) this.synth.triggerRelease(hz(note), time);
    this.synth.triggerAttack(hz(note), time, velocity);
    this.sounding.add(note);
  }
  noteOff(note: number, time: number): void {
    if (this.sounding.delete(note)) this.synth.triggerRelease(hz(note), time);
  }
  allOff(time: number): void {
    this.synth.releaseAll(time);
    this.sounding.clear();
  }
  bend(cents: number): void {
    (this.synth as PolySynth).set({ detune: cents });
  }
}

/**
 * One note at a time, last-note priority: the newest held note sounds. Letting it go returns
 * to the note still held before it (gliding there if the preset has portamento).
 */
class MonoVoice implements Voice {
  /** Held notes, oldest first. */
  private held: number[] = [];
  /** Last attack time. Tone throws if a sounding oscillator is restarted at the same time (a chord). */
  private lastAttack = 0;
  constructor(private synth: MonoSynth) {}
  noteOn(note: number, velocity: number, time: number): void {
    this.held = this.held.filter((n) => n !== note);
    this.held.push(note);
    const t = Math.max(time, this.lastAttack + MIN_STEP);
    this.lastAttack = t;
    this.synth.triggerAttack(hz(note), t, velocity);
  }
  noteOff(note: number, time: number): void {
    const top = this.held[this.held.length - 1];
    this.held = this.held.filter((n) => n !== note);
    if (note !== top) return;
    const prev = this.held[this.held.length - 1];
    if (prev === undefined) this.synth.triggerRelease(time);
    else this.synth.setNote(hz(prev), time);
  }
  allOff(time: number): void {
    this.held = [];
    this.synth.triggerRelease(time);
  }
  bend(cents: number, time: number): void {
    this.synth.detune.cancelScheduledValues(time);
    this.synth.detune.linearRampToValueAtTime(cents, time + BEND_RAMP);
  }
}

/**
 * Recorded notes. Each note plays the nearest recorded one, re-pitched; a note played again while
 * it still sounds is faded out first. Without a loop a note dies away with its sample.
 */
class SampledVoice implements Voice {
  private sounding = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();
  private level: number;
  private cents = 0;
  /** Buffers whose loop crossfade is already baked in. */
  private looped = new WeakSet<AudioBuffer>();

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private inst: InstrumentDef,
    private bufferOf: (name: string) => AudioBuffer | undefined,
  ) {
    this.level = Math.pow(10, inst.gain / 20);
  }

  noteOn(note: number, velocity: number, time: number): void {
    this.noteOff(note, time);
    const root = nearest(this.inst.samples, note);
    const buffer = this.bufferOf(sampleName(this.inst, root));
    if (!buffer) return; // still loading
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.pow(2, (note - root) / 12);
    src.detune.value = this.cents;
    const loop = this.inst.loop;
    if (loop && buffer.duration > loop[1]) {
      this.bakeLoop(buffer, loop[0], loop[1]);
      src.loop = true;
      src.loopStart = loop[0];
      src.loopEnd = loop[1];
    }
    const gain = this.ctx.createGain();
    gain.gain.value = velocity * this.level;
    src.connect(gain).connect(this.out);
    src.start(time);
    const voice = { src, gain };
    src.addEventListener('ended', () => {
      if (this.sounding.get(note) === voice) this.sounding.delete(note);
    });
    this.sounding.set(note, voice);
  }

  noteOff(note: number, time: number): void {
    const v = this.sounding.get(note);
    if (!v) return;
    this.sounding.delete(note);
    const release = this.inst.release;
    const g = v.gain.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(g.value, time);
    g.setTargetAtTime(0, time, release / 4); // about 98% faded after `release`
    v.src.stop(time + release + 0.05);
  }

  allOff(time: number): void {
    for (const note of [...this.sounding.keys()]) this.noteOff(note, time);
  }

  bend(cents: number, time: number): void {
    this.cents = cents;
    for (const { src } of this.sounding.values()) {
      src.detune.cancelScheduledValues(time);
      src.detune.linearRampToValueAtTime(cents, time + BEND_RAMP);
    }
  }

  /**
   * Blends the last LOOP_FADE seconds before the loop end into the audio just before the loop
   * start (equal power), so the jump back to the start is seamless. Done once per buffer, in place.
   */
  private bakeLoop(buffer: AudioBuffer, start: number, end: number): void {
    if (this.looped.has(buffer)) return;
    this.looped.add(buffer);
    const rate = buffer.sampleRate;
    const n = Math.floor(LOOP_FADE * rate);
    const s = Math.floor(start * rate);
    const e = Math.floor(end * rate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[e - n + i] = d[e - n + i] * Math.cos(t * Math.PI / 2) + d[s - n + i] * Math.sin(t * Math.PI / 2);
      }
    }
  }
}

/** The recorded note closest to `note` (the lower one on a tie). */
function nearest(samples: { note: number }[], note: number): number {
  let best = samples[0].note;
  for (const s of samples) if (Math.abs(s.note - note) < Math.abs(best - note)) best = s.note;
  return best;
}

// ---------- Synth presets (same order as PRESETS.synth in src/keys/types.ts) ----------

function warmPad(): Built {
  const filter = new Filter({ type: 'lowpass', frequency: 1600, Q: 0.5 });
  const synth = new PolySynth(Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.75, release: 1.8 },
  });
  synth.maxPolyphony = 12;
  synth.volume.value = -16;
  synth.connect(filter);
  return { voice: new PolyVoice(synth), out: filter };
}

function sawLead(): Built {
  const synth = new MonoSynth({
    oscillator: { type: 'sawtooth' },
    portamento: 0.06,
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.25 },
    filter: { type: 'lowpass', Q: 3, rolloff: -24 },
    filterEnvelope: { attack: 0.005, decay: 0.25, sustain: 0.4, release: 0.3, baseFrequency: 300, octaves: 3.5 },
  });
  synth.volume.value = -12;
  return { voice: new MonoVoice(synth), out: synth };
}

function subBass(): Built {
  const drive = new Distortion({ distortion: 0.35, wet: 0.6 });
  const synth = new MonoSynth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.004, decay: 0.15, sustain: 0.85, release: 0.18 },
    filter: { type: 'lowpass', Q: 0, rolloff: -12 },
    filterEnvelope: { attack: 0.001, decay: 0.1, sustain: 1, release: 0.2, baseFrequency: 900, octaves: 1 },
  });
  synth.volume.value = -8;
  synth.connect(drive);
  return { voice: new MonoVoice(synth), out: drive };
}

function glassPluck(): Built {
  const synth = new PolySynth(FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 12,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 0.9 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.3 },
  });
  synth.maxPolyphony = 16;
  synth.volume.value = -12;
  return { voice: new PolyVoice(synth), out: synth };
}

const SYNTHS = [warmPad, sawLead, subBass, glassPluck];

export class KeysEngine {
  private bus: GainNode;
  /** Presets, built the first time each is picked and then kept (sampled buffers stay loaded). */
  private synths: (Built | undefined)[] = [];
  private sampled: (SampledVoice | undefined)[] = [];
  private voice: Voice | null = null;
  /** Current pitch bend in cents (the PITCH strip). */
  private cents = 0;
  /** Cancel functions of scheduled notes not yet finished. */
  private scheduled = new Set<() => void>();

  constructor(private engine: AudioEngine) {
    this.bus = engine.ctx.createGain();
    this.bus.connect(engine.input);
  }

  /**
   * Switches preset. Notes still sounding on the old one are released. A sampled instrument plays
   * as soon as it is picked; notes are silent until their samples have loaded (the promise).
   */
  setPreset(source: KeysSource, index: number, onProgress?: (done: number, total: number) => void): Promise<void> {
    const now = this.engine.ctx.currentTime;
    this.voice?.allOff(now);
    if (source === 'sampled') {
      const inst = INSTRUMENTS[index];
      let voice = this.sampled[index];
      if (!voice) {
        voice = new SampledVoice(this.engine.ctx, this.bus, inst, (name) => this.engine.buffer(name));
        this.sampled[index] = voice;
      }
      this.voice = voice;
      voice.bend(this.cents, now);
      return this.engine.loadSamples(inst.samples.map((s) => sampleName(inst, s.note)), onProgress);
    }
    let built = this.synths[index];
    if (!built) {
      built = SYNTHS[index]();
      built.out.connect(this.bus);
      this.synths[index] = built;
    }
    this.voice = built.voice;
    this.voice.bend(this.cents, now);
    return Promise.resolve();
  }

  /** Starts `note` (MIDI number) now at MIDI velocity 1–127. Silent while the app's sound is muted for MIDI. */
  noteOn(note: number, velocity: number): void {
    if (!this.engine.localSound) return;
    this.voice?.noteOn(note, Math.pow(velocity / 127, 1.3), this.engine.ctx.currentTime);
  }

  noteOff(note: number): void {
    this.voice?.noteOff(note, this.engine.ctx.currentTime);
  }

  allOff(): void {
    this.voice?.allOff(this.engine.ctx.currentTime);
  }

  /**
   * Plays `note` at context time `when` for `length` seconds (ARP, loops). The note is handed to
   * the voice just before its time, so the returned cancel function still works: before the note
   * starts it never sounds; while it sounds it ends now.
   */
  playAt(note: number, velocity: number, when: number, length: number): () => void {
    if (!this.engine.localSound) return () => {};
    const ctx = this.engine.ctx;
    const vel = Math.pow(velocity / 127, 1.3);
    let voice: Voice | null = null; // the preset playing when the note started
    let onTimer = 0;
    let offTimer = 0;
    let done = false;
    const finish = () => {
      done = true;
      this.scheduled.delete(cancel);
    };
    const cancel = () => {
      if (done) return;
      clearTimeout(onTimer);
      clearTimeout(offTimer);
      voice?.noteOff(note, ctx.currentTime);
      finish();
    };
    onTimer = this.after(when, () => {
      voice = this.voice;
      voice?.noteOn(note, vel, Math.max(when, ctx.currentTime));
    });
    offTimer = this.after(when + length, () => {
      voice?.noteOff(note, Math.max(when + length, ctx.currentTime));
      finish();
    });
    if (!done) this.scheduled.add(cancel);
    return cancel;
  }

  /** Cancels every scheduled note (the transport stopped, ARP went off). */
  cancelScheduled(): void {
    for (const cancel of [...this.scheduled]) cancel();
  }

  /** Pitch bend in semitones (±2 from the PITCH strip). */
  bend(semitones: number): void {
    this.cents = semitones * 100;
    this.voice?.bend(this.cents, this.engine.ctx.currentTime);
  }

  /** Runs `fn` HANDOVER seconds before context time `t` (at once if that has passed). Returns the timer. */
  private after(t: number, fn: () => void): number {
    const delay = (t - HANDOVER - this.engine.ctx.currentTime) * 1000;
    if (delay <= 0) {
      fn();
      return 0;
    }
    return window.setTimeout(fn, delay);
  }
}
