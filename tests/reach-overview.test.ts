import { describe, expect, it } from 'vitest';
import { buildOverviewModel } from '@/lib/reach/overview';
import { createSeedReachData } from '@/lib/reach/seed';
import type { ReachData } from '@/lib/reach/types';

const NOW = new Date('2026-10-09T00:00:00.000Z');
const empty: ReachData = {
  listCampaigns: async () => [], listLeads: async () => [], listAppointments: async () => [],
  listForms: async () => [], listBroadcasts: async () => [], listAutomations: async () => [],
};

describe('buildOverviewModel', () => {
  it('derives KPIs/funnel/campaigns consistent with the chat tool helpers', async () => {
    const m = await buildOverviewModel(createSeedReachData(NOW), NOW);
    expect(m.isEmpty).toBe(false);
    expect(m.kpis.leads.value).toBe(342);
    expect(m.kpis.spendRm).toBe('RM 5,007.58');       // == deriveAdsOverview total
    expect(m.funnel.find((f) => f.key === 'won')?.value).toBe(48);
    expect(m.topCampaigns[0].name).toBe('Lead Magnet — eBook'); // cheapest CPL first
    expect(m.appointments).toHaveLength(3);
  });

  it('marks an org with no rows empty and never divides by zero', async () => {
    const m = await buildOverviewModel(empty, NOW);
    expect(m.isEmpty).toBe(true);
    expect(m.kpis.leads.value).toBe(0);
    expect(m.kpis.conversionPct).toBe(0);
    expect(m.kpis.cplRm).toBe('RM 0.00');
  });
});
