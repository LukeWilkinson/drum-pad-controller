// Low-latency one-shot sampler on raw Web Audio.
// Every hit creates a fresh AudioBufferSourceNode and starts it immediately (no look-ahead),
// so the only delay is the device's output latency.

import { SAMPLE_DIR, SOFT_LAYER_BELOW, sampleNamesOf } from './kit';
import { PADS } from './kits';

const CHOKE_FADE = 0.01; // seconds; short fade avoids a click when a hat is cut off

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  /** Voices still ringing, per choke group, so they can be cut off. */
  private chokeVoices = new Map<string, Set<Voice>>();

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.82;
    this.master.connect(this.ctx.destination);
  }

  get running(): boolean {
    return this.ctx.state === 'running';
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

  async loadKit(onProgress?: (done: number, total: number) => void): Promise<void> {
    const names = sampleNamesOf(PADS);
    let done = 0;
    await Promise.all(
      names.map(async (name) => {
        const res = await fetch(`${SAMPLE_DIR}${name}.flac`);
        if (!res.ok) throw new Error(`Sample ${name}: HTTP ${res.status}`);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
        onProgress?.(++done, names.length);
      }),
    );
  }

  setMasterVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  /** Plays pad `index` (0–15, screen order) at MIDI velocity 1–127. */
  play(index: number, velocity: number): void {
    const pad = PADS[index];
    if (!pad) return;
    const name = pad.soft && velocity < SOFT_LAYER_BELOW ? pad.soft : pad.hard;
    const buffer = this.buffers.get(name);
    if (!buffer) return;

    const now = this.ctx.currentTime;
    if (pad.choke && !pad.chokedOnly) this.choke(pad.choke, now);

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.pow(velocity / 127, 1.6);
    src.connect(gain).connect(this.master);
    src.start(0);

    if (pad.choke) {
      const group = pad.choke;
      const voice = { src, gain };
      let set = this.chokeVoices.get(group);
      if (!set) this.chokeVoices.set(group, (set = new Set()));
      set.add(voice);
      src.onended = () => set!.delete(voice);
    }
  }

  private choke(group: string, now: number): void {
    const set = this.chokeVoices.get(group);
    if (!set) return;
    for (const v of set) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + CHOKE_FADE);
      v.src.stop(now + CHOKE_FADE);
    }
    set.clear();
  }
}

function ms(seconds: number | undefined): string {
  return seconds === undefined ? 'n/a' : `${(seconds * 1000).toFixed(1)}ms`;
}
