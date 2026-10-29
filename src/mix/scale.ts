// Knob scales: how a value maps onto a knob's 0–1 turn. Pure (imports nothing), so the FX knobs
// (src/mix/knobs.ts) and the pedals (src/keys/pedals.ts) can share them without pulling in the store.

/** How a knob's value maps onto its 0–1 turn. */
export interface Scale {
  to(v: number): number;
  from(n: number): number;
  /** One arrow-key step as a fraction of the turn. */
  step: number;
}

export const linear = (min: number, max: number): Scale => ({
  to: (v) => (v - min) / (max - min),
  from: (n) => min + n * (max - min),
  step: 0.02,
});
export const log = (min: number, max: number): Scale => ({
  to: (v) => Math.log(v / min) / Math.log(max / min),
  from: (n) => min * Math.pow(max / min, n),
  step: 0.02,
});
/** `count` values 0 … count − 1. */
export const list = (count: number): Scale => ({
  to: (v) => v / (count - 1),
  from: (n) => Math.round(n * (count - 1)),
  step: 1 / (count - 1),
});
/** Whole numbers min … max. */
export const ints = (min: number, max: number): Scale => ({
  to: (v) => (v - min) / (max - min),
  from: (n) => Math.round(min + n * (max - min)),
  step: 1 / (max - min),
});
