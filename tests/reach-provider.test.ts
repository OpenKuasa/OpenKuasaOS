import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ hasEnv: true, org: { orgId: 'o1', role: 'member' } as unknown }));
vi.mock('@/lib/auth/viewer', () => ({ hasSupabaseEnv: () => env.hasEnv }));
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrg: async () => env.org }));

import { getReachData } from '@/lib/reach/supabase';

const fakeClient = {
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: 'c1', name: 'X', channel: 'whatsapp', status: 'active', leads_count: 1, spend_cents: 1, cpl_cents: 1, created_at: 'now' }], error: null }) }) }) }),
} as never;

afterEach(() => { env.hasEnv = true; env.org = { orgId: 'o1', role: 'member' }; });

describe('getReachData', () => {
  it('uses the Supabase provider when env + org are present', async () => {
    const data = await getReachData(fakeClient);
    const campaigns = await data.listCampaigns();
    expect(campaigns[0].id).toBe('c1');
  });

  it('falls back to the seed provider when no Supabase env', async () => {
    env.hasEnv = false;
    const data = await getReachData(fakeClient);
    // seed campaigns use string ids like "camp_1" and have 5 rows
    expect(await data.listCampaigns()).toHaveLength(5);
  });

  it('returns empty data (never the seed) when there is no current org', async () => {
    env.org = null;
    const data = await getReachData(fakeClient);
    expect(await data.listCampaigns()).toHaveLength(0);
    expect(await data.listLeads()).toHaveLength(0);
  });
});
