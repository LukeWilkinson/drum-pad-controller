// Clean-up for imported sounds (pure: no audio context, no DOM), so a pad fires the moment it is
// touched and sits at the same level as the built-in kits:
// - at most 2 channels; a stereo file whose sides are identical becomes mono (half the size)
// - silence before the sound is cut, keeping 2 ms faded in from zero (no click, no lag)
// - silence after it is cut, keeping 10 ms with a 5 ms fade out
// - the peak is raised or lowered to −1 dBFS
// "Silence" is measured from the file's own peak, so a quiet recording is trimmed like a loud one.

export const START_BELOW_PEAK_DB = -50;
export const END_BELOW_PEAK_DB = -60;
export const TARGET_PEAK_DB = -1;
const PRE_ROLL = 0.002; // seconds kept (and faded in) before the first sound
const POST_ROLL = 0.01; // seconds kept after the last sound
const FADE_OUT = 0.005;
/** Peaks below this (about −90 dBFS) count as an empty file. */
const SILENT_PEAK = 3e-5;

export interface EditedSample {
  channels: Float32Array[];
  /** Seconds cut from the start. */
  trimmedStart: number;
  /** Gain applied to reach the target peak, in dB. */
  gainDb: number;
}

const db = (x: number) => Math.pow(10, x / 20);

/** Trims and normalises; null when the file has no sound in it. */
export function editSample(input: Float32Array[], sampleRate: number): EditedSample | null {
  let chans = input.slice(0, 2);
  if (chans.length === 2 && sameData(chans[0], chans[1])) chans = [chans[0]];
  const frames = chans[0]?.length ?? 0;

  let peak = 0;
  for (const c of chans) for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(c[i]));
  if (peak < SILENT_PEAK) return null;

  const loud = (i: number, level: number) => chans.some((c) => Math.abs(c[i]) >= level);
  const startLevel = peak * db(START_BELOW_PEAK_DB);
  const endLevel = peak * db(END_BELOW_PEAK_DB);
  let first = 0;
  while (first < frames && !loud(first, startLevel)) first++;
  let last = frames - 1;
  while (last > first && !loud(last, endLevel)) last--;

  const pre = Math.round(PRE_ROLL * sampleRate);
  const start = Math.max(0, first - pre);
  const end = Math.min(frames, last + 1 + Math.round(POST_ROLL * sampleRate));
  const gain = db(TARGET_PEAK_DB) / peak;
  const fadeIn = first - start;
  const fadeOut = Math.min(Math.round(FADE_OUT * sampleRate), end - start);

  const out = chans.map((c) => {
    const o = c.slice(start, end);
    for (let i = 0; i < o.length; i++) o[i] *= gain;
    for (let i = 0; i < fadeIn; i++) o[i] *= i / fadeIn;
    // Only fade the end when it was cut; a sound that runs to the end of the file is left alone.
    if (end < frames) for (let i = 0; i < fadeOut; i++) o[o.length - 1 - i] *= i / fadeOut;
    return o;
  });
  return { channels: out, trimmedStart: start / sampleRate, gainDb: 20 * Math.log10(gain) };
}

function sameData(a: Float32Array, b: Float32Array): boolean {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false;
  return true;
}
