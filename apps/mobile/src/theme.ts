import { ref } from 'vue';

/**
 * Light or dark colors: the phone's setting ("system", the default) or a fixed choice kept
 * on this phone. The active mode is one class on <html>, `ion-palette-dark`, which Ionic's
 * dark palette, theme.css and the rest of the app's styles read.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

const KEY = 'tipeline.theme';
const DARK_CLASS = 'ion-palette-dark';

/** The saved choice. */
export const themeMode = ref<ThemeMode>('system');
/** Whether dark colors are showing right now. */
export const isDark = ref(false);

export function resolveDark(mode: ThemeMode, phoneDark: boolean): boolean {
  return mode === 'system' ? phoneDark : mode === 'dark';
}

export function parseThemeMode(value: unknown): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : 'system';
}

let phone: MediaQueryList | undefined;

function apply() {
  isDark.value = resolveDark(themeMode.value, !!phone?.matches);
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, isDark.value);
  // Scrollbars, native form controls and the WebView's own defaults.
  root.style.colorScheme = isDark.value ? 'dark' : 'light';
}

/** Applies the saved choice; call before the app mounts so the first screen has the right colors. */
export function initTheme() {
  try {
    themeMode.value = parseThemeMode(localStorage.getItem(KEY));
  } catch {
    themeMode.value = 'system';
  }
  phone = window.matchMedia?.('(prefers-color-scheme: dark)');
  phone?.addEventListener?.('change', apply);
  apply();
}

export function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode;
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Not kept for the next launch; still applies now.
  }
  apply();
}
