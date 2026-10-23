// WAV encoding (no audio, no DOM): float channels → 16-bit PCM WAV.
// Used for imported samples (stored as WAV), shared kits, and audio export (src/audio/recorder.ts,
// which converts each recorded chunk as it arrives and joins header + chunks into one Blob).
// TPDF dither (two random values summed, ±1 bit) hides the rounding to 16 bits as faint, even noise
// instead of distortion on quiet tails.

const HEADER_BYTES = 44;

/** The 44-byte header of a 16-bit PCM WAV file holding `frames` frames of `count` channels. */
export function wavHeader(frames: number, count: number, sampleRate: number): ArrayBuffer {
  const dataBytes = frames * count * 2;
  const buf = new ArrayBuffer(HEADER_BYTES);
  const v = new DataView(buf);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, count, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * count * 2, true); // bytes per second
  v.setUint16(32, count * 2, true); // bytes per frame
  v.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  v.setUint32(40, dataBytes, true);
  return buf;
}

/** Channels of equal length (values −1…1; louder is clipped) → interleaved 16-bit samples (little-endian on every phone and PC). */
export function toPcm16(channels: Float32Array[], dither = true): Int16Array<ArrayBuffer> {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const out = new Int16Array(frames * count);
  let at = 0;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < count; c++) {
      const noise = dither ? Math.random() - Math.random() : 0;
      const s = Math.round(channels[c][f] * 32767 + noise);
      out[at++] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
    }
  }
  return out;
}

/** Encodes 1 or more channels of equal length as a whole 16-bit PCM WAV file. */
export function encodeWav(channels: Float32Array[], sampleRate: number, dither = true): ArrayBuffer {
  const frames = channels[0]?.length ?? 0;
  const pcm = toPcm16(channels, dither);
  const out = new Uint8Array(HEADER_BYTES + pcm.byteLength);
  out.set(new Uint8Array(wavHeader(frames, channels.length, sampleRate)), 0);
  out.set(new Uint8Array(pcm.buffer), HEADER_BYTES);
  return out.buffer;
}
