// tests/hire.rls.test.ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = (): SupabaseClient =>
  createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const TABLES = ['hire_jobs', 'hire_candidates', 'hire_applications', 'hire_interviews'];

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
  const { data: orgId, error } = await o.c.rpc('create_org_for_current_user', { org_name: 'Hire Test Sdn Bhd' });
  expect(error, error?.message).toBeNull();
  owner = { ...o, orgId: orgId as string };
});

afterAll(async () => {
  await owner?.c.auth.signOut();
});

testWithSupabase('a fresh org sees no hiring rows, and none of the demo org', async () => {
  for (const t of TABLES) {
    const { data, error } = await owner.c.from(t).select('id');
    expect(error, `${t}: ${error?.message}`).toBeNull();
    expect(data ?? []).toHaveLength(0);
  }
});

testWithSupabase('even an owner cannot write this slice', async () => {
  const { error } = await owner.c.from('hire_jobs').insert({ org_id: owner.orgId, title: 'Should not save' });
  expect(error).not.toBeNull();
  const { data } = await owner.c.from('hire_jobs').select('id');
  expect(data ?? []).toHaveLength(0);
});

testWithSupabase('a signed-out client reads nothing', async () => {
  for (const t of TABLES) {
    const { data } = await client().from(t).select('id');
    expect(data ?? []).toHaveLength(0);
  }
});
