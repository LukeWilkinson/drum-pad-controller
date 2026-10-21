// Builds the reverb's impulse response: stereo noise that fades by 60 dB over `decay` seconds and
// gets darker as it fades (high frequencies die first, as in a real room). The room size sets the
// pre-delay, how dense the first echoes are and how dark the tail gets. No samples to download.

/** Per size (REVERB_SIZES order: ROOM, PLATE, HALL). */
const SIZES = [
  { preDelay: 0.004, early: 10, earlyLen: 0.03, bright: 0.55, dark: 0.12 },
  { preDelay: 0.008, early: 0, earlyLen: 0, bright: 0.85, dark: 0.35 },
  { preDelay: 0.022, early: 16, earlyLen: 0.09, bright: 0.45, dark: 0.06 },
];
const FADE_IN = 0.003; // seconds; softens the start so the reverb has no click of its own

export function generateImpulse(ctx: BaseAudioContext, size: number, decay: number): AudioBuffer {
  const s = SIZES[size] ?? SIZES[0];
  const rate = ctx.sampleRate;
  const length = Math.ceil((s.preDelay + decay) * rate);
  const buffer = ctx.createBuffer(2, length, rate);
  const start = Math.floor(s.preDelay * rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // A few loud early echoes at random spots (each channel different, for width).
    for (let i = 0; i < s.early; i++) {
      const at = start + Math.floor(Math.random() * s.earlyLen * rate);
      data[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5) * (1 - i / s.early);
    }
    // Then the tail: decaying noise through a one-pole low-pass that closes as it fades.
    let lp = 0;
    for (let i = start; i < length; i++) {
      const t = (i - start) / rate;
      const k = t / decay; // 0 → 1 over the decay
      const env = Math.exp(-6.9 * k); // ln(1000): −60 dB at the end
      const cut = s.bright + (s.dark - s.bright) * k; // filter coefficient: high = bright
      lp += cut * (Math.random() * 2 - 1 - lp);
      const fade = t < FADE_IN ? t / FADE_IN : 1;
      data[i] += lp * env * fade;
    }
  }
  return buffer;
}
