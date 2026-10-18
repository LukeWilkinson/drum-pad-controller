// KEYS sound: the instrument played from the KEYS tab (and later the computer keyboard, loops and MIDI).
// Synth presets are Tone.js instruments on the engine's AudioContext. Live notes are triggered at
// ctx.currentTime, so Tone's look-ahead never delays them. Sampled presets (step 2) will be raw
// Web Audio voices like the drums. Every preset plays into one keys bus, which feeds the master.

import { Distortion, FMSynth, Filter, MonoSynth, PolySynth, Synth, type ToneAudioNode } from 'tone';
import type { AudioEngine } from './engine';
import type { KeysSource } from '../keys/types';

/** One preset's note handling. Times are context seconds; velocity is 0–1. */
interface Voice {
  noteOn(note: number, velocity: number, time: number): void;
  noteOff(note: number, time: number): void;
  allOff(time: number): void;
}

interface Built {
  voice: Voice;
  /** The node that plays into the keys bus. */
  out: ToneAudioNode;
}

const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const MIN_STEP = 0.001; // seconds between two attacks on a mono voice

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
  /** Synth presets, built the first time each is picked and then kept. */
  private synths: (Built | undefined)[] = [];
  private voice: Voice | null = null;

  constructor(private engine: AudioEngine) {
    this.bus = engine.ctx.createGain();
    this.bus.connect(engine.input);
  }

  /** Switches preset. Notes still sounding on the old one are released. */
  setPreset(source: KeysSource, index: number): void {
    this.voice?.allOff(this.engine.ctx.currentTime);
    if (source === 'sampled') {
      this.voice = null; // sampled instruments arrive in M5 step 2
      return;
    }
    let built = this.synths[index];
    if (!built) {
      built = SYNTHS[index]();
      built.out.connect(this.bus);
      this.synths[index] = built;
    }
    this.voice = built.voice;
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
}
