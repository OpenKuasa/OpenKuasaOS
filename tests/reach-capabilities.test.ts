import { describe, expect, it } from 'vitest';
import { createCampaignInput, updateAdSettingsInput, updateCampaignInput } from '@/lib/reach/capabilities';

describe('campaign capability schemas', () => {
  it('rejects an empty name', () => {
    expect(createCampaignInput.safeParse({ name: '', channel: 'facebook' }).success).toBe(false);
  });
  it('rejects a bad channel', () => {
    expect(createCampaignInput.safeParse({ name: 'x', channel: 'linkedin' }).success).toBe(false);
  });
  it('rejects negative spend', () => {
    expect(createCampaignInput.safeParse({ name: 'x', channel: 'facebook', spend_cents: -1 }).success).toBe(false);
  });
  it('defaults status active, spend 0, leads 0', () => {
    const p = createCampaignInput.parse({ name: 'x', channel: 'facebook' });
    expect(p).toMatchObject({ status: 'active', spend_cents: 0, leads_count: 0 });
  });
  it('update requires a uuid id and allows partial fields', () => {
    expect(updateCampaignInput.safeParse({ id: 'not-a-uuid', name: 'y' }).success).toBe(false);
    expect(updateCampaignInput.safeParse({ id: '00000000-0000-0000-0000-000000000000', name: 'y' }).success).toBe(true);
  });
});

describe('ad settings schema', () => {
  it('requires a 3-letter currency', () => {
    expect(updateAdSettingsInput.safeParse({ currency: 'MY' }).success).toBe(false);
    expect(updateAdSettingsInput.safeParse({ currency: 'MYR' }).success).toBe(true);
  });
  it('accepts boolean toggle maps and rejects non-boolean values', () => {
    expect(updateAdSettingsInput.safeParse({ automation: { auto_pause: true }, notifications: { email: false } }).success).toBe(true);
    expect(updateAdSettingsInput.safeParse({ automation: { auto_pause: 'yes' } }).success).toBe(false);
  });
});

import { createClient as createSb, type SupabaseClient as Sb } from '@supabase/supabase-js';
import { hasSupabaseEnv } from './setup/supabase';
import { createCampaign, deleteCampaign, type ReachWriteContext } from '@/lib/reach/capabilities';
import { test as vtest } from 'vitest';
const itSb = hasSupabaseEnv ? vtest : vtest.skip;

itSb('createCampaign writes to the caller org and ignores an input org_id', async () => {
  const c: Sb = createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await c.auth.signInAnonymously();
  expect(signIn.error).toBeNull();
  const { data: orgId, error: orgError } = await c.rpc('create_org_for_current_user', { org_name: 'Cap IT Sdn Bhd' });
  expect(orgError).toBeNull();
  expect(orgId).toBeTruthy();
  const ctx: ReachWriteContext = { client: c, orgId: orgId as string };
  let createdId: string | null = null;
  try {
    // Pass a bogus org_id in the input; the capability must ignore it and use ctx.orgId.
    const res = await createCampaign(ctx, {
      name: 'From capability', channel: 'facebook', status: 'active', spend_cents: 2000, leads_count: 4,
      // @ts-expect-error — org_id is not part of the input type; prove it's ignored even if present.
      org_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      createdId = res.data.id;
      expect(res.data.cpl_cents).toBe(500);
      const row = await c.from('campaigns').select('org_id').eq('id', res.data.id).single();
      expect(row.error).toBeNull();
      expect(row.data?.org_id).toBe(orgId);
    }
  } finally {
    if (createdId) {
      const del = await deleteCampaign(ctx, { id: createdId });
      expect(del.ok).toBe(true);
    }
    await c.auth.signOut();
  }
});
