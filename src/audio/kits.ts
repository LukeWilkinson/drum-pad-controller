// Built-in kits. The data lives in kits.json, which scripts/fetch-samples.mjs also reads,
// so the downloaded samples always match. Samples are CC0 from Sonic Pi — see CREDITS.md.

import data from './kits.json';
import { DEFAULT_PARAMS, type ActiveKit, type PadDef } from './kit';

export const CATEGORIES = ['Acoustic', 'Hip-hop', 'Electronic', 'Lo-fi'] as const;
export type KitCategory = (typeof CATEGORIES)[number];

export interface KitDef {
  id: string;
  name: string;
  category: KitCategory;
  pads: PadDef[];
}

export const KITS = data.kits as KitDef[];
export const DEFAULT_KIT_ID = KITS[0].id;

export function findKit(id: string): KitDef | undefined {
  return KITS.find((k) => k.id === id);
}

/** A factory kit ready to play, with every pad at default settings. */
export function factoryKit(kit: KitDef): ActiveKit {
  return {
    id: kit.id,
    name: kit.name,
    baseKitId: kit.id,
    user: false,
    pads: kit.pads.map((p) => ({ ...p })),
    params: kit.pads.map(() => ({ ...DEFAULT_PARAMS })),
  };
}

