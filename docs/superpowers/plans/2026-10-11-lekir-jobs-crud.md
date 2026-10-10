# Lekir Jobs CRUD (slice 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make hiring jobs writable: create, edit, open, pause, close, reopen and delete from the Jobs screen, and the same through Lekir and Tuah behind approval cards.

**Architecture:** One capability layer (`src/lib/hire/capabilities.ts`) holds a Zod schema and a function per change; the server actions and the AI tools both call it with the same schema. Postgres enforces tenancy and role with a write policy and column-level grants, and blocks deleting a job that has applications. The Jobs screen gets a client table with a dialog form, following `src/components/reach/ad-studio-table.tsx`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Postgres with RLS, Zod 4, AI SDK v7, `radix-ui` dialogs, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-lekir-jobs-crud-design.md`

## Global Constraints

- Work only on branch `feat-091-lekir-jobs-crud` in the worktree `.claude/worktrees/feat-084-lekir-foundation` (the folder keeps its old name).
- `AGENTS.md`: this Next.js has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing server actions or client/server component boundaries.
- pnpm only. Tests: `pnpm vitest run --dir tests`. This shell exports live Supabase credentials, so `tests/*.rls.test.ts` run against the live project. `tests/hire-jobs-writes.rls.test.ts` (Task 9) fails until the migration is applied; never run it on its own before then.
- TypeScript, 2-space indent, single quotes, semicolons, named exports (screens keep their default export).
- `org_id` always comes from the session or the write context. Never from a form, a request body or the model.
- Every change goes through `src/lib/hire/capabilities.ts`. No screen, action or tool writes to `hire_jobs` any other way.
- A new job is always created with status `draft`.
- Status moves allowed: draft → open; open → paused, closed; paused → open, closed; closed → open. Opening needs a non-empty description.
- A job with applications cannot be deleted; the user is told to close it instead.
- Salary is monthly, stored in sen (`bigint`), max not below min. `closes_on` is a date, not in the past (Kuala Lumpur). `headcount` is at least 1. Title is 1 to 120 characters, description up to 10,000.
- Only members who are not viewers, and not demo visitors, may change anything.
- The job form uses a `radix-ui` `Dialog`, as `ad-studio-table.tsx` does. The spec says "side panel"; the app has no panel component and its CRUD screens use this dialog, so the dialog is the pattern. Section 7.2 of the spec (labels, errors under fields, pending Save, focus, keyboard, 44px targets) still applies in full.
- Job descriptions are rendered as plain text. Never `dangerouslySetInnerHTML`.
- No purple or violet; no new `var(--chart-5)`. No reference-product names in `src/`.
- Migrations are applied to the live project only by the controller, after the user says yes to each. `pnpm eval:tuah` runs only after a yes to a call estimate.
- Candidates, applications and interviews stay read-only. Do not add any write path for them.

## Review Focus

1. **Partial update of a salary pair.** Updating only `salary_min_cents` to a value above the stored max must be refused, with the stored max taken into account, not just the input. Pinned in Task 3.
2. **Clearing a description on a live job.** `updateJob` with an empty or whitespace description on an open or paused job must be refused; on a draft or closed job it is allowed. Pinned in Task 3.
3. **An id from another workspace.** Every capability must answer "That job could not be found." and write nothing, even though RLS would also stop it. Pinned in Task 3.
4. **A double submit.** Clicking Save twice must create one job: every button that triggers an action is `disabled={pending}`. The repo has no component-test setup, so this is not pinned by an automated test: the Task 8 reviewer checks each action button for it, and Task 9's smoke step 1 double-clicks Save and counts the rows.
5. **Deleting a whole workspace.** With the delete guard in place, deleting an org that has jobs with applications must still succeed. Pinned in Task 9 (live check in a rolled-back transaction).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261014090000_hire_jobs_writes.sql` | New columns, checks, write policy, grants, delete guard |
| `supabase/migrations/20261014090100_hire_jobs_demo_seed.sql` | Demo seed with the new fields and working-hours interviews |
| `src/lib/hire/types.ts`, `supabase.ts`, `seed.ts` | Job gains seven fields |
| `src/lib/hire/capabilities.ts` | The single write path |
| `src/app/(app)/hire/actions.ts` | Server actions over the capabilities |
| `src/lib/ai/hire-tools.ts`, `products.ts` | Four change tools; `listJobs` returns ids |
| `src/lib/chat/change-titles.ts` | Approval titles for jobs |
| `src/lib/ai/agents/prompts.ts`, `orchestrator.ts` | What Lekir and Tuah say they can change |
| `src/screens/hire/jobs-table.tsx` | Client table: dialog form, row actions, delete confirm |
| `src/screens/hire/jobs.tsx`, `careers-page.tsx`, `src/lib/hire/lists.ts` | Screens use the table and the publish action |

---

### Task 1: Migration — writable jobs

**Files:**
- Create: `supabase/migrations/20261014090000_hire_jobs_writes.sql`
- Test: `tests/hire-jobs-migration.test.ts`

**Interfaces:**
- Produces: columns `description, salary_min_cents, salary_max_cents, show_salary, closes_on, work_arrangement, headcount` on `public.hire_jobs`; policy `hire_jobs_write`; trigger `hire_jobs_delete_guard`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/hire-jobs-migration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (name: string) => readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');
const sql = read('20261014090000_hire_jobs_writes.sql');

describe('hire jobs writes migration', () => {
  test('adds the seven job fields with their checks', () => {
    for (const column of [
      'description text', 'salary_min_cents bigint', 'salary_max_cents bigint',
      'show_salary boolean not null default false', 'closes_on date',
      'work_arrangement text', 'headcount integer not null default 1',
    ]) {
      expect(sql, column).toContain(column);
    }
    expect(sql).toContain("check (work_arrangement in ('onsite','hybrid','remote'))");
    expect(sql).toContain('check (headcount >= 1)');
    expect(sql).toContain('salary_max_cents >= salary_min_cents');
  });

  test('adds the write policy and the grants together', () => {
    expect(sql).toContain('create policy hire_jobs_write on public.hire_jobs for all to authenticated');
    expect(sql).toContain('private.is_org_writer(org_id)');
    expect(sql).toContain('grant insert on public.hire_jobs to authenticated');
    expect(sql).toContain('grant delete on public.hire_jobs to authenticated');
  });

  test('never lets id, org_id or created_at be updated', () => {
    const match = sql.match(/grant update \(([^)]*)\) on public\.hire_jobs to authenticated;/);
    expect(match).not.toBeNull();
    const columns = match![1].split(',').map((c) => c.trim());
    expect(columns).toEqual(expect.arrayContaining(['title', 'status', 'description', 'headcount', 'opened_at', 'closed_at']));
    for (const forbidden of ['id', 'org_id', 'created_at']) expect(columns).not.toContain(forbidden);
  });

  test('guards deleting a job that has applications, except when the whole workspace is going', () => {
    expect(sql).toContain('create trigger hire_jobs_delete_guard');
    expect(sql).toContain('before delete on public.hire_jobs');
    expect(sql).toContain('from public.hire_applications');
    expect(sql).toContain('from public.orgs');
  });

  test('touches no other hiring table', () => {
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*hire_(candidates|applications|interviews)/);
    expect(sql).not.toMatch(/create policy \w+ on public\.hire_(candidates|applications|interviews)/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run tests/hire-jobs-migration.test.ts`
Expected: FAIL with `ENOENT`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261014090000_hire_jobs_writes.sql
-- Lekir slice 2a: jobs become writable. Two layers, added together: the grants
-- cap the verbs and columns, the policy scopes the rows to writers.

alter table public.hire_jobs
  add column description text check (char_length(description) <= 10000),
  add column salary_min_cents bigint check (salary_min_cents >= 0),
  add column salary_max_cents bigint check (salary_max_cents >= 0),
  add column show_salary boolean not null default false,
  add column closes_on date,
  add column work_arrangement text check (work_arrangement in ('onsite','hybrid','remote')),
  add column headcount integer not null default 1 check (headcount >= 1),
  add constraint hire_jobs_salary_range check (
    salary_min_cents is null or salary_max_cents is null or salary_max_cents >= salary_min_cents
  );

create policy hire_jobs_write on public.hire_jobs for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.hire_jobs to authenticated;
grant update (title, department, location, employment_type, status, opened_at, closed_at,
              description, salary_min_cents, salary_max_cents, show_salary, closes_on,
              work_arrangement, headcount) on public.hire_jobs to authenticated;
grant delete on public.hire_jobs to authenticated;

-- A job with applications is closed, not deleted: deleting cascades to the
-- applications and their interviews. The app refuses first; this stops a direct
-- API call too. When the whole workspace is being deleted its org row is
-- already gone by the time the cascade reaches its jobs, so that is let through.
create or replace function private.hire_jobs_delete_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return old;
  end if;
  if exists (select 1 from public.hire_applications a where a.job_id = old.id) then
    raise exception 'This job has applications. Close it instead.'
      using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke all on function private.hire_jobs_delete_guard() from public, anon, authenticated;

create trigger hire_jobs_delete_guard
  before delete on public.hire_jobs
  for each row execute function private.hire_jobs_delete_guard();
```

- [ ] **Step 4: Run the test to see it pass**

Run: `pnpm vitest run tests/hire-jobs-migration.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014090000_hire_jobs_writes.sql tests/hire-jobs-migration.test.ts
git commit -m "feat(hire): jobs become writable (new fields, write policy, grants, delete guard)"
```

---

### Task 2: Types, provider and sample data

**Files:**
- Modify: `src/lib/hire/types.ts`, `src/lib/hire/supabase.ts`, `src/lib/hire/seed.ts`
- Test: `tests/hire-seed.test.ts`, `tests/hire-provider.test.ts` (extend)

**Interfaces:**
- Produces: `WorkArrangement = 'onsite' | 'hybrid' | 'remote'`; `Job` with `description: string | null`, `salary_min_cents: number | null`, `salary_max_cents: number | null`, `show_salary: boolean`, `closes_on: string | null` (`YYYY-MM-DD`), `work_arrangement: WorkArrangement | null`, `headcount: number`; exported `JOB_COLUMNS` from `src/lib/hire/types.ts`.

- [ ] **Step 1: Add failing tests**

Append to `tests/hire-seed.test.ts` inside the `describe`:

```ts
  it('gives every job the slice 2a fields', async () => {
    const jobs = await data.listJobs();
    for (const job of jobs) {
      expect(job.headcount).toBeGreaterThanOrEqual(1);
      expect(typeof job.show_salary).toBe('boolean');
      expect(job).toHaveProperty('description');
      expect(job).toHaveProperty('closes_on');
      expect(job).toHaveProperty('work_arrangement');
    }
    // Every open job can be shown publicly later, so it has a description.
    for (const job of jobs.filter((j) => j.status === 'open')) {
      expect(job.description?.length ?? 0).toBeGreaterThan(40);
    }
    expect(jobs.filter((j) => j.show_salary)).toHaveLength(4);
    for (const job of jobs) {
      if (job.salary_min_cents !== null && job.salary_max_cents !== null) {
        expect(job.salary_max_cents).toBeGreaterThanOrEqual(job.salary_min_cents);
      }
      if (job.closes_on) expect(job.closes_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('schedules interviews in working hours in Kuala Lumpur, on the hour or half hour', async () => {
    for (const interview of await data.listInterviews()) {
      const kl = new Date(new Date(interview.scheduled_at).getTime() + 8 * 3_600_000);
      const minutes = kl.getUTCHours() * 60 + kl.getUTCMinutes();
      expect(minutes, interview.scheduled_at).toBeGreaterThanOrEqual(9 * 60);
      expect(minutes, interview.scheduled_at).toBeLessThanOrEqual(17 * 60);
      expect(kl.getUTCMinutes() % 30).toBe(0);
    }
  });
```

In `tests/hire-provider.test.ts`, add:

```ts
  it('asks for the slice 2a job columns', async () => {
    const data = await getHireData(fakeClient);
    await data.listJobs();
    const columns = asked.find((a) => a.table === 'hire_jobs')!.columns.split(',');
    for (const column of ['description', 'salary_min_cents', 'salary_max_cents', 'show_salary', 'closes_on', 'work_arrangement', 'headcount']) {
      expect(columns, column).toContain(column);
    }
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run tests/hire-seed.test.ts tests/hire-provider.test.ts`
Expected: FAIL (missing properties; interviews at odd minutes).

- [ ] **Step 3: Extend the types**

In `src/lib/hire/types.ts`, add `export type WorkArrangement = 'onsite' | 'hybrid' | 'remote';` and extend `Job`:

```ts
export type Job = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: EmploymentType;
  status: JobStatus;
  /** Plain text. Needed before a job can be opened. */
  description: string | null;
  /** Monthly salary in sen. */
  salary_min_cents: number | null;
  salary_max_cents: number | null;
  /** Whether a public page may show the salary range. */
  show_salary: boolean;
  /** Last day to apply, as YYYY-MM-DD. */
  closes_on: string | null;
  work_arrangement: WorkArrangement | null;
  /** How many people are being hired for the role. */
  headcount: number;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
};
```

- [ ] **Step 4: Extend the provider**

Put the column list in `src/lib/hire/types.ts`, next to the `Job` type it mirrors, and import it in `src/lib/hire/supabase.ts` (delete the local `JOB_COLUMNS` there). It must not live in `supabase.ts`: Task 3's capability module needs it, and importing `supabase.ts` would drag `next/navigation` and the server Supabase client into a module the capability tests load without mocks. `src/lib/reach/capabilities.ts` keeps clear of `./supabase` for the same reason.

```ts
/** The columns of `hire_jobs` that make a {@link Job}, for selects. */
export const JOB_COLUMNS =
  'id,title,department,location,employment_type,status,description,salary_min_cents,' +
  'salary_max_cents,show_salary,closes_on,work_arrangement,headcount,opened_at,closed_at,created_at';
```

- [ ] **Step 5: Extend the sample data**

In `src/lib/hire/seed.ts`:

Add to the `JobSeed` type: `work_arrangement: WorkArrangement; headcount: number; salary: [number, number] | null; show_salary: boolean; closesInDays: number | null;` (salary in whole ringgit) and import `WorkArrangement`. Add these fields to the nine `JOB_SEEDS` rows, in order:

| Title | work_arrangement | headcount | salary (RM) | show_salary | closesInDays |
|---|---|---|---|---|---|
| Software Engineer | hybrid | 2 | [5000, 8000] | true | 21 |
| Sales Executive | onsite | 3 | [3000, 4500] | true | 14 |
| Account Manager | hybrid | 1 | [4500, 6500] | true | null |
| Graphic Designer | remote | 1 | [3500, 5000] | true | 28 |
| Customer Support | onsite | 2 | [2200, 3000] | false | null |
| Operations Executive | onsite | 1 | [3000, 4000] | false | null |
| Content Writer | remote | 1 | null | false | null |
| Accountant | onsite | 1 | [4000, 5500] | false | null |
| Marketing Lead | hybrid | 1 | null | false | null |

Add a description builder and use it for every job except the draft (Marketing Lead gets `null`):

```ts
const describeJob = (title: string, department: string) =>
  `Rimba Ventures is hiring a ${title} for our ${department} team.\n\n` +
  `You will own day-to-day ${department.toLowerCase()} work, report to the head of ${department}, ` +
  `and work closely with the rest of the company.\n\n` +
  `We are looking for relevant experience, clear communication in Bahasa Malaysia and English, ` +
  `and someone who finishes what they start.`;
```

In the `jobs` mapping add:

```ts
    description: job.status === 'draft' ? null : describeJob(job.title, job.department),
    salary_min_cents: job.salary ? job.salary[0] * 100 : null,
    salary_max_cents: job.salary ? job.salary[1] * 100 : null,
    show_salary: job.show_salary,
    closes_on: job.closesInDays === null ? null : klDate(t + job.closesInDays * DAY),
    work_arrangement: job.work_arrangement,
    headcount: job.headcount,
```

with `const klDate = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });`.

Snap interview times to working hours. Replace the `scheduled_at` expression in the interviews mapping with `iso(workingTime(t + hours * HOUR))` and add:

```ts
/** The same instant moved to 09:00–17:00 in Kuala Lumpur, on the hour or half hour. */
function workingTime(ms: number): number {
  const KL = 8 * HOUR;
  const local = new Date(ms + KL);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const clamped = Math.min(17 * 60, Math.max(9 * 60, Math.round(minutes / 30) * 30));
  return dayStart + clamped * 60_000 - KL;
}
```

The six "ahead" interviews must stay ahead of `now` and the four past ones in the past. Clamping keeps the day, so that holds except when an interview at now + 5 hours is clamped to earlier the same day. Guard it: after building the list, any `scheduled` interview not after `t` is moved to the next day at the same clamped time (`+ DAY`). The existing test "six interviews ahead" must still pass.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run tests/hire-seed.test.ts tests/hire-provider.test.ts tests/hire-helpers.test.ts tests/hire-lists.test.ts tests/hire-tools.test.ts && pnpm exec tsc --noEmit`
Expected: PASS and no type errors. Other code that builds a `Job` by hand in tests (search `employment_type:` under `tests/`) needs the new fields; add them with null, false and 1.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hire/types.ts src/lib/hire/supabase.ts src/lib/hire/seed.ts tests/
git commit -m "feat(hire): jobs carry description, salary, closing date, arrangement and headcount"
```

---

### Task 3: The capability layer

**Files:**
- Create: `src/lib/hire/capabilities.ts`
- Test: `tests/hire-capabilities.test.ts`

**Interfaces:**
- Consumes: `Job`, `JobStatus` and `JOB_COLUMNS` from `@/lib/hire/types` (Task 2). This module must not import `@/lib/hire/supabase`.
- Produces:

```ts
export type HireWriteContext = { client: SupabaseClient; orgId: string };
export type CapResult<T> = { ok: true; data: T } | { ok: false; error: string };
export const createJobInput, updateJobInput, setJobStatusInput, deleteJobInput; // Zod schemas
export function createJob(ctx: HireWriteContext, input: z.input<typeof createJobInput>, now?: Date): Promise<CapResult<Job>>;
export function updateJob(ctx: HireWriteContext, input: z.input<typeof updateJobInput>, now?: Date): Promise<CapResult<Job>>;
export function setJobStatus(ctx: HireWriteContext, input: z.input<typeof setJobStatusInput>, now?: Date): Promise<CapResult<Job>>;
export function deleteJob(ctx: HireWriteContext, input: z.input<typeof deleteJobInput>): Promise<CapResult<{ id: string; title: string }>>;
export const JOB_NOT_FOUND = 'That job could not be found.';
export const JOB_HAS_APPLICATIONS = 'This job has applications. Close it instead.';
export const JOB_NEEDS_DESCRIPTION = 'Add a description before opening this job.';
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/hire-capabilities.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  JOB_HAS_APPLICATIONS,
  JOB_NEEDS_DESCRIPTION,
  JOB_NOT_FOUND,
  createJob,
  deleteJob,
  setJobStatus,
  updateJob,
  type HireWriteContext,
} from '@/lib/hire/capabilities';
import type { Job } from '@/lib/hire/types';

const NOW = new Date('2026-10-11T04:00:00Z'); // 12:00 on 11 Oct in Kuala Lumpur
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

const job = (over: Partial<Job & { org_id: string }> = {}): Job & { org_id: string } => ({
  id: ID, org_id: ORG, title: 'Barista', department: null, location: null,
  employment_type: 'full_time', status: 'draft', description: null,
  salary_min_cents: null, salary_max_cents: null, show_salary: false, closes_on: null,
  work_arrangement: null, headcount: 1, opened_at: null, closed_at: null,
  created_at: '2026-10-01T00:00:00Z', ...over,
});

/** An in-memory stand-in for the two tables the capabilities touch. */
function fake(rows: (Job & { org_id: string })[], applications: Record<string, number> = {}) {
  const writes: { op: string; values?: Record<string, unknown> }[] = [];
  const strip = ({ org_id: _org, ...rest }: Job & { org_id: string }) => rest as Job;
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const match = () => rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
      if (table === 'hire_applications') {
        const chain = {
          select: () => chain,
          eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
          then: (resolve: (v: unknown) => void) =>
            resolve({ count: applications[String(filters.job_id)] ?? 0, error: null }),
        };
        return chain;
      }
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let values: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        insert: (v: Record<string, unknown>) => { op = 'insert'; values = v; return chain; },
        update: (v: Record<string, unknown>) => { op = 'update'; values = v; return chain; },
        delete: () => { op = 'delete'; return chain; },
        eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
        maybeSingle: async () => ({ data: match()[0] ? strip(match()[0]) : null, error: null }),
        single: async () => {
          if (op === 'insert') {
            const row = { ...job(), ...values, id: ID } as Job & { org_id: string };
            rows.push(row);
            writes.push({ op, values });
            return { data: strip(row), error: null };
          }
          const target = match()[0];
          if (!target) return { data: null, error: { message: 'no rows' } };
          Object.assign(target, values);
          writes.push({ op, values });
          return { data: strip(target), error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (op === 'delete') {
            const target = match()[0];
            if (target) rows.splice(rows.indexOf(target), 1);
            writes.push({ op });
          }
          resolve({ error: null });
        },
      };
      return chain;
    },
  };
  const ctx = { client: client as never, orgId: ORG } satisfies HireWriteContext;
  return { ctx, rows, writes };
}

describe('createJob', () => {
  it('creates a draft in the caller\'s workspace, whatever the input says', async () => {
    const { ctx, writes } = fake([]);
    const result = await createJob(ctx, { title: '  Barista  ', org_id: OTHER_ORG, status: 'open' } as never, NOW);
    expect(result).toMatchObject({ ok: true, data: { title: 'Barista', status: 'draft', headcount: 1, show_salary: false } });
    expect(writes[0].values).toMatchObject({ org_id: ORG, status: 'draft', title: 'Barista' });
  });
  it('refuses an empty title, a long title and a headcount of zero', async () => {
    const { ctx, writes } = fake([]);
    for (const input of [{ title: ' ' }, { title: 'x'.repeat(121) }, { title: 'Barista', headcount: 0 }]) {
      expect((await createJob(ctx, input, NOW)).ok).toBe(false);
    }
    expect(writes).toHaveLength(0);
  });
  it('refuses a maximum salary below the minimum', async () => {
    const { ctx } = fake([]);
    const result = await createJob(ctx, { title: 'Barista', salary_min_cents: 300_000, salary_max_cents: 250_000 }, NOW);
    expect(result).toEqual({ ok: false, error: 'Maximum salary can\'t be lower than the minimum.' });
  });
  it('refuses a closing date in the past, by the date in Kuala Lumpur', async () => {
    const { ctx } = fake([]);
    expect((await createJob(ctx, { title: 'Barista', closes_on: '2026-10-10' }, NOW)).ok).toBe(false);
    expect((await createJob(ctx, { title: 'Barista', closes_on: '2026-10-11' }, NOW)).ok).toBe(true);
  });
});

describe('updateJob', () => {
  it('changes only the fields given and never the status', async () => {
    const { ctx, rows } = fake([job({ status: 'open', description: 'Make coffee.' })]);
    const result = await updateJob(ctx, { id: ID, location: 'Shah Alam', status: 'closed' } as never, NOW);
    expect(result).toMatchObject({ ok: true, data: { location: 'Shah Alam', status: 'open' } });
    expect(rows[0].title).toBe('Barista');
  });
  it('checks a new minimum against the stored maximum', async () => {
    const { ctx, writes } = fake([job({ salary_min_cents: 200_000, salary_max_cents: 300_000 })]);
    const result = await updateJob(ctx, { id: ID, salary_min_cents: 350_000 }, NOW);
    expect(result).toEqual({ ok: false, error: 'Maximum salary can\'t be lower than the minimum.' });
    expect(writes).toHaveLength(0);
  });
  it('will not clear the description of an open or paused job, but will for a draft or closed one', async () => {
    for (const status of ['open', 'paused'] as const) {
      const { ctx } = fake([job({ status, description: 'Make coffee.' })]);
      expect(await updateJob(ctx, { id: ID, description: '   ' }, NOW)).toEqual({ ok: false, error: JOB_NEEDS_DESCRIPTION });
    }
    for (const status of ['draft', 'closed'] as const) {
      const { ctx } = fake([job({ status, description: 'Make coffee.' })]);
      expect(await updateJob(ctx, { id: ID, description: '' }, NOW)).toMatchObject({ ok: true, data: { description: null } });
    }
  });
  it('cannot find a job in another workspace', async () => {
    const { ctx, writes } = fake([job({ org_id: OTHER_ORG })]);
    expect(await updateJob(ctx, { id: ID, title: 'Mine now' }, NOW)).toEqual({ ok: false, error: JOB_NOT_FOUND });
    expect(writes).toHaveLength(0);
  });
});

describe('setJobStatus', () => {
  const move = async (from: Job['status'], to: 'open' | 'paused' | 'closed', over: Partial<Job> = {}) => {
    const state = fake([job({ status: from, description: 'Make coffee.', ...over })]);
    return { result: await setJobStatus(state.ctx, { id: ID, status: to }, NOW), ...state };
  };
  it('allows exactly the listed moves', async () => {
    const allowed: [Job['status'], 'open' | 'paused' | 'closed'][] = [
      ['draft', 'open'], ['open', 'paused'], ['open', 'closed'], ['paused', 'open'], ['paused', 'closed'], ['closed', 'open'],
    ];
    for (const [from, to] of allowed) expect((await move(from, to)).result.ok, `${from}->${to}`).toBe(true);
    const refused: [Job['status'], 'open' | 'paused' | 'closed'][] = [['draft', 'paused'], ['draft', 'closed'], ['closed', 'paused']];
    for (const [from, to] of refused) {
      const { result, writes } = await move(from, to);
      expect(result.ok, `${from}->${to}`).toBe(false);
      expect(writes).toHaveLength(0);
    }
  });
  it('will not open a job with no description', async () => {
    const { result, writes } = await move('draft', 'open', { description: '  ' });
    expect(result).toEqual({ ok: false, error: JOB_NEEDS_DESCRIPTION });
    expect(writes).toHaveLength(0);
  });
  it('sets opened_at once, sets closed_at on close and clears it on reopen', async () => {
    const first = await move('draft', 'open');
    expect(first.rows[0].opened_at).toBe(NOW.toISOString());
    const reopened = await move('closed', 'open', { opened_at: '2026-09-01T00:00:00.000Z', closed_at: '2026-10-01T00:00:00.000Z' });
    expect(reopened.rows[0].opened_at).toBe('2026-09-01T00:00:00.000Z');
    expect(reopened.rows[0].closed_at).toBeNull();
    const closed = await move('open', 'closed');
    expect(closed.rows[0].closed_at).toBe(NOW.toISOString());
  });
  it('succeeds without writing when the job already has that status', async () => {
    const { result, writes } = await move('open', 'open');
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(0);
  });
  it('cannot find a job in another workspace', async () => {
    const { ctx } = fake([job({ org_id: OTHER_ORG, description: 'x' })]);
    expect(await setJobStatus(ctx, { id: ID, status: 'open' }, NOW)).toEqual({ ok: false, error: JOB_NOT_FOUND });
  });
});

describe('deleteJob', () => {
  it('deletes a job with no applications and says which', async () => {
    const { ctx, rows } = fake([job()]);
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: true, data: { id: ID, title: 'Barista' } });
    expect(rows).toHaveLength(0);
  });
  it('refuses a job with applications', async () => {
    const { ctx, rows } = fake([job()], { [ID]: 3 });
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: false, error: JOB_HAS_APPLICATIONS });
    expect(rows).toHaveLength(1);
  });
  it('cannot find a job in another workspace', async () => {
    const { ctx, rows } = fake([job({ org_id: OTHER_ORG })]);
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: false, error: JOB_NOT_FOUND });
    expect(rows).toHaveLength(1);
  });
});

describe('database failures', () => {
  it('logs the error and gives a generic line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'permission denied for table hire_jobs' } }) }) }) }),
    };
    const result = await createJob({ client: broken as never, orgId: ORG }, { title: 'Barista' }, NOW);
    expect(result).toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run tests/hire-capabilities.test.ts`
Expected: FAIL, cannot resolve `@/lib/hire/capabilities`.

- [ ] **Step 3: Write the capabilities**

```ts
// src/lib/hire/capabilities.ts
/**
 * The single write path for Lekir's hiring data. Each change is one Zod schema
 * and one function; the AI tool's inputSchema IS the schema and the server
 * action parses with it, so the two cannot accept different things. org_id
 * always comes from the HireWriteContext (the caller's session), never the input.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { JOB_COLUMNS, type Job, type JobStatus } from './types';

export type HireWriteContext = { client: SupabaseClient; orgId: string };
export type CapResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const JOB_NOT_FOUND = 'That job could not be found.';
export const JOB_HAS_APPLICATIONS = 'This job has applications. Close it instead.';
export const JOB_NEEDS_DESCRIPTION = 'Add a description before opening this job.';
const SALARY_RANGE = 'Maximum salary can\'t be lower than the minimum.';
const CLOSES_IN_PAST = 'The closing date can\'t be in the past.';
const WRITE_FAILED = 'That change could not be saved. Please try again.';

/** Logs the DB error for triage; callers only ever see the generic user-facing message. */
function writeFailed(fnName: string, error: unknown): { ok: false; error: string } {
  console.error(`[hire-capability] ${fnName} failed:`, error);
  return { ok: false, error: WRITE_FAILED };
}

const employmentType = z.enum(['full_time', 'part_time', 'contract', 'internship']);
const workArrangement = z.enum(['onsite', 'hybrid', 'remote']);
/**
 * Text that may be cleared. No transform here: these schemas are also the AI
 * tools' input schemas, and a transform cannot be turned into JSON Schema. A
 * blank value is turned into null by `blankToNull` in the functions below.
 */
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
/** '' becomes null; undefined ("not sent") stays undefined. */
const blankToNull = (value: string | null | undefined) => (value === undefined ? undefined : value ? value : null);
const cents = z.number().int().min(0).max(10_000_000_00).nullable().optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31.').nullable().optional();

const jobFields = {
  title: z.string().trim().min(1, 'Give the job a title.').max(120, 'Keep the title under 120 characters.')
    .describe('The job title, for example "Sales Executive".'),
  department: optionalText(80).describe('The department, for example "Sales".'),
  location: optionalText(120).describe('Where the job is based.'),
  employment_type: employmentType.describe('full_time, part_time, contract or internship.'),
  work_arrangement: workArrangement.nullable().optional().describe('onsite, hybrid or remote.'),
  description: optionalText(10_000).describe('The job description, as plain text.'),
  salary_min_cents: cents.describe('Lowest monthly salary in sen (RM 3,000 is 300000).'),
  salary_max_cents: cents.describe('Highest monthly salary in sen.'),
  show_salary: z.boolean().describe('Whether a public job page may show the salary range.'),
  closes_on: isoDate.describe('Last day to apply, as YYYY-MM-DD.'),
  headcount: z.number().int().min(1, 'Headcount must be at least 1.').max(999).describe('How many people to hire.'),
};

export const createJobInput = z.object({
  ...jobFields,
  employment_type: jobFields.employment_type.default('full_time'),
  show_salary: jobFields.show_salary.default(false),
  headcount: jobFields.headcount.default(1),
});
export const updateJobInput = z.object({
  id: z.string().uuid().describe('The job\'s id, from listJobs.'),
  title: jobFields.title.optional(),
  department: jobFields.department,
  location: jobFields.location,
  employment_type: jobFields.employment_type.optional(),
  work_arrangement: jobFields.work_arrangement,
  description: jobFields.description,
  salary_min_cents: jobFields.salary_min_cents,
  salary_max_cents: jobFields.salary_max_cents,
  show_salary: jobFields.show_salary.optional(),
  closes_on: jobFields.closes_on,
  headcount: jobFields.headcount.optional(),
});
export const setJobStatusInput = z.object({
  id: z.string().uuid().describe('The job\'s id, from listJobs.'),
  status: z.enum(['open', 'paused', 'closed']).describe('open, paused or closed.'),
});
export const deleteJobInput = z.object({ id: z.string().uuid().describe('The job\'s id, from listJobs.') });

/** Today's date in Kuala Lumpur, as YYYY-MM-DD. */
const klToday = (now: Date) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

/** The first message of a failed parse, written for the person who typed the input. */
function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? 'That input was not valid.' };
}

function ruleError(
  fields: Pick<Job, 'salary_min_cents' | 'salary_max_cents' | 'closes_on'>,
  now: Date,
  checkDate: boolean,
): string | null {
  const { salary_min_cents: min, salary_max_cents: max, closes_on } = fields;
  if (min !== null && max !== null && max < min) return SALARY_RANGE;
  if (checkDate && closes_on && closes_on < klToday(now)) return CLOSES_IN_PAST;
  return null;
}

async function findJob(ctx: HireWriteContext, id: string): Promise<Job | null> {
  const { data } = await ctx.client
    .from('hire_jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .maybeSingle();
  return (data as Job | null) ?? null;
}

export async function createJob(
  ctx: HireWriteContext,
  input: z.input<typeof createJobInput>,
  now: Date = new Date(),
): Promise<CapResult<Job>> {
  const parsed = createJobInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const values = {
    title: parsed.data.title,
    department: blankToNull(parsed.data.department) ?? null,
    location: blankToNull(parsed.data.location) ?? null,
    employment_type: parsed.data.employment_type,
    work_arrangement: parsed.data.work_arrangement ?? null,
    description: blankToNull(parsed.data.description) ?? null,
    salary_min_cents: parsed.data.salary_min_cents ?? null,
    salary_max_cents: parsed.data.salary_max_cents ?? null,
    show_salary: parsed.data.show_salary,
    closes_on: parsed.data.closes_on ?? null,
    headcount: parsed.data.headcount,
  };
  const broken = ruleError(values, now, true);
  if (broken) return { ok: false, error: broken };
  const { data, error } = await ctx.client
    .from('hire_jobs')
    // A new job is always a draft: nothing goes live without a deliberate open.
    .insert({ ...values, status: 'draft', org_id: ctx.orgId })
    .select(JOB_COLUMNS)
    .single();
  if (error || !data) return writeFailed('createJob', error);
  return { ok: true, data: data as unknown as Job };
}

export async function updateJob(
  ctx: HireWriteContext,
  input: z.input<typeof updateJobInput>,
  now: Date = new Date(),
): Promise<CapResult<Job>> {
  const parsed = updateJobInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...sent } = parsed.data;
  const given = {
    ...sent,
    department: blankToNull(sent.department),
    location: blankToNull(sent.location),
    description: blankToNull(sent.description),
  };
  const current = await findJob(ctx, id);
  if (!current) return { ok: false, error: JOB_NOT_FOUND };

  // Only the fields the caller sent; undefined means "leave as it is".
  const patch = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)) as Partial<Job>;
  const merged = { ...current, ...patch };
  // A stored closing date that has since passed is not this edit's mistake.
  const broken = ruleError(merged, now, 'closes_on' in patch);
  if (broken) return { ok: false, error: broken };
  if ((current.status === 'open' || current.status === 'paused') && !merged.description) {
    return { ok: false, error: JOB_NEEDS_DESCRIPTION };
  }
  if (Object.keys(patch).length === 0) return { ok: true, data: current };

  const { data, error } = await ctx.client
    .from('hire_jobs')
    .update(patch)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select(JOB_COLUMNS)
    .single();
  if (error || !data) return writeFailed('updateJob', error);
  return { ok: true, data: data as unknown as Job };
}

const MOVES: Record<JobStatus, JobStatus[]> = {
  draft: ['open'],
  open: ['paused', 'closed'],
  paused: ['open', 'closed'],
  closed: ['open'],
};
const STATUS_WORD: Record<JobStatus, string> = { draft: 'a draft', open: 'open', paused: 'paused', closed: 'closed' };

export async function setJobStatus(
  ctx: HireWriteContext,
  input: z.input<typeof setJobStatusInput>,
  now: Date = new Date(),
): Promise<CapResult<Job>> {
  const parsed = setJobStatusInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { id, status } = parsed.data;
  const current = await findJob(ctx, id);
  if (!current) return { ok: false, error: JOB_NOT_FOUND };
  if (current.status === status) return { ok: true, data: current };
  if (!MOVES[current.status].includes(status)) {
    const allowed = MOVES[current.status].join(' or ');
    return { ok: false, error: `This job is ${STATUS_WORD[current.status]}. It can only be moved to ${allowed}.` };
  }
  if (status === 'open' && !current.description?.trim()) return { ok: false, error: JOB_NEEDS_DESCRIPTION };

  const stamp = now.toISOString();
  const patch: Partial<Job> = { status };
  if (status === 'open') {
    patch.opened_at = current.opened_at ?? stamp;
    patch.closed_at = null;
  }
  if (status === 'closed') patch.closed_at = stamp;

  const { data, error } = await ctx.client
    .from('hire_jobs')
    .update(patch)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select(JOB_COLUMNS)
    .single();
  if (error || !data) return writeFailed('setJobStatus', error);
  return { ok: true, data: data as unknown as Job };
}

export async function deleteJob(
  ctx: HireWriteContext,
  input: z.input<typeof deleteJobInput>,
): Promise<CapResult<{ id: string; title: string }>> {
  const parsed = deleteJobInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const current = await findJob(ctx, parsed.data.id);
  if (!current) return { ok: false, error: JOB_NOT_FOUND };

  const { count, error: countError } = await ctx.client
    .from('hire_applications')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', ctx.orgId)
    .eq('job_id', current.id);
  if (countError) return writeFailed('deleteJob', countError);
  if ((count ?? 0) > 0) return { ok: false, error: JOB_HAS_APPLICATIONS };

  const { error } = await ctx.client.from('hire_jobs').delete().eq('id', current.id).eq('org_id', ctx.orgId);
  if (error) return writeFailed('deleteJob', error);
  return { ok: true, data: { id: current.id, title: current.title } };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/hire-capabilities.test.ts && pnpm exec tsc --noEmit`
Expected: PASS. Do not add a `.transform()` or `z.preprocess()` to any of the four input schemas: they are handed to the model as tool input schemas in Task 6, and only plain validators convert to JSON Schema. An empty string must be stored as `null` and `undefined` must mean "not sent"; `blankToNull` does that.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hire/capabilities.ts tests/hire-capabilities.test.ts
git commit -m "feat(hire): job capabilities — create, update, set status, delete"
```

---

### Task 4: Demo seed migration

**Files:**
- Create: `supabase/migrations/20261014090100_hire_jobs_demo_seed.sql`
- Modify: `tests/hire-jobs-migration.test.ts`

**Interfaces:**
- Consumes: the columns (Task 1); the values in `JOB_SEEDS`, `describeJob` and `workingTime` (Task 2).
- Produces: a replaced `private.reseed_demo_hire()`.

- [ ] **Step 1: Add the failing test**

Append to `tests/hire-jobs-migration.test.ts`:

```ts
const seed = read('20261014090100_hire_jobs_demo_seed.sql');
const previous = read('20261013090100_hire_demo_seed.sql');

describe('hire jobs demo seed migration', () => {
  test('replaces the reseed function and keeps it private', () => {
    expect(seed).toContain('create or replace function private.reseed_demo_hire()');
    expect(seed).toContain('security definer');
    expect(seed).toContain('revoke all on function private.reseed_demo_hire() from public, anon, authenticated');
    expect(seed).toContain('select private.reseed_demo_hire();');
  });
  test('deletes applications before jobs, so the delete guard never fires', () => {
    const apps = seed.indexOf('delete from public.hire_applications where org_id = demo');
    const jobs = seed.indexOf('delete from public.hire_jobs where org_id = demo');
    expect(apps).toBeGreaterThan(-1);
    expect(jobs).toBeGreaterThan(apps);
  });
  test('fills the new job fields', () => {
    for (const column of ['description', 'salary_min_cents', 'salary_max_cents', 'show_salary', 'closes_on', 'work_arrangement', 'headcount']) {
      expect(seed, column).toContain(column);
    }
    expect(seed.match(/, true,/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
  test('keeps the application arithmetic unchanged', () => {
    for (const line of ['(i * 37) % 248', '(i * 91) % 248', '(i * 53) % 248', 'generate_series(1, 248)', 'generate_series(1, 342)', '28 + k * 2']) {
      expect(seed, line).toContain(line);
      expect(previous, line).toContain(line);
    }
  });
  test('snaps interview times to working hours in Kuala Lumpur', () => {
    expect(seed).toContain("at time zone 'Asia/Kuala_Lumpur'");
    expect(seed).toMatch(/interval '9 hours'/);
    expect(seed).toMatch(/interval '17 hours'/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run tests/hire-jobs-migration.test.ts`
Expected: FAIL with `ENOENT` for the seed file.

- [ ] **Step 3: Write the migration**

Start from a copy of `supabase/migrations/20261013090100_hire_demo_seed.sql` and make exactly these changes; everything else (the `_hire_gen` temp table, the candidate and application inserts) stays byte for byte.

1. Header comment: "Demo-org hiring seed, slice 2a: jobs carry the new fields; interviews fall in working hours. Replaces the function from 20261013090100."
2. Deletes, in this order:

```sql
  -- Children first: hire_jobs has a delete guard for jobs that still have applications.
  delete from public.hire_interviews where org_id = demo;
  delete from public.hire_applications where org_id = demo;
  delete from public.hire_jobs where org_id = demo;
  delete from public.hire_candidates where org_id = demo;
```

3. The jobs insert gains the seven columns. Use one description expression for the eight non-draft jobs, mirroring `describeJob` in `seed.ts`:

```sql
  insert into public.hire_jobs
    (org_id, title, department, location, employment_type, status, opened_at, closed_at, created_at,
     work_arrangement, headcount, salary_min_cents, salary_max_cents, show_salary, closes_on, description)
  select demo, j.title, j.department, j.location, j.employment_type, j.status,
         case when j.opened_days is null then null else now() - make_interval(days => j.opened_days) end,
         case when j.closed_days is null then null else now() - make_interval(days => j.closed_days) end,
         now() - make_interval(days => coalesce(j.opened_days, 2)),
         j.work_arrangement, j.headcount, j.salary_min * 100, j.salary_max * 100, j.show_salary,
         case when j.closes_in is null then null
              else ((now() at time zone 'Asia/Kuala_Lumpur')::date + j.closes_in) end,
         case when j.status = 'draft' then null else
           'Rimba Ventures is hiring a ' || j.title || ' for our ' || j.department || E' team.\n\n' ||
           'You will own day-to-day ' || lower(j.department) || ' work, report to the head of ' || j.department ||
           E', and work closely with the rest of the company.\n\n' ||
           'We are looking for relevant experience, clear communication in Bahasa Malaysia and English, ' ||
           'and someone who finishes what they start.' end
  from (values
    ('Software Engineer','Engineering','Kuala Lumpur','full_time','open',   62, null::int, 'hybrid', 2, 5000, 8000, true,  21),
    ('Sales Executive','Sales','Petaling Jaya','full_time','open',          61, null,      'onsite', 3, 3000, 4500, true,  14),
    ('Account Manager','Sales','Shah Alam','full_time','open',              60, null,      'hybrid', 1, 4500, 6500, true,  null::int),
    ('Graphic Designer','Marketing','Kuala Lumpur','contract','open',       59, null,      'remote', 1, 3500, 5000, true,  28),
    ('Customer Support','Operations','Cyberjaya','part_time','open',        58, null,      'onsite', 2, 2200, 3000, false, null),
    ('Operations Executive','Operations','Klang','full_time','open',        57, null,      'onsite', 1, 3000, 4000, false, null),
    ('Content Writer','Marketing','Kuala Lumpur','contract','closed',       64, 4,         'remote', 1, null::int, null::int, false, null),
    ('Accountant','Finance','Subang Jaya','full_time','paused',             63, null,      'onsite', 1, 4000, 5500, false, null),
    ('Marketing Lead','Marketing','Kuala Lumpur','full_time','draft',       null, null,    'hybrid', 1, null, null, false, null)
  ) as j(title, department, location, employment_type, status, opened_days, closed_days,
         work_arrangement, headcount, salary_min, salary_max, show_salary, closes_in);
```

   Check each row against the table in Task 2 Step 5 and against `JOB_SEEDS` in `src/lib/hire/seed.ts`; the TypeScript is the reference.

4. The interviews insert replaces `now() + make_interval(hours => offsets[g.k - 3])` with a working-hours time. Define the raw time in a subquery and clamp it:

```sql
  insert into public.hire_interviews
    (org_id, application_id, scheduled_at, kind, interviewer_name, status, created_at)
  select
    demo, t.application_id,
    -- A scheduled interview that the clamp moved to before now goes to the next day.
    case when t.status = 'scheduled' and t.clamped <= now() then t.clamped + interval '1 day' else t.clamped end,
    t.kind, t.interviewer, t.status, now() - interval '6 days'
  from (
    select
      a.id as application_id,
      kinds[1 + (g.k - 4) % 3] as kind,
      interviewers[1 + (g.k - 4) % 4] as interviewer,
      case when g.k - 3 <= 6 then 'scheduled' when g.k - 3 <= 9 then 'completed' else 'no_show' end as status,
      (
        date_trunc('day', r.raw at time zone 'Asia/Kuala_Lumpur')
        + least(interval '17 hours', greatest(interval '9 hours',
            make_interval(mins => (round(
              (extract(hour from r.raw at time zone 'Asia/Kuala_Lumpur') * 60
               + extract(minute from r.raw at time zone 'Asia/Kuala_Lumpur')) / 30.0
            ) * 30)::int)))
      ) at time zone 'Asia/Kuala_Lumpur' as clamped
    from _hire_gen g
    join public.hire_candidates c on c.org_id = demo and c.email = 'calon' || g.i || '@demo.openkuasa.com'
    join public.hire_applications a on a.candidate_id = c.id
    cross join lateral (select now() + make_interval(hours => offsets[g.k - 3]) as raw) r
    where g.k between 4 and 13
  ) t;
```

5. Keep the `revoke` line and the final `select private.reseed_demo_hire();`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/hire-jobs-migration.test.ts tests/hire-migration.test.ts`
Expected: PASS. The slice 1 migration test still reads the slice 1 file, which is untouched.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261014090100_hire_jobs_demo_seed.sql tests/hire-jobs-migration.test.ts
git commit -m "feat(hire): demo seed fills the new job fields; interviews in working hours"
```

---

### Task 5: Server actions

**Files:**
- Create: `src/app/(app)/hire/actions.ts`
- Test: `tests/hire-actions.test.ts`

**Interfaces:**
- Consumes: the four capabilities and schemas (Task 3); `getViewer` from `@/lib/auth/viewer`; `can` from `@/lib/auth/permissions`; `createClient` from `@/lib/supabase/server`.
- Produces: `createJobAction(input: unknown)`, `updateJobAction`, `setJobStatusAction`, `deleteJobAction`, each returning the capability's `CapResult`.

- [ ] **Step 1: Write the failing test**

Model it on `tests/reach-actions.test.ts` (read it first for the mocking of `next/cache`, the viewer and the server client).

```ts
// tests/hire-actions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  viewer: { orgId: 'org1', role: 'member', isDemo: false } as { orgId: string; role: string; isDemo: boolean },
  revalidated: [] as string[],
  calls: [] as { fn: string; ctx: { orgId: string }; input: unknown }[],
}));

vi.mock('next/cache', () => ({ revalidatePath: (path: string) => ctl.revalidated.push(path) }));
vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => ctl.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ marker: 'client' }) }));
vi.mock('@/lib/hire/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hire/capabilities')>();
  const stub = (fn: string) => async (ctx: { orgId: string }, input: unknown) => {
    ctl.calls.push({ fn, ctx, input });
    return { ok: true, data: { id: 'j1', title: 'Barista' } };
  };
  return { ...actual, createJob: stub('createJob'), updateJob: stub('updateJob'), setJobStatus: stub('setJobStatus'), deleteJob: stub('deleteJob') };
});

const { createJobAction, updateJobAction, setJobStatusAction, deleteJobAction } = await import('@/app/(app)/hire/actions');
const ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  ctl.viewer = { orgId: 'org1', role: 'member', isDemo: false };
  ctl.revalidated = [];
  ctl.calls = [];
});

describe('hire job actions', () => {
  it('runs the capability with the viewer\'s workspace and refreshes the hiring screens', async () => {
    const result = await createJobAction({ title: 'Barista', org_id: 'someone-else' });
    expect(result.ok).toBe(true);
    expect(ctl.calls).toHaveLength(1);
    expect(ctl.calls[0]).toMatchObject({ fn: 'createJob', ctx: { orgId: 'org1' } });
    expect(ctl.revalidated.sort()).toEqual(['/hire/assistant', '/hire/careers-page', '/hire/dashboard', '/hire/jobs']);
  });
  it('refuses a viewer and a demo visitor without calling the capability', async () => {
    for (const viewer of [{ orgId: 'org1', role: 'viewer', isDemo: false }, { orgId: 'demo', role: 'viewer', isDemo: true }, { orgId: 'org1', role: 'owner', isDemo: true }]) {
      ctl.viewer = viewer;
      for (const run of [() => createJobAction({ title: 'x' }), () => updateJobAction({ id: ID }), () => setJobStatusAction({ id: ID, status: 'open' }), () => deleteJobAction({ id: ID })]) {
        expect(await run()).toEqual({ ok: false, error: 'You do not have permission to make changes here.' });
      }
    }
    expect(ctl.calls).toHaveLength(0);
    expect(ctl.revalidated).toHaveLength(0);
  });
  it('routes each action to its capability', async () => {
    await updateJobAction({ id: ID, title: 'Head Barista' });
    await setJobStatusAction({ id: ID, status: 'open' });
    await deleteJobAction({ id: ID });
    expect(ctl.calls.map((c) => c.fn)).toEqual(['updateJob', 'setJobStatus', 'deleteJob']);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run tests/hire-actions.test.ts`
Expected: FAIL, cannot resolve the actions module.

- [ ] **Step 3: Write the actions**

Read the server actions guide in `node_modules/next/dist/docs/` and `src/app/(app)/reach/actions.ts` first.

```ts
// src/app/(app)/hire/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import {
  type CapResult,
  type HireWriteContext,
  createJob,
  deleteJob,
  setJobStatus,
  updateJob,
} from '@/lib/hire/capabilities';
import { createClient } from '@/lib/supabase/server';

const FORBIDDEN: CapResult<never> = { ok: false, error: 'You do not have permission to make changes here.' };
/** Every screen that shows jobs or numbers worked out from them. */
const JOB_PATHS = ['/hire/jobs', '/hire/careers-page', '/hire/assistant', '/hire/dashboard'];

/** Resolve a write context after checking the viewer may edit data. */
async function writeCtx(): Promise<HireWriteContext | null> {
  const viewer = await getViewer();
  if (viewer.isDemo || !can(viewer.role, 'edit-data')) return null;
  return { client: await createClient(), orgId: viewer.orgId };
}

/** Guard → capability (which parses with its own schema) → revalidate. */
async function run<O>(fn: (ctx: HireWriteContext) => Promise<CapResult<O>>): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const result = await fn(ctx);
  if (result.ok) for (const path of JOB_PATHS) revalidatePath(path);
  return result;
}

export async function createJobAction(input: unknown) {
  return run((ctx) => createJob(ctx, input as never));
}
export async function updateJobAction(input: unknown) {
  return run((ctx) => updateJob(ctx, input as never));
}
export async function setJobStatusAction(input: unknown) {
  return run((ctx) => setJobStatus(ctx, input as never));
}
export async function deleteJobAction(input: unknown) {
  return run((ctx) => deleteJob(ctx, input as never));
}
```

The capabilities `safeParse` their input, so an untyped value from the client is safe to hand over.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/hire-actions.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/hire/actions.ts" tests/hire-actions.test.ts
git commit -m "feat(hire): server actions for job changes"
```

---

### Task 6: AI change tools, product wiring and approval titles

**Files:**
- Modify: `src/lib/ai/hire-tools.ts`, `src/lib/ai/products.ts`, `src/app/api/hire/chat/route.ts`, `src/app/api/chat/route.ts`, `evals/tuah/harness.ts`, `src/lib/chat/change-titles.ts`, `src/components/chat/tool-parts.ts` (only if a change tool needs a label there; change tools normally fall through to the approval title)
- Test: `tests/hire-tools.test.ts`, `tests/hire-chat-route.test.ts`, `tests/tuah-hire.test.ts`, `tests/hire-change-titles.test.ts` (new)

**Interfaces:**
- Consumes: capabilities and schemas (Task 3).
- Produces: `createHireTools(data, nowArg?, write?: { ctx: HireWriteContext; canWrite: boolean })`; `HIRE_WRITE_TOOL_NAMES = ['createJob', 'updateJob', 'setJobStatus', 'deleteJob'] as const` in `products.ts`; `HireAccess = { data: HireData; write?: { ctx: HireWriteContext; canWrite: boolean } }`; `ItemKind` includes `'job'`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/hire-tools.test.ts`:

```ts
import { createJobInput, deleteJobInput, setJobStatusInput, updateJobInput } from '@/lib/hire/capabilities';
import { HIRE_WRITE_TOOL_NAMES } from '@/lib/ai/products';

describe('hire change tools', () => {
  const ctx = { client: {} as never, orgId: 'org1' };
  it('are offered only to someone who may write', () => {
    const none = Object.keys(createHireTools(data, NOW));
    const viewer = Object.keys(createHireTools(data, NOW, { ctx, canWrite: false }));
    const member = Object.keys(createHireTools(data, NOW, { ctx, canWrite: true }));
    for (const name of HIRE_WRITE_TOOL_NAMES) {
      expect(none).not.toContain(name);
      expect(viewer).not.toContain(name);
      expect(member).toContain(name);
    }
    expect(HIRE_WRITE_TOOL_NAMES).toEqual(['createJob', 'updateJob', 'setJobStatus', 'deleteJob']);
  });
  it('take exactly the capability schemas as input', () => {
    const t = createHireTools(data, NOW, { ctx, canWrite: true }) as Record<string, { inputSchema: unknown }>;
    expect(t.createJob.inputSchema).toBe(createJobInput);
    expect(t.updateJob.inputSchema).toBe(updateJobInput);
    expect(t.setJobStatus.inputSchema).toBe(setJobStatusInput);
    expect(t.deleteJob.inputSchema).toBe(deleteJobInput);
  });
  it('lets listJobs hand the model an id and the new fields', async () => {
    const { jobs } = await run('listJobs')({ status: 'open' });
    expect(jobs[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), headcount: expect.any(Number), has_description: true });
    // The whole description of every job would be thousands of characters per lookup.
    expect(jobs[0]).not.toHaveProperty('description');
    expect(jobs[0].description_excerpt.length).toBeLessThanOrEqual(161);
    expect(jobs[0]).toHaveProperty('closes_on');
  });
});
```

Update the existing test "is exactly the eight lookups" so it compares `Object.keys(createHireTools(data, NOW))` (no write access) with `HIRE_TOOL_NAMES`, and make the no-tenant-input test loop over lookups and change tools alike.

Create `tests/hire-change-titles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { approvalDetail, approvalTitle, collectNames } from '@/lib/chat/change-titles';

const ID = '33333333-3333-4333-8333-333333333333';
const names = collectNames([{ tool: 'listJobs', output: { total: 1, jobs: [{ id: ID, name: 'Sales Executive' }] } }]);
const find = (id: unknown, kind?: string) => names[`${kind}:${id}`] ?? null;

describe('approval titles for jobs', () => {
  it('names a job from an earlier listJobs', () => {
    expect(names[`job:${ID}`]).toBe('Sales Executive');
  });
  it('says what will happen', () => {
    expect(approvalTitle('createJob', { title: 'Barista' }, find as never)).toBe('Create job “Barista” as a draft?');
    expect(approvalTitle('updateJob', { id: ID }, find as never)).toBe('Save changes to job “Sales Executive”?');
    expect(approvalTitle('setJobStatus', { id: ID, status: 'open' }, find as never)).toBe('Open job “Sales Executive”?');
    expect(approvalTitle('setJobStatus', { id: ID, status: 'paused' }, find as never)).toBe('Pause job “Sales Executive”?');
    expect(approvalTitle('setJobStatus', { id: ID, status: 'closed' }, find as never)).toBe('Close job “Sales Executive”?');
    expect(approvalTitle('deleteJob', { id: ID }, find as never)).toBe('Delete job “Sales Executive”?');
    expect(approvalTitle('deleteJob', { id: 'unknown' }, find as never)).toBe('Delete this job?');
  });
  it('warns that a delete cannot be undone', () => {
    expect(approvalDetail('deleteJob')).toBe('This cannot be undone.');
  });
});
```

In `tests/hire-chat-route.test.ts`, change the two tool-list assertions: a member's call must contain every `HIRE_TOOL_NAMES` and every `HIRE_WRITE_TOOL_NAMES`; a viewer's must contain the lookups and none of the write names. Keep the no-workspace test (no org → no write tools).

In `tests/tuah-hire.test.ts`, add: in team mode with a writer's `hire` access, Tuah's own tools contain `askLekir` and `applyChange` and none of `HIRE_WRITE_TOOL_NAMES`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run tests/hire-tools.test.ts tests/hire-change-titles.test.ts tests/hire-chat-route.test.ts tests/tuah-hire.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the change tools**

In `src/lib/ai/hire-tools.ts`:

- Update the header comment: it now has change tools for jobs, each of which only runs after approval.
- Import the capabilities: `import { type HireWriteContext, createJob, createJobInput, deleteJob, deleteJobInput, setJobStatus, setJobStatusInput, updateJob, updateJobInput } from '@/lib/hire/capabilities';`
- Change the signature and the return so lookups and changes are built separately:

```ts
export function createHireTools(
  data: HireData,
  nowArg: Date | (() => Date) = () => new Date(),
  write?: { ctx: HireWriteContext; canWrite: boolean },
): ToolSet {
  const now = typeof nowArg === 'function' ? nowArg : () => nowArg;
  const read: ToolSet = { /* the eight existing lookups, unchanged except listJobs below */ };
  if (!write?.canWrite) return read;
  const { ctx } = write;
  // The approval titles learn a row's name from a `name` field; a job has `title`.
  const named = (result: CapResult<Job>) =>
    result.ok ? { ...result, data: { ...result.data, name: result.data.title } } : result;
  return {
    ...read,
    createJob: tool({
      description:
        'Create a job opening. It is always created as a draft: nothing is open until it is opened. ' +
        'Only a title is needed; give the description when you have one.',
      inputSchema: createJobInput,
      execute: async (input) => named(await createJob(ctx, input, now())),
    }),
    updateJob: tool({
      description: 'Change a job\'s details. Send only the fields that change. Does not change its status.',
      inputSchema: updateJobInput,
      execute: async (input) => named(await updateJob(ctx, input, now())),
    }),
    setJobStatus: tool({
      description:
        'Open, pause or close a job. A draft can be opened; an open job paused or closed; a paused job ' +
        'opened or closed; a closed job reopened. Opening needs a description.',
      inputSchema: setJobStatusInput,
      execute: async (input) => named(await setJobStatus(ctx, input, now())),
    }),
    deleteJob: tool({
      description: 'Delete a job for good. Only a job with no applications can be deleted; otherwise close it.',
      inputSchema: deleteJobInput,
      execute: async (input) => deleteJob(ctx, input),
    }),
  };
}
```

- `listJobs` rows gain: `id: job.id`, `name: job.title` (the field the approval titles read), `has_description: boolean`, `description_excerpt` (the first 160 characters, with `…` added when cut; `null` when there is none), `work_arrangement`, `headcount`, `salary_min_cents`, `salary_max_cents`, `show_salary`, `closes_on`. Keep `title`. Do not return the full description: up to 50 jobs of up to 10,000 characters each would go to the model on every lookup. Extend the tool's description: "Each job has an id to pass to a change tool, and says whether it has a description yet."

- [ ] **Step 4: Wire the product**

In `src/lib/ai/products.ts`:

```ts
import type { HireWriteContext } from '@/lib/hire/capabilities';

/** The hiring data an agent reads, and whether this caller may change it. */
export type HireAccess = {
  data: HireData;
  write?: { ctx: HireWriteContext; canWrite: boolean };
};

/** Hiring tools that change data. */
export const HIRE_WRITE_TOOL_NAMES = ['createJob', 'updateJob', 'setJobStatus', 'deleteJob'] as const;
```

and `hireProduct` passes it through: `split(createHireTools(hire.data, () => new Date(), hire.write), HIRE_WRITE_TOOL_NAMES)`.

- [ ] **Step 5: Pass write access from the routes**

In `src/app/api/hire/chat/route.ts`:

```ts
  const org = hasSupabaseEnv() ? await getCurrentOrg(chat.supabase) : null;
  const data = await getHireData(chat.supabase);
  // Only a non-viewer member gets change tools (and each still needs approval).
  const write =
    org && org.role !== 'viewer'
      ? { ctx: { client: chat.supabase, orgId: org.orgId }, canWrite: true }
      : undefined;
  const result = runLekir(chat.messages, { data, write }, request.signal, chat.apiKey);
```

with the two imports the reach route uses (`getCurrentOrg`, `hasSupabaseEnv`), and the header comment updated. In `src/app/api/chat/route.ts` build `hire` the same way from the `org` it already resolves. In `evals/tuah/harness.ts` pass `write` for the eval workspace the way the harness passes reach's.

In `src/lib/ai/agents/orchestrator.ts` update the comment on `runTuah`'s `hire` parameter (no longer "Lookups only") and `runLekir`'s doc comment.

- [ ] **Step 6: Approval titles**

In `src/lib/chat/change-titles.ts`:

- Add `| 'job'` to `ItemKind`.
- Add to `KIND_OF_TOOL`: `listJobs: 'job', createJob: 'job', updateJob: 'job', setJobStatus: 'job', deleteJob: 'job',`.
- Add to `approvalTitle`'s switch:

```ts
    case 'createJob': return `Create job “${i.title ?? ''}” as a draft?`;
    case 'updateJob': return `Save changes to ${the('job', 'job')}?`;
    case 'setJobStatus':
      return i.status === 'open'
        ? `Open ${the('job', 'job')}?`
        : i.status === 'paused'
          ? `Pause ${the('job', 'job')}?`
          : `Close ${the('job', 'job')}?`;
    case 'deleteJob': return `Delete ${the('job', 'job')}?`;
```

- Add `toolName === 'deleteJob'` to the list in `approvalDetail` that returns `'This cannot be undone.'`.

A created or updated job's result has `title`, not `name`, so `gather` would not learn it; that is what `named()` in Step 3 is for. Import the `CapResult` and `Job` types into `hire-tools.ts` for it.

`approvalDetail` takes only the tool name today, so the spec's "changed fields as the detail line" for an edit needs the input too. Add an optional second parameter, `approvalDetail(toolName: string, input?: unknown)`, and for `updateJob` return `Changes: ` followed by the changed fields in words, from the keys of the input other than `id` (`title` → "title", `department` → "department", `location` → "location", `employment_type` → "employment type", `work_arrangement` → "work arrangement", `description` → "description", `salary_min_cents` or `salary_max_cents` → "salary" once, `show_salary` → "salary visibility", `closes_on` → "closing date", `headcount` → "headcount"), in that order, joined with commas; `null` when there are none. Find the callers of `approvalDetail` (`grep -rn "approvalDetail(" src`) and pass the tool's input where it is to hand; a caller that has no input keeps working. Add to `tests/hire-change-titles.test.ts`:

```ts
  it('lists what an edit changes', () => {
    expect(approvalDetail('updateJob', { id: ID, title: 'x', salary_min_cents: 1, salary_max_cents: 2, closes_on: null }))
      .toBe('Changes: title, salary, closing date');
    expect(approvalDetail('updateJob', { id: ID })).toBeNull();
  });
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run tests/hire-tools.test.ts tests/hire-change-titles.test.ts tests/hire-chat-route.test.ts tests/tuah-hire.test.ts tests/tuah-team.test.ts tests/reach-approval.test.ts tests/crm-approval.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/hire-tools.ts src/lib/ai/products.ts src/lib/ai/agents/orchestrator.ts src/app/api/hire/chat/route.ts src/app/api/chat/route.ts evals/tuah/harness.ts src/lib/chat/change-titles.ts tests/
git commit -m "feat(hire): Lekir can change jobs behind approval — four tools, titles, write access"
```

---

### Task 7: Prompts

**Files:**
- Modify: `src/lib/ai/agents/prompts.ts`, `src/lib/ai/agents/orchestrator.ts` (`TEAM_AREA.hire`), `evals/tuah/cases.ts`
- Test: `tests/lekir-prompt.test.ts`, `tests/tuah-hire.test.ts`

**Interfaces:**
- Consumes: `HIRE_WRITE_TOOL_NAMES` (Task 6).

- [ ] **Step 1: Change the tests first**

In `tests/lekir-prompt.test.ts`, replace the test "is honest that it cannot change anything yet…" with:

```ts
  it('says what it can change, in step with the change tools it holds', () => {
    expect(t).toContain('create, edit, open, pause, close, reopen or delete jobs');
    // A change tool for something else means this line has to grow with it.
    expect([...HIRE_WRITE_TOOL_NAMES].every((name) => /Job(Status)?$/.test(name))).toBe(true);
    expect(HIRE_WRITE_TOOL_NAMES.length).toBeGreaterThan(0);
  });
  it('still cannot change candidates, applications or interviews', () => {
    expect(t).toContain('you cannot change candidates, applications or interviews yet');
  });
  it('calls the change tool at once instead of asking to confirm in words', () => {
    expect(t).toContain('call the change tool straight away');
    expect(t).toContain('never ask "are you sure?"');
  });
  it('gets an id from a listing instead of asking the owner', () => {
    expect(t).toContain('get its id');
    expect(t).toContain('never ask the owner for an id');
  });
  it('reports an executed change as done, not still waiting', () => {
    expect(t).toContain('already approved it');
    expect(t).toContain('past tense');
  });
  it('knows the three job rules', () => {
    expect(t).toContain('a new job is always a draft');
    expect(t).toContain('needs a description before it can be opened');
    expect(t).toContain('a job with applications cannot be deleted');
  });
  it('treats a rejected change as the owner\'s choice', () => {
    expect(t).toContain('it is never a permissions problem');
  });
```

In `tests/tuah-hire.test.ts`, replace the test "says hiring cannot be changed yet" with:

```ts
  it('says jobs can be changed and the rest of hiring cannot yet', () => {
    for (const prompt of [TUAH_SYSTEM, tuahTeamSystem([{ name: 'Lekir', area: 'hiring' }], true, null)]) {
      const p = prompt.toLowerCase();
      expect(p).not.toContain('hiring cannot be changed yet');
      expect(p).toContain('candidates, applications and interviews cannot be changed yet');
    }
    expect(TUAH_SYSTEM.toLowerCase()).toContain('create, edit, open, pause, close, reopen or delete jobs');
  });
  it('gives the hiring specialist the job rules in prepare mode', () => {
    const lekir = subAgentSystem('hire', true).toLowerCase();
    expect(lekir).toContain('a new job is always a draft');
    expect(lekir).toContain('a job with applications cannot be deleted');
    expect(lekir).not.toContain('you can only look things up');
  });
```

Run: `pnpm vitest run tests/lekir-prompt.test.ts tests/tuah-hire.test.ts`
Expected: FAIL.

- [ ] **Step 2: `LEKIR_SYSTEM`**

Replace the bullet that begins `- You can look things up, but you cannot change anything yet:` with these bullets, word for word:

```
- You can look things up and you can change jobs: create, edit, open, pause, close, reopen or delete jobs. Every change needs the owner's approval first: it appears as a confirmation card they tap to approve or reject. Never claim a change is done before it is approved. If the user is only a viewer, you cannot make changes; say so and point them to the Jobs screen.
- You cannot change candidates, applications or interviews yet: you cannot add or move a candidate, reject an application, or book, move or cancel an interview. If asked, say plainly that you cannot do that yet and name the screen where they can see it (Candidates, Applications or Interviews).
- When the owner asks for a job change, call the change tool straight away with what they gave you. Calling the tool does not make the change: it is what puts the confirmation card on their screen, and the card only exists once you call the tool. So never ask "are you sure?" or ask them to confirm in words first, and never tell them to tap or approve something before you have called the tool. Ask a question first only when something the tool requires is missing.
- If a change comes back as not approved or denied, the owner tapped Reject: they chose not to make it. Say in one line that nothing was changed and offer to adjust it. It is never a permissions problem, so do not mention access, admins or permissions.
- To change a specific job, first list it with listJobs to get its id, then pass that id to the change tool. Never ask the owner for an id.
- Once a change tool has run and returned its result, the owner has already approved it — report the change as done, in the past tense (for example "Dah tutup job tu"), and say briefly what changed. If the result has "ok": false, the change was not made: tell the owner what the error says and how to fix it.
- A new job is always a draft. When you create one, say it is a draft and offer to open it. When the owner asks you to post a job you have just drafted, create it with that description, as a draft.
- A job needs a description before it can be opened. If it has none, offer to draft one.
- A job with applications cannot be deleted. Offer to close it instead.
- Salary is monthly and in sen in the tools: RM 3,000 is 300000. Say amounts to the owner in Ringgit.
```

- [ ] **Step 3: The specialist rule**

In `SPECIALIST_RULES.hire.rules`, replace the first rule (`'You can only look things up. …'`) with:

```ts
      'You can prepare changes to jobs: create, edit, open, pause, close, reopen or delete. Candidates, applications and interviews cannot be changed yet: if the task asks for that, report that it cannot be done yet.',
      'A new job is always a draft: report it as a draft. A job needs a description before it can be opened. A job with applications cannot be deleted: report that it should be closed instead.',
      'Salary is monthly and in sen in the tools: RM 3,000 is 300000.',
```

- [ ] **Step 4: The Tuah prompts and the team area**

In `TUAH_SYSTEM`, replace the bullet `- Hiring cannot be changed yet: …` with:

```
- You can make changes to jobs in Lekir: create, edit, open, pause, close, reopen or delete jobs. A new job is always a draft. A job needs a description before it can be opened, and a job with applications cannot be deleted, only closed. Candidates, applications and interviews cannot be changed yet: say so and point to the screen.
```

In `tuahTeamSystem`, replace the bullet `- Hiring cannot be changed yet: Lekir can look things up, …` with:

```
- Lekir can prepare changes to jobs: create, edit, open, pause, close, reopen or delete. Candidates, applications and interviews cannot be changed yet: say so and point to the screen.
```

In `orchestrator.ts`, `TEAM_AREA.hire` becomes:

```ts
  hire: 'hiring: job openings (finding, creating, editing, opening, pausing, closing and deleting them), candidates and their applications, the hiring funnel, interviews, the talent pool and time to hire. Existing staff, leave and payroll are not hiring',
```

and `AREA.hire` in `specialists.ts` becomes `'hiring (jobs, candidates, applications, the hiring funnel, interviews, the talent pool)'` unchanged unless it says lookups only.

- [ ] **Step 5: One question-set case**

In `evals/tuah/cases.ts`, add before `hiring-lookup-empty`. Read two existing change cases (`create-campaign`, `add-contact`) first and use the same harness calls (`ask`, `decide(true)`, a database check, cleanup by the eval tag):

```ts
  {
    id: 'create-job',
    about: 'Creates a job through Lekir as a draft, after approval',
    run: async (ws) => {
      const title = `Barista ${EVAL_TAG} ${tag()}`;
      const chat = new Conversation(ws);
      const turn = await chat.ask(`Create a job opening called "${title}" in the Operations department.`);
      const pending = turn.pending.length;
      const done = pending > 0 ? await chat.decide(true) : turn;
      const { data } = await ws.client.from('hire_jobs').select('id,status,department').eq('org_id', ws.orgId).eq('title', title);
      const rows = data ?? [];
      return [
        check('asked Lekir', turn.asked.includes('Lekir'), `asked: ${turn.asked.join(', ') || 'nobody'}`),
        check('put one change up for approval', pending === 1, `pending: ${pending}`),
        check('the job exists once', rows.length === 1, `rows: ${rows.length}`),
        check('it is a draft', rows[0]?.status === 'draft', String(rows[0]?.status)),
        check('says it is a draft', /draft/i.test(done.text), done.text),
      ];
    },
  },
```

Add `hire_jobs` rows whose title contains the eval tag to the harness's cleanup (`cleanUp` in `evals/tuah/harness.ts`), following how it removes tagged campaigns. Do not run the question set.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run tests/lekir-prompt.test.ts tests/tuah-hire.test.ts tests/tuah-prompt.test.ts tests/tuah-team.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/agents/prompts.ts src/lib/ai/agents/orchestrator.ts src/lib/ai/agents/specialists.ts evals/tuah/cases.ts evals/tuah/harness.ts tests/lekir-prompt.test.ts tests/tuah-hire.test.ts
git commit -m "feat(hire): Lekir and Tuah prompts say jobs can be changed, and the rules for doing it"
```

---

### Task 8: Jobs screen and the Careers Page publish action

**Files:**
- Create: `src/screens/hire/jobs-table.tsx`, `src/lib/hire/job-form.ts`
- Modify: `src/lib/hire/lists.ts`, `src/screens/hire/jobs.tsx`, `src/screens/hire/careers-page.tsx`
- Test: `tests/hire-job-form.test.ts`, `tests/hire-lists.test.ts` (extend)

**Interfaces:**
- Consumes: the four actions (Task 5); `Job`, `JobStatus`, `WorkArrangement`, `EmploymentType`; `getViewer`, `can`.
- Produces: `JobsModel.rows` with the full job and its allowed moves; `JobsTable({ rows, canEdit })`; pure form helpers in `job-form.ts`.

Read first: `src/components/reach/ad-studio-table.tsx` in full (the pattern: client table, `radix-ui` `Dialog` for the form, `useTransition`, an `act` helper, an inline delete confirm), `src/screens/reach/ad-studio.tsx` (how the server screen computes `canEdit` and passes rows), and section 7.2 of the spec.

- [ ] **Step 1: Pure form helpers, test first**

The form's conversions and validation are pure functions so they can be tested without a browser.

```ts
// tests/hire-job-form.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_JOB_FORM, allowedMoves, formErrors, fromJob, toInput } from '@/lib/hire/job-form';
import type { Job } from '@/lib/hire/types';

const TODAY = '2026-10-11';
const job: Job = {
  id: 'j1', title: 'Barista', department: 'Operations', location: 'Shah Alam', employment_type: 'part_time',
  status: 'open', description: 'Make coffee.', salary_min_cents: 220_000, salary_max_cents: 300_000,
  show_salary: true, closes_on: '2026-10-31', work_arrangement: 'onsite', headcount: 2,
  opened_at: null, closed_at: null, created_at: '2026-10-01T00:00:00Z',
};

describe('job form helpers', () => {
  it('turns a job into form text and back without loss', () => {
    const form = fromJob(job);
    expect(form).toMatchObject({ title: 'Barista', salaryMin: '2200', salaryMax: '3000', headcount: '2', closesOn: '2026-10-31' });
    expect(toInput(form)).toEqual({
      title: 'Barista', department: 'Operations', location: 'Shah Alam', employment_type: 'part_time',
      work_arrangement: 'onsite', description: 'Make coffee.', salary_min_cents: 220_000,
      salary_max_cents: 300_000, show_salary: true, closes_on: '2026-10-31', headcount: 2,
    });
  });
  it('sends blanks as null so a field can be cleared', () => {
    expect(toInput({ ...EMPTY_JOB_FORM, title: 'Barista' })).toMatchObject({
      department: null, location: null, description: null, salary_min_cents: null, salary_max_cents: null,
      closes_on: null, work_arrangement: null, headcount: 1,
    });
  });
  it('reads ringgit typed with commas or decimals', () => {
    expect(toInput({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: '3,500', salaryMax: '4500.50' })).toMatchObject({
      salary_min_cents: 350_000, salary_max_cents: 450_050,
    });
  });
  it('finds each field error and says how to fix it', () => {
    expect(formErrors({ ...EMPTY_JOB_FORM }, TODAY)).toEqual({ title: 'Give the job a title.' });
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x'.repeat(121) }, TODAY).title).toBe('Keep the title under 120 characters.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: 'abc' }, TODAY).salaryMin).toBe('Enter an amount in ringgit, for example 3500.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: '4000', salaryMax: '3000' }, TODAY).salaryMax).toBe('Maximum salary can\'t be lower than the minimum.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', headcount: '0' }, TODAY).headcount).toBe('Headcount must be at least 1.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', closesOn: '2026-10-10' }, TODAY).closesOn).toBe('The closing date can\'t be in the past.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', closesOn: TODAY }, TODAY)).toEqual({});
  });
  it('lists the status moves each status allows, with the button wording', () => {
    expect(allowedMoves('draft')).toEqual([{ to: 'open', label: 'Open' }]);
    expect(allowedMoves('open')).toEqual([{ to: 'paused', label: 'Pause' }, { to: 'closed', label: 'Close' }]);
    expect(allowedMoves('paused')).toEqual([{ to: 'open', label: 'Reopen' }, { to: 'closed', label: 'Close' }]);
    expect(allowedMoves('closed')).toEqual([{ to: 'open', label: 'Reopen' }]);
  });
});
```

Run: `pnpm vitest run tests/hire-job-form.test.ts` — expected FAIL (no module).

```ts
// src/lib/hire/job-form.ts
/**
 * The job form's text values, and the conversions between them and a job.
 * Pure, so the rules are tested without a browser. The capability checks the
 * same rules again on the server.
 */
import type { EmploymentType, Job, JobStatus, WorkArrangement } from './types';

export type JobFormValues = {
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  workArrangement: WorkArrangement | '';
  headcount: string;
  description: string;
  /** Whole ringgit, as typed. */
  salaryMin: string;
  salaryMax: string;
  showSalary: boolean;
  /** YYYY-MM-DD, or '' for none. */
  closesOn: string;
};

export const EMPTY_JOB_FORM: JobFormValues = {
  title: '', department: '', location: '', employmentType: 'full_time', workArrangement: '',
  headcount: '1', description: '', salaryMin: '', salaryMax: '', showSalary: false, closesOn: '',
};

const ringgit = (cents: number | null) => (cents === null ? '' : String(cents / 100));

export function fromJob(job: Job): JobFormValues {
  return {
    title: job.title,
    department: job.department ?? '',
    location: job.location ?? '',
    employmentType: job.employment_type,
    workArrangement: job.work_arrangement ?? '',
    headcount: String(job.headcount),
    description: job.description ?? '',
    salaryMin: ringgit(job.salary_min_cents),
    salaryMax: ringgit(job.salary_max_cents),
    showSalary: job.show_salary,
    closesOn: job.closes_on ?? '',
  };
}

/** Ringgit as typed ("3,500", "4500.50") to sen; null for blank; NaN for anything else. */
function toCents(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (clean === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Math.round(Number(clean) * 100) : Number.NaN;
}

const blank = (text: string) => (text.trim() === '' ? null : text.trim());

/** What the create and update capabilities take. */
export function toInput(form: JobFormValues) {
  return {
    title: form.title.trim(),
    department: blank(form.department),
    location: blank(form.location),
    employment_type: form.employmentType,
    work_arrangement: form.workArrangement === '' ? null : form.workArrangement,
    description: blank(form.description),
    salary_min_cents: toCents(form.salaryMin),
    salary_max_cents: toCents(form.salaryMax),
    show_salary: form.showSalary,
    closes_on: form.closesOn === '' ? null : form.closesOn,
    headcount: Number.parseInt(form.headcount, 10) || 0,
  };
}

export type JobFormErrors = Partial<Record<keyof JobFormValues, string>>;

/** Every field that is wrong, with what to do about it. `today` is YYYY-MM-DD in Kuala Lumpur. */
export function formErrors(form: JobFormValues, today: string): JobFormErrors {
  const errors: JobFormErrors = {};
  const title = form.title.trim();
  if (title === '') errors.title = 'Give the job a title.';
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.';
  if (form.description.trim().length > 10_000) errors.description = 'Keep the description under 10,000 characters.';
  const min = toCents(form.salaryMin);
  const max = toCents(form.salaryMax);
  const amount = 'Enter an amount in ringgit, for example 3500.';
  if (Number.isNaN(min)) errors.salaryMin = amount;
  if (Number.isNaN(max)) errors.salaryMax = amount;
  if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) {
    errors.salaryMax = 'Maximum salary can\'t be lower than the minimum.';
  }
  const headcount = Number(form.headcount);
  if (!Number.isInteger(headcount) || headcount < 1) errors.headcount = 'Headcount must be at least 1.';
  if (form.closesOn !== '' && form.closesOn < today) errors.closesOn = 'The closing date can\'t be in the past.';
  return errors;
}

/** The status buttons a job's row offers, in order. */
export function allowedMoves(status: JobStatus): { to: 'open' | 'paused' | 'closed'; label: string }[] {
  switch (status) {
    case 'draft': return [{ to: 'open', label: 'Open' }];
    case 'open': return [{ to: 'paused', label: 'Pause' }, { to: 'closed', label: 'Close' }];
    case 'paused': return [{ to: 'open', label: 'Reopen' }, { to: 'closed', label: 'Close' }];
    case 'closed': return [{ to: 'open', label: 'Reopen' }];
  }
}
```

Run the test: PASS.

- [ ] **Step 2: The model carries the job**

In `src/lib/hire/lists.ts`, `JobsModel.rows` gains `job: Job` (the full row, for the edit form) and the builder adds `job`. `CareersModel.rows` gains `id: string` and `jobStatus: JobStatus`. Add to `tests/hire-lists.test.ts`:

```ts
  it('carries the whole job for editing, and ids for the careers actions', async () => {
    const jobs = await buildJobsModel(data, NOW);
    expect(jobs.rows[0].job).toMatchObject({ id: jobs.rows[0].id, title: jobs.rows[0].title });
    const careers = await buildCareersModel(data);
    expect(careers.rows.every((r) => typeof r.id === 'string' && typeof r.jobStatus === 'string')).toBe(true);
  });
```

- [ ] **Step 3: The client table**

Create `src/screens/hire/jobs-table.tsx`, a client component modelled on `AdStudioTable`. Requirements, all from section 7.2 of the spec:

```tsx
'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { AlertDialog, Dialog } from 'radix-ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createJobAction,
  deleteJobAction,
  setJobStatusAction,
  updateJobAction,
} from '@/app/(app)/hire/actions';
import {
  EMPTY_JOB_FORM,
  allowedMoves,
  formErrors,
  fromJob,
  toInput,
  type JobFormErrors,
  type JobFormValues,
} from '@/lib/hire/job-form';
import type { JobsModel } from '@/lib/hire/lists';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Row = JobsModel['rows'][number];
type ActionResult = { ok: boolean; error?: string };
```

Behaviour to implement (write the component in full; these are its acceptance rules, each checked by the reviewer against the file):

1. **Props:** `{ rows: Row[]; canEdit: boolean; today: string }` (`today` is the Kuala Lumpur date from the server screen, so server and client agree).
2. **State:** `editing: Row | null`, `creating: boolean`, `deleting: Row | null`, `error: string | null`, `notice: string | null`, and `const [pending, start] = useTransition()`.
3. **`act(promise, onOk)`:** as in `AdStudioTable`: awaits inside `start`, sets `error` from a failed result, runs `onOk` on success. Every button that triggers an action is `disabled={pending}`, which is what stops a double submit.
4. **"Post a Job" button** (only when `canEdit`) above the table opens the form dialog empty. When `!canEdit` nothing is rendered in its place.
5. **Table:** the same columns the screen has today (Role, Department, Applicants, Status, Posted) plus an Actions column when `canEdit`. Under the role name, one muted line: arrangement and headcount (`Hybrid · 2 openings`, or just `1 opening`). The status pill keeps its word; reuse the pill classes passed in or copy the `PILL` map from `jobs.tsx` into this file and delete it there.
6. **Row actions**, each a `Button` with `variant="ghost" size="sm"`, at least 44 pixels of hit area (`min-h-11 min-w-11` or padding to match), and an accessible name that includes the job: Edit (`aria-label={`Edit ${row.title}`}`), one button per `allowedMoves(row.job.status)` with its label and `aria-label={`${label} ${row.title}`}`, and Delete. Delete is `disabled` when `row.applicants > 0`, with `title="This job has applications. Close it instead."` and the same sentence in a visually hidden span tied by `aria-describedby`.
7. **Status moves** call `setJobStatusAction({ id, status })` through `act`; on success set `notice` to `` `${row.title} is now ${word}.` ``. A refusal (for example opening without a description) shows in the alert region above the table.
8. **Delete confirm:** a `radix-ui` `AlertDialog` (it traps focus, closes on Escape, restores focus). Title `Delete “{title}”?`, description "This can't be undone.", Cancel focused first (`AlertDialog.Cancel` gets `autoFocus`), the confirm button in the destructive variant and separated from Cancel. Confirm calls `deleteJobAction({ id })`.
9. **Form dialog:** a `radix-ui` `Dialog` with `Dialog.Title` ("Post a job" or "Edit job") and a `Dialog.Description`. Inside, a `JobForm` keyed by `editing?.id ?? 'new'` so it resets between jobs.
10. **`JobForm`:** controlled inputs over `JobFormValues` (`fromJob(row.job)` or `EMPTY_JOB_FORM`). Three `<fieldset>`s with `<legend>`s "Role", "Where", "Details". Every input has a `<Label htmlFor>`; ids come from `useId()`. Title is marked required with an asterisk and `aria-required`, and a line at the top says "* Required". Native `<select>` elements styled with `SELECT_CLASS` from `@/screens/crm/crm-form` for employment type (Full-time, Part-time, Contract, Internship) and work arrangement (Not set, On-site, Hybrid, Remote). Headcount and salary use `inputMode="numeric"`; closing date is `type="date"` with `min={today}`. Salary min and max sit side by side, each with "RM" before and "a month" after as text, and helper text under the pair: "Leave blank if you'd rather not say." "Show salary publicly" is a `Checkbox` with a label. The description is a `Textarea` of at least six rows.
11. **Validation:** `errors` state holds `JobFormErrors`. On blur of a field, recompute `formErrors(values, today)` and show only that field's error (track touched fields). On submit, compute all errors; if any, mark all touched, do not call the action, and focus the first invalid input (keep a `ref` map by field name, in field order). Each error renders directly under its input as `<p id={…} role="alert" className="text-sm text-destructive">` and the input gets `aria-invalid` and `aria-describedby` pointing at it.
12. **Submit:** `onSubmit(toInput(values))` → `createJobAction(input)` or `updateJobAction({ id, ...input })`. The Save button reads "Save" / "Saving…" and is `disabled={pending}`. A server refusal shows at the top of the dialog in an alert; the dialog stays open with the values kept. On success the dialog closes and `notice` becomes "Job saved as a draft." (create) or "Changes saved." (edit).
13. **Unsaved changes:** if the values differ from the initial ones, closing the dialog (Cancel, Escape, clicking outside) first shows an `AlertDialog`: "Discard your changes?" with "Keep editing" (focused) and "Discard".
14. **Notice region:** `<p aria-live="polite" className="sr-only sm:not-sr-only …">{notice}</p>` above the table, so success is announced without taking focus. The error region is `role="alert"`.
15. **Layout:** the table is inside `overflow-x-auto`; nothing scrolls the page sideways at 375 pixels; dialog content is `max-h-[85vh] overflow-y-auto`.
16. **Motion:** only the transitions `radix-ui` and the existing dialog classes in `ad-studio-table.tsx` give; add `motion-reduce:transition-none motion-reduce:animate-none` to any animated class you copy.
17. No colour is the only signal for anything; no purple or violet class.
18. **Empty list:** with zero rows the component still renders the "Post a Job" button (when `canEdit`) and shows `No jobs yet` where the table would be; it does not render an empty table.

- [ ] **Step 4: Use it in the Jobs screen**

In `src/screens/hire/jobs.tsx`: read the viewer and compute `const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');` exactly as `src/screens/reach/ad-studio.tsx` does; compute `const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });`; replace the static table (and the disabled header button) with `<JobsTable rows={model.rows} canEdit={canEdit} today={today} />` inside the existing card, keeping the card's title and the failed-load state. Render `JobsTable` whenever the model loaded, including with zero rows: the "Post a Job" button lives inside it, so an empty workspace must still get it. `JobsTable` itself shows "No jobs yet" in place of the table when `rows` is empty (this is acceptance rule 18 of the component), so the screen's own empty-state branch for this card is removed. The search box and filters stay disabled. Remove imports that become unused.

- [ ] **Step 5: Careers Page publish action**

In `src/screens/hire/careers-page.tsx`, the per-job row gets a small client component `src/screens/hire/publish-button.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { setJobStatusAction } from '@/app/(app)/hire/actions';
import { Button } from '@/components/ui/button';

/** Publishes (opens) or unpublishes (closes) one job from the Careers Page list. */
export function PublishButton({ id, title, published }: { id: string; title: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = published ? 'Unpublish' : 'Publish';
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={pending}
        aria-label={`${label} ${title}`}
        onClick={() =>
          start(async () => {
            const result = await setJobStatusAction({ id, status: published ? 'closed' : 'open' });
            setError(result.ok ? null : result.error);
          })
        }
      >
        {pending ? 'Saving…' : label}
      </Button>
      {error && (
        <span role="alert" className="max-w-56 text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
```

Render it in each job row only when `canEdit` (computed as on the Jobs screen), with `published={row.status === 'Published'}`. A draft job with no description will show the capability's "Add a description before opening this job." under the button, which is the intended guidance. The header's Publish and Preview buttons stay disabled.

- [ ] **Step 6: Verify**

Run: `pnpm vitest run tests/hire-job-form.test.ts tests/hire-lists.test.ts && pnpm exec tsc --noEmit && pnpm exec eslint src/screens/hire src/lib/hire`
Expected: PASS, no type or lint errors, no unused imports. Do not start a dev server; the browser check is the controller's in Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hire/job-form.ts src/lib/hire/lists.ts src/screens/hire/jobs-table.tsx src/screens/hire/publish-button.tsx src/screens/hire/jobs.tsx src/screens/hire/careers-page.tsx tests/hire-job-form.test.ts tests/hire-lists.test.ts
git commit -m "feat(hire): Jobs screen — post, edit, open, pause, close, delete; Careers Page publish"
```

---

### Task 9: Apply, verify, smoke test and pull request (controller)

**Files:**
- Create: `tests/hire-jobs-writes.rls.test.ts`

This task is run by the controller, not a subagent. It writes to the live database and pushes.

- [ ] **Step 1: Write the RLS test (it fails until Step 3)**

Model it on `tests/reach-writes.rls.test.ts` (read it for how a second user and a viewer are set up). Cases: an owner inserts a job and it comes back as `draft` when status is omitted; updates its title; cannot update `org_id` (the update errors or leaves `org_id` unchanged); deletes it. A member of another workspace cannot read or update it. A viewer of the workspace cannot insert, update or delete. Rows are removed in `afterAll`. Commit it with the message `test(hire): live RLS checks for job writes`.

- [ ] **Step 2: Full local checks**

Run: `pnpm vitest run --dir tests` (only `tests/hire-jobs-writes.rls.test.ts` may fail), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

- [ ] **Step 3: Apply the migrations, after a yes for each**

With `mcp__openkuasa-supabase__apply_migration`: `hire_jobs_writes`, then `hire_jobs_demo_seed`. Between the two (after `hire_jobs_writes` is applied, before the seed), run this in `execute_sql` to prove the delete guard does not block deleting a workspace. It is wrapped in a transaction that is rolled back, so nothing is kept; it must be run in one call:

```sql
begin;
  insert into public.orgs (id, name) values ('00000000-0000-4000-8000-0000000000aa', 'Guard Check');
  insert into public.hire_jobs (id, org_id, title) values ('00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000aa', 'Guard job');
  insert into public.hire_candidates (id, org_id, name) values ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000aa', 'Guard person');
  insert into public.hire_applications (org_id, candidate_id, job_id) values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000ab');
  delete from public.orgs where id = '00000000-0000-4000-8000-0000000000aa';
  select count(*) as jobs_left from public.hire_jobs where org_id = '00000000-0000-4000-8000-0000000000aa';
rollback;
```

Expected: no error and `jobs_left = 0`. If the org delete raises "This job has applications", the guard's org check does not see the deleted org at that point: change the trigger to also return `old` when `pg_trigger_depth() > 1` (it is firing inside another trigger, which is how a cascade reaches it), re-run the check, and commit the corrected migration file. If `orgs` has other required columns, add them to the insert.

Then confirm, also in a rolled-back transaction, that deleting a job with an application directly raises the guard's message.

After the seed migration: demo counts are still 9 / 342 / 248 / 10; every open demo job has a description; four have `show_salary`; all ten interviews fall between 09:00 and 17:00 Kuala Lumpur time on a half-hour; six are scheduled and in the future. Run the security advisors and check nothing new names `hire_jobs`.

- [ ] **Step 4: Run the RLS test and the full suite**

Run: `pnpm vitest run --dir tests`
Expected: all pass.

- [ ] **Step 5: Smoke test, local, as the smoke account**

Sign in through the loopback helper (never type the password into a tool call). On `/hire/jobs`:

1. Post a job with only a title, double-clicking Save: exactly one job appears, as Draft, and the notice says so.
2. Try to open it: refused, with "Add a description before opening this job."
3. Edit it: add a description, a salary range with max below min (refused under the field), fix it, save.
4. Open, pause, reopen, close it. The pill and the available buttons change each time.
5. Tab through the form and the row actions with the keyboard only; Escape closes the dialog and focus returns to the button that opened it.
6. At 375 pixels wide: no sideways page scroll; the dialog scrolls inside itself.
7. Ask Lekir "create a job called Smoke Barista in Operations": an Approve card titled `Create job “Smoke Barista” as a draft?`; approve; Lekir reports it in the past tense and says it is a draft.
8. Ask Lekir to delete it: card `Delete job “Smoke Barista”?`; approve; it is gone.
9. Delete the first test job from the screen. Confirm the smoke workspace has no jobs left.

About four chat questions on the workspace's key. Say so before starting.

- [ ] **Step 6: Question set, after a yes**

`EVAL_ONLY=create-job,hiring-lookup-empty EVAL_RUNS=1 pnpm eval:tuah`: about 6 to 10 model calls. Stop at the first credits refusal.

- [ ] **Step 7: Push and open the pull request, after a yes**

`gh api user --jq .login` must print `OpenKuasa`. `git fetch origin && git rebase origin/main`, re-run the suite, rename the branch if its number was taken meanwhile, push, `gh issue list --state open`, then `gh pr create` with the title equal to the branch name. The body states that both migrations are already applied, lists the spec's "Out of scope", and notes that the demo's interviews now fall in working hours. No close keyword unless an existing issue tracks this work. Do not merge until asked.

---

## Self-Review Notes

- **Spec coverage:** §4.1 columns, policy, grants → Task 1. §4.2 delete guard → Task 1 and Task 9's live check. §4.3 demo seed → Tasks 2 and 4. §4.4 types → Task 2. §5 capabilities → Task 3. §6.1 actions → Task 5. §6.2 to 6.4 tools, context, titles → Task 6. §7 screens and §7.2 interaction rules → Task 8. §8 prompts → Task 7. §10 tests → each task and Task 9. §13 delivery → Task 9.
- **Where the plan narrows the spec:** the job form is a dialog, not a side panel, because that is the app's existing pattern; salary and closing date show in the dialog only, as the spec says. The Jobs table's "small arrangement and headcount line" is one muted line under the role.
- **Names used across tasks:** `HireWriteContext`, `CapResult`, `createJobInput`, `updateJobInput`, `setJobStatusInput`, `deleteJobInput`, `JOB_COLUMNS`, `HIRE_WRITE_TOOL_NAMES`, `JobFormValues`, `allowedMoves`, `JobsTable` are spelled the same wherever they appear.
