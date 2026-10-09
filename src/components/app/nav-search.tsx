'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ENTRIES.filter((e) =>
      `${e.label} ${e.context}`.toLowerCase().includes(q),
    ).slice(0, MAX_RESULTS);
  }, [query]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setQuery('');
    setOpen(false);
    router.push(entry.href);
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
      setOpen(false);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Jump to a screen…"
        className="pl-9"
        role="combobox"
        aria-label="Search screens"
        aria-expanded={showList}
        aria-controls="nav-search-results"
        aria-autocomplete="list"
      />
      {showList ? (
        <ul
          id="nav-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover py-1 text-popover-foreground shadow-md"
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
  );
}
