// AudioWorklet that copies the master output between two frame numbers (src/audio/recorder.ts).
// Runs on the audio thread: it only copies and posts. Frames are counted on the context's own
// clock, so a take starts and ends on the exact sample asked for.
//
// Messages in:  { type: 'start', frame }   { type: 'stop', frame }
// Messages out: { type: 'data', chans: [left, right] } (about 85 ms each)   { type: 'done' }

// The worklet scope's globals (TypeScript's DOM types don't include them).
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

const CHUNK = 4096; // frames per message

class RecorderProcessor extends AudioWorkletProcessor {
  private start = Infinity;
  private stop = Infinity;
  private buf = [new Float32Array(CHUNK), new Float32Array(CHUNK)];
  private fill = 0;
  private running = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: 'start' | 'stop'; frame: number }>) => {
      const { type, frame } = e.data;
      if (type === 'start') {
        this.start = frame;
        this.stop = Infinity;
        this.fill = 0;
        this.running = true;
      } else if (type === 'stop') this.stop = Math.max(frame, this.start);
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.running) return true;
    const input = inputs[0];
    const n = input[0]?.length ?? 128;
    const from = Math.max(this.start, currentFrame);
    const to = Math.min(this.stop, currentFrame + n);
    for (let f = from; f < to; f++) {
      const i = f - currentFrame;
      // No input connected yet (silence) arrives as an empty list.
      this.buf[0][this.fill] = input[0]?.[i] ?? 0;
      this.buf[1][this.fill] = input[1]?.[i] ?? input[0]?.[i] ?? 0;
      if (++this.fill === CHUNK) this.flush();
    }
    if (currentFrame + n >= this.stop) {
      this.flush();
      this.running = false;
      this.port.postMessage({ type: 'done' });
    }
    return true;
  }

  private flush(): void {
    if (!this.fill) return;
    const chans = this.buf.map((b) => b.slice(0, this.fill));
    this.port.postMessage({ type: 'data', chans }, chans.map((c) => c.buffer));
    this.fill = 0;
  }
}

registerProcessor('drumpad-recorder', RecorderProcessor);
