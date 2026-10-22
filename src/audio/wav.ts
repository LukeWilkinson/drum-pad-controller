// WAV encoding (no audio, no DOM): float channels → a 16-bit PCM WAV file.
// Used for imported samples (stored as WAV), and later for shared kits and audio export.
// TPDF dither (two random values summed, ±1 bit) hides the rounding to 16 bits as faint, even noise
// instead of distortion on quiet tails.

const HEADER_BYTES = 44;

/** Encodes 1 or more channels of equal length (values −1…1; louder is clipped) as 16-bit PCM WAV bytes. */
export function encodeWav(channels: Float32Array[], sampleRate: number, dither = true): ArrayBuffer {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * count * 2;
  const buf = new ArrayBuffer(HEADER_BYTES + dataBytes);
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

  let at = HEADER_BYTES;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < count; c++) {
      const noise = dither ? Math.random() - Math.random() : 0;
      const s = Math.round(channels[c][f] * 32767 + noise);
      v.setInt16(at, s > 32767 ? 32767 : s < -32768 ? -32768 : s, true);
      at += 2;
    }
  }
  return buf;
}
