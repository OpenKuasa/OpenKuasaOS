# Jebat Appointments CRUD + Reports (live + CSV) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `reach/appointments` full CRUD (writes + approval-gated AI tools with AI↔UI schema-identity parity, two-layer RLS) and `reach/reports` read-only-live analytics with a CSV export.

**Architecture:** Mirror slices 1–3. One Zod schema + one capability fn per appointment mutation, consumed by BOTH a UI server action and an AI tool. Two-layer access: table GRANT ceiling + RLS `is_org_writer` policy. Reports derives from live data (no new table) via a pure helper, plus a CSV export server action. New live screens get added to `LIVE_SCREENS` and a regenerated route.

**Tech Stack:** Next.js 16 App Router (server components + `'use server'` actions), Supabase Postgres + RLS, AI SDK v7 (per-product toolkits in `src/lib/ai/products.ts`), Zod, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-jebat-appointments-reports-design.md` (read it; the plan argues from it).

## Global Constraints

- No Kuasa brand names in `src/`; **no purple/violet/indigo/fuchsia** anywhere in the UI; fictional data only (Rimba Ventures).
- Supabase project `ugchntdgaeefmufumchx` via the `openkuasa-supabase` MCP ONLY. **The CONTROLLER applies migrations via the MCP**; implementers own the committed migration file + TS + tests.
- TypeScript strict; 2-space indent, single quotes, semicolons; `const` default; named exports; functional components + hooks.
- A `'use client'` component must NEVER import `@/lib/ai/tools` (pulls `ai`/`zod` into the client bundle). Client reads `rm` from `@/lib/reach/format`, types from `@/lib/reach/types`.
- `id`/`org_id` NEVER in an UPDATE column grant; `org_id` always from `ReachWriteContext`, never input.
- A new live screen MUST be added to `src/config/live-screens.ts` `LIVE_SCREENS` and its route regenerated with `node scripts/gen-screen-routes.mjs` (predev/prebuild hook; `screen-routes --check` test), or it shows a false WIP banner.
- `main` moves fast and the AI toolkit was refactored into `src/lib/ai/products.ts` (#89) with more Tuah work landing (#86/#89/#92). **Task 4 MUST re-read `products.ts` + `tools.ts` + `tool-parts.ts` and wire into the current structure** before writing (a ruling, not an assumption).

## Review Focus

- **Invalid / non-ISO `scheduled_at`** → rejected by `z.string().datetime()`; a *past* datetime is valid (backdated appointment). Pinned in Task 2.
- **Empty `contact_name` / `kind`** → rejected by `.trim().min(1)`. Pinned in Task 2.
- **A report range with zero leads** → honest empty model (no NaN, no crash; `conv_pct` 0, `show_rate_pct` null). Pinned in Task 6.
- **A `created_at` exactly on the range cutoff** → inclusive (`>=`), counted in range. Pinned in Task 6.
- **A CSV field containing a comma, double-quote, or newline** → quoted + inner quotes doubled. Pinned in Task 8.

---

## File Structure

- `supabase/migrations/<ts>_reach_appointments_writes.sql` — status column + CHECK + write policy + grants (Task 1).
- `src/lib/reach/types.ts` — `Appointment` +`status`, `AppointmentStatus`, `APPOINTMENT_STATUSES` (Task 1).
- `src/lib/reach/supabase.ts` — `listAppointments` select +`status` (Task 1).
- `src/lib/reach/seed.ts` — `seedAppointments` +`status` (Task 1).
- `src/lib/reach/capabilities.ts` — appointment schemas + fns (Task 2).
- `src/app/(app)/reach/actions.ts` — `runAppointments` + 4 actions (Task 3), `exportLeadsCsv` (Task 8).
- `src/lib/ai/tools.ts` — 4 appointment write tools + `id` in the upcoming-appointments read tool (Task 4).
- `src/lib/ai/products.ts` — 4 names into `REACH_WRITE_TOOL_NAMES` (Task 4).
- `src/components/chat/tool-parts.ts` — appointment approval copy (Task 4).
- `src/lib/ai/agents/prompts.ts` — JEBAT appointments line (Task 5).
- `src/screens/reach/appointments.tsx` (live) + `src/components/reach/appointments-table.tsx` (new client) (Task 5).
- `src/config/live-screens.ts` — +`reach/appointments` (Task 5), +`reach/reports` (Task 7).
- `src/lib/reach/reports.ts` — `deriveReportsModel` + types (Task 6).
- `src/screens/reach/reports.tsx` (live) + `src/components/reach/reports-controls.tsx` (new client) (Task 7).

---

### Task 1: Appointments writable (migration + type + provider + seed + RLS test)

**Files:**
- Create: `supabase/migrations/<ts>_reach_appointments_writes.sql` (use a timestamp after the latest existing migration, format `YYYYMMDDHHMMSS`).
- Modify: `src/lib/reach/types.ts`, `src/lib/reach/supabase.ts`, `src/lib/reach/seed.ts`.
- Test: `tests/reach-appointments-writes.rls.test.ts` (model on the existing `tests/reach-leads-writes.rls.test.ts` harness).

**Interfaces — Produces:** `AppointmentStatus` type; `APPOINTMENT_STATUSES`; `Appointment` with `status: AppointmentStatus`; provider `listAppointments` returns `status`.

- [ ] **Step 1: Write the migration file** (committed; the controller applies it via the MCP):
```sql
alter table public.appointments
  add column status text not null default 'scheduled';
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'no_show'));

create policy appointments_write on public.appointments for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));

grant insert on public.appointments to authenticated;
grant update (contact_name, kind, scheduled_at, via, status) on public.appointments to authenticated;
grant delete on public.appointments to authenticated;
```

- [ ] **Step 2: Extend the type** in `src/lib/reach/types.ts`:
```ts
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'scheduled', 'completed', 'cancelled', 'no_show',
];
```
and add `status: AppointmentStatus;` to the `Appointment` type (after `via`).

- [ ] **Step 3: Update the provider select** in `src/lib/reach/supabase.ts` — the `listAppointments` column list becomes `'id,contact_name,kind,scheduled_at,via,status,created_at'`.

- [ ] **Step 4: Update the seed** in `src/lib/reach/seed.ts` `seedAppointments` — add a `status` to each fixture: appt_1 `'scheduled'`, appt_2 `'scheduled'`, appt_3 `'completed'` (so the show-rate reads sensibly). (TypeScript will force this once the type changes — it is a required completeness fix, like the slice-3 `promoted_contact_id` seed change.)

- [ ] **Step 5: Write the RLS test** `tests/reach-appointments-writes.rls.test.ts`, modelled on `tests/reach-leads-writes.rls.test.ts` (same owner/other two-org `ReachWriteContext` harness against the LIVE DB). Assert, for an owner writer: insert an appointment succeeds and is visible; a SECOND org's writer cannot select, update, or delete that appointment (RLS hides it); and a viewer (role `viewer`) is denied the write. Clean up inserted rows in a `finally`/`afterAll`.

- [ ] **Step 6: Run** `pnpm vitest run --dir tests tests/reach-appointments-writes.rls.test.ts` (live; must not be skipped) and `pnpm exec tsc --noEmit`. **The migration must be applied (by the controller) before this test passes.**

- [ ] **Step 7: Commit.**
```bash
git add supabase/migrations src/lib/reach/types.ts src/lib/reach/supabase.ts src/lib/reach/seed.ts tests/reach-appointments-writes.rls.test.ts
git commit -m "feat(reach): make appointments writable (two-layer RLS) + status column"
```

---

### Task 2: Appointment capabilities

**Files:** Modify `src/lib/reach/capabilities.ts`; Test `tests/reach-appointment-capabilities.test.ts`.

**Interfaces — Consumes:** `AppointmentStatus`, `APPOINTMENT_STATUSES`, `Appointment` (Task 1); `ReachWriteContext`, `CapResult`, `writeFailed` (existing). **Produces:** `createAppointmentInput`/`updateAppointmentInput`/`setAppointmentStatusInput`/`deleteAppointmentInput` and `createAppointment`/`updateAppointment`/`setAppointmentStatus`/`deleteAppointment`.

- [ ] **Step 1: Write failing unit tests** `tests/reach-appointment-capabilities.test.ts` using a minimal fake client (mirror the existing `tests/reach-capabilities.test.ts` style). Cover: `createAppointmentInput` rejects empty `contact_name` and empty `kind` (`.min(1)`); rejects a non-ISO `scheduled_at` (`z.string().datetime()`); ACCEPTS a past ISO `scheduled_at`; defaults `status` to `'scheduled'`; `updateAppointment` with only `{id}` returns `{ ok:false, error:'Nothing to update.' }`; `setAppointmentStatus` round-trips through update. Run → FAIL.

- [ ] **Step 2: Add the schemas** to `src/lib/reach/capabilities.ts` (near the lead schemas):
```ts
const appointmentStatus = z.enum(['scheduled', 'completed', 'cancelled', 'no_show']);

export const createAppointmentInput = z.object({
  contact_name: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(120),
  scheduled_at: z.string().datetime(),
  via: z.string().trim().min(1).max(80).optional(),
  status: appointmentStatus.default('scheduled'),
});
export const updateAppointmentInput = z.object({
  id: z.string().uuid(),
  contact_name: z.string().trim().min(1).max(120).optional(),
  kind: z.string().trim().min(1).max(120).optional(),
  scheduled_at: z.string().datetime().optional(),
  via: z.string().trim().min(1).max(80).optional(),
  status: appointmentStatus.optional(),
});
export const setAppointmentStatusInput = z.object({ id: z.string().uuid(), status: appointmentStatus });
export const deleteAppointmentInput = z.object({ id: z.string().uuid() });

const APPOINTMENT_COLS = 'id,contact_name,kind,scheduled_at,via,status,created_at';
```

- [ ] **Step 3: Add the functions** (mirror `createLead`/`updateLead`/`setLeadStage`/`deleteLead` EXACTLY — same `writeFailed`, `org_id` from ctx, `.eq('id',id).eq('org_id',ctx.orgId)`, empty-update guard, `maybeSingle` + not-found message):
```ts
export async function createAppointment(
  ctx: ReachWriteContext,
  input: z.input<typeof createAppointmentInput>,
): Promise<CapResult<Appointment>> {
  const values = createAppointmentInput.parse(input);
  const { data, error } = await ctx.client
    .from('appointments')
    .insert({ ...values, org_id: ctx.orgId })
    .select(APPOINTMENT_COLS)
    .single();
  if (error || !data) return writeFailed('createAppointment', error);
  return { ok: true, data: data as unknown as Appointment };
}

export async function updateAppointment(
  ctx: ReachWriteContext,
  input: z.infer<typeof updateAppointmentInput>,
): Promise<CapResult<Appointment>> {
  const { id, ...fields } = updateAppointmentInput.parse(input);
  if (Object.values(fields).every((v) => v === undefined)) {
    return { ok: false, error: 'Nothing to update.' };
  }
  const { data, error } = await ctx.client
    .from('appointments')
    .update(fields)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select(APPOINTMENT_COLS)
    .maybeSingle();
  if (error) return writeFailed('updateAppointment', error);
  if (!data) return { ok: false, error: 'That appointment was not found.' };
  return { ok: true, data: data as unknown as Appointment };
}

export async function setAppointmentStatus(
  ctx: ReachWriteContext,
  input: z.infer<typeof setAppointmentStatusInput>,
): Promise<CapResult<Appointment>> {
  const { id, status } = setAppointmentStatusInput.parse(input);
  return updateAppointment(ctx, { id, status });
}

export async function deleteAppointment(
  ctx: ReachWriteContext,
  input: z.infer<typeof deleteAppointmentInput>,
): Promise<CapResult<{ id: string }>> {
  const { id } = deleteAppointmentInput.parse(input);
  const { data, error } = await ctx.client
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return writeFailed('deleteAppointment', error);
  if (!data) return { ok: false, error: 'That appointment was not found.' };
  return { ok: true, data: data as { id: string } };
}
```
(Confirm `deleteLead` in the same file uses this exact delete shape; align if it differs.)

- [ ] **Step 4: Run** `pnpm vitest run --dir tests tests/reach-appointment-capabilities.test.ts` → PASS; `pnpm exec tsc --noEmit` clean.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/reach/capabilities.ts tests/reach-appointment-capabilities.test.ts
git commit -m "feat(reach): appointment write capability layer (Zod + RLS-scoped mutations)"
```

---

### Task 3: Appointment server actions

**Files:** Modify `src/app/(app)/reach/actions.ts`; Test `tests/reach-actions.test.ts` (extend).

**Interfaces — Consumes:** Task-2 schemas + capabilities; existing `writeCtx`, `FORBIDDEN`, `runLeads` pattern. **Produces:** `createAppointmentAction`/`updateAppointmentAction`/`setAppointmentStatusAction`/`deleteAppointmentAction`.

- [ ] **Step 1: Write failing guard tests** (extend `tests/reach-actions.test.ts`, mirroring the lead guard tests): a demo viewer and a plain viewer each get `{ ok:false }` from `createAppointmentAction` and the capability spy is NOT called; invalid input returns `ok:false`; an authorized member reaches the capability. Run → FAIL.

- [ ] **Step 2: Add the helper + actions** (mirror `runLeads` exactly, new path constant):
```ts
const APPOINTMENTS_PATHS = ['/reach/appointments'];

async function runAppointments<I, O>(
  schema: ZodType<I>,
  input: unknown,
  fn: (ctx: ReachWriteContext, parsed: I) => Promise<CapResult<O>>,
): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That input was not valid.' };
  }
  const result = await fn(ctx, parsed.data);
  if (result.ok) for (const path of APPOINTMENTS_PATHS) revalidatePath(path);
  return result;
}

export async function createAppointmentAction(input: unknown) {
  return runAppointments(createAppointmentInput, input, createAppointment);
}
export async function updateAppointmentAction(input: unknown) {
  return runAppointments(updateAppointmentInput, input, updateAppointment);
}
export async function setAppointmentStatusAction(input: unknown) {
  return runAppointments(setAppointmentStatusInput, input, setAppointmentStatus);
}
export async function deleteAppointmentAction(input: unknown) {
  return runAppointments(deleteAppointmentInput, input, deleteAppointment);
}
```
Import the four schemas + capabilities from `@/lib/reach/capabilities`.

- [ ] **Step 3: Run** the extended `tests/reach-actions.test.ts` → PASS; `tsc --noEmit` clean.

- [ ] **Step 4: Commit.**
```bash
git add "src/app/(app)/reach/actions.ts" tests/reach-actions.test.ts
git commit -m "feat(reach): server actions for appointment CRUD (edit-data gated)"
```

---

### Task 4: Appointment AI tools + id-bearing read + approval + parity  **[CLEAN CUT 4a]**

**Files:** Modify `src/lib/ai/tools.ts`, `src/lib/ai/products.ts`, `src/components/chat/tool-parts.ts`; Test `tests/reach-ai-parity.test.ts` (extend) + the relevant appointments-read test.

**Interfaces — Consumes:** Task-2 schemas/capabilities; `createReachTools`, `REACH_WRITE_TOOL_NAMES`. **Produces:** AI tools `createAppointment`/`updateAppointment`/`setAppointmentStatus`/`deleteAppointment`; the upcoming-appointments read tool now includes `id`.

- [ ] **Step 0 (RULING — do FIRST): re-read the current structure.** Read `src/lib/ai/products.ts` (the `REACH_WRITE_TOOL_NAMES` array + `reachProduct`/`split`/`combineToolkits`), `src/lib/ai/tools.ts` (the `createReachTools(data, now, write?)` write block — where lead write tools live behind the `canWrite` gate — and the upcoming-appointments read tool built on `filterUpcomingAppointments`), and `src/components/chat/tool-parts.ts` (`approvalTitle`/`approvalDetail`, the `the(label, kind)` helper, `ItemKind`). Wire the new tools into **that** structure; the code below shows intent, not line numbers.

- [ ] **Step 1: Add `id` to the upcoming-appointments read tool.** In `src/lib/ai/tools.ts`, the mapper (`filterUpcomingAppointments` or the read tool's `execute`) must include each appointment's `id` (and `status`) in its output, so the model can target one by name→id without asking the owner. Add a failing unit test first (a new or existing appointments-summary test asserting the result rows carry `id`), run → FAIL, add the fields → PASS.

- [ ] **Step 2: Add the 4 write tools** inside `createReachTools`'s write block (after the lead tools), importing the capabilities aliased + their schemas (match the existing `cap`-prefix import convention, alphabetical):
```ts
createAppointment: tool({ description: 'Book an appointment. Needs the owner’s approval before it is saved.', inputSchema: createAppointmentInput, execute: async (input) => capCreateAppointment(ctx, input) }),
updateAppointment: tool({ description: 'Edit an appointment by id (contact, kind, time, channel). Needs approval.', inputSchema: updateAppointmentInput, execute: async (input) => capUpdateAppointment(ctx, input) }),
setAppointmentStatus: tool({ description: 'Mark an appointment by id scheduled, completed, cancelled or no_show. Needs approval.', inputSchema: setAppointmentStatusInput, execute: async (input) => capSetAppointmentStatus(ctx, input) }),
deleteAppointment: tool({ description: 'Delete an appointment by id. Cannot be undone; needs approval.', inputSchema: deleteAppointmentInput, execute: async (input) => capDeleteAppointment(ctx, input) }),
```

- [ ] **Step 3: Gate them** — add `'createAppointment'`, `'updateAppointment'`, `'setAppointmentStatus'`, `'deleteAppointment'` to `REACH_WRITE_TOOL_NAMES` in `src/lib/ai/products.ts`. (`combineToolkits` turns every tool in a product's `write` set into a `'user-approval'` entry, so this gates them in Jebat and Tuah alike.)

- [ ] **Step 4: Approval copy** in `src/components/chat/tool-parts.ts` `approvalTitle` (use the file's current `the()`/literal convention; `ItemKind` has no `'appointment'`, so use literals like the lead cases): createAppointment → ``Book appointment with “${i.contact_name ?? ''}”?``; updateAppointment → `'Save changes to this appointment?'`; setAppointmentStatus → ``Mark this appointment “${i.status ?? ''}”?``; deleteAppointment → `'Delete this appointment?'`. Add `'deleteAppointment'` to the `approvalDetail` "cannot be undone" set.

- [ ] **Step 5: Extend the parity test** (`tests/reach-ai-parity.test.ts`): assert `tools.createAppointment.inputSchema === createAppointmentInput` (+ the other 3 by identity), and that the all-write-tools-gated exact-set regression (built write tools vs `REACH_WRITE_TOOL_NAMES`) still matches with the 4 new names.

- [ ] **Step 6: Run** `pnpm vitest run --dir tests tests/reach-ai-parity.test.ts <appointments-summary test>` → PASS; `tsc --noEmit` clean; and the chat-route + approval regression tests (whatever they are named now) → no regression.

- [ ] **Step 7: Commit.**
```bash
git add src/lib/ai/tools.ts src/lib/ai/products.ts src/components/chat/tool-parts.ts tests/
git commit -m "feat(reach): AI appointment write tools (approval-gated) + id in read; parity"
```

> **Clean cut point:** after Task 4, appointments CRUD is shipped end-to-end minus its screen ("4a"). Tasks 5–8 can be a "4b" run.

---

### Task 5: Live Appointments screen + nav/live-screens + prompt

**Files:** Create `src/components/reach/appointments-table.tsx`; Modify `src/screens/reach/appointments.tsx`, `src/config/live-screens.ts`, `src/lib/ai/agents/prompts.ts`; regenerate routes.

**Interfaces — Consumes:** `getReachData().listAppointments()`, `getViewer`, `can`, the Task-3 appointment actions, `Appointment`/`AppointmentStatus`/`APPOINTMENT_STATUSES` from `@/lib/reach/types`.

- [ ] **Step 1: Create the live screen** `src/screens/reach/appointments.tsx` — a server component modelled on `src/screens/reach/leads.tsx`: `const supabase = await createClient(); const [data, viewer] = await Promise.all([getReachData(supabase), getViewer()]); const appts = await data.listAppointments(); const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');` Render a header + `<AppointmentsTable appointments={appts} canEdit={canEdit} />`. Keep existing widgets/KPIs where they have a real source (e.g. count of upcoming); sourceless widgets → "Not available yet".

- [ ] **Step 2: Create `src/components/reach/appointments-table.tsx`** (`'use client'`) modelled on `src/components/reach/lead-funnel-table.tsx`: a table (contact, kind, when=`scheduled_at` via a date formatter, via, status) with, when `canEdit`: a "New appointment" dialog (contact_name; kind; a `datetime-local`→ISO `scheduled_at`; via; status `Select` over `APPOINTMENT_STATUSES`), row Edit, a per-row status `Select` calling `setAppointmentStatusAction`, inline two-step confirm Delete, `role="alert"` errors, `useTransition`. Import types from `@/lib/reach/types` only — **never** `@/lib/ai/tools`. No purple/violet. Convert the `datetime-local` value to a full ISO string (`new Date(value).toISOString()`) before sending, so it satisfies `z.string().datetime()`.

- [ ] **Step 3: Mark it live + regenerate routes.** Add `'reach/appointments'` to `LIVE_SCREENS` in `src/config/live-screens.ts` (Jebat group). Run `node scripts/gen-screen-routes.mjs` (expect `wrote 0, removed 0` — the route already exists; it only rewrites if the module path changed) and `node scripts/gen-screen-routes.mjs --check` (must pass).

- [ ] **Step 4: Prompt.** In `src/lib/ai/agents/prompts.ts`, extend the `JEBAT_SYSTEM` capability line to include booking/editing/rescheduling/cancelling/completing appointments, and the id-from-a-listing note to mention appointments. (Confirm Tuah inherits via the shared toolkit; do not hand-edit `TUAH_SYSTEM` unless its capability line omits appointments.)

- [ ] **Step 5: Verify.** `pnpm exec tsc --noEmit`; `pnpm exec eslint src/screens/reach/appointments.tsx src/components/reach/appointments-table.tsx src/config/live-screens.ts`; grep the two new files for `purple|violet|indigo|fuchsia` (none); `pnpm vitest run --dir tests` (no regressions, incl. `screen-routes` + `live-screens`).

- [ ] **Step 6: Commit.**
```bash
git add src/screens/reach/appointments.tsx src/components/reach/appointments-table.tsx src/config/live-screens.ts src/lib/ai/agents/prompts.ts "src/app/(app)/reach/appointments/page.tsx"
git commit -m "feat(reach): live Appointments screen with gated CRUD + status"
```

---

### Task 6: `deriveReportsModel` (pure) + tests

**Files:** Create `src/lib/reach/reports.ts`; Test `tests/reach-reports.test.ts`.

**Interfaces — Consumes:** `Lead`, `Campaign`, `Appointment`, `Channel`, `LeadStage` from `@/lib/reach/types`; `deriveLeadSummary` from `@/lib/ai/tools` (server-only; this file is only used by the server screen). **Produces:** `ReportRange`, `ReportsModel`, `deriveReportsModel`.

- [ ] **Step 1: Write failing tests** `tests/reach-reports.test.ts`: (a) a lead with `created_at` exactly on the cutoff IS included (inclusive `>=`); a lead older than the range is excluded; (b) `leadsByChannel` groups correctly; (c) `topChannels` conv_pct = round(qualified/leads*100), and qualified counts stages qualified+booked+won; (d) `appointmentStats.show_rate_pct` = round(completed/(completed+no_show)*100), and is `null` when completed+no_show===0; (e) empty input → zeros, `show_rate_pct` null, no NaN. Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/reach/reports.ts`:
```ts
import type { Appointment, Campaign, Channel, Lead, LeadStage } from '@/lib/reach/types';
import { deriveLeadSummary } from '@/lib/ai/tools';

export type ReportRange = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<ReportRange, number> = { '7d': 7, '30d': 30, '90d': 90 };
const QUALIFIED_OR_BEYOND: LeadStage[] = ['qualified', 'booked', 'won'];
const CHANNELS: Channel[] = ['whatsapp', 'facebook', 'instagram', 'tiktok'];

export type ReportsModel = {
  range: ReportRange;
  totalLeads: number;
  leadsTrend: { label: string; leads: number; qualified: number }[];
  leadsByChannel: { channel: Channel; leads: number }[];
  funnel: ReturnType<typeof deriveLeadSummary>['funnel'];
  topChannels: { channel: Channel; leads: number; qualified: number; conv_pct: number }[];
  appointmentStats: {
    scheduled: number; completed: number; cancelled: number; no_show: number;
    show_rate_pct: number | null;
  };
};

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export function deriveReportsModel(
  leads: Lead[],
  _campaigns: Campaign[],
  appointments: Appointment[],
  range: ReportRange,
  now: Date,
): ReportsModel {
  const cutoff = now.getTime() - RANGE_DAYS[range] * 86_400_000;
  const inRange = (iso: string) => new Date(iso).getTime() >= cutoff;
  const ls = leads.filter((l) => inRange(l.created_at));
  const appts = appointments.filter((a) => inRange(a.created_at));
  const qualified = (l: Lead) => QUALIFIED_OR_BEYOND.includes(l.stage);

  const weeks = Math.max(1, Math.ceil(RANGE_DAYS[range] / 7));
  const leadsTrend = Array.from({ length: weeks }, (_, i) => {
    const from = cutoff + i * 7 * 86_400_000;
    const to = from + 7 * 86_400_000;
    const wk = ls.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return t >= from && t < to;
    });
    return { label: `Wk ${i + 1}`, leads: wk.length, qualified: wk.filter(qualified).length };
  });

  const leadsByChannel = CHANNELS.map((channel) => ({
    channel,
    leads: ls.filter((l) => l.channel === channel).length,
  })).filter((r) => r.leads > 0);

  const topChannels = CHANNELS.map((channel) => {
    const chLeads = ls.filter((l) => l.channel === channel);
    const q = chLeads.filter(qualified).length;
    return { channel, leads: chLeads.length, qualified: q, conv_pct: pct(q, chLeads.length) };
  })
    .filter((r) => r.leads > 0)
    .sort((a, b) => b.leads - a.leads);

  const by = (s: Appointment['status']) => appts.filter((a) => a.status === s).length;
  const completed = by('completed');
  const no_show = by('no_show');

  return {
    range,
    totalLeads: ls.length,
    leadsTrend,
    leadsByChannel,
    funnel: deriveLeadSummary(ls, now).funnel,
    topChannels,
    appointmentStats: {
      scheduled: by('scheduled'),
      completed,
      cancelled: by('cancelled'),
      no_show,
      show_rate_pct: completed + no_show > 0 ? pct(completed, completed + no_show) : null,
    },
  };
}
```
(If `deriveLeadSummary`'s signature differs from `(leads, now)`, adapt the call; confirm by reading it in `src/lib/ai/tools.ts`.)

- [ ] **Step 3: Run** `pnpm vitest run --dir tests tests/reach-reports.test.ts` → PASS; `tsc --noEmit` clean.

- [ ] **Step 4: Commit.**
```bash
git add src/lib/reach/reports.ts tests/reach-reports.test.ts
git commit -m "feat(reach): deriveReportsModel (live analytics, honest empties)"
```

---

### Task 7: Live Reports screen + range controls + live-screens

**Files:** Create `src/components/reach/reports-controls.tsx`; Modify `src/screens/reach/reports.tsx`, `src/config/live-screens.ts`; regenerate routes.

**Interfaces — Consumes:** `deriveReportsModel`/`ReportRange` (Task 6); `getReachData`.

- [ ] **Step 1: Make the screen live** `src/screens/reach/reports.tsx` — server component: read `range` from `searchParams` (`const sp = await searchParams;` per Next 16; default `'30d'`, validate against `['7d','30d','90d']`), load live data via `getReachData(await createClient())` (`listCampaigns`/`listLeads`/`listAppointments`), call `deriveReportsModel(leads, campaigns, appts, range, new Date())`, render the existing charts from the model. leads-by-state → a "Not available yet" panel; any widget with no data in range → "No data for this range yet". Replace all mock constants. Render `<ReportsControls range={range} />` in the header actions.

- [ ] **Step 2: Create `src/components/reach/reports-controls.tsx`** (`'use client'`): the range `Select` (7d/30d/90d) updates the URL (`router.replace('/reach/reports?range=' + value)` via `next/navigation`), and the `Download` button (wired in Task 8). No `@/lib/ai/tools` import; no purple/violet.

- [ ] **Step 3: Mark live + routes.** Add `'reach/reports'` to `LIVE_SCREENS`; run `node scripts/gen-screen-routes.mjs` then `--check` (must pass).

- [ ] **Step 4: Verify.** `tsc --noEmit`; `eslint` the touched files; purple/violet grep; `pnpm vitest run --dir tests` (no regressions).

- [ ] **Step 5: Commit.**
```bash
git add src/screens/reach/reports.tsx src/components/reach/reports-controls.tsx src/config/live-screens.ts "src/app/(app)/reach/reports/page.tsx"
git commit -m "feat(reach): live Reports screen with functional range filter"
```

---

### Task 8: CSV export action + Download wiring

**Files:** Modify `src/app/(app)/reach/actions.ts`, `src/components/reach/reports-controls.tsx`; Test `tests/reach-export-csv.test.ts`.

**Interfaces — Consumes:** `getViewer`, `createClient`, `getReachData`, `ReportRange`. **Produces:** `exportLeadsCsv(range)`.

- [ ] **Step 1: Write failing tests** `tests/reach-export-csv.test.ts` for a pure `leadsToCsv(leads)` helper (export it from `actions.ts` or a small `src/lib/reach/csv.ts` — prefer the latter so it is unit-testable without the server action): header row is `id,name,channel,stage,source,created_at`; a lead whose `name` contains a comma, a double-quote, and a newline is wrapped in quotes with inner quotes doubled; an empty-source lead renders an empty field. Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/reach/csv.ts`:
```ts
import type { Lead } from '@/lib/reach/types';

function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function leadsToCsv(leads: Lead[]): string {
  const header = 'id,name,channel,stage,source,created_at';
  const rows = leads.map((l) =>
    [l.id, l.name, l.channel, l.stage, l.source ?? '', l.created_at].map(cell).join(','),
  );
  return [header, ...rows].join('\r\n');
}
```

- [ ] **Step 3: Add the server action** to `src/app/(app)/reach/actions.ts`:
```ts
export async function exportLeadsCsv(
  range: ReportRange,
): Promise<{ ok: true; filename: string; csv: string } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer.orgId) return { ok: false, error: 'Please sign in to export.' };
  const supabase = await createClient();
  const leads = await getReachData(supabase).listLeads();
  const days = { '7d': 7, '30d': 30, '90d': 90 }[range];
  const cutoff = Date.now() - days * 86_400_000;
  const inRange = leads.filter((l) => new Date(l.created_at).getTime() >= cutoff);
  const stamp = new Date().toISOString().slice(0, 10);
  return { ok: true, filename: `leads-${range}-${stamp}.csv`, csv: leadsToCsv(inRange) };
}
```
(Import `leadsToCsv` + `ReportRange`. `getReachData` is org-scoped via the session client, so RLS limits the rows; a demo viewer exports their demo org's leads, which they can already see.)

- [ ] **Step 4: Wire the Download button** in `src/components/reach/reports-controls.tsx`: on click (inside `useTransition`), call `exportLeadsCsv(range)`; on `ok`, `const blob = new Blob([res.csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = res.filename; a.click(); URL.revokeObjectURL(url);`; on `!ok`, show an inline `role="alert"` error.

- [ ] **Step 5: Run** `pnpm vitest run --dir tests tests/reach-export-csv.test.ts` → PASS; `tsc --noEmit`; `eslint` the touched files.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/reach/csv.ts "src/app/(app)/reach/actions.ts" src/components/reach/reports-controls.tsx tests/reach-export-csv.test.ts
git commit -m "feat(reach): CSV export of leads behind the Reports screen"
```

---

## Final verification (before the whole-branch review)

- [ ] `pnpm exec tsc --noEmit` clean; `pnpm vitest run --dir tests` all green; `pnpm exec eslint src tests` 0 errors; `node scripts/gen-screen-routes.mjs --check` passes.
- [ ] `get_advisors` (security) — no new warning beyond the by-design anon-access WARN on `appointments` (same as all reach/crm tables).
- [ ] Confirm every reach write tool (campaigns ×4, creatives ×3, ad_settings, forms ×4, leads ×4, promote ×1, appointments ×4) is in `REACH_WRITE_TOOL_NAMES` and the all-gated regression passes.
- [ ] Confirm no `'use client'` component imports `@/lib/ai/tools`.
- [ ] Browser smoke (writer smoke account): book/edit/advance-status/delete an appointment; ask Jebat by name to reschedule/complete one → approval card → executes; Reports loads live, the range filter changes the data, Download produces a CSV of the in-range leads; a viewer/demo sees read-only.
