// Theme and pad colours. This is the only code that changes state.theme. The look is all CSS:
// applyTheme() only sets data-theme / data-pads on <html> (see the bottom of tokens.css).

import { state, update } from '../state';
import { saveTheme, THEME_BAR, type PadColours, type ThemeId, type ThemeState } from './themeTypes';

/** Call once at boot, before the first paint, and it keeps the page in step with state.theme. */
export function applyTheme(): void {
  const t = state.theme;
  const root = document.documentElement;
  root.dataset.theme = t.theme;
  root.dataset.pads = t.pads;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BAR[t.theme]);
}

function set(patch: Partial<ThemeState>): void {
  const theme = { ...state.theme, ...patch };
  update({ theme });
  saveTheme(theme);
  applyTheme();
}

export const setTheme = (theme: ThemeId) => set({ theme });
export const setPads = (pads: PadColours) => set({ pads });
export const setVibrate = (vibrate: boolean) => set({ vibrate });

export const canVibrate = (): boolean => typeof navigator.vibrate === 'function';
