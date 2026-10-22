// Theme settings: the type, the defaults and the saved copy. Pure (no store, no DOM), so state.ts
// can import it. The saved copy is in localStorage because the theme must be known synchronously,
// before the first paint.

export const THEME_KEY = 'theme';

export const THEMES = ['chassis', 'light', 'contrast'] as const;
export type ThemeId = (typeof THEMES)[number];
export const THEME_NAMES: Record<ThemeId, string> = { chassis: 'Chassis', light: 'Chassis light', contrast: 'High contrast' };
/** The browser / phone status bar colour for each theme (matches that theme's --body). */
export const THEME_BAR: Record<ThemeId, string> = { chassis: '#2B2A28', light: '#D9D5CB', contrast: '#000000' };

export type PadColours = 'type' | 'single';

export interface ThemeState {
  theme: ThemeId;
  /** 'type' = a colour per drum type; 'single' = every pad amber. */
  pads: PadColours;
  /** Short buzz on every touch hit (phones that support it). */
  vibrate: boolean;
}

export const DEFAULT_THEME: ThemeState = { theme: 'chassis', pads: 'type', vibrate: false };

/** Reads the saved settings; anything missing or damaged falls back to the defaults. */
export function loadTheme(): ThemeState {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_THEME };
    const r = raw as Record<string, unknown>;
    return {
      theme: THEMES.includes(r.theme as ThemeId) ? (r.theme as ThemeId) : DEFAULT_THEME.theme,
      pads: r.pads === 'single' ? 'single' : 'type',
      vibrate: r.vibrate === true,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function saveTheme(s: ThemeState): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the settings last for this visit only */
  }
}
