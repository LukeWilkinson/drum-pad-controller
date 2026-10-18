// The default pad ↔ MIDI note map: chromatic from note 36, bank by bank.
// A1 (bottom-left of bank A) = 36 … A16 = 51, then B 52–67, C 68–83, D 84–99.
// Pad indexes are bank × 16 + screen index, as everywhere else; pad numbers follow the MPC layout.

import { PADS_PER_BANK, PAD_COUNT, padNumber } from '../audio/kit';

export const BASE_NOTE = 36;
export const LAST_NOTE = BASE_NOTE + PAD_COUNT - 1; // 99

/** MIDI note for pad `index` (0–63). */
export function noteOfPad(index: number): number {
  return BASE_NOTE + Math.floor(index / PADS_PER_BANK) * PADS_PER_BANK + padNumber(index) - 1;
}

/** Pad index (0–63) for a MIDI note, or null outside 36–99. */
export function padOfNote(note: number): number | null {
  if (!Number.isInteger(note) || note < BASE_NOTE || note > LAST_NOTE) return null;
  const bank = Math.floor((note - BASE_NOTE) / PADS_PER_BANK);
  const n = (note - BASE_NOTE) % PADS_PER_BANK; // padNumber − 1
  const row = 3 - Math.floor(n / 4);
  return bank * PADS_PER_BANK + row * 4 + (n % 4);
}
