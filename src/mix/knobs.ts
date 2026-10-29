// The nine FX knobs: how each value maps onto its 0–1 turn, how it is read and changed, and how it reads out.
// Pure (no DOM), so the MIX / FX cards (src/ui/mix.ts) and MIDI Learn (src/midi/targets.ts) share the
// same objects and a CC always lands where the on-screen knob would.

import { state } from '../state';
import * as mix from './mix';
import { linear, list, log, type Scale } from './scale';
import { DEFAULT_MIX, DELAY_TIMES, FILTER_TYPES, FX_RANGE, REVERB_SIZES, type FxId } from './types';

export interface KnobDef {
  label: string;
  scale: Scale;
  value(): number;
  apply(v: number): void;
  default: number;
  text(v: number): string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const delayName = (i: number) => DELAY_TIMES[i].name.replace(/([DT])$/, ' $1'); // "1/8D" → "1/8 D"
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);

export const FX: { id: FxId; name: string; knobs: KnobDef[] }[] = [
  {
    id: 'reverb',
    name: 'REVERB',
    knobs: [
      { label: 'SIZE', scale: list(REVERB_SIZES.length), value: () => state.mix.reverb.size, apply: (v) => mix.setReverb({ size: v }), default: DEFAULT_MIX.reverb.size, text: (v) => REVERB_SIZES[v] },
      { label: 'DECAY', scale: log(FX_RANGE.decay.min, FX_RANGE.decay.max), value: () => state.mix.reverb.decay, apply: (v) => mix.setReverb({ decay: v }), default: DEFAULT_MIX.reverb.decay, text: (v) => `${v.toFixed(1)} s` },
      { label: 'MIX', scale: linear(0, 1), value: () => state.mix.reverb.mix, apply: (v) => mix.setReverb({ mix: v }), default: DEFAULT_MIX.reverb.mix, text: pct },
    ],
  },
  {
    id: 'delay',
    name: 'DELAY',
    knobs: [
      { label: 'TIME', scale: list(DELAY_TIMES.length), value: () => state.mix.delay.time, apply: (v) => mix.setDelay({ time: v }), default: DEFAULT_MIX.delay.time, text: delayName },
      { label: 'FDBK', scale: linear(FX_RANGE.feedback.min, FX_RANGE.feedback.max), value: () => state.mix.delay.feedback, apply: (v) => mix.setDelay({ feedback: v }), default: DEFAULT_MIX.delay.feedback, text: pct },
      { label: 'MIX', scale: linear(0, 1), value: () => state.mix.delay.mix, apply: (v) => mix.setDelay({ mix: v }), default: DEFAULT_MIX.delay.mix, text: pct },
    ],
  },
  {
    id: 'filter',
    name: 'FILTER',
    knobs: [
      { label: 'TYPE', scale: list(FILTER_TYPES.length), value: () => state.mix.filter.type, apply: (v) => mix.setFilter({ type: v }), default: DEFAULT_MIX.filter.type, text: (v) => FILTER_TYPES[v].name },
      { label: 'CUTOFF', scale: log(FX_RANGE.cutoff.min, FX_RANGE.cutoff.max), value: () => state.mix.filter.cutoff, apply: (v) => mix.setFilter({ cutoff: v }), default: DEFAULT_MIX.filter.cutoff, text: hz },
      { label: 'RES', scale: log(FX_RANGE.res.min, FX_RANGE.res.max), value: () => state.mix.filter.res, apply: (v) => mix.setFilter({ res: v }), default: DEFAULT_MIX.filter.res, text: (v) => v.toFixed(v < 1 ? 2 : 1) },
    ],
  },
];
