# Jebat Agent Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a workspace create flexible, self-running schedules for the Weekly Studio agent — by asking in chat ("a photo every hour for 8 hours") and managing them on the Agents screen — with hard spend caps so a schedule can never run away.

**Architecture:** A new `agent_schedules` table (many per org, keyed by `agent_key`) drives a schedule-based runner `runSchedules` that replaces the cadence loop. Chat creates schedules via an approval-gated AI tool (the LLM fills a structured schema); the Agents screen shows/edits/cancels them. Three cap layers (per-run → per-schedule → workspace daily/weekly ceiling) all derive from the tamper-proof `agent_runs.cost_cents`. Reuses `runWeeklyStudio`/`agent_runs` unchanged.

**Tech Stack:** Next.js 16 App Router (server components + `'use server'` actions), Supabase Postgres + two-layer RLS, Vitest (node env), AI SDK v7 tools, shadcn/Tailwind + lucide.

**Spec:** `docs/superpowers/specs/2026-10-11-jebat-agent-scheduling-design.md` (read it; the plan argues from it).

## Global Constraints

- TypeScript strict; 2-space indent, single quotes, semicolons; named exports; `const` by default; async/await.
- Supabase project is `ugchntdgaeefmufumchx` via the **openkuasa-supabase** MCP ONLY. The CONTROLLER applies migrations + any bucket via the MCP; implementers commit the migration file for reproducibility (no MCP call, no re-apply).
- Two-layer RLS on `agent_schedules`: table GRANT ceiling + RLS policy. `private.is_org_member(org_id)` select, `private.is_org_writer(org_id)` write, restrictive `mfa_required` = `(select private.mfa_ok())`. `id`/`org_id` NEVER in an UPDATE grant.
- **Integrity rule:** `spent_cents`, `runs_used`, `last_run_at`, `paused_reason` are **service-role-only** — excluded from the `authenticated` UPDATE grant. `agent_runs`/`agent_run_assets` stay service-role-only writes.
- `interval_seconds` floor = **300** (5 min), enforced in the DB CHECK, the Zod schema, AND the capability.
- Default caps: `daily_cap_cents` **500**, `weekly_cap_cents` **2000**. Per-run cap (`max_cost_cents`) default 200 unchanged.
- org_id ALWAYS from session (actions/capability) or from the trusted schedule row (runner) — NEVER from untrusted input. The runner is the only service-role actor; `AGENTS_ENABLED` stays the master kill-switch.
- **Tests MUST mock `@/lib/agents/openrouter-media` and `runWeeklyStudio`; CI never spends or generates.** No real OpenRouter call.
- No Kuasa brand names in `src/`; no purple/violet/indigo/fuchsia in the UI; fictional data only. Never log/print any key.
- A `'use client'` component imports only types + server actions — never `@/lib/agents/*`, `@/lib/supabase/*`, `@/lib/ai/*` server code.

## Review Focus

- A schedule with `interval_seconds < 300`, or absurd `max_runs`/`end_at` → rejected by the capability (not just the tool schema). → T2.
- Two heartbeat ticks in the same window → the conditional claim runs each schedule at most once. → T5.
- A workspace at its weekly ceiling → every active schedule pauses with a reason; no further run executes. → T5.
- A quiet workspace on a frequent schedule → monitor-skip writes a cost-0 `skipped` run and spends nothing. → T5.
- A tenant attempting to reset `spent_cents`/`runs_used` via the data API → denied (not in the UPDATE grant). → T1.
- A schedule reaching `max_runs`/`end_at`/`max_total_cents` → transitions to `completed` exactly once; completed is inert. → T5.

---

## File Structure

- Create `supabase/migrations/20261013090000_agent_schedules.sql` — table + RLS/grants/indexes, `agent_configs` cap columns, `agent_runs` status `skipped`, data migration (T1).
- Modify `src/lib/agents/types.ts` — `AgentSchedule`, `ScheduleStatus` (T1).
- Create `tests/agent-schedules.rls.test.ts` (T1).
- Create `src/lib/reach/schedule-capabilities.ts` — Zod inputs + `createSchedule`/`updateSchedule`/`pauseSchedule`/`resumeSchedule`/`cancelSchedule`/`listSchedules` + `syncCadenceSchedule` (T2, T7).
- Create `tests/schedule-capabilities.test.ts` (T2).
- Modify `src/app/(app)/reach/actions.ts` — schedule actions (T3); cadence bridge (T7).
- Modify `tests/reach-actions.test.ts` (T3).
- Modify `src/lib/ai/tools.ts` + `src/lib/ai/products.ts` + `src/lib/chat/change-titles.ts` — the `scheduleWeeklyStudio` tool, its name in `REACH_WRITE_TOOL_NAMES`, approval copy (T4).
- Modify `tests/ai-products.test.ts` or add `tests/schedule-tool-parity.test.ts` (T4).
- Modify `src/lib/agents/runner.ts` — `runSchedules`, `overBudget`, `hasNewDataSince` (T5).
- Modify `src/app/api/agents/run/route.ts` — call `runSchedules` (T5).
- Create `tests/agent-schedules-runner.test.ts` (T5).
- Modify `src/screens/reach/agents.tsx` + `src/components/reach/agents-panel.tsx` — schedules list, budget strip, edit/pause/cancel (T6).

---

### Task 1: Schedule schema + types + RLS test

**Files:**
- Create: `supabase/migrations/20261013090000_agent_schedules.sql`
- Modify: `src/lib/agents/types.ts`
- Test: `tests/agent-schedules.rls.test.ts`

**Interfaces — Produces:** table `public.agent_schedules`; `agent_configs.daily_cap_cents`/`weekly_cap_cents`; `agent_runs.status` gains `'skipped'`; types `AgentSchedule`, `ScheduleStatus = 'active'|'paused'|'completed'`.

**Controller note:** the CONTROLLER applies this migration via the openkuasa-supabase MCP and confirms it. The implementer writes the committed file (no MCP, no re-apply), the types, and the RLS test (which runs live).

- [ ] **Step 1: Write the migration file** `supabase/migrations/20261013090000_agent_schedules.sql`:

```sql
-- Flexible, self-running schedules for agents (currently Weekly Studio).
create table public.agent_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  nl_text text,
  interval_seconds integer not null check (interval_seconds >= 300),
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  end_at timestamptz,
  max_runs integer check (max_runs is null or max_runs between 1 and 1000),
  runs_used integer not null default 0,
  max_total_cents integer check (max_total_cents is null or max_total_cents between 0 and 100000),
  spent_cents integer not null default 0,
  status text not null default 'active' check (status in ('active','paused','completed')),
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_schedules enable row level security;
revoke all on public.agent_schedules from anon, authenticated;
grant select, insert, delete on public.agent_schedules to authenticated;
grant update (nl_text, interval_seconds, next_run_at, end_at, max_runs, max_total_cents, status, updated_at)
  on public.agent_schedules to authenticated;

create policy agent_schedules_select on public.agent_schedules
  for select to authenticated using (private.is_org_member(org_id));
create policy agent_schedules_write on public.agent_schedules
  for all to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy agent_schedules_mfa on public.agent_schedules
  as restrictive for all to authenticated using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

create index agent_schedules_due_idx on public.agent_schedules (status, next_run_at);
create index agent_schedules_org_idx on public.agent_schedules (org_id);

-- Workspace rolling-ceiling config (safe defaults; tenant-editable).
alter table public.agent_configs
  add column daily_cap_cents integer not null default 500 check (daily_cap_cents between 0 and 1000000),
  add column weekly_cap_cents integer not null default 2000 check (weekly_cap_cents between 0 and 1000000);
grant update (daily_cap_cents, weekly_cap_cents) on public.agent_configs to authenticated;

-- Monitor-skip needs a 'skipped' run status. (The inline CHECK from the 5a
-- migration is auto-named agent_runs_status_check; if a live check shows a
-- different name, drop THAT name instead — the controller verifies at apply.)
alter table public.agent_runs drop constraint agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check
  check (status in ('running','done','failed','skipped'));

-- Data migration: existing enabled cadence configs become schedule rows.
insert into public.agent_schedules (org_id, agent_key, interval_seconds, next_run_at, nl_text)
select org_id, agent_key,
  case cadence when 'daily' then 86400 when 'weekly' then 604800 end,
  now(),
  'Migrated from ' || cadence || ' cadence'
from public.agent_configs
where enabled = true and cadence in ('daily','weekly');
```

- [ ] **Step 2: Add types** to `src/lib/agents/types.ts`:

```ts
export type ScheduleStatus = 'active' | 'paused' | 'completed';

export type AgentSchedule = {
  id: string;
  org_id: string;
  agent_key: string;
  created_by: string | null;
  nl_text: string | null;
  interval_seconds: number;
  next_run_at: string;
  last_run_at: string | null;
  end_at: string | null;
  max_runs: number | null;
  runs_used: number;
  max_total_cents: number | null;
  spent_cents: number;
  status: ScheduleStatus;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
};
```

Also widen the existing `AgentRunStatus` union to include `'skipped'`.

- [ ] **Step 3: Write the RLS test** `tests/agent-schedules.rls.test.ts` (model it on `tests/agent-configs.rls.test.ts`; it runs live against the DB via the anon/service clients that test already uses). Assert, for a seeded owner org and a second org:
  - owner can INSERT a schedule (`error` null) and UPDATE a granted column (`interval_seconds`), then read it back;
  - a member of another org reads **0** rows and its UPDATE touches 0 rows;
  - a non-writer (viewer/demo) INSERT fails with code `42501`;
  - **an authenticated UPDATE of `spent_cents` (or `runs_used`) fails with code `42501`** (the integrity rule).

- [ ] **Step 4: Run** `pnpm exec vitest run tests/agent-schedules.rls.test.ts` → PASS (4+ assertions). `pnpm exec tsc --noEmit` clean.

- [ ] **Step 5: Commit** `git add supabase/migrations/20261013090000_agent_schedules.sql src/lib/agents/types.ts tests/agent-schedules.rls.test.ts && git commit -m "feat(agents): agent_schedules table + cap columns + skipped run status (two-layer RLS)"`

---

### Task 2: Schedule capability

**Files:**
- Create: `src/lib/reach/schedule-capabilities.ts`
- Test: `tests/schedule-capabilities.test.ts`

**Interfaces — Consumes:** `type ReachWriteContext` + `type CapResult` from `@/lib/reach/capabilities`; `WEEKLY_STUDIO`, `AgentSchedule` from `@/lib/agents/types`. **Produces:** `createScheduleInput`/`updateScheduleInput`/`pauseScheduleInput`/`resumeScheduleInput`/`cancelScheduleInput` (Zod) + `createSchedule`/`updateSchedule`/`pauseSchedule`/`resumeSchedule`/`cancelSchedule`/`listSchedules`.

- [ ] **Step 1: Write failing tests** `tests/schedule-capabilities.test.ts` (minimal fake client like `tests/reach-capabilities.test.ts`): `createScheduleInput` rejects `interval_seconds < 300`, `max_runs` outside 1..1000, a past `end_at`, `max_total_cents` outside 0..100000, and an unknown `agent_key`; `createSchedule` inserts with `org_id` from ctx (never input) + `status:'active'` + `next_run_at = starts_at ?? now+interval`; `cancelSchedule` sets `status:'completed'`; each fn scopes writes by `org_id`. Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/reach/schedule-capabilities.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ReachWriteContext, CapResult } from '@/lib/reach/capabilities';
import { WEEKLY_STUDIO, type AgentSchedule } from '@/lib/agents/types';

const agentKey = z.enum([WEEKLY_STUDIO]);
const iso = z.string().datetime({ offset: true });
const FAILED: CapResult<never> = { ok: false, error: 'That change could not be saved.' };

export const createScheduleInput = z.object({
  agent_key: agentKey,
  interval_seconds: z.number().int().min(300).max(31_536_000),
  starts_at: iso.optional(),
  end_at: iso.optional(),
  max_runs: z.number().int().min(1).max(1000).optional(),
  max_total_cents: z.number().int().min(0).max(100_000).optional(),
  nl_text: z.string().trim().max(200).optional(),
}).refine((v) => !v.end_at || new Date(v.end_at) > new Date(), { message: 'end_at must be in the future', path: ['end_at'] });

export const updateScheduleInput = z.object({
  id: z.string().uuid(),
  interval_seconds: z.number().int().min(300).max(31_536_000).optional(),
  end_at: iso.nullable().optional(),
  max_runs: z.number().int().min(1).max(1000).nullable().optional(),
  max_total_cents: z.number().int().min(0).max(100_000).nullable().optional(),
  nl_text: z.string().trim().max(200).optional(),
});
export const pauseScheduleInput = z.object({ id: z.string().uuid() });
export const resumeScheduleInput = z.object({ id: z.string().uuid() });
export const cancelScheduleInput = z.object({ id: z.string().uuid() });

const COLS =
  'id,org_id,agent_key,created_by,nl_text,interval_seconds,next_run_at,last_run_at,end_at,max_runs,runs_used,max_total_cents,spent_cents,status,paused_reason,created_at,updated_at';

export async function listSchedules(client: SupabaseClient, orgId: string): Promise<AgentSchedule[]> {
  const { data } = await client.from('agent_schedules').select(COLS).eq('org_id', orgId).order('created_at', { ascending: false });
  return (data ?? []) as unknown as AgentSchedule[];
}

export async function createSchedule(ctx: ReachWriteContext, input: z.infer<typeof createScheduleInput>): Promise<CapResult<AgentSchedule>> {
  const p = createScheduleInput.parse(input);
  const nextRun = p.starts_at ?? new Date(Date.now() + p.interval_seconds * 1000).toISOString();
  const { data, error } = await ctx.client.from('agent_schedules').insert({
    org_id: ctx.orgId, agent_key: p.agent_key, created_by: ctx.userId ?? null, nl_text: p.nl_text ?? null,
    interval_seconds: p.interval_seconds, next_run_at: nextRun, end_at: p.end_at ?? null,
    max_runs: p.max_runs ?? null, max_total_cents: p.max_total_cents ?? null,
  }).select(COLS).single();
  if (error || !data) { console.error('[schedules] create failed:', error?.code); return FAILED; }
  return { ok: true, data: data as unknown as AgentSchedule };
}

async function patch(ctx: ReachWriteContext, id: string, fields: Record<string, unknown>): Promise<CapResult<AgentSchedule>> {
  const { data, error } = await ctx.client.from('agent_schedules')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id).eq('org_id', ctx.orgId).select(COLS).maybeSingle();
  if (error || !data) { console.error('[schedules] update failed:', error?.code); return FAILED; }
  return { ok: true, data: data as unknown as AgentSchedule };
}

export async function updateSchedule(ctx: ReachWriteContext, input: z.infer<typeof updateScheduleInput>) {
  const { id, ...rest } = updateScheduleInput.parse(input);
  return patch(ctx, id, rest);
}
export async function pauseSchedule(ctx: ReachWriteContext, input: z.infer<typeof pauseScheduleInput>) {
  return patch(ctx, pauseScheduleInput.parse(input).id, { status: 'paused' });
}
export async function resumeSchedule(ctx: ReachWriteContext, input: z.infer<typeof resumeScheduleInput>) {
  return patch(ctx, resumeScheduleInput.parse(input).id, { status: 'active', paused_reason: null });
}
export async function cancelSchedule(ctx: ReachWriteContext, input: z.infer<typeof cancelScheduleInput>) {
  return patch(ctx, cancelScheduleInput.parse(input).id, { status: 'completed' });
}
```

(Note: `resumeSchedule`/the runner set `paused_reason`; but `paused_reason` is NOT in the authenticated UPDATE grant. A session-client resume therefore must NOT write `paused_reason`. **Correction to apply:** `resumeSchedule` sets only `{ status: 'active' }` — drop `paused_reason: null` from the session path; the runner clears it service-side. Keep `pauseSchedule` to `{ status: 'paused' }` only. The reviewer verifies no granted-exclusion column is written by the session path.)

`ReachWriteContext` must expose `userId`; if it does not, omit `created_by` from the insert (leave the column null) rather than add it — check `@/lib/reach/capabilities` and match what's there.

- [ ] **Step 3: Run** `pnpm exec vitest run tests/schedule-capabilities.test.ts` → PASS; `tsc` clean.
- [ ] **Step 4: Commit** `feat(agents): schedule capability (create/update/pause/resume/cancel, org-scoped, floors)`

---

### Task 3: Schedule server actions

**Files:**
- Modify: `src/app/(app)/reach/actions.ts`
- Test: `tests/reach-actions.test.ts` (extend)

**Interfaces — Consumes:** Task-2 inputs + fns; existing `writeCtx()`, `run`-style helpers, `AGENTS_PATHS`. **Produces:** `createScheduleAction`/`updateScheduleAction`/`pauseScheduleAction`/`resumeScheduleAction`/`cancelScheduleAction`.

- [ ] **Step 1: Failing guard tests** (extend `tests/reach-actions.test.ts`, mirror the agent-config action tests): a demo user and a viewer each get `{ ok:false }` from `createScheduleAction` and the capability spy is NOT called; a writer with valid input reaches the capability. Run → FAIL.

- [ ] **Step 2: Implement** a `runSchedule` helper mirroring the existing `runAgentConfig`, plus the five actions, in `src/app/(app)/reach/actions.ts` (import the schemas/fns from `@/lib/reach/schedule-capabilities`):

```ts
async function runSchedule<I, O>(
  schema: ZodType<I>, input: unknown,
  fn: (ctx: ReachWriteContext, parsed: I) => Promise<CapResult<O>>,
): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await fn(ctx, parsed.data);
  if (result.ok) for (const p of AGENTS_PATHS) revalidatePath(p);
  return result;
}
export async function createScheduleAction(input: unknown) { return runSchedule(createScheduleInput, input, createSchedule); }
export async function updateScheduleAction(input: unknown) { return runSchedule(updateScheduleInput, input, updateSchedule); }
export async function pauseScheduleAction(input: unknown) { return runSchedule(pauseScheduleInput, input, pauseSchedule); }
export async function resumeScheduleAction(input: unknown) { return runSchedule(resumeScheduleInput, input, resumeSchedule); }
export async function cancelScheduleAction(input: unknown) { return runSchedule(cancelScheduleInput, input, cancelSchedule); }
```
(`FORBIDDEN`/`INVALID`/`writeCtx`/`AGENTS_PATHS`/`ReachWriteContext`/`CapResult`/`ZodType` are all already in this file from earlier slices — reuse them, do not redefine.)

- [ ] **Step 3: Run** `pnpm exec vitest run tests/reach-actions.test.ts` → PASS; `tsc` clean.
- [ ] **Step 4: Commit** `feat(agents): server actions for schedules (edit-data gated)`

---

### Task 4: Chat tool + approval parity  **[CLEAN CUT: schedules creatable & manageable]**

**Files:**
- Modify: `src/lib/ai/tools.ts`, `src/lib/ai/products.ts`, `src/lib/chat/change-titles.ts`
- Test: `tests/schedule-tool-parity.test.ts` (new)

**Interfaces — Consumes:** `createScheduleInput`/`createSchedule` from `@/lib/reach/schedule-capabilities`; the `write?: { ctx, canWrite }` pattern in `reachTools`.

- [ ] **Step 1: Failing parity test** `tests/schedule-tool-parity.test.ts`: assert `'scheduleWeeklyStudio'` is in `REACH_WRITE_TOOL_NAMES` (so it is approval-gated in both products), and that the tool's `inputSchema` is the SAME object as `createScheduleInput` (identity — `toBe`). Run → FAIL.

- [ ] **Step 2: Implement.**
  - In `src/lib/ai/tools.ts`, inside the `write` block (where `ctx = write.ctx`), add:
    ```ts
    scheduleWeeklyStudio: tool({
      description:
        'Schedule the Weekly Studio agent to run itself on a recurring interval. interval_seconds is the gap between runs (min 300 = 5 min); optional starts_at (UTC ISO), max_runs, end_at (UTC ISO), max_total_cents (per-schedule budget). Set nl_text to the user’s own phrasing. Needs the owner’s approval before it is saved.',
      inputSchema: createScheduleInput,
      execute: async (input) => capCreateSchedule(ctx, input),
    }),
    ```
    importing `createSchedule as capCreateSchedule, createScheduleInput` from `@/lib/reach/schedule-capabilities`.
  - In `src/lib/ai/products.ts`, append `'scheduleWeeklyStudio'` to `REACH_WRITE_TOOL_NAMES`.
  - In `src/lib/chat/change-titles.ts`, map the tool to approval copy: add `scheduleWeeklyStudio` to `KIND_OF_TOOL` (kind `'schedule'` — add that `ItemKind` member) and ensure `approvalTitle` renders e.g. "Schedule Weekly Studio" with the resolved interval/runs from the input. Keep copy generic; do not leak internals.

- [ ] **Step 3: Run** `pnpm exec vitest run tests/schedule-tool-parity.test.ts` + the existing `tests/ai-products.test.ts` → PASS; `tsc` clean.
- [ ] **Step 4: Commit** `feat(agents): scheduleWeeklyStudio chat tool (approval-gated, schema parity)`

---

### Task 5: `runSchedules` + budget gate + monitor-skip

**Files:**
- Modify: `src/lib/agents/runner.ts`, `src/app/api/agents/run/route.ts`
- Test: `tests/agent-schedules-runner.test.ts` (new)

**Interfaces — Consumes:** `runWeeklyStudio`, `WEEKLY_STUDIO`, `serviceClient` (via the route). **Produces:** `runSchedules(client): Promise<RunSchedulesSummary>` where `RunSchedulesSummary = { ran: number; skipped: number; paused: number; completed: number; failed: number }`.

- [ ] **Step 1: Failing tests** `tests/agent-schedules-runner.test.ts` (`vi.mock('@/lib/agents/weekly-studio', () => ({ runWeeklyStudio: vi.fn(async () => ({ runId: 'r1', status: 'done' })) }))` + a fake service client). Cover: (a) `AGENTS_ENABLED` unset → nothing runs; (b) a due schedule past `max_runs` → marked `completed`, `runWeeklyStudio` NOT called; (c) workspace over the weekly ceiling (fake `agent_runs` cost sum ≥ cap) → the schedule is set `paused` with `paused_reason`, `runWeeklyStudio` NOT called; (d) the claim returning no row → `runWeeklyStudio` NOT called (double-tick safety); (e) **monitor-skip:** `last_run_at` set + no new reach rows since → an `agent_runs` row with `status:'skipped'` + `cost_cents:0` is inserted and `runWeeklyStudio` NOT called; (f) a happy run → `runWeeklyStudio` called, `spent_cents`/`runs_used` advanced; (g) reaching `max_runs` after the run → `completed`. Run → FAIL.

- [ ] **Step 2: Implement** in `src/lib/agents/runner.ts`:

```ts
export type RunSchedulesSummary = { ran: number; skipped: number; paused: number; completed: number; failed: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling-ceiling check. Returns a pause reason, or null if under budget. */
async function overBudget(client: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: cfg } = await client
    .from('agent_configs').select('daily_cap_cents, weekly_cap_cents')
    .eq('org_id', orgId).eq('agent_key', WEEKLY_STUDIO).maybeSingle();
  const daily = (cfg?.daily_cap_cents as number | undefined) ?? 500;
  const weekly = (cfg?.weekly_cap_cents as number | undefined) ?? 2000;
  const spentSince = async (sinceIso: string): Promise<number> => {
    const { data } = await client.from('agent_runs').select('cost_cents').eq('org_id', orgId).gte('started_at', sinceIso);
    return (data ?? []).reduce((a: number, r: { cost_cents: number | null }) => a + (r.cost_cents ?? 0), 0);
  };
  if ((await spentSince(new Date(Date.now() - DAY_MS).toISOString())) >= daily) return 'daily budget reached';
  if ((await spentSince(new Date(Date.now() - 7 * DAY_MS).toISOString())) >= weekly) return 'weekly budget reached';
  return null;
}

/** Monitor-skip: has the org's reach data changed since `sinceIso`? */
async function hasNewDataSince(client: SupabaseClient, orgId: string, sinceIso: string): Promise<boolean> {
  for (const table of ['leads', 'campaigns', 'appointments']) {
    const { data } = await client.from(table).select('id').eq('org_id', orgId).gt('created_at', sinceIso).limit(1).maybeSingle();
    if (data) return true;
  }
  return false;
}

export async function runSchedules(client: SupabaseClient): Promise<RunSchedulesSummary> {
  const summary: RunSchedulesSummary = { ran: 0, skipped: 0, paused: 0, completed: 0, failed: 0 };
  const flag = (process.env.AGENTS_ENABLED ?? '').trim().toLowerCase();
  if (flag !== 'true' && flag !== '1') return summary;

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from('agent_schedules')
    .select('id, org_id, agent_key, interval_seconds, next_run_at, last_run_at, end_at, max_runs, runs_used, max_total_cents, spent_cents')
    .eq('status', 'active').lte('next_run_at', nowIso);
  if (error || !data) return summary;

  type S = { id: string; org_id: string; agent_key: string; interval_seconds: number; next_run_at: string; last_run_at: string | null; end_at: string | null; max_runs: number | null; runs_used: number; max_total_cents: number | null; spent_cents: number };
  for (const s of data as S[]) {
    try {
      const done =
        (s.max_runs != null && s.runs_used >= s.max_runs) ||
        (s.max_total_cents != null && s.spent_cents >= s.max_total_cents) ||
        (s.end_at != null && new Date(s.end_at) <= new Date());
      if (done) {
        await client.from('agent_schedules').update({ status: 'completed', updated_at: nowIso }).eq('id', s.id).eq('org_id', s.org_id);
        summary.completed += 1; continue;
      }
      const reason = await overBudget(client, s.org_id);
      if (reason) {
        await client.from('agent_schedules').update({ status: 'paused', paused_reason: reason, updated_at: nowIso }).eq('org_id', s.org_id).eq('status', 'active');
        summary.paused += 1; continue;
      }
      const nextIso = new Date(Date.now() + s.interval_seconds * 1000).toISOString();
      const { data: claimed } = await client.from('agent_schedules')
        .update({ next_run_at: nextIso, updated_at: nowIso })
        .eq('id', s.id).eq('status', 'active').lte('next_run_at', nowIso).select('id').maybeSingle();
      if (!claimed) { summary.skipped += 1; continue; }

      if (s.last_run_at && !(await hasNewDataSince(client, s.org_id, s.last_run_at))) {
        await client.from('agent_runs').insert({ org_id: s.org_id, agent_key: s.agent_key, status: 'skipped', trigger: 'schedule', cost_cents: 0, finished_at: nowIso });
        await client.from('agent_schedules').update({ last_run_at: nowIso, runs_used: s.runs_used + 1, updated_at: nowIso }).eq('id', s.id).eq('org_id', s.org_id);
        summary.skipped += 1; continue;
      }

      const result = await runWeeklyStudio(client, s.org_id, 'schedule');
      const { data: runRow } = await client.from('agent_runs').select('cost_cents').eq('id', result.runId).maybeSingle();
      const cost = (runRow?.cost_cents as number | undefined) ?? 0;
      const runsUsed = s.runs_used + 1;
      const spent = s.spent_cents + cost;
      const nowDone = (s.max_runs != null && runsUsed >= s.max_runs) || (s.max_total_cents != null && spent >= s.max_total_cents);
      await client.from('agent_schedules').update({
        last_run_at: nowIso, runs_used: runsUsed, spent_cents: spent,
        status: nowDone ? 'completed' : 'active', updated_at: nowIso,
      }).eq('id', s.id).eq('org_id', s.org_id);
      summary.ran += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
```

- [ ] **Step 3: Wire the route.** In `src/app/api/agents/run/route.ts` replace `runAgents` with `runSchedules`:
```ts
import { runSchedules } from '@/lib/agents/runner';
// ...
const summary = await runSchedules(serviceClient());
return NextResponse.json(summary);
```
Leave `runAgents` in place (unused, harmless) or delete it; if deleted, also drop its now-dead `tests/agent-runner.test.ts` cases for `runAgents` — prefer deleting `runAgents` + its test block to avoid dead code, keeping the trigger-auth tests.

- [ ] **Step 4: Run** `pnpm exec vitest run tests/agent-schedules-runner.test.ts` → PASS; `tsc` + eslint clean.
- [ ] **Step 5: Commit** `feat(agents): runSchedules — due loop, per-schedule + workspace caps, monitor-skip`

---

### Task 6: Live schedules UI

**Files:**
- Modify: `src/screens/reach/agents.tsx`, `src/components/reach/agents-panel.tsx`

**Interfaces — Consumes:** `listSchedules` (server), the Task-3 actions (client), `AgentSchedule` type.

- [ ] **Step 1: Server load.** In `src/screens/reach/agents.tsx`, alongside the config/runs load, call `listSchedules(supabase, viewer.orgId)` and the org's `agent_configs` cap columns (already loaded via `listAgentConfigs` — ensure `daily_cap_cents`/`weekly_cap_cents` are selected). Compute `spentToday`/`spentWeek` by summing the already-loaded `runs` cost (or a small `agent_runs` sum) for the budget strip. Pass `schedules`, `caps`, `spentToday`, `spentWeek` as new props to `<AgentsPanel>`.

- [ ] **Step 2: Panel UI** in `src/components/reach/agents-panel.tsx` (`'use client'`, types-only + actions imports; no server import; no purple/violet/indigo/fuchsia; lucide icons). Add below the run history:
  - A **Schedules** section. Empty state when none: "No schedules yet — ask Jebat 'run every Monday 9am', or add one here." with an add control.
  - Each schedule row (compact): `nl_text` (or a derived "Every N · K runs"), next run (`timeZone:'Asia/Kuala_Lumpur'`), **status + budget shown as an icon + text label** (not color alone), `runs_used/max_runs`, `spent/budget` in tabular figures. Row actions when `canEdit`: pause/resume, edit (progressive-disclosure inline fields with visible `<label>`s + helper text "Minimum 5 minutes" + on-blur validation), and **Cancel** (a confirm dialog, danger emphasis, visually separated; an Undo toast after via `resumeSchedule` is not applicable — cancel = completed, so offer re-create guidance instead).
  - A **budget strip**: a progress bar of `spentWeek` vs `weekly_cap_cents` WITH the numeric values beside it (tabular), plus the daily/weekly cap number inputs (edit via `updateAgentConfig`/a cap action). If a schedule is `paused` with `paused_reason`, show a `role="alert"` "Paused — {reason}" with a Resume action.
  - Every mutation: `useTransition`, loading state on the control, success toast, errors inline via `role="alert"`.

- [ ] **Step 3: Verify** `pnpm exec tsc --noEmit` clean; eslint the two files; `grep -riE 'purple|violet|indigo|fuchsia'` on both files = none; `node scripts/gen-screen-routes.mjs --check` green. (No render test — repo is node-env with no jsdom; this is presentational and covered by the browser smoke.)

- [ ] **Step 4: Commit** `feat(agents): schedules list, budget strip, and controls on the Agents screen`

---

### Task 7: Cadence bridge + operator checklist  **[CLEAN CUT: end-to-end]**

**Files:**
- Modify: `src/lib/reach/schedule-capabilities.ts` (add `syncCadenceSchedule`), `src/app/(app)/reach/actions.ts` (the existing `setAgentCadenceAction`), `docs/superpowers/specs/2026-10-11-jebat-agent-scheduling-design.md` (append an operator note) — and a test in `tests/schedule-capabilities.test.ts`.

**Interfaces — Produces:** `syncCadenceSchedule(ctx, cadence)` — ensures the off/daily/weekly dropdown stays unified with the schedule table.

- [ ] **Step 1: Failing test** (extend `tests/schedule-capabilities.test.ts`): `syncCadenceSchedule(ctx, 'weekly')` creates/activates one schedule with `interval_seconds=604800` for the org; `syncCadenceSchedule(ctx, 'off')` sets the migrated/preset schedule to `completed` (deactivated); calling it twice does not create duplicates. Run → FAIL.

- [ ] **Step 2: Implement** `syncCadenceSchedule(ctx, cadence)` in `schedule-capabilities.ts`: look up the org's existing preset schedule (an `agent_schedules` row whose `nl_text` marks it a cadence preset, e.g. `nl_text ilike 'Migrated from%'` OR a dedicated `nl_text='cadence preset'` tag — pick the tag and use it consistently). For `off` → set it `completed`; for `daily`/`weekly` → upsert via the capability's update-first-then-insert pattern with `interval_seconds` 86400/604800 and `status='active'`. Then in `setAgentCadenceAction` (actions.ts), after the existing `setAgentCadence` capability call succeeds, also call `syncCadenceSchedule(ctx, cadence)` so the dropdown and the schedule table never diverge.

- [ ] **Step 3: Operator checklist.** Append to the spec's rollout note: the `/api/agents/run` cron must change from hourly to **every ~5 min**; `AGENTS_ENABLED`, the service-role key header, and the per-schedule/workspace caps all still apply; no new secret.

- [ ] **Step 4: Run** `pnpm exec vitest run tests/schedule-capabilities.test.ts tests/reach-actions.test.ts` → PASS; `tsc` clean.
- [ ] **Step 5: Commit** `feat(agents): unify the off/daily/weekly dropdown with the schedule table + operator note`
