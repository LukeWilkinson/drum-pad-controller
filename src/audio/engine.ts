// Low-latency one-shot sampler on raw Web Audio.
// Every live hit creates a fresh AudioBufferSourceNode and starts it immediately (no look-ahead),
// so the only delay is the device's output latency. Sequenced hits and metronome clicks are
// scheduled ahead with playAt()/click() by the clock (src/audio/clock.ts).
// Voice chain: source (pitch via playbackRate) → gain (velocity × pad volume, decay envelope)
// → stereo panner (only when the pad is panned) → the pad group's mixer strip, plus a reverb and
// a delay send when the pad has them (src/mix/graph.ts).

import { state } from '../state';
import { getSample } from '../store/db';
import { MixGraph } from '../mix/graph';
import { USER_PREFIX } from './userSamples';
import { GROUP_STRIP, type PadStrip } from '../mix/types';
import {
  DEFAULT_PARAMS,
  PADS_PER_BANK,
  SAMPLE_DIR,
  SAMPLE_EXT,
  SAMPLES_ROOT,
  SOFT_LAYER_BELOW,
  sampleNamesOf,
  type ActiveKit,
  type PadParams,
} from './kit';

const CHOKE_FADE = 0.01; // seconds; short fade avoids a click when a hat is cut off
const DECAY_TAIL = 0.015; // seconds; fade at the end of a shortened (decayed) sample
const CLICK_LEVEL = 0.45;

interface Voice {
  src: AudioScheduledSourceNode;
  gain: GainNode;
  /** Start time in context seconds. */
  when: number;
}

/**
 * Told about every pad hit so it can go out as MIDI (src/midi/out.ts). `at()` returns a cancel
 * function like playAt() does; cancelAll() is called when the transport stops.
 */
export interface HitHook {
  now(index: number, velocity: number): void;
  at(index: number, velocity: number, when: number): () => void;
  cancelAll(): void;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  /** False mutes the app's own sound (a DAW plays the MIDI notes instead). The hit hook still hears every hit. */
  localSound = true;
  /** Mixer strips, effects and master volume (set by src/mix/mix.ts). */
  readonly mix: MixGraph;
  private hook: HitHook | null = null;
  private buffers = new Map<string, AudioBuffer>();
  /** Samples being fetched, so two kits asking for the same file share one download. */
  private loading = new Map<string, Promise<void>>();
  /** Imported samples a kit asked for that aren't stored any more. */
  private missing = new Set<string>();
  private kit: ActiveKit | null = null;
  /** Voices still ringing, per choke group, so they can be cut off. */
  private chokeVoices = new Map<string, Set<Voice>>();
  /** Scheduled voices (sequenced hits, clicks) not yet ended, so stop() can cancel ones still in the future. */
  private scheduled = new Set<Voice>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: state.latency.low ? 'interactive' : 'playback' });
    this.mix = new MixGraph(this.ctx);
  }

  get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** Where the KEYS instrument connects: the mixer's KEYS strip. */
  get input(): AudioNode {
    return this.mix.keysIn;
  }

  /** The kit currently playing (null until the first kit is set). */
  get activeKit(): ActiveKit | null {
    return this.kit;
  }

  /** Must be called from a user gesture (pointerdown/keydown) on mobile. */
  unlock(): Promise<void> {
    if (this.ctx.state === 'running') return Promise.resolve();
    return this.ctx.resume().then(() => {
      console.info(
        `[audio] running · sampleRate ${this.ctx.sampleRate} · baseLatency ${ms(this.ctx.baseLatency)} · outputLatency ${ms(this.ctx.outputLatency)}`,
      );
    });
  }

  /** Fetches and decodes any of `names` not already in memory. Buffers are kept for instant kit switching. */
  async loadSamples(names: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    let done = 0;
    onProgress?.(0, names.length);
    await Promise.all(
      names.map(async (name) => {
        if (!this.buffers.has(name)) {
          let job = this.loading.get(name);
          if (!job) {
            job = this.fetchSample(name).finally(() => this.loading.delete(name));
            this.loading.set(name, job);
          }
          await job;
        }
        onProgress?.(++done, names.length);
      }),
    );
  }

  /**
   * Loads the kit's samples, then makes it the playing kit. Voices already ringing carry on.
   * `stillWanted` is checked after loading, so a slow load can't replace a kit chosen later.
   */
  async loadKit(
    kit: ActiveKit,
    onProgress?: (done: number, total: number) => void,
    stillWanted: () => boolean = () => true,
    firstBank = 0,
  ): Promise<void> {
    // The bank on screen loads first, so the kit is playable quickly; the other banks follow.
    const first = kit.pads.slice(firstBank * PADS_PER_BANK, (firstBank + 1) * PADS_PER_BANK);
    await this.loadSamples(sampleNamesOf(first), onProgress);
    if (!stillWanted()) return;
    this.kit = kit;
    this.loadSamples(sampleNamesOf(kit.pads)).catch((err: unknown) => console.warn('[audio] bank samples', err));
  }

  /** Length in seconds of a loaded sample, or undefined if it isn't loaded yet. */
  sampleDuration(name: string): number | undefined {
    return this.buffers.get(name)?.duration;
  }

  /** A loaded sample's buffer (the KEYS sampled instruments play these), or undefined. */
  buffer(name: string): AudioBuffer | undefined {
    return this.buffers.get(name);
  }

  setHitHook(hook: HitHook | null): void {
    this.hook = hook;
  }

  /**
   * Plays pad `index` (bank × 16 + screen index) at MIDI velocity 1–127, right now (live hits).
   * `echo` false keeps the hit from going out as MIDI (it came in as MIDI).
   */
  play(index: number, velocity: number, echo = true): void {
    if (this.localSound) this.hit(index, velocity, 0);
    if (echo) this.hook?.now(index, velocity);
  }

  /**
   * Plays pad `index` at context time `when` (sequenced hits, note repeat). Cancelled by
   * cancelScheduled(), or by calling the returned function before it starts.
   */
  playAt(index: number, velocity: number, when: number, echo = true): () => void {
    const voice = this.localSound ? this.hit(index, velocity, when) : undefined;
    if (voice) this.track(voice);
    const cancelMidi = echo ? this.hook?.at(index, velocity, when) : undefined;
    return () => {
      cancelMidi?.();
      if (!voice || voice.when <= this.ctx.currentTime) return; // already sounding: let it ring
      voice.src.stop();
      this.scheduled.delete(voice);
    };
  }

  /** A metronome click at context time `when`; `accent` marks beat 1 of the bar. */
  click(when: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = accent ? 1760 : 1175;
    const gain = this.ctx.createGain();
    const level = accent ? CLICK_LEVEL : CLICK_LEVEL * 0.6;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    osc.connect(gain).connect(this.mix.clickIn);
    osc.start(when);
    osc.stop(when + 0.05);
    this.track({ src: osc, gain, when });
  }

  /** Stops every scheduled voice that hasn't started yet (used when the transport stops). */
  cancelScheduled(): void {
    this.hook?.cancelAll();
    const now = this.ctx.currentTime;
    for (const v of this.scheduled) {
      if (v.when > now) {
        v.src.stop();
        this.scheduled.delete(v);
      }
    }
  }

  /** Plays any loaded sample at default settings, e.g. to preview it before swapping it onto a pad. */
  async preview(name: string): Promise<void> {
    await this.loadSamples([name]);
    const buffer = this.buffers.get(name);
    if (buffer) this.startVoice(buffer, 0.8, DEFAULT_PARAMS, 0);
  }

  /**
   * Plays `duration` seconds of `buffer` from `offset` at `gain`, on the preview path (the REC MIC
   * panel's PLAY). Returns a stop function; `onEnd` runs once it ends or is stopped.
   */
  previewBuffer(buffer: AudioBuffer, offset: number, duration: number, gain: number, onEnd?: () => void): () => void {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.mix.previewIn);
    src.onended = () => {
      g.disconnect();
      onEnd?.();
    };
    src.start(0, offset, duration);
    return () => {
      try {
        src.stop();
      } catch {
        // already ended
      }
    };
  }

  /** `when` 0 means now: the source starts with start(0), the lowest-latency path. */
  private hit(index: number, velocity: number, when: number): Voice | undefined {
    const pad = this.kit?.pads[index];
    const params = this.kit?.params[index];
    if (!pad || !params) return;
    const name = pad.soft && velocity < SOFT_LAYER_BELOW ? pad.soft : pad.hard;
    const buffer = this.buffers.get(name);
    if (!buffer) return;

    if (pad.choke && !pad.chokedOnly) this.choke(pad.choke, when || this.ctx.currentTime);
    const voice = this.startVoice(buffer, Math.pow(velocity / 127, 1.6), params, when, GROUP_STRIP[pad.group]);

    if (pad.choke) {
      const group = pad.choke;
      let set = this.chokeVoices.get(group);
      if (!set) this.chokeVoices.set(group, (set = new Set()));
      set.add(voice);
      voice.src.addEventListener('ended', () => set!.delete(voice));
    }
    return voice;
  }

  private track(voice: Voice): void {
    this.scheduled.add(voice);
    voice.src.addEventListener('ended', () => this.scheduled.delete(voice));
  }

  /** Without a `strip` (a sample preview) the voice skips the strips and sends. */
  private startVoice(buffer: AudioBuffer, velGain: number, p: Readonly<PadParams>, when: number, strip?: PadStrip): Voice {
    const now = when || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const rate = Math.pow(2, p.pitch / 12);
    src.playbackRate.value = rate;

    const level = velGain * Math.pow(10, p.volumeDb / 20);
    const gain = this.ctx.createGain();
    gain.gain.value = level;

    let out: AudioNode = src.connect(gain);
    if (p.pan !== 0) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = p.pan;
      out = gain.connect(panner);
    }
    if (strip) {
      const nodes = this.mix.pads[strip];
      out.connect(nodes.dry);
      this.send(out, p.reverbSend, nodes.rv);
      this.send(out, p.delaySend, nodes.dl);
    } else out.connect(this.mix.previewIn);
    src.start(when);

    if (p.decay < 1) {
      // Hold, then fade out over DECAY_TAIL so the cut never clicks. stop() must come after start().
      const length = Math.max((buffer.duration / rate) * p.decay, 0.005);
      const tail = Math.min(DECAY_TAIL, length / 2);
      gain.gain.setValueAtTime(level, now + length - tail);
      gain.gain.linearRampToValueAtTime(0, now + length);
      src.stop(now + length + 0.005);
    }
    return { src, gain, when: now };
  }

  /** A per-voice send gain, only when the pad sends anything (most don't). */
  private send(from: AudioNode, amount: number, to: AudioNode): void {
    if (!(amount > 0)) return;
    const g = this.ctx.createGain();
    g.gain.value = amount;
    from.connect(g).connect(to);
  }

  /** True when pad `index` uses an imported sample that is no longer stored (the pad is silent). */
  padMissing(index: number): boolean {
    const pad = this.kit?.pads[index];
    return !!pad && this.missing.has(pad.hard);
  }

  /** Drops a sample from memory (an imported sample that was deleted). */
  forget(name: string): void {
    this.buffers.delete(name);
    this.missing.delete(name);
  }

  /**
   * Drum samples are plain names in SAMPLE_DIR; a name with a folder ("instruments/grand/60") is under samples/.
   * Imported samples ("user:…") come from IndexedDB; one that is gone is noted, not thrown, so the rest of the kit still loads.
   */
  private async fetchSample(name: string): Promise<void> {
    if (name.startsWith(USER_PREFIX)) {
      const stored = await getSample(name).catch((err: unknown) => (console.warn('[audio]', err), undefined));
      if (!stored) {
        console.warn(`[audio] imported sample ${name} is missing`);
        this.missing.add(name);
        return;
      }
      this.missing.delete(name);
      this.buffers.set(name, await this.ctx.decodeAudioData(await stored.wav.arrayBuffer()));
      return;
    }
    const res = await fetch(`${name.includes('/') ? SAMPLES_ROOT : SAMPLE_DIR}${name}.${SAMPLE_EXT}`);
    if (!res.ok) throw new Error(`Sample ${name}: HTTP ${res.status}`);
    this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
  }

  /** Fades out the group's voices from time `at` (now for live hits, later for scheduled ones). */
  private choke(group: string, at: number): void {
    const set = this.chokeVoices.get(group);
    if (!set) return;
    for (const v of set) {
      if (v.when > at) continue; // starts after the choking hit: leave it alone
      const g = v.gain.gain;
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(at); // keeps a decay fade in progress (not in Firefox)
      else {
        g.cancelScheduledValues(at);
        g.setValueAtTime(g.value, at);
      }
      g.linearRampToValueAtTime(0, at + CHOKE_FADE);
      v.src.stop(at + CHOKE_FADE);
      set.delete(v);
    }
  }
}

function ms(seconds: number | undefined): string {
  return seconds === undefined ? 'n/a' : `${(seconds * 1000).toFixed(1)}ms`;
}
