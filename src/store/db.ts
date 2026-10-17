// Small promise wrapper over IndexedDB (no dependency).
// Stores: `userKits` (saved kits, keyed by id) and `prefs` (key → value, e.g. last kit, master volume).
// Every call rejects if IndexedDB is unavailable (private mode on some browsers); callers carry on without saving.

import type { UserKit } from '../audio/kit';

const DB_NAME = 'drumpad';
const DB_VERSION = 1;
const KITS = 'userKits';
const PREFS = 'prefs';

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KITS)) d.createObjectStore(KITS, { keyPath: 'id' });
      if (!d.objectStoreNames.contains(PREFS)) d.createObjectStore(PREFS);
    };
    req.onsuccess = () => resolve(req.result);
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
