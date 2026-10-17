// Pattern data and pure timing helpers (no audio, no DOM).
// A pattern is a loop of 1–8 bars holding pad hits at tick positions, 96 ticks per beat.
// Pads are numbered bank × 16 + screen index (0–63), so banks need no data change.

export const BEATS_PER_BAR = 4;
export const PPQ = 96; // ticks per beat
export const STEP_TICKS = PPQ / 4; // one 16th
export const BAR_TICKS = PPQ * BEATS_PER_BAR;
export const PATTERN_COUNT = 4;

export const LENGTHS = [1, 2, 4, 8] as const;
export type Bars = (typeof LENGTHS)[number];

export const QUANTS = ['1/4', '1/8', '1/16', '1/32', 'OFF'] as const;
export type Quant = (typeof QUANTS)[number];
export const QUANT_TICKS: Record<Quant, number> = { '1/4': PPQ, '1/8': PPQ / 2, '1/16': PPQ / 4, '1/32': PPQ / 8, OFF: 1 };

export const SWING_MIN = 50;
export const SWING_MAX = 75;

export interface SeqEvent {
  /** Position in the pattern, 0 … bars × BAR_TICKS − 1. */
  tick: number;
  /** bank × 16 + screen index. */
  pad: number;
  /** MIDI velocity 1–127. */
  vel: number;
}

export interface Pattern {
  bars: Bars;
  /** Sorted by tick. Events past the current length are kept, so lengthening a loop brings them back. */
  events: SeqEvent[];
}

export function emptyPattern(bars: Bars = 2): Pattern {
  return { bars, events: [] };
}

export function lengthTicks(p: Pattern): number {
  return p.bars * BAR_TICKS;
}

/** True when the pattern has at least one hit inside its current length. */
export function hasHits(p: Pattern): boolean {
  const end = lengthTicks(p);
  return p.events.some((e) => e.tick < end);
}

/** Wraps any tick into 0 … length − 1. */
export function wrap(tick: number, length: number): number {
  return ((tick % length) + length) % length;
}

/** Snaps a (fractional) tick to the quantise grid and wraps it into the loop. */
export function quantise(tick: number, q: Quant, length: number): number {
  const grid = QUANT_TICKS[q];
  return wrap(Math.round(tick / grid) * grid, length);
}

/**
 * Swing delay in ticks for an event: only hits exactly on an off-beat 16th move.
 * At 50% nothing moves; at 66% the off-beat lands on the triplet; at 75% it is half a 16th late.
 */
export function swingTicks(tick: number, swing: number): number {
  if (tick % (STEP_TICKS * 2) !== STEP_TICKS) return 0;
  return ((swing - 50) / 50) * STEP_TICKS;
}

/** Inserts keeping the list sorted by tick. */
export function insertEvent(events: SeqEvent[], ev: SeqEvent): void {
  let i = events.length;
  while (i > 0 && events[i - 1].tick > ev.tick) i--;
  events.splice(i, 0, ev);
}

export function clonePattern(p: Pattern): Pattern {
  return { bars: p.bars, events: p.events.map((e) => ({ ...e })) };
}
