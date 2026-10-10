import { PRODUCTS, visibleSections } from '@/config/nav';
import type { Viewer } from '@/lib/auth/viewer';

export type SearchEntry = { href: string; label: string; context: string };

const ACCOUNT_ENTRIES: SearchEntry[] = [
  { href: '/account/profile', label: 'My profile', context: 'Account' },
  { href: '/account/security', label: 'Security', context: 'Account' },
  { href: '/account/notifications', label: 'Notifications', context: 'Account' },
  { href: '/account/company', label: 'Company details', context: 'Account' },
  { href: '/account/team', label: 'Team', context: 'Account' },
  { href: '/account/ai', label: 'AI key', context: 'Account' },
];

/** Every screen this viewer may open: the same sections the side navigation shows them. */
export function buildSearchEntries(viewer: Pick<Viewer, 'role' | 'isDemo'>): SearchEntry[] {
  return [
    ...PRODUCTS.flatMap((p) => [
      { href: `/${p.key}`, label: p.name, context: p.tagline },
      ...visibleSections(p, viewer).flatMap((s) =>
        s.items.map((i) => ({
          href: `/${p.key}/${i.slug}`,
          label: i.label,
          context: `${p.name} · ${s.label}`,
        })),
      ),
    ]),
    ...ACCOUNT_ENTRIES,
  ];
}
