'use client';

import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PRODUCTS } from '@/config/nav';
import { cn } from '@/lib/utils';

type Entry = { href: string; label: string; context: string };

const ACCOUNT_ENTRIES: Entry[] = [
  { href: '/account/profile', label: 'My profile', context: 'Account' },
  { href: '/account/security', label: 'Security', context: 'Account' },
  { href: '/account/notifications', label: 'Notifications', context: 'Account' },
  { href: '/account/company', label: 'Company details', context: 'Account' },
  { href: '/account/team', label: 'Team', context: 'Account' },
];

const ENTRIES: Entry[] = [
  ...PRODUCTS.flatMap((p) => [
    { href: `/${p.key}`, label: p.name, context: p.tagline },
    ...p.sections.flatMap((s) =>
      s.items.map((i) => ({
        href: `/${p.key}/${i.slug}`,
        label: i.label,
        context: `${p.name} · ${s.label}`,
      })),
    ),
  ]),
  ...ACCOUNT_ENTRIES,
];

const MAX_RESULTS = 8;

/** Jump-to search over the app's screens. Record search comes with live data. */
export function NavSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Below md the field collapses to an icon; tapping it opens the field over
  // the top bar, which has no room for a usable field beside its other controls.
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ENTRIES.filter((e) =>
      `${e.label} ${e.context}`.toLowerCase().includes(q),
    ).slice(0, MAX_RESULTS);
  }, [query]);

  const close = () => {
    setOpen(false);
    setExpanded(false);
  };

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setQuery('');
    close();
    router.push(entry.href);
  };

  const expand = () => {
    // Render the field synchronously so it can take focus inside the tap:
    // iOS only raises the keyboard for a focus made during the gesture.
    flushSync(() => setExpanded(true));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === 'Escape') {
      close();
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <>
      {expanded ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Search screens"
          onClick={expand}
          className="size-11 md:hidden"
        >
          <Search className="size-5" />
        </Button>
      )}

      <div
        className={cn(
          'relative w-full max-w-sm',
          expanded
            ? 'max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:z-40 max-md:flex max-md:h-14 max-md:max-w-none max-md:items-center max-md:gap-1 max-md:bg-background max-md:px-3'
            : 'max-md:hidden',
        )}
      >
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={close}
            onKeyDown={onKeyDown}
            placeholder="Jump to a screen…"
            className="pl-9"
            role="combobox"
            aria-label="Search screens"
            aria-expanded={showList}
            aria-controls="nav-search-results"
            aria-autocomplete="list"
          />
        </div>

        {expanded ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close search"
            // pointerdown, not click: the field's blur closes the bar first
            // and would unmount this button before a click could land.
            onPointerDown={() => {
              setQuery('');
              close();
            }}
            className="size-11 shrink-0 md:hidden"
          >
            <X className="size-5" />
          </Button>
        ) : null}

        {showList ? (
          <ul
            id="nav-search-results"
            role="listbox"
            className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover py-1 text-popover-foreground shadow-md max-md:inset-x-3"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No screens match “{query.trim()}”.
              </li>
            ) : (
              results.map((r, i) => (
                <li
                  key={r.href}
                  role="option"
                  aria-selected={i === active}
                  // mousedown fires before the input's blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm',
                    i === active && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="truncate font-medium">{r.label}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {r.context}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </>
  );
}
