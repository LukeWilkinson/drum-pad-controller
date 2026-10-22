// Small promise wrapper over IndexedDB (no dependency).
// Stores: `userKits` (saved kits, keyed by id), `prefs` (key → value, e.g. last kit, master volume)
// and `samples` (imported sounds as WAV blobs, keyed by their `user:` id; added in version 2).
// Every call rejects if IndexedDB is unavailable (private mode on some browsers); callers carry on without saving.

import type { UserKit } from '../audio/kit';

/** An imported sample as stored: the processed sound as a WAV file. */
export interface StoredSample {
  /** "user:" + 16 hex digits of the original file's SHA-256. */
  id: string;
  name: string;
  wav: Blob;
  seconds: number;
  /** Date.now() of the import. */
  addedAt: number;
}

const DB_NAME = 'drumpad';
const DB_VERSION = 2;
const KITS = 'userKits';
const PREFS = 'prefs';
const SAMPLES = 'samples';

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KITS)) d.createObjectStore(KITS, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(PREFS)) d.createObjectStore(PREFS);
      if (!d.objectStoreNames.contains(SAMPLES)) d.createObjectStore(SAMPLES, { keyPath: 'id' });
    };
    // Another tab still has version 1 open: it closes its copy so this one can upgrade (it reopens on its next call).
    req.onblocked = () => console.warn('[store] waiting for another tab to close the old database');
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => {
        d.close();
        opening = null;
      };
      resolve(d);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = op(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = tx.onabort = () => reject(tx.error ?? req.error);
  });
}

/** Saved kits, newest first. */
export async function listUserKits(): Promise<UserKit[]> {
  const kits = await run<UserKit[]>(KITS, 'readonly', (s) => s.getAll());
  return kits.sort((a, b) => b.savedAt - a.savedAt);
}

export function saveUserKit(kit: UserKit): Promise<void> {
  return run(KITS, 'readwrite', (s) => s.put(kit));
}

export function deleteUserKit(id: string): Promise<void> {
  return run(KITS, 'readwrite', (s) => s.delete(id));
}

export function getPref<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>(PREFS, 'readonly', (s) => s.get(key));
}

export function setPref(key: string, value: unknown): Promise<void> {
  return run(PREFS, 'readwrite', (s) => s.put(value, key));
}

/** Imported samples, oldest first. */
export async function listSamples(): Promise<StoredSample[]> {
  const all = await run<StoredSample[]>(SAMPLES, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export function getSample(id: string): Promise<StoredSample | undefined> {
  return run<StoredSample | undefined>(SAMPLES, 'readonly', (s) => s.get(id));
}

export function saveSample(sample: StoredSample): Promise<void> {
  return run(SAMPLES, 'readwrite', (s) => s.put(sample));
}

export function deleteSample(id: string): Promise<void> {
  return run(SAMPLES, 'readwrite', (s) => s.delete(id));
}
