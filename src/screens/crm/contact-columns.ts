'use client';

import { useSyncExternalStore } from 'react';

/** The table columns a person can hide. The Contact column always shows. */
export const CONTACT_COLUMNS = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'status', label: 'Status' },
  { key: 'pic', label: 'PIC' },
  { key: 'lastInteraction', label: 'Last interaction' },
] as const;

export type ContactColumnKey = (typeof CONTACT_COLUMNS)[number]['key'];

const STORAGE_KEY = 'ok.crm.contacts.hidden-columns';
const CHANGE_EVENT = 'ok:crm-contact-columns';
const KEYS = new Set<string>(CONTACT_COLUMNS.map((c) => c.key));

function read(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Storage can be blocked; the table then simply shows every column.
    return '';
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Which columns are hidden, remembered in this browser. The server render and
 * the first client render both show every column, so the two always match.
 */
export function useHiddenColumns() {
  const raw = useSyncExternalStore(subscribe, read, () => '');
  const hidden = new Set(raw.split(',').filter((key) => KEYS.has(key))) as Set<ContactColumnKey>;

  const toggle = (key: ContactColumnKey) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, [...next].join(','));
    } catch {
      // Storage is blocked, so there is nowhere to keep the choice.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return { hidden, toggle };
}
