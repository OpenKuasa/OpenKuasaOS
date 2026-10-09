# Jebat Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Jebat (`reach`) off in-file fixtures: create `campaigns`/`leads`/`appointments` in Postgres with read-only RLS, seed the demo org freshly, and point both the Ask-Jebat chat and the live Overview dashboard at the same org-scoped data through the existing `ReachData` seam.

**Architecture:** A new `createSupabaseReachData(client, orgId)` implements the unchanged `ReachData` interface; a `getReachData(client)` selector returns it in prod and the seed provider in dev/preview. Org scoping = RLS (`is_org_member`, hard cross-tenant guarantee) + an explicit current-org filter via a new `public.current_org_id()` RPC (picks the active workspace among the user's own orgs). The Overview server component renders a pure, tested `buildOverviewModel(data, now)`. The demo org stays fresh via a `private.reseed_demo_reach()` function + nightly `pg_cron`.

**Tech Stack:** Next.js 16 (App Router, server components, route handlers), Supabase (Postgres + RLS, `@supabase/ssr`/`@supabase/supabase-js`), AI SDK v7 (`ai`, `@ai-sdk/react`), Vitest. Migrations applied through the `openkuasa-supabase` MCP (`apply_migration`).

**Spec:** `docs/superpowers/specs/2026-10-10-jebat-data-foundation-design.md` (read it alongside this plan).

## Global Constraints

- **Branch/PR:** `git pull` first (local `main` is behind `origin/main`); branch `feat-NNN-jebat-data-foundation` (next number off `git branch -a`; **047** as of writing); one PR, squash-merge, PR title = branch name; never push `main`, never delete branches.
- **GitHub identity:** act as `OpenKuasa` — verify `gh api user` before any gh/push op.
- **Supabase project:** `ugchntdgaeefmufumchx` via the **`openkuasa-supabase`** MCP only. NOT the `supabase` / `supabase-postvote` MCPs (other projects).
- **Two-layer access:** every reach table gets a `_select` policy `using (private.is_org_member(org_id))`, a `mfa_required` **restrictive** policy, and read-only grants (`revoke all ... from anon, authenticated; grant select ... to authenticated`). **No write grants or `is_org_writer` policies this slice.**
- **Money in cents** (`bigint`). **`org_id` never comes from the model/client** on reads — RLS + the current-org filter enforce scope.
- **Independence:** fictional Rimba Ventures data only (`.my` / `@openkuasa.com`); do NOT copy the reference teardown's tool/product/agent names. No purple/violet in UI.
- **Seam is unchanged:** `src/lib/reach/types.ts` and `src/lib/ai/tools.ts` must not change — the whole point is a drop-in provider swap.
- **Tests:** `pnpm vitest run --dir tests`. Integration (RLS) tests need `.env.local` pointing at the dev project; they `test.skip` without it. `pnpm` only (never npm/yarn).
- **Deploy:** Railway (prod is openkuasa.com on Railway); smoke there post-merge.

## Review Focus

- **Multi-org blend:** a user who also clicked "Explore the demo" belongs to their own org *and* the demo org; the Overview and chat must show only the **current** org, not a mix. → pinned in Task 5 (`getCurrentOrg` honoring/fallback) and Task 4 (provider scoped to `orgId`).
- **Demo/viewer write attempt:** a demo `viewer` (or anyone) must be unable to `insert/update/delete` reach rows this slice. → pinned in Task 1 (insert rejected — no grant).
- **Empty real org:** a fresh org with zero reach rows must render empty states, not `NaN`/broken charts. → pinned in Task 8 (`buildOverviewModel` empty case).
- **Empty aggregates:** no campaigns ⇒ blended CPL / conversion must be `0`, not a divide-by-zero. → pinned in Task 8 (empty-model test; `deriveAdsOverview([])` already returns 0).
- **Demo reseed idempotency:** running the reseed twice (initial + nightly cron) must keep exact counts (5 / 342 / 3), not duplicate. → pinned in Task 2 (double-run test).

---

### Task 1: Reach tables and read-only RLS

**Files:**
- Create: `supabase/migrations/20261011090000_reach_foundation.sql`
- Create: `tests/reach.rls.test.ts`

**Interfaces:**
- Consumes: existing `private.is_org_member(uuid)`, `private.mfa_ok()`, `create_org_for_current_user(text)`, `join_demo_org()`.
- Produces: tables `public.campaigns`, `public.leads`, `public.appointments` (read-only).

- [ ] **Step 1: Write the failing test** — `tests/reach.rls.test.ts`

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --dir tests tests/reach.rls.test.ts`
Expected: FAIL — relation "campaigns" does not exist (or SKIP if no `.env.local`; to actually drive this task, `.env.local` must be present).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261011090000_reach_foundation.sql`

```sql
-- Jebat data foundation: campaigns, leads, appointments (READ-ONLY this slice)
-- + current_org_id() to resolve the caller's active workspace.
-- Writes arrive in later CRUD slices (add grant + is_org_writer policy TOGETHER).

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('whatsapp','facebook','instagram','tiktok')),
  status text not null default 'active' check (status in ('active','paused')),
  leads_count int not null default 0,
  spend_cents bigint not null default 0,
  cpl_cents bigint,
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
create index campaigns_org_created_idx on public.campaigns (org_id, created_at desc);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('whatsapp','facebook','instagram','tiktok')),
  stage text not null check (stage in ('lead','contacted','qualified','booked','won')),
  source text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
create index leads_org_created_idx on public.leads (org_id, created_at desc);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_name text not null,
  kind text not null,
  scheduled_at timestamptz not null,
  via text,
  created_at timestamptz not null default now()
);
alter table public.appointments enable row level security;
create index appointments_org_sched_idx on public.appointments (org_id, scheduled_at);

-- read policy + MFA belt-and-suspenders + read-only grants, identical per table
do $$
declare t text;
begin
  foreach t in array array['campaigns','leads','appointments'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_org_member(org_id))',
      t || '_select', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
```

- [ ] **Step 4: Apply the migration**

Call `mcp__openkuasa-supabase__apply_migration` with `name: "reach_foundation"` and the full SQL above. Then `mcp__openkuasa-supabase__get_advisors` with `type: "security"` and resolve any new RLS finding before continuing (expected: clean — RLS on, policies present).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run --dir tests tests/reach.rls.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261011090000_reach_foundation.sql tests/reach.rls.test.ts
git commit -m "feat(reach): campaigns/leads/appointments tables with read-only RLS"
```

---

### Task 2: Demo reseed function + seed data

**Files:**
- Create: `supabase/migrations/20261011090100_reach_demo_seed.sql`
- Modify: `tests/reach.rls.test.ts` (add a demo-viewer block)

**Interfaces:**
- Consumes: Task 1 tables; existing demo org (`slug = 'rimba-ventures-demo'`), `join_demo_org()`.
- Produces: `private.reseed_demo_reach() returns void` (definer; demo-only); the demo org populated with 5 campaigns / 342 leads / 3 appointments anchored to `now()`.

- [ ] **Step 1: Write the failing test** — append to `tests/reach.rls.test.ts`

```ts
testWithSupabase('the demo org is seeded and a demo viewer can read it', async () => {
  const d = await anonUser();
  const { data: demoId, error } = await d.c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();

  const campaigns = await d.c.from('campaigns').select('id').eq('org_id', demoId);
  expect(campaigns.data ?? []).toHaveLength(5);
  const leads = await d.c.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', demoId);
  expect(leads.count).toBe(342);
  const appts = await d.c.from('appointments').select('scheduled_at').eq('org_id', demoId);
  expect(appts.data ?? []).toHaveLength(3);
  expect((appts.data ?? []).every((a) => new Date(a.scheduled_at) > new Date())).toBe(true);

  // Isolation: the fresh owner (not a demo member) sees none of the demo rows.
  const ownerSees = await owner.c.from('campaigns').select('id');
  expect(ownerSees.data ?? []).toHaveLength(0);

  await d.c.auth.signOut();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --dir tests tests/reach.rls.test.ts`
Expected: FAIL — demo campaigns length 0 (not seeded yet).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261011090100_reach_demo_seed.sql`

```sql
-- Demo-org reach seed. Idempotent + re-runnable + anchored to now(), so the
-- demo stays fresh (nightly cron added in the next migration). Demo-only.
create or replace function private.reseed_demo_reach()
returns void language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  if demo is null then raise exception 'demo org missing'; end if;

  delete from public.campaigns where org_id = demo;
  delete from public.leads where org_id = demo;
  delete from public.appointments where org_id = demo;

  insert into public.campaigns (org_id, name, channel, status, leads_count, spend_cents, cpl_cents, created_at)
  values
    (demo,'Ramadan–Raya Promo','facebook','active', 96, 96*1250, 1250, now()-interval '40 days'),
    (demo,'Lead Magnet — eBook','whatsapp','active', 61, 61*688,  688,  now()-interval '33 days'),
    (demo,'Retargeting — Cart','instagram','active', 54, 54*1185, 1185, now()-interval '26 days'),
    (demo,'New Product Launch','tiktok','paused',    70, 70*2640, 2640, now()-interval '19 days'),
    (demo,'Brand Awareness','facebook','paused',     18, 18*5000, 5000, now()-interval '12 days');

  -- 342 leads. Each of channel/stage/week honors its exact marginal
  -- (CHANNEL 142/96/68/36, STAGE 78/106/62/48/48, WEEKLY 30/34/36/42/46/50/50/54),
  -- decorrelated via independent hash orderings. created_at spread within each week.
  insert into public.leads (org_id, name, channel, stage, source, created_at)
  select demo,
    (array['Aisyah','Faiz','Nurul','Hafiz','Siti','Danial','Farah','Amir',
           'Liyana','Zikri','Balqis','Hakim','Intan','Rizal','Maya','Syafiq'])[1 + (i % 16)]
    || ' ' ||
    (array['Rahim','Hakim','Huda','Ismail','Osman','Tan','Lim','Kaur',
           'Abdullah','Yusof','Chong','Devi','Karim','Noor','Salleh','Wong'])[1 + ((i*7) % 16)],
    case when rc<=142 then 'whatsapp' when rc<=238 then 'facebook'
         when rc<=306 then 'instagram' else 'tiktok' end,
    case when rs<=78 then 'lead' when rs<=184 then 'contacted'
         when rs<=246 then 'qualified' when rs<=294 then 'booked' else 'won' end,
    (array['WhatsApp click ad','Facebook lead form','Instagram DM',
           'TikTok bio link','Website form','Customer referral'])[1 + (i % 6)],
    now() - make_interval(days => wa*7 + (i % 7))
  from (
    select i,
      row_number() over (order by md5(i::text||'ch')) as rc,
      row_number() over (order by md5(i::text||'st')) as rs,
      row_number() over (order by md5(i::text||'wk')) as rw
    from generate_series(1,342) as g(i)
  ) base
  cross join lateral (select case
      when rw<=30 then 7 when rw<=64 then 6 when rw<=100 then 5 when rw<=142 then 4
      when rw<=188 then 3 when rw<=238 then 2 when rw<=288 then 1 else 0 end as wa) wk;

  insert into public.appointments (org_id, contact_name, kind, scheduled_at, via, created_at)
  values
    (demo,'Aisyah Rahim','Discovery call', now()+interval '5 hours','WhatsApp', now()-interval '2 days'),
    (demo,'Faiz Hakim','Product demo',     now()+interval '26 hours','Zoom',    now()-interval '2 days'),
    (demo,'Nurul Huda','Follow-up',        now()+interval '72 hours','Call',    now()-interval '2 days');
end $$;

revoke execute on function private.reseed_demo_reach() from public, anon, authenticated;

-- Seed once now.
select private.reseed_demo_reach();
```

- [ ] **Step 4: Apply + advisor**

`mcp__openkuasa-supabase__apply_migration` (`name: "reach_demo_seed"`). Then `get_advisors` (`security`) — resolve any finding on the new function (expected clean: definer + `set search_path`).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run --dir tests tests/reach.rls.test.ts`
Expected: PASS (now 4 tests, incl. 5/342/3 and isolation).

- [ ] **Step 6: Verify idempotency, then commit**

Run (manual, via `mcp__openkuasa-supabase__execute_sql`): `select private.reseed_demo_reach(); select count(*) from public.leads l join public.orgs o on o.id=l.org_id where o.slug='rimba-ventures-demo';`
Expected: `342` (unchanged after a second run).

```bash
git add supabase/migrations/20261011090100_reach_demo_seed.sql tests/reach.rls.test.ts
git commit -m "feat(reach): idempotent demo reach seed anchored to now()"
```

---

### Task 3: Nightly `pg_cron` re-seed (verify-in-plan; non-blocking)

**Files:**
- Create: `supabase/migrations/20261011090200_reach_demo_cron.sql`

**Interfaces:**
- Consumes: `private.reseed_demo_reach()` (Task 2).
- Produces: a `pg_cron` job `reseed-demo-reach` (daily 00:00 UTC). If `pg_cron` cannot be enabled by migration, this task's deliverable becomes the documented fallback instead — it does **not** block the slice.

- [ ] **Step 1: Write the migration** — `supabase/migrations/20261011090200_reach_demo_cron.sql`

```sql
-- Keep the demo fresh automatically. Separate migration so a pg_cron enablement
-- failure never blocks the data foundation (tables/seed already landed).
create extension if not exists pg_cron;
select cron.schedule('reseed-demo-reach', '0 0 * * *', $$select private.reseed_demo_reach()$$);
```

- [ ] **Step 2: Apply and verify**

Try `mcp__openkuasa-supabase__apply_migration` (`name: "reach_demo_cron"`). Verify via `mcp__openkuasa-supabase__execute_sql`: `select jobname, schedule from cron.job where jobname='reseed-demo-reach';`
Expected: one row.

- [ ] **Step 3: Fallback if `pg_cron` is not enablable by migration**

If apply fails on `create extension pg_cron` (Supabase may gate it to the dashboard): do NOT retry blindly. Record in the PR description that pg_cron must be enabled once in the Supabase dashboard (Database → Extensions), then re-apply this migration; **or** schedule `reseed_demo_reach()` from a Supabase scheduled Edge Function. Either way the data foundation is already shipped — the demo simply re-seeds on redeploy until the schedule is live. Leave the migration file committed for when the extension is on.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261011090200_reach_demo_cron.sql
git commit -m "feat(reach): nightly pg_cron re-seed of the demo org"
```

---

### Task 4: `createSupabaseReachData` provider

**Files:**
- Create: `src/lib/reach/supabase.ts`
- Create: `tests/reach-provider.rls.test.ts`

**Interfaces:**
- Consumes: `ReachData`, `Campaign`, `Lead`, `Appointment` from `@/lib/reach/types`; `SupabaseClient`.
- Produces: `createSupabaseReachData(client: SupabaseClient, orgId: string): ReachData`. (In slice 1 `listForms`/`listBroadcasts`/`listAutomations` return `[]`.)

- [ ] **Step 1: Write the failing test** — `tests/reach-provider.rls.test.ts`

```ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';
import { createSupabaseReachData } from '@/lib/reach/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let c: SupabaseClient;
let demoId: string;

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await c.auth.signInAnonymously();
  const { data } = await c.rpc('join_demo_org');
  demoId = data as string;
});
afterAll(async () => { await c?.auth.signOut(); });

testWithSupabase('reads the demo org via the ReachData seam', async () => {
  const data = createSupabaseReachData(c, demoId);
  const campaigns = await data.listCampaigns();
  expect(campaigns).toHaveLength(5);
  expect(campaigns[0]).toHaveProperty('spend_cents');
  expect(campaigns[0]).toHaveProperty('cpl_cents');
  expect(await data.listLeads()).toHaveLength(342);
  expect(await data.listAppointments()).toHaveLength(3);
  // Tables that arrive in later slices resolve empty, not error.
  expect(await data.listForms()).toEqual([]);
  expect(await data.listBroadcasts()).toEqual([]);
  expect(await data.listAutomations()).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --dir tests tests/reach-provider.rls.test.ts`
Expected: FAIL — cannot find module `@/lib/reach/supabase`.

- [ ] **Step 3: Write the provider** — `src/lib/reach/supabase.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Appointment,
  Automation,
  Broadcast,
  Campaign,
  Form,
  Lead,
  ReachData,
} from './types';

/**
 * RLS-scoped {@link ReachData} over Supabase. Reads are filtered to `orgId`
 * (the caller's current org); Postgres RLS independently guarantees no other
 * org's rows are reachable, so `orgId` is a workspace selector, not the security
 * boundary. Forms/broadcasts/automations have no tables yet (later slices), so
 * their methods return [] rather than erroring.
 */
export function createSupabaseReachData(client: SupabaseClient, orgId: string): ReachData {
  async function rows<T>(table: string, columns: string, order: { col: string; asc: boolean }): Promise<T[]> {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('org_id', orgId)
      .order(order.col, { ascending: order.asc });
    if (error) throw error;
    return (data ?? []) as T[];
  }

  return {
    listCampaigns: () =>
      rows<Campaign>('campaigns', 'id,name,channel,status,leads_count,spend_cents,cpl_cents,created_at', {
        col: 'created_at', asc: false,
      }),
    listLeads: () =>
      rows<Lead>('leads', 'id,name,channel,stage,source,created_at', { col: 'created_at', asc: false }),
    listAppointments: () =>
      rows<Appointment>('appointments', 'id,contact_name,kind,scheduled_at,via,created_at', {
        col: 'scheduled_at', asc: true,
      }),
    listForms: async (): Promise<Form[]> => [],
    listBroadcasts: async (): Promise<Broadcast[]> => [],
    listAutomations: async (): Promise<Automation[]> => [],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --dir tests tests/reach-provider.rls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reach/supabase.ts tests/reach-provider.rls.test.ts
git commit -m "feat(reach): RLS-scoped Supabase ReachData provider"
```

---

### Task 5: Resolve the current org in `getCurrentOrg`

**Files:**
- Modify: `src/lib/auth/current-org.ts:7-25`
- Modify: `tests/current-org.test.ts`

**Interfaces:**
- Consumes: `profiles.current_org_id` and `org_members` (both readable under existing RLS).
- Produces: `getCurrentOrg(client)` returns the **current** org (honoring `profiles.current_org_id`, falling back to earliest membership), fixing the first-membership blend for the reach provider. Signature unchanged.

> **Context (post-rebase):** `getViewer` (viewer.ts:114-139) **already** resolves the current org this way — the MFA/BYOK work added it. Only `getCurrentOrg` still used first-membership. We mirror getViewer's TS logic here rather than add a SQL RPC, because the house resolves current-org in TS (see `viewer.ts` and `account/team/actions.ts`); no `current_org_id()` RPC is introduced. The ~10-line similarity to getViewer is accepted (extracting a shared helper would mean refactoring freshly-merged, MFA-interleaved getViewer code — more risk than the duplication saves).

- [ ] **Step 1: Replace the test** — `tests/current-org.test.ts`

```ts
import { expect, test, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentOrg, requireOrg } from '@/lib/auth/current-org';

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));

type Row = { user_id: string; org_id: string; role: string };

// Serves profiles (returns current_org_id) and org_members (filtered by the
// eq() calls) from one fake, keyed by table name.
function fakeClient(
  user: { id: string } | null,
  currentOrgId: string | null,
  memberships: Row[],
  opts: { queryError?: Error } = {},
) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      const eqs: Record<string, string> = {};
      const b = {
        select: () => b,
        eq: (c: string, v: string) => { eqs[c] = v; return b; },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          if (table === 'profiles') return { data: { current_org_id: currentOrgId }, error: null };
          if (opts.queryError) return { data: null, error: opts.queryError };
          let rows = memberships.filter((r) => r.user_id === eqs.user_id);
          if (eqs.org_id) rows = rows.filter((r) => r.org_id === eqs.org_id);
          const m = rows[0];
          return { data: m ? { org_id: m.org_id, role: m.role } : null, error: null };
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

test('returns null when not signed in', async () => {
  expect(await getCurrentOrg(fakeClient(null, null, []))).toBeNull();
});

test('returns null when signed in but org-less', async () => {
  expect(await getCurrentOrg(fakeClient({ id: 'u1' }, null, []))).toBeNull();
});

test('falls back to the earliest membership when no current_org_id is set', async () => {
  const rows = [{ user_id: 'u1', org_id: 'o1', role: 'owner' }];
  expect(await getCurrentOrg(fakeClient({ id: 'u1' }, null, rows))).toEqual({ orgId: 'o1', role: 'owner' });
});

test('prefers the chosen current org when the user still belongs to it', async () => {
  const rows = [
    { user_id: 'u1', org_id: 'o1', role: 'owner' },
    { user_id: 'u1', org_id: 'o2', role: 'viewer' }, // e.g. the demo org
  ];
  expect(await getCurrentOrg(fakeClient({ id: 'u1' }, 'o2', rows))).toEqual({ orgId: 'o2', role: 'viewer' });
});

test('ignores a current_org_id the user no longer belongs to', async () => {
  const rows = [{ user_id: 'u1', org_id: 'o1', role: 'owner' }];
  expect(await getCurrentOrg(fakeClient({ id: 'u1' }, 'o9', rows))).toEqual({ orgId: 'o1', role: 'owner' });
});

test('throws on an org_members query error instead of reporting org-less', async () => {
  const boom = new Error('db down');
  await expect(getCurrentOrg(fakeClient({ id: 'u1' }, null, [], { queryError: boom }))).rejects.toBe(boom);
});

test('requireOrg redirects to /onboarding when org-less', async () => {
  await expect(requireOrg(fakeClient({ id: 'u1' }, null, []))).rejects.toThrow('REDIRECT:/onboarding');
});

test('requireOrg returns the org for a member', async () => {
  const rows = [{ user_id: 'u1', org_id: 'o1', role: 'admin' }];
  expect(await requireOrg(fakeClient({ id: 'u1' }, null, rows))).toEqual({ orgId: 'o1', role: 'admin' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --dir tests tests/current-org.test.ts`
Expected: FAIL — `getCurrentOrg` still reads `org_members` ordered by `created_at` (first membership) and ignores `profiles.current_org_id`, so "prefers the chosen current org" returns `o1` not `o2`.

- [ ] **Step 3: Rewrite `getCurrentOrg`** — `src/lib/auth/current-org.ts` (replace lines 7-25)

```ts
export async function getCurrentOrg(client: SupabaseClient): Promise<CurrentOrg | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  // Prefer the workspace the user last chose (profiles.current_org_id) if they
  // still belong to it; otherwise their earliest membership. Mirrors getViewer,
  // so a user who also joined the demo org isn't silently switched to it.
  const { data: profile } = await client
    .from('profiles')
    .select('current_org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let row: { org_id: string; role: string } | null = null;
  if (profile?.current_org_id) {
    const { data } = await client
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('org_id', profile.current_org_id)
      .maybeSingle();
    row = data;
  }
  if (!row) {
    const { data, error } = await client
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }

  return row ? { orgId: row.org_id, role: row.role as OrgRole } : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --dir tests tests/current-org.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/current-org.ts tests/current-org.test.ts
git commit -m "fix(auth): getCurrentOrg honors the chosen current org (not first membership)"
```

---

### Task 6: `getReachData` provider selector

**Files:**
- Modify: `src/lib/reach/supabase.ts` (add `getReachData`)
- Create: `tests/reach-provider.test.ts`

**Interfaces:**
- Consumes: `createSupabaseReachData` (Task 4), `createSeedReachData` (`@/lib/reach/seed`), `hasSupabaseEnv` (`@/lib/auth/viewer`), `getCurrentOrg` (`@/lib/auth/current-org`).
- Produces: `getReachData(client: SupabaseClient): Promise<ReachData>` — Supabase provider when env + org present, else the seed provider.

- [ ] **Step 1: Write the failing test** — `tests/reach-provider.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ hasEnv: true, org: { orgId: 'o1', role: 'member' } as unknown }));
vi.mock('@/lib/auth/viewer', () => ({ hasSupabaseEnv: () => env.hasEnv }));
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrg: async () => env.org }));

import { getReachData } from '@/lib/reach/supabase';
import { createSeedReachData } from '@/lib/reach/seed';

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

  it('falls back to seed when there is no current org', async () => {
    env.org = null;
    const data = await getReachData(fakeClient);
    expect(await data.listCampaigns()).toHaveLength((await createSeedReachData().listCampaigns()).length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --dir tests tests/reach-provider.test.ts`
Expected: FAIL — `getReachData` is not exported.

- [ ] **Step 3: Add `getReachData`** — append to `src/lib/reach/supabase.ts`

```ts
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { createSeedReachData } from './seed';

/**
 * Request-scoped provider selection: RLS-scoped Supabase in prod, the seed
 * fixtures when no project is configured (dev/preview/tests) or the caller has
 * no org. One place, so the route and the Overview stay consistent.
 */
export async function getReachData(client: SupabaseClient): Promise<ReachData> {
  if (!hasSupabaseEnv()) return createSeedReachData();
  const org = await getCurrentOrg(client);
  return org ? createSupabaseReachData(client, org.orgId) : createSeedReachData();
}
```

(Add the three imports at the top of the file alongside the existing imports.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --dir tests tests/reach-provider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reach/supabase.ts tests/reach-provider.test.ts
git commit -m "feat(reach): getReachData selector (supabase in prod, seed in dev)"
```

---

### Task 7: Swap the Jebat chat route onto `getReachData`

**Files:**
- Modify: `src/lib/ai/chat-request.ts` (add `supabase` to the prepared result)
- Modify: `src/app/api/reach/chat/route.ts:13,24-29`
- Modify: `tests/reach-chat-route.test.ts`

**Interfaces:**
- Consumes: `getReachData` (Task 6); `prepareChat()` (existing — returns `{ ok, messages, apiKey, freeRemaining }`).
- Produces: `prepareChat`'s `ok` result gains `supabase: SupabaseClient` (additive; the Tuah route at `/api/chat` ignores it). The Jebat route feeds `runJebat` a request-scoped provider via `getReachData(chat.supabase)`.

> **Context (post-rebase):** the route was refactored — gating now lives in `prepareChat` (chat-request.ts), which creates the Supabase client internally, and `runJebat(messages, data, signal?, apiKey?)` gained a 4th `apiKey` arg. Only the **Jebat** route swaps its provider; the Tuah route keeps its own.

- [ ] **Step 1: Add the hermetic provider mock to the test** — `tests/reach-chat-route.test.ts`

Add this alongside the other top-level `vi.mock(...)` calls (above the `const { POST } = await import(...)` line). It forces the seed provider so the route test never needs a DB, independent of env:

```ts
vi.mock('@/lib/reach/supabase', () => ({
  getReachData: async () => {
    const { createSeedReachData } = await import('@/lib/reach/seed');
    return createSeedReachData();
  },
}));
```

All existing gating + happy-path assertions stay unchanged (the mocked model still returns the "Lead Magnet" text).

- [ ] **Step 2: Run to confirm the current suite still passes (baseline)**

Run: `pnpm vitest run --dir tests tests/reach-chat-route.test.ts`
Expected: PASS — the mock is inert until the route imports `getReachData` (next steps). This records the green baseline before the edit.

- [ ] **Step 3: Return the client from `prepareChat`** — `src/lib/ai/chat-request.ts`

Add the import (with the other imports):
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
```
Add `supabase` to the `ok: true` variant of `PreparedChat`:
```ts
      ok: true;
      supabase: SupabaseClient;
      messages: ModelMessage[];
```
And include it in the success return (the `supabase` const already exists in `prepareChat`):
```ts
  return {
    ok: true,
    supabase,
    messages,
    apiKey: access.kind === 'byok' ? access.apiKey : undefined,
    freeRemaining: access.kind === 'free' ? access.remaining : null,
  };
```

- [ ] **Step 4: Edit the route** — `src/app/api/reach/chat/route.ts`

Replace the seed import (line 13):
```ts
import { getReachData } from '@/lib/reach/supabase';
```
Replace the `runJebat` call (lines 24-29) so the data comes from the request-scoped provider:
```ts
  const result = runJebat(
    chat.messages,
    await getReachData(chat.supabase),
    request.signal,
    chat.apiKey,
  );
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run --dir tests tests/reach-chat-route.test.ts`
Expected: PASS — the route now calls the mocked `getReachData` (seed), streams 200, "Lead Magnet" present; gating unchanged; Tuah route test still green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/chat-request.ts src/app/api/reach/chat/route.ts tests/reach-chat-route.test.ts
git commit -m "feat(reach): Jebat chat route reads live data via getReachData"
```

---

### Task 8: Live Overview — `buildOverviewModel` + render

**Files:**
- Create: `src/lib/reach/overview.ts`
- Create: `tests/reach-overview.test.ts`
- Modify: `src/screens/reach/assistant.tsx`

**Interfaces:**
- Consumes: `ReachData` + the pure helpers (`deriveLeadSummary`, `deriveSpendByChannel`, `deriveAdsOverview`, `summarizeCampaigns`, `filterUpcomingAppointments`, `rm`) from `@/lib/ai/tools`; `getReachData` (Task 6).
- Produces: `buildOverviewModel(data: ReachData, now: Date): Promise<OverviewModel>` (typed below). The server component renders it.

- [ ] **Step 1: Write the failing test** — `tests/reach-overview.test.ts`

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --dir tests tests/reach-overview.test.ts`
Expected: FAIL — cannot find `@/lib/reach/overview`.

- [ ] **Step 3: Write `buildOverviewModel`** — `src/lib/reach/overview.ts`

```ts
import {
  deriveAdsOverview,
  deriveLeadSummary,
  deriveSpendByChannel,
  filterUpcomingAppointments,
  rm,
  summarizeCampaigns,
} from '@/lib/ai/tools';
import type { Channel, LeadStage, ReachData } from './types';

export type OverviewModel = {
  isEmpty: boolean;
  kpis: {
    leads: { value: number; spark: number[] };
    spendRm: string;        // headline only (no weekly series / delta — no source)
    cplRm: string;
    conversionPct: number;
  };
  leadsTrend: { label: string; leads: number; qualified: number }[];
  channelMix: { key: Channel; label: string; value: number }[];
  spendByChannel: { label: string; spend: number }[];
  funnel: { key: LeadStage; label: string; value: number }[];
  topCampaigns: { name: string; leads: number; cpl: string; status: 'Active' | 'Paused' }[];
  appointments: { name: string; kind: string; when: string; via: string }[];
};

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok',
};
const STAGE_LABEL: Record<LeadStage, string> = {
  lead: 'Leads', contacted: 'Contacted', qualified: 'Qualified', booked: 'Booked', won: 'Won',
};

/** "Today · 2:30pm" / "Tomorrow · 10:00am" / "Thu · 4:00pm" relative to now. */
export function formatWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.floor((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : d.toLocaleDateString('en-MY', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  return `${day} · ${time}`;
}

export async function buildOverviewModel(data: ReachData, now: Date): Promise<OverviewModel> {
  const [campaigns, leads, appts] = await Promise.all([
    data.listCampaigns(), data.listLeads(), data.listAppointments(),
  ]);
  const summary = deriveLeadSummary(leads, now);
  const ads = deriveAdsOverview(campaigns);
  const spend = deriveSpendByChannel(campaigns);
  const top = summarizeCampaigns(campaigns);

  return {
    isEmpty: campaigns.length === 0 && leads.length === 0 && appts.length === 0,
    kpis: {
      leads: { value: summary.total_leads, spark: summary.weekly_trend.map((w) => w.leads) },
      spendRm: ads.total_spend,
      cplRm: ads.blended_cpl,
      conversionPct: summary.conversion_pct,
    },
    leadsTrend: summary.weekly_trend.map((w) => ({
      label: `Wk${8 - w.weeks_ago}`, leads: w.leads, qualified: w.qualified,
    })),
    channelMix: (Object.entries(summary.by_channel) as [Channel, number][])
      .map(([key, value]) => ({ key, label: CHANNEL_LABEL[key], value })),
    spendByChannel: spend.by_channel.map((c) => ({ label: CHANNEL_LABEL[c.channel], spend: Math.round(c.spend_cents / 100) })),
    funnel: (Object.keys(summary.funnel) as LeadStage[]).map((key) => ({ key, label: STAGE_LABEL[key], value: summary.funnel[key] })),
    topCampaigns: top.map((c) => ({ name: c.name, leads: c.leads, cpl: c.cpl, status: c.status === 'active' ? 'Active' : 'Paused' })),
    appointments: filterUpcomingAppointments(appts, now).map((a) => ({
      name: a.contact_name, kind: a.kind, when: formatWhen(a.scheduled_at, now), via: a.via,
    })),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --dir tests tests/reach-overview.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the Overview** — `src/screens/reach/assistant.tsx`

Replace the mock `const` arrays and the render so the sourced widgets read the model. Keep `AskJebatHero`, the three display-only widgets, and the grid/layout. Concretely:

1. Delete the data consts `LEADS_TREND`, `CHANNEL_MIX`, `SPEND_BY_CHANNEL`, `FUNNEL`, `CAMPAIGNS`, `APPOINTMENTS` (keep `LEADS_SERIES`, `SPEND_SERIES`, `PROMPTS`, `HEAT_DAYS/SLOTS/VALUES`, `AGENTS`).
2. At the top of `OverviewScreen`:

```tsx
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isDemo = !isLiveChatAllowed(user);
  // `model` is built in a try/catch — see point 7.
```

3. Feed the model into the existing chart components (`model.leadsTrend`, `model.channelMix` mapped to the `Slice[]` colour palette, `model.spendByChannel`, `model.funnel`, `model.topCampaigns`, `model.appointments`), replacing the KPI literal values with `model.kpis.*`.
4. **KPI honesty:** render only the **leads** KPI with its sparkline (`model.kpis.leads.spark`). For Ad spend / Cost-per-lead / Conversion, render the headline value with **no `chart` and no `delta`** (those had no source).
5. **Display-only widgets** (ad-engine-health gauge, best-time heatmap, AI-agents): keep the sample render **only when `isDemo`**; for a real org, render a muted "Not available yet" placeholder in the same card.
6. **Empty state:** when `model.isEmpty`, render each sourced card's empty variant (e.g. "No campaigns yet", "No leads yet", "No upcoming appointments") instead of an empty chart.
7. **Graceful DB-error degradation (spec §9):** wrap the data fetch so a query failure doesn't crash the screen —

```tsx
  let model: OverviewModel | null = null;
  try {
    model = await buildOverviewModel(await getReachData(supabase), new Date());
  } catch (e) {
    console.error('[reach/overview] data error:', e);
  }
```

When `model` is `null`, render a single muted "Couldn't load your dashboard — please refresh" card in place of the sourced widgets (the hero + display-only widgets still render). Import the `OverviewModel` type for the annotation.

Add imports: `import { getReachData } from '@/lib/reach/supabase';` and `import { buildOverviewModel, type OverviewModel } from '@/lib/reach/overview';`.

- [ ] **Step 6: Typecheck, full suite, and build**

Run: `pnpm vitest run --dir tests && pnpm lint && pnpm build`
Expected: all green (the `build` catches server-component/type errors the unit tests don't).

- [ ] **Step 7: Manual smoke (pre-merge gate)**

With `.env.local` set: `pnpm dev`, then:
- Sign up a new account → `/reach/assistant` shows **empty states** (fresh org, no data), no broken charts.
- "Explore the demo" (or sign in to a demo session) → Overview shows live Rimba numbers; ask Jebat "which campaign has the best cost per lead?" → grounded streamed answer naming **Lead Magnet — eBook**.
- Confirm the Overview's spend/leads/CPL/conversion agree with what Jebat reports.

- [ ] **Step 8: Commit**

```bash
git add src/lib/reach/overview.ts tests/reach-overview.test.ts src/screens/reach/assistant.tsx
git commit -m "feat(reach): live Overview from Postgres via buildOverviewModel"
```

---

## Ship

- [ ] `git push -u origin feat-NNN-jebat-data-foundation`
- [ ] `gh pr create --title "feat-NNN-jebat-data-foundation" --body "<summary + test plan>"` (no `Closes #` — confirm with `gh issue list` there's no tracking issue; omit the keyword if none).
- [ ] After CI + the manual smoke gate: `gh pr merge --squash`; verify with `gh pr view <n> --json state,mergeCommit`.
- [ ] `git checkout main && git pull`. Smoke prod on openkuasa.com (Railway): Overview live + Jebat grounded answer.

## Self-review notes (checked against the spec)
- **Spec coverage:** §4.2 tables → Task 1; §4.4 current-org resolution → Task 5 (in TS, mirroring `getViewer` — no RPC; see Task 5 note); §6 demo seed/freshness → Tasks 2,3; §5.1 provider → Task 4; §5.2 selector → Task 6; §5.3 Overview (live/honesty/empty) → Task 8; §10 tests → Tasks 1,2,4,6,8; route swap (§5) → Task 7. The two-layer GRANT+RLS model (§4.1) is realized by Task 1's grants and asserted by Task 1's write-denied test.
- **Out of scope confirmed absent:** no write grants/policies, no new entities, no other screens — matches §2.
- **Known pre-existing bug (not touched):** `/reach/reports` 404s (registered, not in nav) — spec §12, left for slice 4.
