// Switches between the PADS screen and the KITS and SEQ panels. CSS does the layout work via
// .app[data-view]; this only keeps the attribute and the tab highlight in step with the store.

import { subscribe, update, type View } from '../state';
import type { ScreenRefs } from './screen';

const VIEWS: View[] = ['pads', 'kits', 'seq'];

export function initViews(ui: ScreenRefs): void {
  for (const view of VIEWS) {
    ui.app.querySelector(`.tab.${view}`)?.addEventListener('click', () => update({ view }));
  }
  ui.kitBtn.addEventListener('click', () => update({ view: 'kits' }));

  subscribe((s, changed) => {
    if (!changed.has('view')) return;
    ui.app.dataset.view = s.view;
    for (const tab of ui.app.querySelectorAll('.tab')) {
      if (tab.classList.contains(s.view)) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  });
}
