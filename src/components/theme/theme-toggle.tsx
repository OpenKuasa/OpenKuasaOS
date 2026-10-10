'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  applyTheme,
  isDarkSnapshot,
  resolveTheme,
  saveTheme,
  subscribeTheme,
} from '@/lib/theme';
import { cn } from '@/lib/utils';
import { preloadKeris, sliceTheme } from './keris-slice';

/** Light/dark switch. The change is drawn as a keris cutting across the screen. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribeTheme, isDarkSnapshot, () => false);

  // In development React's Strict Mode remount resets <html>'s attributes,
  // dropping the class the inline script set. Re-apply it; a no-op in production.
  useLayoutEffect(() => {
    applyTheme(resolveTheme());
    preloadKeris();
  }, []);

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    saveTheme(next);
    void sliceTheme(() => applyTheme(next));
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      // 44px on touch-sized screens; the default 32px icon button is a small target.
      className={cn('max-md:size-11', className)}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
