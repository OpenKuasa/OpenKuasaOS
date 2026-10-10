# Lekir Public Job Board (slice 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace can switch on a public, read-only job board at `/careers/<workspace-id>`, with a page per open job, and manage it from the Careers Page screen and through Lekir.

**Architecture:** One new table (`hire_settings`, one row per workspace) and two `security definer` functions are the only things a signed-out visitor can reach; `anon` gets no table grant. Public pages read through a session-less client. The board switch, headline and tagline are written through one capability (`updateCareersPage`) shared by a server action and an AI change tool behind approval.

**Tech Stack:** Next.js App Router (this repo's version has breaking changes: read `node_modules/next/dist/docs/` before writing a route, page or server action), Supabase Postgres with RLS, Zod 4, AI SDK v7, radix-ui, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-lekir-public-job-board-design.md`

## Global Constraints

- pnpm only. TypeScript, 2-space indent, single quotes, semicolons, named exports, `const` by default.
- No reference-product names in `src/`. No purple or violet anywhere (never `var(--chart-5)`).
- `anon` gets execute on exactly two functions and no table privilege. The functions take ids only and build no dynamic SQL.
- A visitor never receives: `headcount`, `status`, `created_at`, `closed_at`, applicant counts, a hidden salary, or any other workspace's rows.
- The board is off by default. The demo workspace (`slug = 'rimba-ventures-demo'`) never has a public board.
- `org_id` comes only from the session's context, never from a form or the model.
- Capability schemas contain no `.transform()` and no `z.preprocess()` (they become JSON Schema for the tools).
- Descriptions, headlines and taglines are rendered as text: no HTML, no Markdown.
- Any failure on a public page is "not found". No error detail reaches a visitor.
- This shell has live database credentials. Never run a `*.rls.test.ts` file on its own. Do not apply migrations, push, or run anything under `evals/`: those are the controller's (Task 9).
- New migration tables: the project adds a restrictive `mfa_required` policy by itself, so the migration drops it if present and creates it, as `20261013090000_hire_foundation.sql` does.

## Review Focus

1. An open job with a blank description (possible through the API directly): a visitor expects not to see a half-empty job page. The public functions leave such a job out. Test in Task 1 (text) and Task 8 (live).
2. A job id from workspace A requested under workspace B's address: expected "not found". Task 8.
3. A board that is on but has no open jobs: expected the workspace's name and "No open roles right now", not "not found". Tasks 2 and 6.
4. A malformed id in the address (`/careers/abc`): expected "not found" with no database call. Task 2.
5. Switching the board on for the demo workspace through the assistant: expected a refusal. Task 3.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261016090000_hire_settings.sql` | Table, policies, grants, two public functions |
| `src/lib/supabase/anonymous.ts` | `createAnonymousClient` (moved from reach; reach re-exports) |
| `src/lib/hire/public-careers.ts` | Server-only readers for the two functions, plus formatting helpers for the public pages |
| `src/lib/hire/types.ts`, `seed.ts`, `supabase.ts` | `HireSettings`, `HireData.getSettings()` |
| `src/lib/hire/capabilities.ts` | `updateCareersPage` |
| `src/app/(app)/hire/actions.ts` | `updateCareersPageAction` |
| `src/lib/ai/hire-tools.ts`, `src/lib/ai/products.ts` | `getCareersPage`, `updateCareersPage` tools |
| `src/lib/chat/change-titles.ts`, `src/components/chat/tool-parts.ts` | Approval card text, tool label |
| `src/lib/ai/agents/prompts.ts` | What the assistants may say and do |
| `src/app/careers/[orgId]/{page,not-found}.tsx`, `src/app/careers/[orgId]/[jobId]/page.tsx` | Public pages |
| `src/components/hire/public-careers-shell.tsx` | The frame around the public pages |
| `src/screens/hire/careers-controls.tsx`, `src/screens/hire/careers-page.tsx`, `src/lib/hire/lists.ts` | The Careers Page screen |

---

### Task 1: Migration `hire_settings` and the two public functions

**Files:**
- Create: `supabase/migrations/20261016090000_hire_settings.sql`
- Test: `tests/hire-settings-migration.test.ts`

**Interfaces:**
- Produces: table `public.hire_settings (org_id, careers_enabled, careers_headline, careers_tagline, updated_at)`; `public.get_public_careers(p_org_id uuid)` returning `org_name, headline, tagline, job_id, title, department, location, work_arrangement, employment_type, closes_on, accepting`; `public.get_public_job(p_org_id uuid, p_job_id uuid)` returning the same plus `description, salary_min_cents, salary_max_cents`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/hire-settings-migration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations', '20261016090000_hire_settings.sql'), 'utf8');
/** The text of one function, from its `create` to the end of its body. */
const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
};
const returnsOf = (body: string) => body.slice(body.indexOf('returns table'), body.indexOf('language sql'));

describe('hire settings migration', () => {
  test('creates the table with the board off by default and the length checks', () => {
    expect(sql).toContain('create table public.hire_settings');
    expect(sql).toContain('org_id uuid primary key references public.orgs(id) on delete cascade');
    expect(sql).toContain('careers_enabled boolean not null default false');
    expect(sql).toContain('check (char_length(careers_headline) <= 80)');
    expect(sql).toContain('check (char_length(careers_tagline) <= 160)');
    expect(sql).toContain('alter table public.hire_settings enable row level security');
  });

  test('members read, writers write, and nobody deletes or rewrites org_id', () => {
    expect(sql).toContain('create policy hire_settings_select on public.hire_settings for select to authenticated');
    expect(sql).toContain('create policy hire_settings_write on public.hire_settings for all to authenticated');
    expect(sql).toContain('drop policy if exists mfa_required on public.hire_settings');
    expect(sql).toContain('revoke all on public.hire_settings from anon, authenticated');
    expect(sql).toContain('grant select, insert on public.hire_settings to authenticated');
    const update = sql.match(/grant update \(([^)]*)\) on public\.hire_settings to authenticated;/);
    expect(update?.[1].split(',').map((c) => c.trim()).sort()).toEqual(
      ['careers_enabled', 'careers_headline', 'careers_tagline', 'updated_at'],
    );
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*hire_settings/);
    expect(sql).not.toMatch(/grant[^;]*hire_settings to anon/);
  });

  test.each(['get_public_careers', 'get_public_job'])('%s is a locked-down definer function', (name) => {
    const body = fn(name);
    expect(body).toContain('language sql security definer stable set search_path = \'\'');
    // What a visitor is handed never includes these.
    for (const hidden of ['headcount', 'status', 'created_at', 'closed_at', 'show_salary']) {
      expect(returnsOf(body), `${name} returns ${hidden}`).not.toContain(hidden);
    }
    expect(body).toContain('s.careers_enabled');
    expect(body).toContain("o.slug is distinct from 'rimba-ventures-demo'");
    expect(body).toContain("j.status = 'open'");
    // An open job with a blank description is not shown.
    expect(body).toContain("nullif(btrim(j.description), '') is not null");
    expect(body).not.toMatch(/execute\s/i);
  });

  test('the job function only gives a salary that may be shown, and ties the job to the workspace', () => {
    const body = fn('get_public_job');
    expect(body).toContain('case when j.show_salary then j.salary_min_cents end');
    expect(body).toContain('case when j.show_salary then j.salary_max_cents end');
    expect(body).toContain('j.org_id = o.id');
    expect(body).toContain('j.id = p_job_id');
  });

  test('anon and authenticated may execute the two functions and nothing else is granted to anon', () => {
    expect(sql).toContain('revoke execute on function public.get_public_careers(uuid) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.get_public_careers(uuid) to anon, authenticated');
    expect(sql).toContain('revoke execute on function public.get_public_job(uuid, uuid) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.get_public_job(uuid, uuid) to anon, authenticated');
    expect(sql.match(/to anon/g)?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run tests/hire-settings-migration.test.ts`
Expected: FAIL, the migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261016090000_hire_settings.sql
-- Lekir slice 2b: a workspace's public job board. One settings row per
-- workspace, and two functions that are the only thing a signed-out visitor
-- can reach. A workspace with no row has the defaults: board off.

create table public.hire_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  careers_enabled boolean not null default false,
  careers_headline text check (char_length(careers_headline) <= 80),
  careers_tagline text check (char_length(careers_tagline) <= 160),
  updated_at timestamptz not null default now()
);
alter table public.hire_settings enable row level security;

create policy hire_settings_select on public.hire_settings for select to authenticated
  using (private.is_org_member(org_id));
create policy hire_settings_write on public.hire_settings for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
-- The project adds mfa_required to new public tables by itself; replace it so
-- this file gives the same result with or without that trigger.
drop policy if exists mfa_required on public.hire_settings;
create policy mfa_required on public.hire_settings as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

revoke all on public.hire_settings from anon, authenticated;
grant select, insert on public.hire_settings to authenticated;
grant update (careers_enabled, careers_headline, careers_tagline, updated_at)
  on public.hire_settings to authenticated;

-- ---------------------------------------------------------------------------
-- The public board: one row per open job of a workspace whose board is on.
-- A board that is on with no open jobs gives one row with a null job_id, so
-- the page can show the workspace's name instead of "not found". Nothing for
-- a board that is off, the demo workspace, or an unknown id.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_careers(p_org_id uuid)
returns table (
  org_name text, headline text, tagline text,
  job_id uuid, title text, department text, location text,
  work_arrangement text, employment_type text, closes_on date, accepting boolean
)
language sql security definer stable set search_path = '' as $$
  select
    o.name, s.careers_headline, s.careers_tagline,
    j.id, j.title, j.department, j.location,
    j.work_arrangement, j.employment_type, j.closes_on,
    case when j.id is null then null
         else j.closes_on is null or j.closes_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date end
  from public.orgs o
  join public.hire_settings s on s.org_id = o.id and s.careers_enabled
  left join public.hire_jobs j
    on j.org_id = o.id and j.status = 'open' and nullif(btrim(j.description), '') is not null
  where o.id = p_org_id
    and o.slug is distinct from 'rimba-ventures-demo'
  order by j.opened_at desc nulls last, j.title;
$$;

-- ---------------------------------------------------------------------------
-- One open job of a workspace whose board is on. The salary is given only
-- when the workspace chose to show it.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_job(p_org_id uuid, p_job_id uuid)
returns table (
  org_name text, headline text, tagline text,
  job_id uuid, title text, department text, location text,
  work_arrangement text, employment_type text, closes_on date, accepting boolean,
  description text, salary_min_cents bigint, salary_max_cents bigint
)
language sql security definer stable set search_path = '' as $$
  select
    o.name, s.careers_headline, s.careers_tagline,
    j.id, j.title, j.department, j.location,
    j.work_arrangement, j.employment_type, j.closes_on,
    j.closes_on is null or j.closes_on >= (now() at time zone 'Asia/Kuala_Lumpur')::date,
    j.description,
    case when j.show_salary then j.salary_min_cents end,
    case when j.show_salary then j.salary_max_cents end
  from public.orgs o
  join public.hire_settings s on s.org_id = o.id and s.careers_enabled
  join public.hire_jobs j
    on j.org_id = o.id and j.status = 'open' and nullif(btrim(j.description), '') is not null
  where o.id = p_org_id
    and j.id = p_job_id
    and o.slug is distinct from 'rimba-ventures-demo';
$$;

revoke execute on function public.get_public_careers(uuid) from public, anon, authenticated;
revoke execute on function public.get_public_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_public_careers(uuid) to anon, authenticated;
grant execute on function public.get_public_job(uuid, uuid) to anon, authenticated;
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm vitest run tests/hire-settings-migration.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261016090000_hire_settings.sql tests/hire-settings-migration.test.ts
git commit -m "feat(hire): hire_settings table and the two public job board functions"
```

---

### Task 2: Settings in the data seam, the anonymous client, and the public readers

**Files:**
- Create: `src/lib/supabase/anonymous.ts`, `src/lib/hire/public-careers.ts`
- Modify: `src/lib/reach/public-forms.ts` (re-export), `src/lib/hire/types.ts`, `src/lib/hire/seed.ts`, `src/lib/hire/supabase.ts`
- Test: `tests/hire-public-careers.test.ts`, `tests/hire-provider.test.ts`, `tests/hire-seed.test.ts`

**Interfaces:**
- Produces:
  - `createAnonymousClient(): SupabaseClient` from `@/lib/supabase/anonymous` (still exported from `@/lib/reach/public-forms`).
  - `type HireSettings = { org_id: string | null; careers_enabled: boolean; careers_headline: string | null; careers_tagline: string | null }`, `DEFAULT_HIRE_SETTINGS`, `SETTINGS_COLUMNS` in `types.ts`.
  - `HireData.getSettings(): Promise<HireSettings>`.
  - From `public-careers.ts`: `type PublicJobSummary`, `type PublicCareers = { orgName; headline; tagline; jobs: PublicJobSummary[] }`, `type PublicJob = PublicJobSummary & { orgName; headline; tagline; description; salaryMinCents; salaryMaxCents }`, `getPublicCareers(client, orgId)`, `getPublicJob(client, orgId, jobId)`, `careersPath(orgId)`, `careersJobPath(orgId, jobId)`, `careersUrl(origin, orgId)`, `DEFAULT_HEADLINE = 'Join our team'`, `formatSalary(min, max)`, `formatLongDate(iso)`, `ARRANGEMENT_LABEL`, `EMPLOYMENT_LABEL`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/hire-public-careers.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  careersJobPath, careersPath, careersUrl, formatLongDate, formatSalary, getPublicCareers, getPublicJob,
} from '@/lib/hire/public-careers';

const ORG = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const client = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, asClient: { rpc } as never };
};
const row = {
  org_name: 'Kedai Kopi', headline: null, tagline: 'Good coffee', job_id: JOB, title: 'Barista',
  department: 'Operations', location: 'Ipoh', work_arrangement: 'onsite', employment_type: 'full_time',
  closes_on: '2026-10-31', accepting: true,
};

describe('getPublicCareers', () => {
  it('maps the rows to a board', async () => {
    const c = client([row]);
    expect(await getPublicCareers(c.asClient, ORG)).toEqual({
      orgName: 'Kedai Kopi', headline: null, tagline: 'Good coffee',
      jobs: [{
        id: JOB, title: 'Barista', department: 'Operations', location: 'Ipoh',
        workArrangement: 'onsite', employmentType: 'full_time', closesOn: '2026-10-31', accepting: true,
      }],
    });
    expect(c.rpc).toHaveBeenCalledWith('get_public_careers', { p_org_id: ORG });
  });
  it('reads a board that is on with no open jobs as an empty board, not as missing', async () => {
    const c = client([{ ...row, job_id: null, title: null, accepting: null }]);
    expect(await getPublicCareers(c.asClient, ORG)).toMatchObject({ orgName: 'Kedai Kopi', jobs: [] });
  });
  it('is null when nothing comes back, and when the call fails', async () => {
    expect(await getPublicCareers(client([]).asClient, ORG)).toBeNull();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getPublicCareers(client(null, { message: 'boom' }).asClient, ORG)).toBeNull();
    spy.mockRestore();
  });
  it('makes no call for an id that is not a UUID', async () => {
    const c = client([row]);
    expect(await getPublicCareers(c.asClient, 'abc')).toBeNull();
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe('getPublicJob', () => {
  const jobRow = { ...row, description: 'Make coffee.\nSmile.', salary_min_cents: 300000, salary_max_cents: null };
  it('maps one job', async () => {
    const c = client([jobRow]);
    expect(await getPublicJob(c.asClient, ORG, JOB)).toMatchObject({
      id: JOB, orgName: 'Kedai Kopi', description: 'Make coffee.\nSmile.', salaryMinCents: 300000, salaryMaxCents: null,
    });
    expect(c.rpc).toHaveBeenCalledWith('get_public_job', { p_org_id: ORG, p_job_id: JOB });
  });
  it('is null for no row, a failed call, or a bad id (without calling)', async () => {
    expect(await getPublicJob(client([]).asClient, ORG, JOB)).toBeNull();
    const c = client([jobRow]);
    expect(await getPublicJob(c.asClient, ORG, 'not-a-uuid')).toBeNull();
    expect(await getPublicJob(c.asClient, 'x', JOB)).toBeNull();
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe('addresses and formatting', () => {
  it('builds the board and job addresses', () => {
    expect(careersPath(ORG)).toBe(`/careers/${ORG}`);
    expect(careersJobPath(ORG, JOB)).toBe(`/careers/${ORG}/${JOB}`);
    expect(careersUrl('https://openkuasa.com/', ORG)).toBe(`https://openkuasa.com/careers/${ORG}`);
  });
  it('writes a salary range for Malaysia', () => {
    expect(formatSalary(400000, 600000)).toBe('RM 4,000 – RM 6,000 a month');
    expect(formatSalary(400000, null)).toBe('From RM 4,000 a month');
    expect(formatSalary(null, 600050)).toBe('Up to RM 6,000.50 a month');
    expect(formatSalary(null, null)).toBeNull();
  });
  it('writes a date in full without depending on the machine locale', () => {
    expect(formatLongDate('2026-10-31')).toBe('31 October 2026');
    expect(formatLongDate('2026-09-01')).toBe('1 September 2026');
    expect(formatLongDate('nonsense')).toBeNull();
  });
});
```

Add to `tests/hire-seed.test.ts`:

```ts
it('has the careers page off, with no workspace id', async () => {
  expect(await createSeedHireData(new Date()).getSettings()).toEqual({
    org_id: null, careers_enabled: false, careers_headline: null, careers_tagline: null,
  });
});
```

Add to `tests/hire-provider.test.ts` (follow the file's existing fake-client style; read it first):

```ts
it('reads settings for the workspace, and gives the defaults when there is no row', async () => {
  // with a row: getSettings() returns { org_id: <the provider's org id>, careers_enabled: true, careers_headline: 'Hi', careers_tagline: null }
  // with no row (maybeSingle gives data: null): { org_id: <org id>, careers_enabled: false, careers_headline: null, careers_tagline: null }
  // a read error throws, as the other readers do
});
```
Write those three assertions with the file's fake client: the query is `from('hire_settings').select(SETTINGS_COLUMNS).eq('org_id', orgId).maybeSingle()`.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run tests/hire-public-careers.test.ts tests/hire-seed.test.ts tests/hire-provider.test.ts`
Expected: FAIL (module not found; `getSettings` is not a function).

- [ ] **Step 3: Implement**

`src/lib/supabase/anonymous.ts`: move `createAnonymousClient` here verbatim with its doc comment (change "public form" to "public page"). In `src/lib/reach/public-forms.ts` delete the function and the now-unused `createClient` import, and add `export { createAnonymousClient } from '@/lib/supabase/anonymous';`.

`src/lib/hire/types.ts`, append:

```ts
/** A workspace's hiring settings. `org_id` is null only for the sample data. */
export type HireSettings = {
  org_id: string | null;
  /** Whether the public job board is on. */
  careers_enabled: boolean;
  careers_headline: string | null;
  careers_tagline: string | null;
};
export const SETTINGS_COLUMNS = 'careers_enabled,careers_headline,careers_tagline';
/** What a workspace with no settings row has. */
export const DEFAULT_HIRE_SETTINGS: Omit<HireSettings, 'org_id'> = {
  careers_enabled: false, careers_headline: null, careers_tagline: null,
};
```
and add `getSettings(): Promise<HireSettings>;` to `HireData`.

`src/lib/hire/seed.ts`: add to the returned object `getSettings: async () => ({ org_id: null, ...DEFAULT_HIRE_SETTINGS }),`.

`src/lib/hire/supabase.ts`: add to `createSupabaseHireData`'s returned object

```ts
    getSettings: async () => {
      const { data, error } = await client
        .from('hire_settings').select(SETTINGS_COLUMNS).eq('org_id', orgId).maybeSingle();
      if (error) throw error;
      return { org_id: orgId, ...DEFAULT_HIRE_SETTINGS, ...((data ?? {}) as Partial<HireSettings>) };
    },
```
and to `EMPTY_HIRE_DATA`: `getSettings: async () => ({ org_id: null, ...DEFAULT_HIRE_SETTINGS }),`.

`src/lib/hire/public-careers.ts`:

```ts
/**
 * What the public job board shows a visitor who is not signed in. A visitor
 * has no access to any table: each read goes through one of the two database
 * functions made for the purpose, which decide what a stranger may see.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { EmploymentType, WorkArrangement } from './types';

export const DEFAULT_HEADLINE = 'Join our team';

export type PublicJobSummary = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  workArrangement: WorkArrangement | null;
  employmentType: EmploymentType;
  /** Last day to apply, as YYYY-MM-DD. */
  closesOn: string | null;
  /** False once the closing date has passed. */
  accepting: boolean;
};
export type PublicCareers = { orgName: string; headline: string | null; tagline: string | null; jobs: PublicJobSummary[] };
export type PublicJob = PublicJobSummary & {
  orgName: string; headline: string | null; tagline: string | null;
  description: string;
  /** Monthly, in sen. Null when the workspace does not show the salary. */
  salaryMinCents: number | null;
  salaryMaxCents: number | null;
};

type Row = {
  org_name: string | null; headline: string | null; tagline: string | null;
  job_id: string | null; title: string | null; department: string | null; location: string | null;
  work_arrangement: WorkArrangement | null; employment_type: EmploymentType | null;
  closes_on: string | null; accepting: boolean | null;
  description?: string | null; salary_min_cents?: number | null; salary_max_cents?: number | null;
};

const isUuid = (value: string) => z.uuid().safeParse(value).success;

function summary(row: Row): PublicJobSummary | null {
  if (!row.job_id || !row.title) return null;
  return {
    id: row.job_id, title: row.title, department: row.department, location: row.location,
    workArrangement: row.work_arrangement, employmentType: row.employment_type ?? 'full_time',
    closesOn: row.closes_on, accepting: row.accepting !== false,
  };
}

/** The board of a workspace, or null when it has none to show. A failed read is also null (and logged). */
export async function getPublicCareers(client: SupabaseClient, orgId: string): Promise<PublicCareers | null> {
  if (!isUuid(orgId)) return null;
  const { data, error } = await client.rpc('get_public_careers', { p_org_id: orgId });
  if (error) {
    console.error('[public-careers] get_public_careers failed:', error);
    return null;
  }
  const rows = (Array.isArray(data) ? data : []) as Row[];
  const first = rows[0];
  if (!first?.org_name) return null;
  return {
    orgName: first.org_name, headline: first.headline, tagline: first.tagline,
    jobs: rows.map(summary).filter((job): job is PublicJobSummary => job !== null),
  };
}

/** One open job on a workspace's board, or null. */
export async function getPublicJob(client: SupabaseClient, orgId: string, jobId: string): Promise<PublicJob | null> {
  if (!isUuid(orgId) || !isUuid(jobId)) return null;
  const { data, error } = await client.rpc('get_public_job', { p_org_id: orgId, p_job_id: jobId });
  if (error) {
    console.error('[public-careers] get_public_job failed:', error);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
  const base = row ? summary(row) : null;
  if (!row?.org_name || !base) return null;
  return {
    ...base, orgName: row.org_name, headline: row.headline, tagline: row.tagline,
    description: row.description ?? '',
    salaryMinCents: row.salary_min_cents ?? null, salaryMaxCents: row.salary_max_cents ?? null,
  };
}

/* ---- addresses ------------------------------------------------------- */

export const careersPath = (orgId: string) => `/careers/${orgId}`;
export const careersJobPath = (orgId: string, jobId: string) => `${careersPath(orgId)}/${jobId}`;
/** The full link to share, for a site served from `origin`. */
export const careersUrl = (origin: string, orgId: string) => `${origin.replace(/\/+$/, '')}${careersPath(orgId)}`;

/* ---- words ----------------------------------------------------------- */

export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** "31 October 2026" from "2026-10-31". A fixed month list: no locale, no time zone. */
export function formatLongDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

function ringgit(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sen = cents % 100;
  return `RM ${whole}${sen ? `.${String(sen).padStart(2, '0')}` : ''}`;
}

/** "RM 4,000 – RM 6,000 a month", or null when there is nothing to show. */
export function formatSalary(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${ringgit(min)} – ${ringgit(max)} a month`;
  if (min !== null) return `From ${ringgit(min)} a month`;
  if (max !== null) return `Up to ${ringgit(max)} a month`;
  return null;
}
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm vitest run tests/hire-public-careers.test.ts tests/hire-seed.test.ts tests/hire-provider.test.ts tests/reach-public-forms.test.ts` (the last one if it exists: the re-export must keep reach's tests green), then `pnpm exec tsc --noEmit`.
Expected: PASS; tsc clean. Any other object typed `HireData` in `tests/` or `evals/` that tsc now reports needs a `getSettings` added.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/anonymous.ts src/lib/reach/public-forms.ts src/lib/hire/types.ts src/lib/hire/seed.ts src/lib/hire/supabase.ts src/lib/hire/public-careers.ts tests/hire-public-careers.test.ts tests/hire-seed.test.ts tests/hire-provider.test.ts
# plus any other test or eval file tsc made you add getSettings to
git commit -m "feat(hire): hiring settings in the data seam; readers for the public job board"
```

---

### Task 3: The `updateCareersPage` capability and its server action

**Files:**
- Modify: `src/lib/hire/capabilities.ts`, `src/app/(app)/hire/actions.ts`
- Test: `tests/hire-capabilities.test.ts`, `tests/hire-actions.test.ts`

**Interfaces:**
- Consumes: `HireSettings`, `SETTINGS_COLUMNS`, `DEFAULT_HIRE_SETTINGS` (Task 2); `careersPath` (Task 2).
- Produces: `updateCareersPageInput` (Zod), `updateCareersPage(ctx, input): Promise<CapResult<HireSettings>>`, `CAREERS_DEMO = 'The demo workspace cannot have a public careers page.'`; `updateCareersPageAction(input: unknown)`.

- [ ] **Step 1: Write the failing tests**

Read `tests/hire-capabilities.test.ts` first and reuse its fake-client helper. Add a `describe('updateCareersPage')` with these cases, each asserting on what the fake client was asked to do:

1. An existing row: `update` is called on `hire_settings` with exactly the sent fields plus `updated_at`, filtered by `org_id = ctx.orgId`; the result is `{ ok: true, data: { org_id: ctx.orgId, careers_enabled: true, careers_headline: 'Hi', careers_tagline: null } }`.
2. No row yet (the update returns no row): `insert` is called with `{ org_id: ctx.orgId, ...sent }`; never with an `org_id` from the input (`{ careers_enabled: true, org_id: 'evil' }` still inserts `ctx.orgId`).
3. A raced insert (insert error code `23505`): the update is tried once more and its row returned.
4. A blank headline or tagline is stored as `null`; a field not sent is not in the patch.
5. A headline of 81 characters is refused with `Keep the headline under 80 characters.`; a tagline of 161 with `Keep the tagline under 160 characters.`; nothing is written.
6. Nothing sent (`{}`): no write; the current settings (or the defaults) are returned.
7. `careers_enabled: true` in a workspace whose org row has `slug: 'rimba-ventures-demo'`: refused with `CAREERS_DEMO`, nothing written. Switching **off** or editing the headline there is not blocked by this rule.
8. A database error on the write gives the generic `That change could not be saved. Please try again.` and logs.
9. `z.toJSONSchema(updateCareersPageInput)` does not throw (add it to the existing schema smoke test).

In `tests/hire-actions.test.ts` (read it first, same mocks): `updateCareersPageAction` returns FORBIDDEN for a demo viewer and for a viewer role without calling the capability; for an owner it calls the capability with the session context and revalidates `/hire/careers-page`, `/hire/assistant` and `/careers/<orgId>`.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run tests/hire-capabilities.test.ts tests/hire-actions.test.ts`
Expected: FAIL, `updateCareersPage` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/hire/capabilities.ts` (add `DEFAULT_HIRE_SETTINGS, SETTINGS_COLUMNS, type HireSettings` to the `./types` import):

```ts
// ─── careers page (one settings row per workspace) ───────────────────────────

export const CAREERS_DEMO = 'The demo workspace cannot have a public careers page.';
const DEMO_SLUG = 'rimba-ventures-demo';

export const updateCareersPageInput = z.object({
  careers_enabled: z.boolean().optional()
    .describe('true turns the public careers page on: open jobs become visible to anyone with the link. false turns it off.'),
  careers_headline: z.string().trim().max(80, 'Keep the headline under 80 characters.').nullable().optional()
    .describe('The headline at the top of the public careers page. Blank clears it.'),
  careers_tagline: z.string().trim().max(160, 'Keep the tagline under 160 characters.').nullable().optional()
    .describe('One line under the headline. Blank clears it.'),
});

const asSettings = (orgId: string, row: unknown): HireSettings =>
  ({ org_id: orgId, ...DEFAULT_HIRE_SETTINGS, ...((row ?? {}) as Partial<HireSettings>) });

export async function updateCareersPage(
  ctx: HireWriteContext,
  input: z.input<typeof updateCareersPageInput>,
  now: Date = new Date(),
): Promise<CapResult<HireSettings>> {
  const parsed = updateCareersPageInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const given = {
    careers_enabled: parsed.data.careers_enabled,
    careers_headline: blankToNull(parsed.data.careers_headline),
    careers_tagline: blankToNull(parsed.data.careers_tagline),
  };
  const patch = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));

  if (Object.keys(patch).length === 0) {
    const { data, error } = await ctx.client
      .from('hire_settings').select(SETTINGS_COLUMNS).eq('org_id', ctx.orgId).maybeSingle();
    if (error) return writeFailed('updateCareersPage', error);
    return { ok: true, data: asSettings(ctx.orgId, data) };
  }

  if (patch.careers_enabled === true) {
    const { data: org, error } = await ctx.client.from('orgs').select('slug').eq('id', ctx.orgId).maybeSingle();
    if (error) return writeFailed('updateCareersPage', error);
    if ((org as { slug?: string | null } | null)?.slug === DEMO_SLUG) return { ok: false, error: CAREERS_DEMO };
  }

  // Not an upsert: the update grant leaves out org_id, which an upsert's "do update" would set.
  const update = () =>
    ctx.client.from('hire_settings')
      .update({ ...patch, updated_at: now.toISOString() })
      .eq('org_id', ctx.orgId).select(SETTINGS_COLUMNS).maybeSingle();

  const first = await update();
  if (first.error) return writeFailed('updateCareersPage', first.error);
  if (first.data) return { ok: true, data: asSettings(ctx.orgId, first.data) };

  const inserted = await ctx.client.from('hire_settings')
    .insert({ ...patch, org_id: ctx.orgId }).select(SETTINGS_COLUMNS).single();
  if (!inserted.error && inserted.data) return { ok: true, data: asSettings(ctx.orgId, inserted.data) };
  // Someone else made the row between the two calls: update it after all.
  if ((inserted.error as { code?: string } | null)?.code !== '23505') return writeFailed('updateCareersPage', inserted.error);
  const second = await update();
  if (second.error || !second.data) return writeFailed('updateCareersPage', second.error);
  return { ok: true, data: asSettings(ctx.orgId, second.data) };
}
```

In `src/app/(app)/hire/actions.ts`: import `updateCareersPage` and `careersPath` (from `@/lib/hire/public-careers`), and add

```ts
/** The careers page is its own thing: it does not change what the job screens show. */
export async function updateCareersPageAction(input: unknown) {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const result = await updateCareersPage(ctx, input as never);
  if (result.ok) {
    revalidatePath('/hire/careers-page');
    revalidatePath('/hire/assistant');
    revalidatePath(careersPath(ctx.orgId), 'layout');
  }
  return result;
}
```
Check `revalidatePath`'s signature in `node_modules/next/dist/docs/` for this version before using the second argument; the intent is "the board and every job page under it".

- [ ] **Step 4: Run and see them pass**

Run: `pnpm vitest run tests/hire-capabilities.test.ts tests/hire-actions.test.ts` then `pnpm exec tsc --noEmit`.
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hire/capabilities.ts "src/app/(app)/hire/actions.ts" tests/hire-capabilities.test.ts tests/hire-actions.test.ts
git commit -m "feat(hire): updateCareersPage capability and server action"
```

---

### Task 4: Lekir's careers tools, approval text and labels

**Files:**
- Modify: `src/lib/ai/hire-tools.ts`, `src/lib/ai/products.ts`, `src/lib/chat/change-titles.ts`, `src/components/chat/tool-parts.ts`, `src/app/api/hire/chat/route.ts`, `src/app/api/chat/route.ts`, `evals/tuah/harness.ts`
- Test: `tests/hire-tools.test.ts`, `tests/hire-tools-write.test.ts`, `tests/hire-change-titles.test.ts`, `tests/hire-chat-route.test.ts`, `tests/tuah-hire.test.ts`

**Interfaces:**
- Consumes: `HireData.getSettings`, `careersPath`, `careersUrl` (Task 2); `updateCareersPage`, `updateCareersPageInput` (Task 3).
- Produces: `createHireTools(data, nowArg?, write?, site?: { origin: string | null })`; `HIRE_TOOL_NAMES` gains `'getCareersPage'`; `HIRE_WRITE_TOOL_NAMES` gains `'updateCareersPage'`; `HireAccess` gains `origin?: string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/hire-tools.test.ts` (reuse its helpers for calling a tool):

```ts
describe('getCareersPage', () => {
  const settings = { org_id: 'org-1', careers_enabled: true, careers_headline: 'Join us', careers_tagline: null };
  const data = () => ({ ...createSeedHireData(NOW), getSettings: async () => settings });

  it('gives the address from the site origin and the session workspace, never from the model', async () => {
    const tools = createHireTools(data(), NOW, undefined, { origin: 'https://openkuasa.com' });
    const out = await run(tools.getCareersPage, { org_id: 'evil' });
    expect(out).toMatchObject({
      enabled: true, headline: 'Join us', tagline: null,
      path: '/careers/org-1', url: 'https://openkuasa.com/careers/org-1',
    });
    // Open jobs that have a description: what a visitor would see listed.
    const open = (await data().listJobs()).filter((j) => j.status === 'open' && j.description?.trim()).length;
    expect(out).toMatchObject({ jobs_showing: open });
  });
  it('shows nothing public while the page is off', async () => {
    const off = { ...data(), getSettings: async () => ({ ...settings, careers_enabled: false }) };
    expect(await run(createHireTools(off, NOW).getCareersPage, {})).toMatchObject({ enabled: false, jobs_showing: 0, url: null });
  });
  it('has no address for the sample data', async () => {
    expect(await run(createHireTools(createSeedHireData(NOW), NOW).getCareersPage, {})).toMatchObject({ path: null, url: null });
  });
});
```
(`run` and `NOW` are whatever the file already uses to execute a tool and fix the clock; adapt the names.) The existing test "gives a writer nothing beyond the lookups…" keeps passing through set equality once both name lists are updated.

`tests/hire-tools-write.test.ts`: mock `updateCareersPage` the same way `createJob` is mocked and add a case: the tool reaches the capability with the very same `ctx`, and an `org_id` in the model's input never reaches it as the workspace.

`tests/hire-change-titles.test.ts`:

```ts
it('names a careers page change by what it does', () => {
  expect(approvalTitle('updateCareersPage', { careers_enabled: true })).toBe('Turn on the public careers page?');
  expect(approvalTitle('updateCareersPage', { careers_enabled: false })).toBe('Turn off the public careers page?');
  expect(approvalTitle('updateCareersPage', { careers_headline: 'Join us' })).toBe('Save changes to the careers page?');
});
it('says what turning it on exposes, and shows the words being saved', () => {
  expect(approvalDetail('updateCareersPage', { careers_enabled: true }))
    .toBe('Your open jobs become visible to anyone with the link.');
  expect(approvalDetail('updateCareersPage', { careers_enabled: true, careers_headline: 'Join us' }))
    .toBe('Your open jobs become visible to anyone with the link. · Headline: “Join us”');
  expect(approvalDetail('updateCareersPage', { careers_headline: '', careers_tagline: 'Good coffee' }))
    .toBe('Headline: none · Tagline: “Good coffee”');
  expect(approvalDetail('updateCareersPage', { careers_enabled: false })).toBe('The page and every job page stop being public.');
  expect(approvalDetail('updateCareersPage', null)).toBeNull();
});
```
Match `approvalTitle`'s real signature in the file (it may take the tool part's input as an object and a lookup of names); adapt the calls, not the expected strings.

`tests/hire-chat-route.test.ts` and `tests/tuah-hire.test.ts`: one assertion each that the hire access object the route builds carries `origin` taken from the request headers (`x-forwarded-host: openkuasa.com` gives `https://openkuasa.com`), using the files' existing mocks.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run tests/hire-tools.test.ts tests/hire-tools-write.test.ts tests/hire-change-titles.test.ts tests/hire-chat-route.test.ts tests/tuah-hire.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/ai/hire-tools.ts`:
- Add `'getCareersPage'` to `HIRE_TOOL_NAMES`.
- Signature: `createHireTools(data, nowArg = () => new Date(), write?, site?: { origin: string | null })`.
- New lookup in `read`:

```ts
    getCareersPage: tool({
      description:
        'The public careers page: whether it is on, its address, its headline and tagline, and how many jobs it is showing. ' +
        'When it is off nothing is public.',
      inputSchema: z.object({}),
      execute: async () =>
        safe('getCareersPage', async () => {
          const [settings, jobs] = await Promise.all([data.getSettings(), data.listJobs()]);
          const path = settings.org_id ? careersPath(settings.org_id) : null;
          const origin = site?.origin ?? null;
          return {
            enabled: settings.careers_enabled,
            headline: settings.careers_headline,
            tagline: settings.careers_tagline,
            path,
            url: settings.careers_enabled && origin && settings.org_id ? careersUrl(origin, settings.org_id) : null,
            // Only open jobs with a description are listed publicly.
            jobs_showing: settings.careers_enabled
              ? jobs.filter((j) => j.status === 'open' && j.description?.trim()).length
              : 0,
          };
        }),
    }),
```
- New change tool beside the job ones:

```ts
    updateCareersPage: tool({
      description:
        'Turn the public careers page on or off, or change its headline and tagline. Send only what changes. ' +
        'Turning it on makes every open job visible to anyone with the link.',
      inputSchema: updateCareersPageInput,
      execute: async (input) => updateCareersPage(ctx, input, now()),
    }),
```

`src/lib/ai/products.ts`: `HIRE_WRITE_TOOL_NAMES = ['createJob', 'updateJob', 'setJobStatus', 'deleteJob', 'updateCareersPage'] as const;`; `HireAccess` gains `origin?: string | null;`; `hireProduct` passes `{ origin: hire.origin ?? null }` as the fourth argument.

Routes and harness: in `src/app/api/hire/chat/route.ts` and `src/app/api/chat/route.ts`, add `origin: originFromHeaders((name) => request.headers.get(name))` to the hire access object (`originFromHeaders` is in `@/lib/reach/form-submissions`; use the route's own request variable name). `evals/tuah/harness.ts`: `origin: 'https://example.test'`.

`src/lib/chat/change-titles.ts`:
- In the title switch: 
```ts
    case 'updateCareersPage':
      return i.careers_enabled === true
        ? 'Turn on the public careers page?'
        : i.careers_enabled === false
          ? 'Turn off the public careers page?'
          : 'Save changes to the careers page?';
```
- In `approvalDetail`, before the job branches:
```ts
  if (toolName === 'updateCareersPage') {
    const quoted = (label: string, key: string) =>
      Object.hasOwn(i, key) ? `${label}: ${typeof i[key] === 'string' && i[key].trim() ? `“${i[key].trim()}”` : 'none'}` : null;
    const parts = [
      i.careers_enabled === true ? 'Your open jobs become visible to anyone with the link.' : null,
      i.careers_enabled === false ? 'The page and every job page stop being public.' : null,
      quoted('Headline', 'careers_headline'),
      quoted('Tagline', 'careers_tagline'),
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
```
Use the file's existing way of reading the input as a record (`i`), and keep its "non-object input gives null" behaviour.

`src/components/chat/tool-parts.ts`: add `getCareersPage: { label: 'Careers page', Icon: Globe },` to `TOOL_META` and import `Globe` from `lucide-react`.

- [ ] **Step 4: Run and see them pass**

Run the Step 2 command plus `tests/tuah-team.test.ts tests/reach-approval.test.ts tests/crm-approval.test.ts`, then `pnpm exec tsc --noEmit`.
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai src/lib/chat/change-titles.ts src/components/chat/tool-parts.ts src/app/api evals/tuah/harness.ts tests
git commit -m "feat(hire): Lekir can read and change the careers page behind approval"
```

---

### Task 5: Prompts and one question-set case

**Files:**
- Modify: `src/lib/ai/agents/prompts.ts`, `evals/tuah/cases.ts`
- Test: `tests/lekir-prompt.test.ts`

**Interfaces:**
- Consumes: `HIRE_WRITE_TOOL_NAMES` with `updateCareersPage` (Task 4).

- [ ] **Step 1: Write the failing tests** in `tests/lekir-prompt.test.ts`

Replace the tool-name check in "says what it can change, in step with the change tools it holds" with:

```ts
    expect([...HIRE_WRITE_TOOL_NAMES].every((name) => /Job(Status)?$|^updateCareersPage$/.test(name))).toBe(true);
```
and add:

```ts
  it('can switch the careers page on or off, and says what switching it on exposes', () => {
    expect(t).toContain('public careers page');
    expect(t).toContain('turning it on makes every open job visible to anyone with the link');
    expect(t).toContain('getcareerspage');
  });
```
Add the same two `toContain` checks (first and second line) for the hire specialist rule, `TUAH_SYSTEM` and `tuahTeamSystem` in the describe blocks the file already has for them (lower-cased as the file does).

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run tests/lekir-prompt.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement** in `src/lib/ai/agents/prompts.ts`

Keep every existing sentence the tests pin. Add:
- `LEKIR_SYSTEM`, after the bullet about a job with applications: `- You can also turn the public careers page on or off and edit its headline and tagline, behind the same approval. Turning it on makes every open job visible to anyone with the link, so say that in the same breath when you propose it. Use getCareersPage for its address and whether it is on; never make up a link.`
- `SPECIALIST_RULES.hire`: `'You can also prepare a change to the public careers page: on, off, headline, tagline. Turning it on makes every open job visible to anyone with the link: report that with it. Use getCareersPage for its address.'`
- `TUAH_SYSTEM`, in the Lekir changes bullet: append ` You can also turn the public careers page on or off and edit its headline and tagline. Turning it on makes every open job visible to anyone with the link: say so when you propose it.`
- `tuahTeamSystem`, in the "When changes are allowed, Lekir can prepare changes to jobs" bullet: append ` Lekir can also prepare turning the public careers page on or off and editing its headline and tagline; turning it on makes every open job visible to anyone with the link.`

Do not touch Jebat's, Kasturi's or Lekiu's prompts.

`evals/tuah/cases.ts`: read the `create-job` case and add one modelled on it, id `careers-page-on`, question `Turn on our public careers page.`, approving the change, passing when the `updateCareersPage` tool ran with `careers_enabled: true` and the answer mentions that open jobs are now public (`/public|visible|awam|umum/i`). Add cleanup in `evals/tuah/harness.ts` beside the job cleanup: `await client.from('hire_settings').update({ careers_enabled: false }).eq('org_id', orgId);`. Do not run it.

- [ ] **Step 4: Run and see them pass**

Run: `pnpm vitest run tests/lekir-prompt.test.ts tests/tuah-hire.test.ts` then `pnpm exec tsc --noEmit`.
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/agents/prompts.ts evals/tuah tests/lekir-prompt.test.ts
git commit -m "feat(hire): assistants know the careers page can be switched and what that exposes"
```

---

### Task 6: The public pages

**Files:**
- Create: `src/components/hire/public-careers-shell.tsx`, `src/app/careers/[orgId]/page.tsx`, `src/app/careers/[orgId]/not-found.tsx`, `src/app/careers/[orgId]/[jobId]/page.tsx`
- Test: `tests/hire-careers-pages.test.tsx`

There is no page-render test in this repo to copy and no component-test setup; do not add one. The pages are tested by calling them as functions: `const element = await BoardPage({ params: Promise.resolve({ orgId }) })`, then `renderToStaticMarkup(element)` from `react-dom/server` and assertions on the HTML string. This works only while the page's own tree holds no nested async components, so keep the shell and every child synchronous: the page function does all the awaiting. If the test file needs JSX it is `.tsx`; check `vitest.config` handles that extension and, if it does not, build the element without JSX in a `.ts` file instead of changing the config.

**Interfaces:**
- Consumes: everything exported from `@/lib/hire/public-careers` (Task 2); `createAnonymousClient` from `@/lib/supabase/anonymous`; `hasSupabaseEnv` from `@/lib/auth/viewer`.

Before writing: read `src/app/f/[formId]/page.tsx`, `not-found.tsx` and `src/components/reach/public-form-shell.tsx` (the conventions to follow), and the pages, `generateMetadata`, `not-found` and caching guides under `node_modules/next/dist/docs/`.

**Rules (each is a requirement):**

1. Both pages are server components outside the `(app)` group, with no client JavaScript needed to read them. No sidebar, no sign-in, nothing of the app except a "Powered by OpenKuasa" footer link (as the form shell has).
2. Each page loads through a `cache()`-wrapped loader that returns null when `!hasSupabaseEnv()`, and otherwise calls `getPublicCareers` / `getPublicJob` with `createAnonymousClient()`. Null → `notFound()`. The page and `generateMetadata` share the one loader call.
3. The pages are rendered per request and never served from a stale cache after the board is switched off: follow this Next version's documented way to opt a page into request-time rendering.
4. `not-found.tsx` for the segment: title "This page isn't available", body "The role may have been filled or the link may be out of date." Because `[jobId]` sits under `[orgId]`, this one file serves both pages.
5. Board page: a skip link to `#main`; `<header>` with the workspace name as small text, one `<h1>` with the headline (`DEFAULT_HEADLINE` when unset) and the tagline as a paragraph when set; `<main id="main">` with an `<h2>` "Open roles" and a `<ul>` of jobs. Empty: "No open roles right now. Check back soon."
6. Each job in the list is one link (`careersJobPath`) covering the whole card, at least 44px tall, with the title as the link text; under it, as text: department, location, `ARRANGEMENT_LABEL`, `EMPLOYMENT_LABEL`, each only when present, separated by " · ". When `accepting` is false the words "Applications closed" appear (text, not colour alone).
7. Job page: skip link; `<header>` with the workspace name; one `<h1>` with the job title; a `<dl>` of key facts above the description, each row only when present: Department, Location, Work arrangement, Employment type, Salary (`formatSalary`), Closing date (`formatLongDate`; when `accepting` is false the value is followed by " · Applications closed"); an `<h2>` "About the role" and the description as plain text with line breaks kept (`whitespace-pre-line`, `break-words`), held to about 65–75 characters wide on large screens (`max-w-prose`); a visible link "All open roles" back to `careersPath`. No apply button.
8. Text is rendered as React text children only. Never `dangerouslySetInnerHTML`.
9. Mobile first at 375px: one column, no horizontal scroll, body text at least 16px (`text-base`) with `leading-relaxed`; numbers use `tabular-nums`; every link has a visible focus ring (the form shell's classes).
10. Colours come from the app's existing tokens (`bg-muted/40`, `bg-card`, `text-muted-foreground`, `border`). No new colours; nothing purple or violet.
11. `generateMetadata`: board title `Careers at <workspace>`, description = tagline or `Open roles at <workspace>.`; job title `<job title> at <workspace>`, description = the first 160 characters of the description with whitespace collapsed. Both set `openGraph` and `twitter` titles as the form page does, and `robots: { index: true, follow: true }`. For a null load: title "Page not available" and `robots: { index: false, follow: false }`.
12. The shell component holds the frame shared by the two pages and the not-found page (background, centred column `max-w-2xl`, footer), so the three do not repeat it.

**Tests** (mock `@/lib/hire/public-careers`' two readers with `vi.mock`, keeping the real helpers through `importOriginal`; mock `next/navigation`'s `notFound` to throw a marker):
- Board: renders the workspace name, headline fallback "Join our team", a link per job to the right address, "Applications closed" for a non-accepting job, and the empty-state sentence for no jobs.
- Job: renders the title as the only `h1`, the salary line, "31 October 2026", the description text, and the link back.
- A description containing `<script>alert(1)</script>` appears escaped in the rendered HTML.
- Null from the reader → `notFound` is called, for each page.
- Metadata: the three titles above; `robots.index` true for found, false for null.

- [ ] **Step 1:** Write the tests. Run `pnpm vitest run tests/hire-careers-pages.test.tsx`. Expected: FAIL (modules missing).
- [ ] **Step 2:** Write the shell, the two pages and `not-found.tsx` to the rules.
- [ ] **Step 3:** Run the tests again, then `pnpm exec tsc --noEmit` and `pnpm exec eslint src/app/careers src/components/hire`. Expected: PASS, clean.
- [ ] **Step 4:** Re-read each rule against the finished files and list in the report the file and line that meets it.
- [ ] **Step 5: Commit**

```bash
git add src/app/careers src/components/hire tests/hire-careers-pages.test.tsx
git commit -m "feat(hire): public job board and job pages"
```

---

### Task 7: The Careers Page screen

**Files:**
- Create: `src/screens/hire/careers-controls.tsx` (client)
- Modify: `src/screens/hire/careers-page.tsx`, `src/lib/hire/lists.ts`
- Test: `tests/hire-lists.test.ts`, `tests/hire-careers-form.test.ts`

**Interfaces:**
- Consumes: `HireData.getSettings` (Task 2), `updateCareersPageAction` (Task 3), `careersPath`, `careersUrl`, `DEFAULT_HEADLINE` (Task 2), `originFromHeaders` (`@/lib/reach/form-submissions`).
- Produces: `CareersModel` gains `settings: HireSettings` and `showing: { title: string; location: string }[]` (open jobs with a description, newest opened first: what the public board lists); pure helper `brandingErrors(values: { headline: string; tagline: string }): { headline?: string; tagline?: string }` exported from `src/lib/hire/lists.ts`.

Before writing: read `src/screens/hire/jobs-table.tsx` for the house patterns this screen must match (the `act` helper with try/catch and the "could not be sent" message, pending buttons, `role="alert"` errors under fields, radix `AlertDialog` with an opener ref and `onCloseAutoFocus`, the `TARGET` 44px class, a notice in an `aria-live` region that does not take focus), and `src/components/ui/switch.tsx`.

**Rules:**

1. `buildCareersModel` also reads `data.getSettings()`; `showing` uses the same filter as the database function (status open and a non-blank description).
2. Header actions, for a real workspace: a **Publish** switch (the `Switch` component, `role="switch"`, with a visible label "Public careers page" and its state in words, "On" / "Off"), **Preview**, and **Copy link**. Beside the switch one line: "When on, your open jobs are visible to anyone with the link and can appear in search engines."
3. Switching **on** opens a confirm ("Make your open jobs public?", body "Anyone with the link will be able to see your open jobs.", buttons "Cancel" and "Make public"). Switching **off** does not confirm. Both call `updateCareersPageAction({ careers_enabled })`; the switch is disabled while pending; a refusal is shown in a `role="alert"` beside it and the switch stays where it was.
4. **Preview**: while the board is on it is a link styled as a button (`target="_blank"`, `rel="noopener"`) to `careersPath(orgId)`; while it is off it is rendered instead as a disabled `<button>` with `title="Turn the careers page on first"` (an anchor cannot be disabled). **Copy link** is a button that copies `careersUrl(origin, orgId)` and announces "Link copied" in an `aria-live="polite"` region (if `navigator.clipboard` fails, show "Could not copy. The link is: <url>"); it is disabled with the same title while the board is off. The origin comes from the request headers in the server screen (`originFromHeaders`), as `src/screens/reach/lead-forms.tsx` does.
5. **Preview card**: shows the workspace's real name, the headline (`DEFAULT_HEADLINE` when unset), the tagline when set, and up to three of `showing`. When the board is off, the frame shows "Your careers page is off" instead. The address bar text is `careersPath(orgId)`. The sample "Rimba Ventures" branding appears only for demo visitors.
6. **Page branding card**: Headline and Tagline are real inputs with visible labels, a character count hint ("Up to 80 characters", "Up to 160 characters"), errors under the field from `brandingErrors` checked on blur and on Save, the server's refusal under the field it names, and a **Save** button that reads "Saving…" and is disabled while pending and disabled when nothing changed. After a save: "Careers page saved." in the live region, focus stays where it was. The colour field is removed.
7. A viewer (no `edit-data`) sees the same screen read-only: the switch disabled with `title="You do not have permission to change this"`, the inputs `readOnly`, no Save button. Preview and Copy link still work when the board is on.
8. The demo workspace keeps its sample branding and sample charts, and shows the switch disabled with the text "Not available in the demo".
9. Page views, Applies, Conversion, the trend, the funnel and the source chart stay exactly as they are (sample for demo, "Not available yet" otherwise). The Job listings table and its `PublishButton` are unchanged.
10. All interactive targets are at least 44px tall; nothing scrolls sideways at 375px; no purple or violet.
11. The workspace id and name come from `getViewer()` (`viewer.orgId`, `viewer.orgName`); do not query for them again.

**Tests:**
- `tests/hire-lists.test.ts`: the model carries `settings` from the provider; `showing` leaves out a draft, a paused job and an open job with a blank description, and is ordered newest opened first.
- `tests/hire-careers-form.test.ts`: `brandingErrors` gives "Keep the headline under 80 characters." for 81 characters and nothing for 80; "Keep the tagline under 160 characters." for 161; and the two messages are the same strings the capability refuses with (parse an over-long value with `updateCareersPageInput` and compare the first issue's message).

- [ ] **Step 1:** Write the tests; run `pnpm vitest run tests/hire-lists.test.ts tests/hire-careers-form.test.ts`. Expected: FAIL.
- [ ] **Step 2:** Implement the model change and the helper; run the tests. Expected: PASS.
- [ ] **Step 3:** Write `careers-controls.tsx` and change `careers-page.tsx` to the rules.
- [ ] **Step 4:** `pnpm exec tsc --noEmit`, `pnpm exec eslint src/screens/hire src/lib/hire`, and `pnpm vitest run tests/hire-screen-parts.test.ts tests/hire-lists.test.ts tests/hire-careers-form.test.ts`. Expected: clean, PASS.
- [ ] **Step 5:** Re-read each rule against the finished files and list in the report the file and line that meets it. There is no component-test setup: do not add one. The controller checks the behaviour in a browser.
- [ ] **Step 6: Commit**

```bash
git add src/screens/hire src/lib/hire/lists.ts tests/hire-lists.test.ts tests/hire-careers-form.test.ts
git commit -m "feat(hire): Careers Page screen with the publish switch, real preview and branding"
```

---

### Task 8: Live checks for the public functions (written, not run)

**Files:**
- Create: `tests/hire-careers.rls.test.ts`

Read `tests/hire-jobs-writes.rls.test.ts` first and reuse its way of making a signed-in owner with a workspace (`create_org_for_current_user`), its skip condition when the environment is missing, and its cleanup. An anonymous visitor is `createAnonymousClient()` from `@/lib/supabase/anonymous`.

Cases (one `it` each):
1. Board off (no settings row): `get_public_careers` gives no rows; `get_public_job` for an open, described job gives no rows.
2. The owner switches the board on (insert into `hire_settings`): a visitor gets the workspace's name and exactly the open jobs that have a description. Set up one of each: open with description, open with a blank description (update it directly), draft, paused, closed. Only the first is listed.
3. `get_public_job` returns nothing for the draft, paused, closed and blank-description job ids.
4. Salary: a job with `show_salary` false gives null for both salary fields; with true gives the numbers.
5. A second workspace's open job requested with the first workspace's id gives nothing.
6. A board that is on with no open jobs gives one row with the workspace's name and a null `job_id`.
7. The demo workspace id gives nothing from either function (find it by `slug` with the service client only if the file's existing helpers already have one; otherwise use `join_demo_org` as the 2a file does to learn the id).
8. As a visitor, `from('hire_jobs').select('id')` and `from('hire_settings').select('org_id')` return an error or no rows.
9. A viewer of a workspace cannot insert or update `hire_settings` (expect an error or zero rows changed), and a writer cannot change `org_id` on its row.
10. The returned rows have no `headcount`, `status`, `created_at` or `closed_at` keys.

- [ ] **Step 1:** Write the file. Do NOT run it: it needs the migration, which is not applied yet.
- [ ] **Step 2:** `pnpm exec tsc --noEmit` and `pnpm exec eslint tests/hire-careers.rls.test.ts`. Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add tests/hire-careers.rls.test.ts
git commit -m "test(hire): live checks for the public job board functions"
```

---

### Task 9 (controller): apply, verify, smoke, pull request

Not for an implementer. Each of the migration, the question-set run and the push waits for the user's yes.

- [ ] Rebase onto `origin/main`; if another migration took version `20261016090000`, renumber this one and its test.
- [ ] Apply `hire_settings` through the `openkuasa-supabase` MCP (one call).
- [ ] Verify live: both functions exist, are `security definer` with empty `search_path`, executable by `anon`; `anon` has no privilege on `hire_settings` or `hire_jobs`; the demo workspace returns nothing; security advisors show nothing new for the table or functions.
- [ ] Run the full suite (`pnpm vitest run --dir tests`), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- [ ] Local smoke as the smoke account: create and open a job with a description; switch the board on (confirm appears, focus returns to the switch); Preview opens the board; open it in a signed-out browser context and see the job and its page; check 375px and keyboard focus rings; a job with a hidden salary shows no salary; pause the job and see it gone and its page "not available"; switch the board off and see "not available"; edit headline and tagline and see them on the board; Copy link says "Link copied"; ask Lekir "is our careers page on?" and "turn on the careers page" (approval card says what it exposes). Then restore: board off, test job deleted, chat threads removed.
- [ ] After a yes: `EVAL_ONLY=careers-page-on,create-job EVAL_RUNS=1 pnpm eval:tuah`.
- [ ] After a yes: next free branch number, push, open the pull request (title = branch name, no close keyword unless a tracking issue exists). Do not merge until asked. After merge: smoke test production the same way, with the user signed in to the smoke account.
