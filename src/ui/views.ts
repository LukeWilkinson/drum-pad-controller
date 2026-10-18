// Switches between the PADS screen and the KITS, SEQ, KEYS and SETUP panels. CSS does the layout work
// via .app[data-view]; this only keeps the attribute and the tab highlight in step with the store.

import { subscribe, update, type View } from '../state';
import type { ScreenRefs } from './screen';

const VIEWS: View[] = ['pads', 'kits', 'seq', 'keys', 'setup'];

export function initViews(ui: ScreenRefs): void {
  for (const view of VIEWS) {
    ui.app.querySelector(`.tab.${view}`)?.addEventListener('click', () => update({ view }));
  }
  ui.kitBtn.addEventListener('click', () => update({ view: 'kits' }));
  // The tablet header has no SETUP tab: the MIDI chip and the gear open it.
  for (const el of [ui.midiChip, ui.gear]) el.addEventListener('click', () => update({ view: 'setup' }));

  subscribe((s, changed) => {
    if (!changed.has('view')) return;
    ui.app.dataset.view = s.view;
    ui.gear.setAttribute('aria-pressed', String(s.view === 'setup'));
    for (const tab of ui.app.querySelectorAll('.tab')) {
      if (tab.classList.contains(s.view)) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  });
}
