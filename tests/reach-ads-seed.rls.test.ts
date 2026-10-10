import { expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';
const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

testWithSupabase('demo org has creatives and an ad_settings row; campaign CPL is generated', async () => {
  const c: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c.auth.signInAnonymously();
  const { data: demoId } = await c.rpc('join_demo_org');
  const creatives = await c.from('creatives').select('id, campaign_id').eq('org_id', demoId);
  expect((creatives.data ?? []).length).toBeGreaterThanOrEqual(8);
  const settings = await c.from('ad_settings').select('currency').eq('org_id', demoId).single();
  expect(settings.data!.currency).toBe('MYR');
  const camp = await c.from('campaigns').select('leads_count, spend_cents, cpl_cents').eq('org_id', demoId).eq('name', 'Ramadan–Raya Promo').single();
  expect(camp.data!.cpl_cents).toBe(Math.floor(camp.data!.spend_cents / camp.data!.leads_count));
  await c.auth.signOut();
});
