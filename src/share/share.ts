// Sharing kits and songs as files (src/share/format.ts): making them from what is playing, and
// adding what a file holds. The dialogs are in src/ui/share.ts.

import * as clock from '../audio/clock';
import { sampleNamesOf, type UserKit } from '../audio/kit';
import { addShared, isUserSample, wavsOf } from '../audio/userSamples';
import { addKit } from '../kitControl';
import { applySong, currentSong } from '../seq/sequencer';
import { state } from '../state';
import { deliver, type DeliverHow, type Delivered } from './deliver';
import { FILE_TYPE, ShareError, fileName, kitFileText, parseFile, songFileText, type Shared } from './format';

/** A kit with 64 imported 30 s samples is about 330 MB; files over this are refused unread. */
const MAX_FILE_BYTES = 120 * 1024 * 1024;

/** Shares (or with 'download' saves) the kit playing now, unsaved changes and imported samples included. */
export async function shareKit(how: DeliverHow = 'share'): Promise<Delivered> {
  const kit = state.kit;
  if (!kit) throw new ShareError('No kit is loaded yet.');
  const samples = await wavsOf(sampleNamesOf(kit.pads).filter(isUserSample));
  const text = kitFileText({ name: kit.name, baseKitId: kit.baseKitId, pads: kit.pads, params: kit.params }, samples);
  return deliver(new Blob([text], { type: FILE_TYPE }), fileName(kit.name), how);
}

/** Shares (or saves) the 4 loops with tempo, swing, quantise and the other song settings. */
export function shareSong(how: DeliverHow = 'share'): Promise<Delivered> {
  const date = new Date().toISOString().slice(0, 10);
  return deliver(new Blob([songFileText(currentSong())], { type: FILE_TYPE }), fileName(`song ${state.bpm}bpm ${date}`), how);
}

export async function readShared(file: File): Promise<Shared> {
  if (file.size > MAX_FILE_BYTES) throw new ShareError("That file is too big to be a Drum Pads file.");
  return parseFile(await file.text());
}

/** Adds a shared kit and its samples to the saved kits. `lost` = samples that couldn't be stored (their pads stay silent). */
export async function importKit(shared: Extract<Shared, { type: 'kit' }>): Promise<{ kit: UserKit; lost: number }> {
  for (const s of shared.samples) {
    await addShared(s.id, s.name, s.wav).catch((err: unknown) => console.warn('[share]', err));
  }
  // Samples the pads name that this phone still doesn't have: broken in the file, or not in it at all.
  const have = new Set(state.userSamples.map((s) => s.id));
  const lost = sampleNamesOf(shared.kit.pads).filter((n) => isUserSample(n) && !have.has(n)).length;
  return { kit: await addKit(shared.kit), lost };
}

/** Replaces the song (4 loops and settings). Stops the transport first; undo history is cleared. */
export function importSong(shared: Extract<Shared, { type: 'song' }>): void {
  if (state.playing) clock.stop();
  applySong(shared.song);
}
