// Built-in kits. The data lives in kits.json, which scripts/fetch-samples.mjs also reads,
// so the downloaded samples always match. Samples are CC0 from Sonic Pi — see CREDITS.md.
// Each kit defines bank A; banks B–D come from the shared "banks" in kits.json unless the kit
// overrides one with its own "banks": { "C": [...] }.

import data from './kits.json';
import { BANK_NAMES, DEFAULT_PARAMS, PADS_PER_BANK, type ActiveKit, type PadDef } from './kit';

export const CATEGORIES = ['Acoustic', 'Hip-hop', 'Electronic', 'Lo-fi'] as const;
export type KitCategory = (typeof CATEGORIES)[number];

type BankName = Exclude<(typeof BANK_NAMES)[number], 'A'>;

export interface KitDef {
  id: string;
  name: string;
  category: KitCategory;
  /** Bank A. */
  pads: PadDef[];
  /** Replacements for the shared banks B–D. */
  banks?: Partial<Record<BankName, PadDef[]>>;
}

export const KITS = data.kits as KitDef[];
export const DEFAULT_KIT_ID = KITS[0].id;
const SHARED_BANKS = data.banks as Record<BankName, PadDef[]>;

export function findKit(id: string): KitDef | undefined {
  return KITS.find((k) => k.id === id);
}

/** All 64 pads of a built-in kit: its bank A, then banks B–D (its own or the shared ones). */
export function allPads(kit: KitDef): PadDef[] {
  const pads = kit.pads.slice(0, PADS_PER_BANK);
  for (const bank of ['B', 'C', 'D'] as const) pads.push(...(kit.banks?.[bank] ?? SHARED_BANKS[bank]));
  return pads.map((p) => ({ ...p }));
}

/** A factory kit ready to play, with every pad at default settings. */
export function factoryKit(kit: KitDef): ActiveKit {
  const pads = allPads(kit);
  return {
    id: kit.id,
    name: kit.name,
    baseKitId: kit.id,
    user: false,
    pads,
    params: pads.map(() => ({ ...DEFAULT_PARAMS })),
  };
}
