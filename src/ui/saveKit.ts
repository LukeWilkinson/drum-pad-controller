// The SAVE KIT dialog: from the KITS panel's SAVE button, and offered after a REC MIC take is put
// on a pad ("SAVE AS NEW KIT?"). kitControl.saveKit() does the saving.

import { defaultSaveName, saveKit } from '../kitControl';
import { state } from '../state';
import { escapeHtml, openDialog } from './dialog';

/**
 * `offer`: asked after a change rather than from SAVE, so CANCEL reads NOT NOW and SAVE AS NEW is the
 * main button. The name field then starts with a new name, and UPDATE keeps the kit's own name.
 */
export async function openSaveKitDialog(offer = false): Promise<void> {
  const kit = state.kit;
  if (!kit) return;
  const name = kit.user && !offer ? kit.name : defaultSaveName();
  const res = await openDialog(`
    <h2>${offer ? 'SAVE AS NEW KIT?' : 'SAVE KIT'}</h2>
    ${offer ? '<p class="sh-hint">The new sound is only on the pads until the kit is saved.</p>' : ''}
    <label class="dlg-field">NAME<input name="name" maxlength="32" value="${escapeHtml(name)}" autocomplete="off"></label>
    <div class="dlg-btns">
      <button value="cancel" class="kp-btn">${offer ? 'NOT NOW' : 'CANCEL'}</button>
      ${kit.user ? `<button value="save" class="kp-btn${offer ? '' : ' primary'}">UPDATE</button>` : ''}
      <button value="new" class="kp-btn${offer || !kit.user ? ' primary' : ''}">${kit.user ? 'SAVE AS NEW' : 'SAVE'}</button>
    </div>`);
  const newName = (res.fields.name ?? '').trim() || name;
  if (res.value === 'new') await saveKit(newName);
  else if (res.value === 'save' && kit.user) {
    if (!offer) kit.name = newName;
    await saveKit();
  }
}
