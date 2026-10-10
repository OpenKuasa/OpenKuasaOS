import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = (): SupabaseClient =>
  createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

async function ownedOrg(name: string) {
  const c = client();
  const { error: e1 } = await c.auth.signInAnonymously();
  expect(e1, e1?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', { org_name: name });
  expect(error, error?.message).toBeNull();
  return { c, orgId: orgId as string };
}

let owner: Awaited<ReturnType<typeof ownedOrg>>;
let other: Awaited<ReturnType<typeof ownedOrg>>;

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  owner = await ownedOrg('Ads Writer Sdn Bhd');
  other = await ownedOrg('Ads Other Sdn Bhd');
});
afterAll(async () => {
  await owner?.c.auth.signOut();
  await other?.c.auth.signOut();
});

testWithSupabase('owner can insert, update and delete a campaign; CPL is generated', async () => {
  const ins = await owner.c
    .from('campaigns')
    .insert({ org_id: owner.orgId, name: 'Promo', channel: 'facebook', status: 'active', spend_cents: 10000, leads_count: 8 })
    .select('id, cpl_cents')
    .single();
  expect(ins.error, ins.error?.message).toBeNull();
  expect(ins.data!.cpl_cents).toBe(1250); // 10000 / 8

  const id = ins.data!.id;
  const upd = await owner.c.from('campaigns').update({ leads_count: 0 }).eq('id', id).select('cpl_cents').single();
  expect(upd.error, upd.error?.message).toBeNull();
  expect(upd.data!.cpl_cents).toBeNull(); // zero leads → null CPL

  const del = await owner.c.from('campaigns').delete().eq('id', id).select('id');
  expect(del.error, del.error?.message).toBeNull();
  expect(del.data).toHaveLength(1);
});

testWithSupabase('cpl_cents cannot be written directly (generated column)', async () => {
  const { error } = await owner.c
    .from('campaigns')
    .insert({ org_id: owner.orgId, name: 'x', channel: 'whatsapp', spend_cents: 1, leads_count: 1, cpl_cents: 999999 });
  expect(error, 'writing a generated column must be rejected').not.toBeNull();
});

testWithSupabase('a different org cannot write to the owner’s campaigns', async () => {
  // insert into owner's org → RLS check fails
  const ins = await other.c
    .from('campaigns')
    .insert({ org_id: owner.orgId, name: 'intrusion', channel: 'tiktok' });
  expect(ins.error?.code).toBe('42501');
  // seed a row in owner, then other tries to update/delete it → zero rows, no error
  const mine = await owner.c
    .from('campaigns')
    .insert({ org_id: owner.orgId, name: 'mine', channel: 'facebook' })
    .select('id')
    .single();
  const upd = await other.c.from('campaigns').update({ name: 'hacked' }).eq('id', mine.data!.id).select('id');
  expect(upd.error).toBeNull();
  expect(upd.data ?? []).toHaveLength(0);
  await owner.c.from('campaigns').delete().eq('id', mine.data!.id);
});

testWithSupabase('a viewer (demo member) cannot write', async () => {
  const v = client();
  await v.auth.signInAnonymously();
  const { data: demoId } = await v.rpc('join_demo_org');
  const { error } = await v.from('campaigns').insert({ org_id: demoId, name: 'nope', channel: 'whatsapp' });
  expect(error?.code).toBe('42501'); // is_org_writer false for a viewer
  await v.auth.signOut();
});
