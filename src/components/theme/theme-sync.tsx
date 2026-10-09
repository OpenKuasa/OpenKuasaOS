'use client';

import { useLayoutEffect } from 'react';
import { applyTheme, resolveTheme } from '@/lib/theme';

/**
 * Re-applies the saved theme once React has taken over the page. The inline
 * script in the root layout sets it before first paint, but whenever React
 * rebuilds <html> on the client (a hydration fallback, or the Strict Mode
 * remount in development) it resets the element to the attributes in JSX and
 * the theme class is lost. Rendered once in the root layout so every page is
 * covered, not only those with a theme toggle.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(resolveTheme());
  }, []);

  return null;
}
