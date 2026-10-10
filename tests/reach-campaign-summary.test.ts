import { describe, expect, it } from 'vitest';
import { summarizeCampaigns, summarizeCreatives } from '@/lib/ai/tools';
import type { Campaign } from '@/lib/reach/types';
import { createSeedReachData } from '@/lib/reach/seed';

const base: Omit<Campaign, 'cpl_cents'> = {
  id: 'c1', name: 'Zero leads', channel: 'facebook', status: 'active',
  leads_count: 0, spend_cents: 5000, created_at: new Date().toISOString(),
};

describe('summarizeCampaigns with a null CPL', () => {
  it('renders "—" and sorts a null-CPL campaign last', () => {
    const rows = summarizeCampaigns([
      { ...base, id: 'c1', cpl_cents: null },
      { ...base, id: 'c2', name: 'Has CPL', leads_count: 4, cpl_cents: 1250 },
    ]);
    expect(rows[0].name).toBe('Has CPL'); // null sorts last
    expect(rows[1].cpl).toBe('—');
    expect(rows[1].cpl_cents).toBeNull();
  });
});

describe('row ids in AI read summaries', () => {
  it('summarizeCampaigns carries each source row id', () => {
    const rows = summarizeCampaigns([{ ...base, id: 'camp-123', cpl_cents: 100 }]);
    expect(rows[0].id).toBe('camp-123');
  });
  it('summarizeCreatives carries each source row id', async () => {
    const creatives = await createSeedReachData().listCreatives();
    expect(creatives.length).toBeGreaterThan(0);
    const rows = summarizeCreatives(creatives, { limit: creatives.length });
    expect(rows.map((r) => r.id)).toEqual(creatives.map((c) => c.id));
    expect(rows.every((r) => Boolean(r.id))).toBe(true);
  });
});
