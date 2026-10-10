import { describe, expect, test } from 'vitest';
import { applyDealMove, canDropDeal } from '@/lib/crm/deal-board';
import { filterDeals, DEFAULT_DEAL_FILTERS } from '@/lib/crm/deal-filters';
import { stageColumns } from '@/lib/crm/deal-stats';
import type { CrmDeal } from '@/lib/crm/deals';

const AT = '2026-10-10T08:30:00.000Z';
const LEAD = { id: 'lead', name: 'Lead' };
const PROPOSAL = { id: 'proposal', name: 'Proposal' };
const WON = { id: 'won', name: 'Won' };

function deal(id: string, overrides: Partial<CrmDeal> = {}): CrmDeal {
  return {
    id,
    title: `Deal ${id}`,
    company: 'Teratak Kopi',
    contactName: 'Faiz Hakim',
    value: 1000,
    owner: 'Aisyah Rahim',
    status: 'open',
    pipelineId: 'p-1',
    stageId: 'lead',
    lastTouch: '—',
    expectedClose: null,
    createdAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    ...overrides,
  };
}

describe('canDropDeal', () => {
  test('is true for any stage but the one the deal is in', () => {
    expect(canDropDeal(deal('a'), 'proposal')).toBe(true);
    expect(canDropDeal(deal('a'), 'lead')).toBe(false);
    expect(canDropDeal(null, 'lead')).toBe(false);
  });
});

describe('applyDealMove', () => {
  test('puts the deal in the new stage and leaves the others as they were', () => {
    const a = deal('a');
    const b = deal('b');
    const deals = [a, b];

    const moved = applyDealMove(deals, { dealId: 'a', stage: PROPOSAL, at: AT });

    expect(moved).not.toBe(deals);
    expect(moved.map((d) => d.id)).toEqual(['a', 'b']);
    expect(moved[0]).toEqual({ ...a, stageId: 'proposal' });
    expect(moved[1]).toBe(b);
    // The list it was given is not changed.
    expect(a.stageId).toBe('lead');
  });

  test('wins a deal dropped on Won, whatever it was before', () => {
    const [open] = applyDealMove([deal('a')], { dealId: 'a', stage: WON, at: AT });
    expect(open).toMatchObject({ stageId: 'won', status: 'won', wonAt: AT });

    const lost = deal('b', { status: 'lost', lostAt: '2026-10-01T00:00:00.000Z', lostReason: 'Price' });
    const [revived] = applyDealMove([lost], { dealId: 'b', stage: { id: 'won', name: ' WON ' }, at: AT });
    expect(revived).toMatchObject({ status: 'won', wonAt: AT, lostAt: null, lostReason: null });
  });

  test('reopens a won deal dragged out of Won', () => {
    const won = deal('a', { stageId: 'won', status: 'won', wonAt: '2026-10-01T00:00:00.000Z' });

    const [moved] = applyDealMove([won], { dealId: 'a', stage: PROPOSAL, at: AT });

    expect(moved).toMatchObject({ stageId: 'proposal', status: 'open', wonAt: null });
  });

  test('keeps a lost deal lost between other stages', () => {
    const lost = deal('a', { status: 'lost', lostAt: '2026-10-01T00:00:00.000Z', lostReason: 'Price' });

    const [moved] = applyDealMove([lost], { dealId: 'a', stage: PROPOSAL, at: AT });

    expect(moved).toEqual({ ...lost, stageId: 'proposal' });
  });

  test('moves the stage the edit form would start on', () => {
    const withForm = deal('a', { form: { title: 'Deal a', stageId: 'lead' } });

    const [moved] = applyDealMove([withForm], { dealId: 'a', stage: PROPOSAL, at: AT });

    expect(moved.form).toEqual({ title: 'Deal a', stageId: 'proposal' });
    expect(withForm.form?.stageId).toBe('lead');
  });

  test('changes nothing for a deal that is not there or is already in the stage', () => {
    const deals = [deal('a')];

    expect(applyDealMove(deals, { dealId: 'gone', stage: PROPOSAL, at: AT })).toBe(deals);
    expect(applyDealMove(deals, { dealId: 'a', stage: LEAD, at: AT })).toBe(deals);
  });

  test('two drops in a row both hold', () => {
    const deals = [deal('a'), deal('b')];

    const once = applyDealMove(deals, { dealId: 'a', stage: PROPOSAL, at: AT });
    const twice = applyDealMove(once, { dealId: 'b', stage: WON, at: AT });

    expect(twice.map((d) => [d.id, d.stageId, d.status])).toEqual([
      ['a', 'proposal', 'open'],
      ['b', 'won', 'won'],
    ]);
  });

  test('the board built from the result shows the card in its new column', () => {
    const stages = [LEAD, PROPOSAL, WON].map((stage, index) => ({
      ...stage,
      position: index + 1,
      probability: 0,
      dot: '',
    }));
    const deals = [deal('a'), deal('b')];

    const moved = applyDealMove(deals, { dealId: 'a', stage: WON, at: AT });
    const columns = stageColumns(stages, filterDeals(moved, DEFAULT_DEAL_FILTERS));

    expect(columns.map((column) => column.deals.map((d) => d.id))).toEqual([['b'], [], ['a']]);
    // A view of open deals only stops showing a deal once it is won.
    expect(filterDeals(moved, { ...DEFAULT_DEAL_FILTERS, status: 'open' }).map((d) => d.id)).toEqual(['b']);
  });
});
