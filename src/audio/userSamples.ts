// Imported samples: the only code that changes `state.userSamples` and the `samples` store.
// A file is decoded, cleaned up (src/audio/sampleEdit.ts), stored as a WAV blob and named
// "user:<hash>", so the engine and kits treat it like any other sample name.

import type { AudioEngine } from './engine';
import { sampleNamesOf } from './kit';
import { editSample } from './sampleEdit';
import { encodeWav } from './wav';
import { deleteSample, getSample, listSamples, saveSample, type StoredSample } from '../store/db';
import { state, update } from '../state';

export const USER_PREFIX = 'user:';
export const MAX_SECONDS = 30;
/** Bigger files are refused before decoding, so a phone never runs out of memory on one. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const NAME_LENGTH = 12;

/** What the UI lists: a stored sample without its audio. */
export type UserSampleInfo = Omit<StoredSample, 'wav'>;

export class ImportError extends Error {}

let engine: AudioEngine;
let askedPersist = false;

export function isUserSample(name: string): boolean {
  return name.startsWith(USER_PREFIX);
}

/** Lists the stored samples. Call once at boot. */
export async function initUserSamples(e: AudioEngine): Promise<void> {
  engine = e;
  try {
    update({ userSamples: (await listSamples()).map(info) });
  } catch (err) {
    console.warn('[samples]', err);
  }
}

/**
 * Imports an audio file and stores it; the same file again just returns the stored one.
 * Throws ImportError with a message for Luke when the file can't be used.
 */
export async function importFile(file: File): Promise<UserSampleInfo> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError(`That file is too big (over ${MAX_FILE_BYTES >> 20} MB).`);
  const bytes = await file.arrayBuffer();
  const id = USER_PREFIX + (await hash(bytes));
  const known = state.userSamples.find((s) => s.id === id);
  if (known) return known;

  let decoded: AudioBuffer;
  try {
    decoded = await engine.ctx.decodeAudioData(bytes);
  } catch {
    throw new ImportError("This file can't be read as audio. Try WAV, MP3, FLAC, OGG or M4A.");
  }
  if (decoded.duration > MAX_SECONDS) {
    throw new ImportError(`That sound is ${decoded.duration.toFixed(1)} s long. Samples can be up to ${MAX_SECONDS} s.`);
  }
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
  const edited = editSample(channels, decoded.sampleRate);
  if (!edited) throw new ImportError('That file is silent.');

  const stored: StoredSample = {
    id,
    name: sampleName(file.name),
    wav: new Blob([encodeWav(edited.channels, decoded.sampleRate)], { type: 'audio/wav' }),
    seconds: edited.channels[0].length / decoded.sampleRate,
    addedAt: Date.now(),
  };
  try {
    await saveSample(stored);
  } catch (err) {
    console.warn('[samples]', err);
    throw new ImportError(
      (err as DOMException)?.name === 'QuotaExceededError'
        ? 'The phone is out of storage space for samples. Delete some, then try again.'
        : "The sample couldn't be saved (storage unavailable).",
    );
  }
  // Ask the browser not to clear stored samples when space runs low (it may say no; nothing else changes).
  if (!askedPersist) {
    askedPersist = true;
    navigator.storage?.persist?.().catch(() => {});
  }
  const added = info(stored);
  update({ userSamples: [...state.userSamples, added] });
  return added;
}

/**
 * Stores a sample that came inside a shared kit (already trimmed and normalised by the sender).
 * Returns false when the WAV can't be decoded; a sample already stored is kept as it is.
 */
export async function addShared(id: string, name: string, wav: Uint8Array): Promise<boolean> {
  if (state.userSamples.some((s) => s.id === id)) return true;
  let decoded: AudioBuffer;
  try {
    decoded = await engine.ctx.decodeAudioData(wav.slice().buffer); // decoding detaches its input
  } catch {
    return false;
  }
  if (decoded.duration > MAX_SECONDS + 1) return false;
  const stored: StoredSample = { id, name, wav: new Blob([wav.slice()], { type: 'audio/wav' }), seconds: decoded.duration, addedAt: Date.now() };
  await saveSample(stored);
  engine.forget(id); // a pad that found it missing earlier loads it next time
  update({ userSamples: [...state.userSamples, info(stored)] });
  return true;
}

/** The stored WAV bytes of imported samples, for a shared kit file. Ones that are gone are left out. */
export async function wavsOf(ids: string[]): Promise<{ id: string; name: string; wav: Uint8Array }[]> {
  const out: { id: string; name: string; wav: Uint8Array }[] = [];
  for (const id of ids) {
    const s = await getSample(id).catch(() => undefined);
    if (s) out.push({ id, name: s.name, wav: new Uint8Array(await s.wav.arrayBuffer()) });
  }
  return out;
}

/** Saved kits (and the kit playing now) that use the sample; it can't be deleted while this is not empty. */
export function usedBy(id: string): string[] {
  const names = state.userKits.filter((k) => sampleNamesOf(k.pads).includes(id)).map((k) => k.name);
  const kit = state.kit;
  // An unchanged saved kit is already in the list; otherwise the kit on the pads counts too.
  if (kit && sampleNamesOf(kit.pads).includes(id) && !(kit.user && !state.edited)) names.push('the kit playing now');
  return names;
}

/** Deletes a sample nothing uses. Returns the kits using it instead (and deletes nothing) if any do. */
export async function removeSample(id: string): Promise<string[]> {
  const users = usedBy(id);
  if (users.length) return users;
  await deleteSample(id);
  engine.forget(id);
  update({ userSamples: state.userSamples.filter((s) => s.id !== id) });
  return [];
}

/** Display name: the imported sample's name, or the built-in sample name as it is. */
export function sampleLabel(name: string): string {
  if (!isUserSample(name)) return name;
  return state.userSamples.find((s) => s.id === name)?.name ?? 'missing sample';
}

/** "My Kick 01.wav" → "My Kick 01", at most NAME_LENGTH characters. */
export function sampleName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  return (base || 'Sample').slice(0, NAME_LENGTH).trim();
}

function info({ wav: _wav, ...rest }: StoredSample): UserSampleInfo {
  return rest;
}

/** First 16 hex digits (64 bits) of the SHA-256 of the file. */
async function hash(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}
