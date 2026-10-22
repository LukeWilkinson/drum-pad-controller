// The SHARE dialog (KITS header, and SHARE / IMPORT in the SEQ loop picker): share the kit playing
// now or the song as a file, or import a file someone sent. The work is in src/share/share.ts.

import { selectKit } from '../kitControl';
import type { Delivered } from '../share/deliver';
import { ShareError, FILE_SUFFIX } from '../share/format';
import { importKit, importSong, readShared, shareKit, shareSong } from '../share/share';
import { state } from '../state';
import { escapeHtml, openDialog } from './dialog';

let picker: HTMLInputElement | null = null;

/** Opens the file picker. Must run inside a tap (browsers only open pickers then). */
function pickFile(): void {
  if (!picker) {
    picker = document.createElement('input');
    picker.type = 'file';
    // Phones may hide the .txt suffix or add their own, so plain text and JSON are offered too.
    picker.accept = `${FILE_SUFFIX},.drumpad,.txt,.json,text/plain,application/json`;
    picker.hidden = true;
    document.body.appendChild(picker);
    picker.addEventListener('change', () => {
      const file = picker!.files?.[0];
      if (file) void importFlow(file);
    });
  }
  picker.value = '';
  picker.click();
}

export async function openShareDialog(): Promise<void> {
  const kitName = state.kit ? state.kit.name.toUpperCase() : 'KIT';
  await openDialog(
    `<h2>SHARE</h2>
    <p class="sh-hint">Send the kit or the song to another phone as a file, or open a file you were sent.</p>
    <div class="sh-list">
      <button type="button" class="kp-btn" data-share="kit">SHARE KIT · ${escapeHtml(kitName)}${state.edited ? ' *' : ''}</button>
      <button type="button" class="kp-btn" data-share="song">SHARE SONG · 4 LOOPS</button>
      <button type="button" class="kp-btn" data-share="import">IMPORT FILE…</button>
    </div>
    <p class="sh-msg" role="status"></p>
    <div class="dlg-btns"><button value="cancel" class="kp-btn">CLOSE</button></div>`,
    (btn) => {
      const dialog = btn.closest('dialog')!;
      const msg = dialog.querySelector<HTMLElement>('.sh-msg')!;
      const what = btn.dataset.share;
      if (what === 'import') {
        pickFile();
        dialog.close('cancel'); // the import shows its own dialogs
      } else if (what === 'kit' || what === 'song') {
        void send(what === 'kit' ? shareKit : shareSong, btn, msg);
      }
    },
  );
}

async function send(make: () => Promise<Delivered>, btn: HTMLButtonElement, msg: HTMLElement): Promise<void> {
  btn.disabled = true;
  msg.textContent = 'PREPARING…';
  try {
    const how = await make();
    msg.textContent = how === 'shared' ? 'Sent.' : how === 'downloaded' ? 'Saved to the Downloads folder.' : '';
  } catch (err) {
    if (!(err instanceof ShareError)) console.error(err);
    msg.textContent = err instanceof ShareError ? err.message : "That couldn't be shared.";
  } finally {
    btn.disabled = false;
  }
}

/** Reads a chosen file and adds what it holds, asking first before a song replaces the loops. */
async function importFlow(file: File): Promise<void> {
  let shared;
  try {
    shared = await readShared(file);
  } catch (err) {
    if (!(err instanceof ShareError)) console.error(err);
    return notice('IMPORT', err instanceof ShareError ? err.message : "That file couldn't be read.");
  }

  if (shared.type === 'song') {
    const res = await openDialog(`
      <h2>IMPORT SONG</h2>
      <p>Replace the 4 loops, tempo and song settings with “${escapeHtml(file.name)}”? The current loops and their undo history are lost.</p>
      <div class="dlg-btns">
        <button value="cancel" class="kp-btn">CANCEL</button>
        <button value="ok" class="kp-btn danger">REPLACE</button>
      </div>`);
    if (res.value === 'ok') importSong(shared);
    return;
  }

  let added;
  try {
    added = await importKit(shared);
  } catch (err) {
    console.error(err);
    return notice('IMPORT', "The kit couldn't be saved (storage unavailable or full).");
  }
  const { kit, lost } = added;
  const lostNote = lost ? ` ${lost} of its imported samples ${lost > 1 ? 'were' : 'was'} missing or damaged; ${lost > 1 ? 'those pads stay' : 'that pad stays'} silent.` : '';
  const editedNote = state.edited ? ' Loading it drops the unsaved changes to the kit playing now.' : '';
  const res = await openDialog(`
    <h2>KIT ADDED</h2>
    <p>“${escapeHtml(kit.name)}” is in My kits.${lostNote}${editedNote}</p>
    <div class="dlg-btns">
      <button value="cancel" class="kp-btn">OK</button>
      <button value="load" class="kp-btn primary">LOAD NOW</button>
    </div>`);
  if (res.value === 'load') await selectKit(kit.id);
}

async function notice(title: string, text: string): Promise<void> {
  await openDialog(`<h2>${title}</h2><p>${escapeHtml(text)}</p><div class="dlg-btns"><button value="ok" class="kp-btn primary">OK</button></div>`);
}
