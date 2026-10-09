import { describe, expect, it } from 'vitest';
import { deriveAdsOverview, deriveLeadSummary } from '@/lib/ai/tools';
import { buildOverviewModel, formatWhen } from '@/lib/reach/overview';
import { createSeedReachData } from '@/lib/reach/seed';
import type { ReachData } from '@/lib/reach/types';

const NOW = new Date('2026-10-09T00:00:00.000Z');
const empty: ReachData = {
  listCampaigns: async () => [], listLeads: async () => [], listAppointments: async () => [],
  listForms: async () => [], listBroadcasts: async () => [], listAutomations: async () => [],
};

describe('buildOverviewModel', () => {
  it('derives KPIs/funnel/campaigns consistent with the chat tool helpers', async () => {
    const data = createSeedReachData(NOW);
    const m = await buildOverviewModel(data, NOW);
    const ads = deriveAdsOverview(await data.listCampaigns());
    const sum = deriveLeadSummary(await data.listLeads(), NOW);
    expect(m.kpis.spendRm).toBe(ads.total_spend);
    expect(m.kpis.cplRm).toBe(ads.blended_cpl);
    expect(m.kpis.leads.value).toBe(sum.total_leads);
    expect(m.kpis.conversionPct).toBe(sum.conversion_pct);
    expect(m.leadsTrend.map((t) => t.label)).toEqual(
      ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Wk5', 'Wk6', 'Wk7', 'Wk8'],
    );
    expect(m.channelMix.reduce((n, c) => n + c.value, 0)).toBe(sum.total_leads);
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

describe('formatWhen', () => {
  // 2026-10-09 10:00 KL (UTC+8)
  const now = new Date('2026-10-09T02:00:00.000Z');
  it('formats Today / Tomorrow / weekday in Asia/Kuala_Lumpur', () => {
    expect(formatWhen('2026-10-09T06:30:00.000Z', now)).toBe('Today · 2:30pm');
    expect(formatWhen('2026-10-10T02:00:00.000Z', now)).toBe('Tomorrow · 10:00am');
    // 16:30 UTC on the 9th is 00:30 KL on the 10th
    expect(formatWhen('2026-10-09T16:30:00.000Z', now)).toBe('Tomorrow · 12:30am');
    expect(formatWhen('2026-10-12T08:00:00.000Z', now)).toBe('Mon · 4:00pm');
  });
});
