export const THEME_KEY = 'theme';

export type Theme = 'light' | 'dark';

/** The saved choice, or the system preference when nothing is saved. */
export function resolveTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage can be unavailable (private mode, blocked storage).
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not saved; the choice still applies for this page view.
  }
}

/**
 * Runs before first paint (inlined in <head>) so the saved theme is applied
 * without a flash. Keep in sync with resolveTheme/applyTheme above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

/** Subscribe to the theme class on <html>, for useSyncExternalStore. */
export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

export function isDarkSnapshot() {
  return document.documentElement.classList.contains('dark');
}
