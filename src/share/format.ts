// The shared file format (no audio, no DOM): one JSON text file per kit or song, named
// "<name>.drumpad.txt" because Chrome's share sheet only accepts a fixed list of file types
// (.txt yes, .json no). Reading a file checks every field, since it may come from anyone:
// anything unknown or out of range falls back to the base kit's pad or a default.
//
//   { app: 'drumpad', version: 1, type: 'kit',  kit: { name, baseKitId, pads, params }, samples: [{ id, name, wav }] }
//   { app: 'drumpad', version: 1, type: 'song', song: { patterns, pattern, bpm, … } }
//
// A kit carries its imported samples as base64 WAV, so it plays on a phone that never had them.

import {
  DEFAULT_PARAMS,
  PARAM_RANGE,
  sampleNamesOf,
  type PadDef,
  type PadGroup,
  type PadParams,
  type ParamKey,
} from '../audio/kit';
import { KITS, allPads, findKit } from '../audio/kits';
import type { Song } from '../seq/sequencer';

export const FILE_APP = 'drumpad';
export const FILE_VERSION = 1;
export const FILE_SUFFIX = '.drumpad.txt';
export const FILE_TYPE = 'text/plain';
const NAME_MAX = 32;
const USER_ID = /^user:[0-9a-f]{16}$/;
const GROUPS: readonly PadGroup[] = ['kick', 'snare', 'hat', 'tom', 'cym', 'perc', 'fx'];

export interface SharedKit {
  name: string;
  baseKitId: string;
  pads: PadDef[];
  params: PadParams[];
}

export interface SharedSample {
  /** The sample's "user:" id, so a phone that already has it keeps one copy. */
  id: string;
  name: string;
  /** WAV bytes as base64. */
  wav: string;
}

interface KitFile {
  app: typeof FILE_APP;
  version: number;
  type: 'kit';
  kit: SharedKit;
  samples: SharedSample[];
}

interface SongFile {
  app: typeof FILE_APP;
  version: number;
  type: 'song';
  song: Song;
}

/** What a file holds once read and checked. */
export type Shared =
  | { type: 'kit'; kit: SharedKit; samples: { id: string; name: string; wav: Uint8Array }[] }
  | { type: 'song'; song: Partial<Song> };

export class ShareError extends Error {}

export function kitFileText(kit: SharedKit, samples: { id: string; name: string; wav: Uint8Array }[]): string {
  const file: KitFile = {
    app: FILE_APP,
    version: FILE_VERSION,
    type: 'kit',
    kit,
    samples: samples.map((s) => ({ id: s.id, name: s.name, wav: toBase64(s.wav) })),
  };
  return JSON.stringify(file);
}

export function songFileText(song: Song): string {
  const file: SongFile = { app: FILE_APP, version: FILE_VERSION, type: 'song', song };
  return JSON.stringify(file);
}

/** "Lo-fi Beat #2" → "Lo-fi-Beat-2.drumpad.txt". */
export function fileName(name: string): string {
  const safe = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  return (safe || 'drumpad') + FILE_SUFFIX;
}

/** Reads and checks a shared file. Throws ShareError with a message for Luke when it isn't one. */
export function parseFile(text: string): Shared {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ShareError("That isn't a Drum Pads file.");
  }
  if (!raw || typeof raw !== 'object' || raw.app !== FILE_APP) throw new ShareError("That isn't a Drum Pads file.");
  if (typeof raw.version !== 'number' || raw.version > FILE_VERSION) {
    throw new ShareError('That file was made by a newer version of the app. Update the app, then try again.');
  }
  if (raw.type === 'song') {
    const song = raw.song as Partial<Song> | undefined;
    if (!song || typeof song !== 'object' || !Array.isArray(song.patterns)) throw new ShareError('That song file is damaged.');
    return { type: 'song', song };
  }
  if (raw.type === 'kit') return { type: 'kit', ...cleanKit(raw.kit, raw.samples) };
  throw new ShareError("That file holds something this version of the app can't open.");
}

function cleanKit(rawKit: unknown, rawSamples: unknown): { kit: SharedKit; samples: { id: string; name: string; wav: Uint8Array }[] } {
  const k = rawKit as Partial<SharedKit> | undefined;
  if (!k || typeof k !== 'object' || !Array.isArray(k.pads)) throw new ShareError('That kit file is damaged.');
  const base = findKit(String(k.baseKitId)) ?? KITS[0];
  // Always the full 64 pads: the base kit fills any the file leaves out or gets wrong.
  const pads = allPads(base).map((b, i) => cleanPad(k.pads![i], b));
  const params = pads.map((_, i) => cleanParams(Array.isArray(k.params) ? k.params[i] : undefined));

  // Only samples the pads use, each checked; a broken one leaves its pad silent (like a missing sample).
  const wanted = new Set(sampleNamesOf(pads).filter((n) => USER_ID.test(n)));
  const samples: { id: string; name: string; wav: Uint8Array }[] = [];
  for (const s of (Array.isArray(rawSamples) ? rawSamples : []) as Partial<SharedSample>[]) {
    if (!s || typeof s.id !== 'string' || !wanted.has(s.id) || typeof s.wav !== 'string') continue;
    const wav = fromBase64(s.wav);
    if (!wav) continue;
    wanted.delete(s.id);
    samples.push({ id: s.id, name: cleanName(s.name, 'Sample', 12), wav });
  }
  return { kit: { name: cleanName(k.name, 'Shared kit'), baseKitId: base.id, pads, params }, samples };
}

/** Every sample name the built-in kits use (a pad may only name one of these or an imported sample). */
let builtIn: Set<string> | null = null;
function isKnownSample(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (USER_ID.test(name)) return true;
  builtIn ??= new Set(KITS.flatMap((kit) => sampleNamesOf(allPads(kit))));
  return builtIn.has(name);
}

function cleanPad(raw: unknown, base: PadDef): PadDef {
  const p = raw as Partial<PadDef> | undefined;
  if (!p || typeof p !== 'object' || !isKnownSample(p.hard)) return { ...base };
  const pad: PadDef = {
    name: cleanName(p.name, base.name),
    group: GROUPS.includes(p.group as PadGroup) ? (p.group as PadGroup) : base.group,
    hard: p.hard,
  };
  if (isKnownSample(p.soft)) pad.soft = p.soft;
  if (typeof p.choke === 'string' && p.choke.length <= 16) pad.choke = p.choke;
  if (p.chokedOnly === true) pad.chokedOnly = true;
  return pad;
}

function cleanParams(raw: unknown): PadParams {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PARAMS };
  for (const key of Object.keys(PARAM_RANGE) as ParamKey[]) {
    const v = p[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(PARAM_RANGE[key].max, Math.max(PARAM_RANGE[key].min, v));
  }
  return out;
}

function cleanName(raw: unknown, fallback: string, max = NAME_MAX): string {
  return (typeof raw === 'string' ? raw.trim().slice(0, max).trim() : '') || fallback;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000; // String.fromCharCode takes a limited number of arguments
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
