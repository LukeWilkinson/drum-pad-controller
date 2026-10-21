// Kit actions: load, edit, swap, save and delete. These are the only code paths that change the
// active kit, so the engine, the store and IndexedDB never disagree.

import type { AudioEngine } from './audio/engine';
import { DEFAULT_PARAMS, PADS_PER_BANK, PAD_COUNT, PARAM_RANGE, type ActiveKit, type ParamKey, type UserKit } from './audio/kit';
import { DEFAULT_KIT_ID, KITS, factoryKit, findKit } from './audio/kits';
import { deleteUserKit, getPref, listUserKits, saveUserKit, setPref } from './store/db';
import { state, update } from './state';

type Progress = (done: number, total: number) => void;

let engine: AudioEngine;
/** Bumped on every kit selection, so a slow load never overwrites a newer choice. */
let selectToken = 0;

const ignore = (err: unknown) => console.warn('[store]', err);

/** Restores saved kits and the last kit. (Master volume is in the `mix` pref: src/mix/mix.ts.) */
export async function bootKits(e: AudioEngine, onProgress?: Progress): Promise<void> {
  engine = e;
  const [userKits, lastKit] = await Promise.all([
    listUserKits().catch((err) => (ignore(err), [] as UserKit[])),
    getPref<string>('lastKit').catch(ignore),
  ]);
  update({ userKits });
  await selectKit(lastKit ?? DEFAULT_KIT_ID, onProgress);
}

/** Loads a factory or user kit by id. Unknown ids fall back to the default kit. */
export async function selectKit(id: string, onProgress?: Progress): Promise<void> {
  const token = ++selectToken;
  const user = state.userKits.find((u) => u.id === id);
  const active: ActiveKit = user ? fromUserKit(user) : factoryKit(findKit(id) ?? KITS[0]);

  await engine.loadKit(active, onProgress, () => token === selectToken, state.bank);
  if (token !== selectToken) return;
  update({ kit: active, edited: false });
  setPref('lastKit', active.id).catch(ignore);
}

/**
 * A saved kit ready to play. Kits saved before banks existed (16 pads) get banks B–D from
 * their base kit, at default settings.
 */
function fromUserKit(user: UserKit): ActiveKit {
  const pads = structuredClone(user.pads);
  // Kits saved before M6 have no reverb / delay sends: they start dry.
  const params = user.params.map((p) => ({ ...DEFAULT_PARAMS, ...p }));
  if (pads.length < PAD_COUNT) {
    const base = factoryKit(findKit(user.baseKitId) ?? KITS[0]);
    pads.push(...base.pads.slice(pads.length));
    params.push(...base.params.slice(params.length));
  }
  return { id: user.id, name: user.name, baseKitId: user.baseKitId, user: true, pads, params };
}

/** Changes one setting of one pad, clamped to its range. Takes effect on the next hit. */
export function setParam(index: number, key: ParamKey, value: number): void {
  const kit = state.kit;
  if (!kit) return;
  const { min, max } = PARAM_RANGE[key];
  kit.params[index][key] = Math.min(max, Math.max(min, value));
  update({ edited: true }, 'params');
}

/** Puts a different sample on a pad. The soft layer is dropped, since it belonged to the old sample. */
export async function swapSample(index: number, sample: string): Promise<void> {
  const kit = state.kit;
  if (!kit) return;
  await engine.loadSamples([sample]);
  const { soft: _soft, ...rest } = kit.pads[index];
  kit.pads[index] = { ...rest, hard: sample };
  update({ edited: true }, 'pads');
}

/**
 * Saves the active kit. With a name it is saved as a new user kit; without one, a loaded user kit
 * is overwritten (a factory kit is always saved as new, under the default name).
 */
export async function saveKit(name?: string): Promise<void> {
  const kit = state.kit;
  if (!kit) return;
  const asNew = name !== undefined || !kit.user;
  const saved: UserKit = {
    id: asNew ? `user-${Date.now().toString(36)}` : kit.id,
    name: (name ?? (kit.user ? kit.name : defaultSaveName())).trim() || defaultSaveName(),
    baseKitId: kit.baseKitId,
    pads: structuredClone(kit.pads),
    params: structuredClone(kit.params),
    savedAt: Date.now(),
  };
  await saveUserKit(saved);
  Object.assign(kit, { id: saved.id, name: saved.name, user: true });
  update({ kit, edited: false, userKits: await listUserKits() });
  setPref('lastKit', saved.id).catch(ignore);
}

/** Deletes a saved kit. If it is the one playing, it keeps playing as unsaved changes to its base kit. */
export async function deleteKit(id: string): Promise<void> {
  await deleteUserKit(id);
  const userKits = await listUserKits();
  const kit = state.kit;
  if (kit?.id === id) {
    const base = findKit(kit.baseKitId) ?? KITS[0];
    Object.assign(kit, { id: base.id, name: base.name, user: false });
    update({ kit, edited: true, userKits });
    setPref('lastKit', base.id).catch(ignore);
  } else {
    update({ userKits });
  }
}

/** Shows pad bank `bank` (0–3). The selected pad moves to the same spot in the new bank. */
export function selectBank(bank: number): void {
  if (bank === state.bank) return;
  update({ bank, selectedPad: bank * PADS_PER_BANK + (state.selectedPad % PADS_PER_BANK) });
}

/** "My Neon Electronic 2" etc., numbered past any saved kit already using the name. */
export function defaultSaveName(): string {
  const base = findKit(state.kit?.baseKitId ?? DEFAULT_KIT_ID)?.name ?? 'Kit';
  const used = new Set(state.userKits.map((u) => u.name));
  let n = 1;
  while (used.has(`My ${base} ${n}`)) n++;
  return `My ${base} ${n}`;
}

/** LCD label: "KIT 02 · NEON ELECTRONIC", "MY · DUSTY EDIT" for saved kits, "*" when there are unsaved changes. */
export function kitLabel(kit: ActiveKit | null, edited: boolean): string {
  if (!kit) return 'LOADING…';
  const star = edited ? ' *' : '';
  if (kit.user) return `MY · ${kit.name.toUpperCase()}${star}`;
  const num = String(KITS.findIndex((k) => k.id === kit.id) + 1).padStart(2, '0');
  return `KIT ${num} · ${kit.name.toUpperCase()}${star}`;
}
