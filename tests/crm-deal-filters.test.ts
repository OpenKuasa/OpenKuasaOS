import { describe, expect, test } from 'vitest';
import {
  ALL_OWNERS,
  DEAL_STATUS_VIEWS,
  DEFAULT_DEAL_FILTERS,
  UNASSIGNED_OWNER,
  dealOwners,
  dealsInPipeline,
  filterDeals,
  statusCounts,
  type DealFilters,
} from '@/lib/crm/deal-filters';
import type { CrmDeal } from '@/lib/crm/deals';

function deal(overrides: Partial<CrmDeal> & { id: string }): CrmDeal {
  return {
    title: 'POS rollout',
    company: 'Seri Mutiara Enterprise',
    contactName: 'Aisyah Rahim',
    value: 18000,
    owner: 'Faiz Hakim',
    status: 'open',
    pipelineId: 'p-1',
    stageId: 's-1',
    lastTouch: '—',
    expectedClose: null,
    createdAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    ...overrides,
  };
}

const DEALS: CrmDeal[] = [
  deal({ id: 'a', title: 'POS rollout', company: 'Seri Mutiara Enterprise', tag: 'Inbound' }),
  deal({
    id: 'b',
    title: 'Loyalty and WhatsApp CRM',
    company: 'Teratak Kopi',
    contactName: 'Nurul Huda',
    owner: 'Aisyah Rahim',
  }),
  deal({ id: 'c', title: 'Annual retainer', company: 'Delima Properties', status: 'won', tag: 'Renewal' }),
  deal({ id: 'd', title: 'Fleet dashboard', company: 'Nusantara Logistics', status: 'lost', owner: UNASSIGNED_OWNER }),
  deal({ id: 'e', title: 'Billing module', company: 'Kedai Runcit Maju', pipelineId: 'p-2' }),
];

function ids(filters: Partial<DealFilters>, deals = DEALS) {
  return filterDeals(deals, { ...DEFAULT_DEAL_FILTERS, status: 'all', ...filters }).map((d) => d.id);
}

describe('the status views', () => {
  test('are Open, Won, Lost and All deals, starting on Open', () => {
    expect(DEAL_STATUS_VIEWS.map((view) => view.key)).toEqual([
      'active',
      'open',
      'won',
      'lost',
      'all',
    ]);
    expect(DEAL_STATUS_VIEWS.map((view) => view.label)).toEqual([
      'Open and won',
      'Open',
      'Won',
      'Lost',
      'All deals',
    ]);
    expect(DEFAULT_DEAL_FILTERS).toEqual({ search: '', owner: ALL_OWNERS, status: 'active' });
  });
});

describe('dealsInPipeline', () => {
  test('keeps the deals of one pipeline', () => {
    expect(dealsInPipeline(DEALS, 'p-1').map((d) => d.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(dealsInPipeline(DEALS, 'p-2').map((d) => d.id)).toEqual(['e']);
    expect(dealsInPipeline(DEALS, 'p-9')).toEqual([]);
    expect(dealsInPipeline(DEALS, null)).toEqual([]);
  });
});

describe('filterDeals', () => {
  test('hides only lost deals by default, so won deals stay on the board', () => {
    expect(filterDeals(DEALS, DEFAULT_DEAL_FILTERS).map((d) => d.id)).toEqual(['a', 'b', 'c', 'e']);
  });

  test('the Open view hides won and lost deals', () => {
    expect(
      filterDeals(DEALS, { ...DEFAULT_DEAL_FILTERS, status: 'open' }).map((d) => d.id),
    ).toEqual(['a', 'b', 'e']);
  });

  test('shows one status at a time, or all of them', () => {
    expect(ids({ status: 'open' })).toEqual(['a', 'b', 'e']);
    expect(ids({ status: 'won' })).toEqual(['c']);
    expect(ids({ status: 'lost' })).toEqual(['d']);
    expect(ids({ status: 'all' })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('searches the title, company, contact name, tag and owner, ignoring case', () => {
    expect(ids({ search: 'whatsapp' })).toEqual(['b']);
    expect(ids({ search: 'DELIMA' })).toEqual(['c']);
    expect(ids({ search: 'nurul' })).toEqual(['b']);
    expect(ids({ search: 'renewal' })).toEqual(['c']);
    expect(ids({ search: 'unassigned' })).toEqual(['d']);
  });

  test('needs every word, each in any field', () => {
    // "aisyah" is the contact of some deals and the owner of another.
    expect(ids({ search: 'aisyah' })).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids({ search: 'aisyah kopi' })).toEqual(['b']);
    expect(ids({ search: '  pos   inbound ' })).toEqual(['a']);
    expect(ids({ search: 'pos renewal' })).toEqual([]);
  });

  test('ignores a blank search', () => {
    expect(ids({ search: '   ' })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('filters by owner, including deals nobody owns', () => {
    expect(ids({ owner: 'Aisyah Rahim' })).toEqual(['b']);
    expect(ids({ owner: UNASSIGNED_OWNER })).toEqual(['d']);
    expect(ids({ owner: 'Nobody Here' })).toEqual([]);
    expect(ids({ owner: ALL_OWNERS })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('applies search, owner and status together', () => {
    expect(ids({ search: 'retainer', owner: 'Faiz Hakim', status: 'won' })).toEqual(['c']);
    expect(ids({ search: 'retainer', owner: 'Faiz Hakim', status: 'open' })).toEqual([]);
  });

  test('keeps the order and does not change its input', () => {
    const before = [...DEALS];

    const result = filterDeals(DEALS, { ...DEFAULT_DEAL_FILTERS, status: 'all' });

    expect(result).not.toBe(DEALS);
    expect(DEALS).toEqual(before);
  });
});

describe('dealOwners', () => {
  test('lists each owner once, A to Z, with Unassigned last', () => {
    expect(dealOwners(DEALS)).toEqual(['Aisyah Rahim', 'Faiz Hakim', UNASSIGNED_OWNER]);
  });

  test('leaves Unassigned out when every deal has an owner', () => {
    expect(dealOwners(DEALS.filter((d) => d.id !== 'd'))).toEqual(['Aisyah Rahim', 'Faiz Hakim']);
    expect(dealOwners([])).toEqual([]);
  });
});

describe('statusCounts', () => {
  test('counts the deals each view holds', () => {
    expect(statusCounts(DEALS)).toEqual({ active: 4, open: 3, won: 1, lost: 1, all: 5 });
    expect(statusCounts([])).toEqual({ active: 0, open: 0, won: 0, lost: 0, all: 0 });
  });
});
