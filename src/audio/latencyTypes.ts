// Latency settings: the type, the defaults and the saved copy. Pure (no store, no audio), so
// state.ts and engine.ts can import it. The saved copy is in localStorage rather than IndexedDB
// because `low` must be known synchronously, when the AudioContext is created.

export const LATENCY_KEY = 'latency';
export const OFFSET_MIN = -50;
export const OFFSET_MAX = 50;
export const MEASURED_MAX = 300;

export interface LatencyState {
  /** Delay in ms found by tap-along calibration, or null to use the browser's own number. */
  measured: number | null;
  /** Manual trim in ms, OFFSET_MIN–OFFSET_MAX. Positive = recorded hits land earlier in the loop. */
  offset: number;
  /** Low-latency mode: the smallest audio buffer. Off = a bigger buffer (applies after a reload). */
  low: boolean;
}

export const DEFAULT_LATENCY: LatencyState = { measured: null, offset: 0, low: true };

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

/** Reads the saved settings; anything missing or damaged falls back to the defaults. */
export function loadLatency(): LatencyState {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LATENCY_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_LATENCY };
    const r = raw as Record<string, unknown>;
    return {
      measured: num(r.measured, 0, MEASURED_MAX) ?? null,
      offset: Math.round(num(r.offset, OFFSET_MIN, OFFSET_MAX) ?? 0),
      low: typeof r.low === 'boolean' ? r.low : true,
    };
  } catch {
    return { ...DEFAULT_LATENCY };
  }
}

export function saveLatency(s: LatencyState): void {
  try {
    localStorage.setItem(LATENCY_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the settings last for this visit only */
  }
}
