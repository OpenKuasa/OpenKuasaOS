import type { CrmContact } from '@/lib/crm/contacts';
import type { CrmFollowUp } from '@/lib/crm/follow-ups';

export type ContactView =
  | 'active'
  | 'lead'
  | 'contacted'
  | 'qualified'
  | 'customer'
  | 'archived'
  | 'all';

/** In menu order: active, lead, contacted, qualified, customer, archived, all. */
export const CONTACT_VIEWS: { key: ContactView; label: string }[] = [
  { key: 'active', label: 'Active contacts' },
  { key: 'lead', label: 'New leads' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'customer', label: 'Customers' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All contacts' },
];

export type ScoreBand = 'hot' | 'warm' | 'cold';

/** In order hot, warm, cold. hot = 75 and above, warm = 40 to 74, cold = below 40. */
export const SCORE_BANDS: { key: ScoreBand; label: string }[] = [
  { key: 'hot', label: 'Hot (75+)' },
  { key: 'warm', label: 'Warm (40–74)' },
  { key: 'cold', label: 'Cold (<40)' },
];

export function scoreBand(score: number): ScoreBand {
  if (score >= 75) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

/** Stands for "nobody is in charge" in `ContactFilters.pics` and in `filterOptions().pics`. */
export const UNASSIGNED = '';

export type FollowUpFilter = 'any' | 'open' | 'overdue';

export type ContactFilters = {
  view: ContactView;
  search: string;
  scores: ScoreBand[];
  /** Names, and/or `UNASSIGNED`. */
  pics: string[];
  countries: string[];
  tags: string[];
  followUp: FollowUpFilter;
};

/** View 'active', everything else empty / 'any'. */
export const DEFAULT_FILTERS: ContactFilters = {
  view: 'active',
  search: '',
  scores: [],
  pics: [],
  countries: [],
  tags: [],
  followUp: 'any',
};

const ARCHIVED = 'Archived';

/** The status label each single-status view keeps. */
const VIEW_STATUS: Record<Exclude<ContactView, 'active' | 'all'>, string> = {
  lead: 'New Leads',
  contacted: 'Contacted',
  qualified: 'Qualified',
  customer: 'Customer',
  archived: ARCHIVED,
};

function matchesView(contact: CrmContact, view: ContactView) {
  if (view === 'all') return true;
  if (view === 'active') return contact.status !== ARCHIVED;
  return contact.status === VIEW_STATUS[view];
}

/** Drops the punctuation people type in phone numbers: spaces, hyphens, plus signs, parentheses. */
function phoneDigits(value: string) {
  return value.replace(/[\s\-+()]/g, '');
}

/** Every word must appear in one of the searched fields, or in the phone number ignoring punctuation. */
function matchesSearch(contact: CrmContact, words: string[]) {
  if (words.length === 0) return true;

  const fields = [
    contact.first,
    contact.last,
    contact.email,
    contact.company,
    contact.phone,
    ...(contact.tags ?? []),
  ].map((field) => (field ?? '').toLowerCase());
  const phone = phoneDigits((contact.phone ?? '').toLowerCase());

  return words.every((word) => {
    if (fields.some((field) => field.includes(word))) return true;
    // A word that is only punctuation strips to nothing, which every phone "contains".
    const bare = phoneDigits(word);
    return bare.length > 0 && phone.includes(bare);
  });
}

function matchesFollowUp(list: CrmFollowUp[], filter: FollowUpFilter) {
  if (filter === 'any') return true;
  if (filter === 'open') return list.length > 0;
  return list.some((followUp) => followUp.overdue);
}

/**
 * Narrows already-loaded contacts. Every kind of filter must hold; within one
 * kind any selected value is enough, and an empty selection restricts nothing.
 * Keeps the input order and returns a new array.
 */
export function filterContacts(
  contacts: CrmContact[],
  followUps: Record<string, CrmFollowUp[]>,
  filters: ContactFilters,
): CrmContact[] {
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const scores = new Set(filters.scores);
  const pics = new Set(filters.pics);
  const countries = new Set(filters.countries);
  const tags = new Set(filters.tags.map((tag) => tag.toLowerCase()));

  return contacts.filter((contact) => {
    if (!matchesView(contact, filters.view)) return false;
    if (!matchesSearch(contact, words)) return false;
    if (scores.size > 0 && !scores.has(scoreBand(contact.score))) return false;
    if (pics.size > 0 && !pics.has(contact.pic || UNASSIGNED)) return false;
    if (countries.size > 0 && !countries.has(contact.country)) return false;
    if (tags.size > 0 && !(contact.tags ?? []).some((tag) => tags.has(tag.toLowerCase()))) {
      return false;
    }
    // Contact ids are looked up as own keys, so an id never hits Object.prototype.
    const open = Object.prototype.hasOwnProperty.call(followUps, contact.id)
      ? followUps[contact.id]
      : [];
    return matchesFollowUp(open, filters.followUp);
  });
}

/** Choices to offer, taken from the contacts themselves. */
export function filterOptions(contacts: CrmContact[]): {
  pics: string[];
  countries: string[];
  tags: string[];
} {
  const pics = new Set<string>();
  const countries = new Set<string>();
  /** Lower-cased tag -> the first spelling seen. */
  const tags = new Map<string, string>();
  let unassigned = false;

  for (const contact of contacts) {
    if (contact.pic) pics.add(contact.pic);
    else unassigned = true;

    if (contact.country && contact.country !== '—') countries.add(contact.country);

    for (const tag of contact.tags ?? []) {
      const key = tag.toLowerCase();
      if (!tags.has(key)) tags.set(key, tag);
    }
  }

  return {
    pics: [
      ...[...pics].sort((a, b) => a.localeCompare(b)),
      ...(unassigned ? [UNASSIGNED] : []),
    ],
    countries: [...countries].sort(),
    tags: [...tags.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
  };
}

/** How many of search, scores, pics and countries are in use (0 to 4). Drives the badge on the Filter button. */
export function activeFilterCount(filters: ContactFilters): number {
  return [
    filters.search.trim().length > 0,
    filters.scores.length > 0,
    filters.pics.length > 0,
    filters.countries.length > 0,
  ].filter(Boolean).length;
}
