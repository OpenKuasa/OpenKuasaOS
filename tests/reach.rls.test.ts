import { afterAll, beforeAll, expect } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';
import { test } from 'vitest';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = (): SupabaseClient =>
  createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

async function anonUser() {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  expect(error, error?.message).toBeNull();
  return { c, uid: data.user!.id };
}

let owner: Awaited<ReturnType<typeof anonUser>> & { orgId: string };

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  const o = await anonUser();
  const { data: orgId, error } = await o.c.rpc('create_org_for_current_user', {
    org_name: 'Reach Test Sdn Bhd',
  });
  expect(error, error?.message).toBeNull();
  owner = { ...o, orgId: orgId as string };
});

afterAll(async () => {
  await owner?.c.auth.signOut();
});

testWithSupabase('a fresh org sees no reach rows', async () => {
  for (const t of ['campaigns', 'leads', 'appointments']) {
    const { data, error } = await owner.c.from(t).select('id');
    expect(error, `${t}: ${error?.message}`).toBeNull();
    expect(data ?? []).toHaveLength(0);
  }
});

testWithSupabase('writes are rejected this slice (no write grant)', async () => {
  const { error } = await owner.c
    .from('campaigns')
    .insert({ org_id: owner.orgId, name: 'x', channel: 'whatsapp' });
  expect(error, 'insert should be denied').not.toBeNull();
  expect(error?.code).toBe('42501'); // permission denied, not a constraint failure
});

testWithSupabase('the demo org is seeded and a demo viewer can read it', async () => {
  const d = await anonUser();
  const { data: demoId, error } = await d.c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();

  const campaigns = await d.c.from('campaigns').select('id').eq('org_id', demoId);
  expect(campaigns.data ?? []).toHaveLength(5);
  const leads = await d.c.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', demoId);
  expect(leads.count).toBe(342);
  const appts = await d.c.from('appointments').select('contact_name,scheduled_at').eq('org_id', demoId);
  expect(appts.data ?? []).toHaveLength(3);
  // The hourly reseed keeps appointments >=4h in the future.
  expect((appts.data ?? []).map((a) => a.contact_name).sort()).toEqual(
    ['Aisyah Rahim', 'Faiz Hakim', 'Nurul Huda'],
  );
  for (const a of appts.data ?? []) {
    expect(new Date(a.scheduled_at) > new Date()).toBe(true);
  }

  // Isolation: the fresh owner (not a demo member) sees none of the demo rows.
  const ownerSees = await owner.c.from('campaigns').select('id');
  expect(ownerSees.data ?? []).toHaveLength(0);

  await d.c.auth.signOut();
});

testWithSupabase('demo leads honor the exact channel and stage marginals', async () => {
  const d = await anonUser();
  const { data: demoId, error } = await d.c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();

  const { data, error: leadsError } = await d.c
    .from('leads')
    .select('channel, stage')
    .eq('org_id', demoId)
    .limit(1000);
  expect(leadsError, leadsError?.message).toBeNull();
  expect(data ?? []).toHaveLength(342);

  const tally = (key: 'channel' | 'stage') => {
    const counts: Record<string, number> = {};
    for (const row of data ?? []) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
    return counts;
  };
  expect(tally('channel')).toEqual({ whatsapp: 142, facebook: 96, instagram: 68, tiktok: 36 });
  expect(tally('stage')).toEqual({ lead: 78, contacted: 106, qualified: 62, booked: 48, won: 48 });

  await d.c.auth.signOut();
});
