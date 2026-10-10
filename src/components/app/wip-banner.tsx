'use client';

import { useSyncExternalStore } from 'react';
import { Construction, X } from 'lucide-react';

const STORAGE_KEY = 'ok.wip-banner.dismissed';
const CHANGE_EVENT = 'ok:wip-banner';

function read(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage can be blocked; the banner then simply stays.
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function dismiss() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Nothing to remember it in; it hides until the next page load.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Shown above screens that are not connected to the workspace's data yet.
 * Closing it lasts for the browser session, so it comes back on the next visit.
 */
export function WipBanner() {
  const dismissed = useSyncExternalStore(subscribe, read, () => false);
  if (dismissed) return null;

  return (
    <div
      role="note"
      className="flex shrink-0 items-center gap-2 border-b bg-muted px-4 py-1.5 text-xs text-muted-foreground"
    >
      <Construction aria-hidden className="size-3.5 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-medium text-foreground">Work in progress.</span>{' '}
        This screen is not connected to your workspace yet. What it shows is
        sample data, and changes here are not saved.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this notice"
        className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-background hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
