import type { CrmDeal } from '@/lib/crm/deals';

export type DealStatusView = 'active' | 'open' | 'won' | 'lost' | 'all';

/**
 * In menu order. The board starts on "Open and won": everything except lost
 * deals, so the Won column fills up as deals close instead of sitting empty.
 */
export const DEAL_STATUS_VIEWS: { key: DealStatusView; label: string }[] = [
  { key: 'active', label: 'Open and won' },
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'all', label: 'All deals' },
];

/** Stands for "every owner" in `DealFilters.owner`. Never a person's name. */
export const ALL_OWNERS = '__all__';

/** What a deal with no owner shows, and how the owner filter names it. */
export const UNASSIGNED_OWNER = 'Unassigned';

export type DealFilters = {
  search: string;
  /** An owner's name, `UNASSIGNED_OWNER`, or `ALL_OWNERS`. */
  owner: string;
  status: DealStatusView;
};

/** No search, every owner, lost deals hidden. */
export const DEFAULT_DEAL_FILTERS: DealFilters = {
  search: '',
  owner: ALL_OWNERS,
  status: 'active',
};

/** Whether a status view puts a deal of this status on the board. */
export function viewShows(view: DealStatusView, status: CrmDeal['status']): boolean {
  if (view === 'all') return true;
  if (view === 'active') return status !== 'lost';
  return view === status;
}

/** The deals of one pipeline, in the order given. */
export function dealsInPipeline(deals: CrmDeal[], pipelineId: string | null): CrmDeal[] {
  return deals.filter((deal) => deal.pipelineId === pipelineId);
}

/** Every word must appear in the title, company, contact name, tag or owner. */
function matchesSearch(deal: CrmDeal, words: string[]) {
  if (words.length === 0) return true;
  const fields = [deal.title, deal.company, deal.contactName, deal.tag, deal.owner].map(
    (field) => (field ?? '').toLowerCase(),
  );
  return words.every((word) => fields.some((field) => field.includes(word)));
}

/**
 * Narrows already-loaded deals by search, owner and status view. Keeps the
 * input order and returns a new array.
 */
export function filterDeals(deals: CrmDeal[], filters: DealFilters): CrmDeal[] {
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return deals.filter((deal) => {
    if (!viewShows(filters.status, deal.status)) return false;
    if (filters.owner !== ALL_OWNERS && deal.owner !== filters.owner) return false;
    return matchesSearch(deal, words);
  });
}

/** The owners to offer, taken from the deals themselves: names A to Z, then Unassigned. */
export function dealOwners(deals: CrmDeal[]): string[] {
  const names = new Set<string>();
  let unassigned = false;
  for (const deal of deals) {
    if (deal.owner && deal.owner !== UNASSIGNED_OWNER) names.add(deal.owner);
    else unassigned = true;
  }
  return [
    ...[...names].sort((a, b) => a.localeCompare(b)),
    ...(unassigned ? [UNASSIGNED_OWNER] : []),
  ];
}

/** How many deals each status view would show, before search and owner. */
export function statusCounts(deals: CrmDeal[]): Record<DealStatusView, number> {
  const counts: Record<DealStatusView, number> = {
    active: 0,
    open: 0,
    won: 0,
    lost: 0,
    all: deals.length,
  };
  for (const deal of deals) counts[deal.status] += 1;
  counts.active = counts.open + counts.won;
  return counts;
}
