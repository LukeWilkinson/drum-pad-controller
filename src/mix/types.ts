// Mixer and effects types, defaults and pure helpers. Imports only a type, so state.ts, the audio
// code and the UI can all use it.

import type { PadGroup } from '../audio/kit';

export const STRIPS = ['kicks', 'snare', 'hats', 'perc', 'keys', 'vox', 'master'] as const;
export type StripId = (typeof STRIPS)[number];
/** The strips with their own input and sends: the KEYS instrument and the VOX mic (src/vocal/vocal.ts). */
export type BusStrip = 'keys' | 'vox';
/** The strips pads play through. */
export type PadStrip = Exclude<StripId, BusStrip | 'master'>;

export const STRIP_LABEL: Record<StripId, string> = {
  kicks: 'KICKS',
  snare: 'SNARE',
  hats: 'HATS',
  perc: 'PERC',
  keys: 'KEYS',
  vox: 'VOX',
  master: 'MASTER',
};

/** Which strip each pad group plays through (Luke's grouping, 2026-10-18). */
export const GROUP_STRIP: Record<PadGroup, PadStrip> = {
  kick: 'kicks',
  snare: 'snare',
  hat: 'hats',
  cym: 'hats',
  tom: 'perc',
  perc: 'perc',
  fx: 'perc',
};

export interface StripState {
  /** Fader position 0–1 (see faderGain). */
  level: number;
  mute: boolean;
}

export const REVERB_SIZES = ['ROOM', 'PLATE', 'HALL'] as const;
/** Delay times in beats, tempo-synced. "D" = dotted, "T" = triplet. */
export const DELAY_TIMES = [
  { name: '1/32', beats: 0.125 },
  { name: '1/16T', beats: 1 / 6 },
  { name: '1/16', beats: 0.25 },
  { name: '1/16D', beats: 0.375 },
  { name: '1/8T', beats: 1 / 3 },
  { name: '1/8', beats: 0.5 },
  { name: '1/8D', beats: 0.75 },
  { name: '1/4T', beats: 2 / 3 },
  { name: '1/4', beats: 1 },
  { name: '1/4D', beats: 1.5 },
  { name: '1/2', beats: 2 },
] as const;
export const FILTER_TYPES = [
  { name: 'LOW-P', type: 'lowpass' },
  { name: 'BAND-P', type: 'bandpass' },
  { name: 'HIGH-P', type: 'highpass' },
] as const satisfies readonly { name: string; type: BiquadFilterType }[];

export interface ReverbState {
  on: boolean;
  /** Index into REVERB_SIZES. */
  size: number;
  /** Seconds to fade by 60 dB. */
  decay: number;
  /** Return level 0–1. */
  mix: number;
}

export interface DelayState {
  on: boolean;
  /** Index into DELAY_TIMES. */
  time: number;
  /** 0–FEEDBACK_MAX. */
  feedback: number;
  /** Return level 0–1. */
  mix: number;
}

export interface FilterState {
  on: boolean;
  /** Index into FILTER_TYPES. */
  type: number;
  /** Hz. */
  cutoff: number;
  /** Resonance as a Q factor (0.71 = flat). */
  res: number;
}

/** Mixer and FX settings (changed only by src/mix/mix.ts; saved as the `mix` pref). */
export interface MixState {
  strips: Record<StripId, StripState>;
  reverb: ReverbState;
  delay: DelayState;
  filter: FilterState;
}

export type FxId = 'reverb' | 'delay' | 'filter';

/** Ranges of the FX knobs that aren't a list. */
export const FX_RANGE = {
  decay: { min: 0.3, max: 6 },
  mix: { min: 0, max: 1 },
  feedback: { min: 0, max: 0.9 },
  cutoff: { min: 40, max: 18000 },
  res: { min: 0.5, max: 12 },
} as const;

/** Top of the fader travel: +6 dB. */
export const FADER_MAX_GAIN = Math.pow(10, 6 / 20);

/** Fader position 0–1 → gain. Square law: 0 = silent, 0.5 = −6 dB, 0.71 = 0 dB, 1 = +6 dB. */
export function faderGain(level: number): number {
  return FADER_MAX_GAIN * level * level;
}

/** Gain → fader position (inverse of faderGain), clamped to 0–1. */
export function faderLevel(gain: number): number {
  return Math.min(1, Math.max(0, Math.sqrt(gain / FADER_MAX_GAIN)));
}

/** Gain → dB (−Infinity for silence). */
export function gainDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}

const UNITY = faderLevel(1);

/** Defaults: strips at 0 dB, master at the old default volume (0.82); FX as drawn in Fx.dc.html. */
export const DEFAULT_MIX: MixState = {
  strips: {
    kicks: { level: UNITY, mute: false },
    snare: { level: UNITY, mute: false },
    hats: { level: UNITY, mute: false },
    perc: { level: UNITY, mute: false },
    keys: { level: UNITY, mute: false },
    vox: { level: UNITY, mute: false },
    master: { level: faderLevel(0.82), mute: false },
  },
  reverb: { on: true, size: 2, decay: 1.8, mix: 0.25 },
  delay: { on: true, time: 6, feedback: 0.35, mix: 0.18 },
  filter: { on: false, type: 0, cutoff: 8200, res: 0.71 },
};

/** A deep copy of the defaults. */
export function defaultMix(): MixState {
  return structuredClone(DEFAULT_MIX);
}
