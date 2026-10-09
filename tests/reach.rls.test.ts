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
});
