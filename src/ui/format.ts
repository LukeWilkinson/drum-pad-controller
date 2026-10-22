// Readouts for pad settings, shared by the Kits panel and the tablet right rail.

import type { ParamKey, PadParams } from '../audio/kit';

const MINUS = '−';

export const PARAM_LABEL: Record<ParamKey, string> = {
  volumeDb: 'VOLUME',
  pitch: 'PITCH',
  pan: 'PAN',
  decay: 'DECAY',
  reverbSend: 'REVERB SEND',
  delaySend: 'DELAY SEND',
};

/** `sampleSeconds` is the pad's sample length, used to show decay in ms. */
export function formatParam(key: ParamKey, p: PadParams, sampleSeconds?: number): string {
  switch (key) {
    case 'volumeDb':
      return `${p.volumeDb < 0 ? MINUS : '+'}${Math.abs(p.volumeDb).toFixed(1)} dB`;
    case 'pitch':
      return `${p.pitch < 0 ? MINUS : '+'}${Math.abs(p.pitch)} st`;
    case 'pan': {
      const amount = Math.round(Math.abs(p.pan) * 100);
      return amount === 0 ? 'C' : `${p.pan < 0 ? 'L' : 'R'}${amount}`;
    }
    case 'decay': {
      if (p.decay >= 1) return 'FULL';
      if (sampleSeconds === undefined) return `${Math.round(p.decay * 100)}%`;
      return `${Math.round((sampleSeconds / Math.pow(2, p.pitch / 12)) * p.decay * 1000)} ms`;
    }
    case 'reverbSend':
    case 'delaySend':
      return `${Math.round(p[key] * 100)}%`;
  }
}
