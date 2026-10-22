// Vocal pitch correction settings (pure; state.ts imports it). Changed only by src/vocal/vocal.ts.

import { SCALES, SCALE_IDS } from '../keys/scales';
import { DEFAULT_TUNE, SPEED_MAX, type VocalScale } from './pitch';

/** Where the mic is: off, waiting for the browser, running, or why it can't run. */
export type MicStatus = 'off' | 'asking' | 'on' | 'denied' | 'nomic' | 'unsupported' | 'error';

export interface VocalState {
  /** The card's switch: mic on and corrected into the VOX strip. Not saved; starts off. */
  on: boolean;
  mic: MicStatus;
  /** Pitch class 0–11 (C = 0). */
  key: number;
  scale: VocalScale;
  /** 0–1. */
  strength: number;
  /** ms, 0 (hard) – SPEED_MAX (natural). */
  speed: number;
  /** VOX bus sends, 0–1. */
  reverbSend: number;
  delaySend: number;
}

export const VOCAL_SCALES: VocalScale[] = ['chromatic', ...SCALE_IDS];
export const vocalScaleName = (s: VocalScale) => (s === 'chromatic' ? 'Chromatic' : SCALES[s].name);
export { SPEED_MAX };

export const DEFAULT_VOCAL: VocalState = {
  on: false,
  mic: 'off',
  key: DEFAULT_TUNE.key,
  scale: DEFAULT_TUNE.scale,
  strength: DEFAULT_TUNE.strength,
  speed: DEFAULT_TUNE.speed,
  reverbSend: 0,
  delaySend: 0,
};
