import { describe, expect, it } from 'vitest';
import { summarizeCampaigns } from '@/lib/ai/tools';
import type { Campaign } from '@/lib/reach/types';

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
