# Jebat Appointments CRUD + Reports (live + CSV) — Design (Slice 4)

**Status:** approved in chat 2026-10-10. Source of truth for the plan.

## 1. Goal

Make the last two static Jebat (reach) screens live on Postgres: **Appointments**
as full CRUD (writes + approval-gated AI tools with AI↔UI capability parity, two-layer
RLS), and **Reports** as read-only analytics derived from live data, with a CSV export.
This completes "full CRUD / live data across the Jebat screens that have a data shape".
The **AI Agents** screen is explicitly out of scope (no data model; needs its own product
decision) and stays as-is.

## 2. Context & what already exists (surveyed 2026-10-10 on `main`)

- `appointments` table EXISTS (slice 1), read-only: columns `id uuid pk`, `org_id uuid
  not null (FK orgs on delete cascade)`, `contact_name text not null`, `kind text not
  null`, `scheduled_at timestamptz not null`, `via text null`, `created_at timestamptz
  default now()`. Policies `appointments_select (is_org_member)` + `mfa_required`
  (restrictive). Grants: authenticated has **SELECT only**. No status column, no
  kind/via CHECK, no updated_at, no FK to leads.
- Provider `createSupabaseReachData` already has `listAppointments` selecting
  `id,contact_name,kind,scheduled_at,via,created_at`; seed provider has `seedAppointments`.
  `Appointment` type (`src/lib/reach/types.ts`): `{ id, contact_name, kind, scheduled_at,
  via, created_at }` (kind/via are `string`, free-text).
- No appointment **write** capabilities, actions, or AI write tools exist yet. An
  appointments READ tool exists in `src/lib/ai/tools.ts` (`filterUpcomingAppointments`
  → an "upcoming appointments" tool).
- `reach/appointments`, `reach/reports`, `reach/agents` screens are all static/sample and
  are **not** in `src/config/live-screens.ts` `LIVE_SCREENS` (they show the WIP banner).
- Reports screen (`src/screens/reach/reports.tsx`) renders, from mock data: a leads-over-
  time trend, leads-by-source donut, a lead funnel, a leads-by-state bar chart, and a
  "top sources" table (source, leads, qualified, conv%, RM value); plus a date-range
  `Select` (30d default) and a `Download` button — both inert today.
- The AI toolkit was refactored into per-product toolkits in `src/lib/ai/products.ts`
  (#89), and Tuah AI work keeps landing (#86/#89/#92). No work is in flight on
  appointments or reports (low overlap risk), but the plan MUST re-verify the current AI
  toolkit/gating structure before wiring appointment tools (a slice-3-style ruling).

## 3. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Appointment lifecycle | Add `status` ∈ `scheduled | completed | cancelled | no_show`, default `scheduled` | Enables mark-done/cancel/no-show (owner + AI) and a show-rate metric in Reports |
| kind / via | Stay **free-text** (no enum/CHECK) | Matches current data ("Discovery call", "Zoom"); flexible; YAGNI |
| Appointment ↔ lead/contact link | **None** (keep `contact_name` free text) | Keep surfaces separate (as slice 3 did); no cross-module FK |
| Reports data | **Derive-on-read** from live campaigns/leads/appointments (no new table) | Consistent with Overview (slice 1); small data; always current |
| Reports export | **CSV of the raw leads** behind the report (respecting the range filter) | Most actionable export; the aggregates are already on screen |
| Range filter | Functional: `7d | 30d | 90d`, filters by `created_at`, default `30d` | Derivable; real value |
| Not derivable → honest empty | leads-by-state (no geo field), RM value column (no deal-value source) | Never fabricate; same honesty rule as Overview |
| Two-layer access (appointments writes) | table GRANT ceiling + RLS `is_org_writer` policy; `id`/`org_id` NEVER in the UPDATE grant; `org_id` from session only | Same model proven in slices 1–3 |

## 4. Global constraints (carry into every task)

- Independence: no Kuasa brand names in `src/`; no purple/violet/indigo/fuchsia anywhere
  in the UI; fictional data only (Rimba Ventures).
- Supabase project `ugchntdgaeefmufumchx` via the `openkuasa-supabase` MCP ONLY.
- TypeScript strict; 2-space indent, single quotes, semicolons; `const` default; named
  exports; functional components + hooks; pnpm.
- A `'use client'` component must NEVER import `@/lib/ai/tools` (pulls `ai`/`zod` into the
  client bundle). Client reads `rm` from `@/lib/reach/format` and types from
  `@/lib/reach/types`.
- A new live screen MUST be added to `src/config/live-screens.ts` `LIVE_SCREENS`, and its
  route regenerated via `node scripts/gen-screen-routes.mjs` (predev/prebuild hook;
  `screen-routes --check` test), or it renders the false WIP banner (slice-3 lesson).

---

## 5. Cluster 4a — Appointments CRUD

### 5.1 Migration (`supabase/migrations/<ts>_reach_appointments_writes.sql`)

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

(No FK, no `updated_at` — matches the leads slice. Controller applies the migration via
the MCP; implementers own the committed file + TS + tests.)

### 5.2 Types / provider / seed

- `Appointment` gains `status: AppointmentStatus`; add
  `export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';`
  and `export const APPOINTMENT_STATUSES: AppointmentStatus[] = [...]`.
- Provider `listAppointments` select → `id,contact_name,kind,scheduled_at,via,status,created_at`.
- `seedAppointments`: add `status` to each fixture (e.g. mix of `scheduled`, one
  `completed`) so the sample screen and the Reports show-rate read sensibly.

### 5.3 Capability layer (`src/lib/reach/capabilities.ts`)

One Zod schema + one async fn per mutation, `ReachWriteContext = { client, orgId }`,
`CapResult<T>`, `writeFailed`. `org_id` from `ctx`, never input. `status`/`org_id`/`id`
never settable except as designed below.

- `createAppointmentInput = z.object({ contact_name: z.string().trim().min(1), kind:
  z.string().trim().min(1), scheduled_at: z.string().datetime(), via: z.string().trim().min(1).optional(),
  status: z.enum(APPOINTMENT_STATUSES).default('scheduled') })` → `createAppointment`.
- `updateAppointmentInput = z.object({ id: z.string().uuid() }).merge(<the create fields,
  all optional, no default on status>)` with an empty-update guard (matches the campaign/
  lead pattern) → `updateAppointment`.
- `setAppointmentStatusInput = z.object({ id: z.string().uuid(), status: z.enum(APPOINTMENT_STATUSES) })`
  → `setAppointmentStatus`.
- `deleteAppointmentInput = z.object({ id: z.string().uuid() })` → `deleteAppointment`.
- `APPOINTMENT_COLS = 'id,contact_name,kind,scheduled_at,via,status,created_at'`;
  update/delete `.eq('id', id).eq('org_id', ctx.orgId)`.

### 5.4 Server actions (`src/app/(app)/reach/actions.ts`)

A `runAppointments` helper mirroring `runLeads`: guard FIRST via `writeCtx()` (deny
`viewer.isDemo || !can(viewer.role, 'edit-data')` → `FORBIDDEN` before parsing), THEN
`safeParse` (surface the Zod issue message, generic fallback), THEN the capability, THEN
`revalidatePath` on `APPOINTMENTS_PATHS = ['/reach/appointments']` only when `ok`. Four
actions: `createAppointmentAction` / `updateAppointmentAction` / `setAppointmentStatusAction`
/ `deleteAppointmentAction`, each routing through `runAppointments`.

### 5.5 AI tools (`src/lib/ai/tools.ts` + the per-product toolkit)

- Add `createAppointment` / `updateAppointment` / `setAppointmentStatus` / `deleteAppointment`
  write tools, each `inputSchema` = the matching capability schema **by identity** (parity),
  `execute` calls the matching capability. They live in the write block (unavailable to a
  read-only caller).
- The existing **upcoming-appointments READ tool must surface `id`** (so the model can
  target an appointment by name→id without asking the owner — the slice-2/3 fix).
- Register the 4 names so they are approval-gated in **both** Jebat and Tuah. **The plan
  must first re-read `src/lib/ai/products.ts` + `orchestrator.ts` (post-#89/#92) and wire
  the tools + gating into the current structure** (the `WRITE_TOOL_NAMES`-equivalent), then
  extend the parity + all-gated regression tests to include the 4 names.
- Approval copy in `src/components/chat/tool-parts.ts` `approvalTitle`: createAppointment →
  `Book appointment with "${i.contact_name ?? ''}"?`; updateAppointment → 'Save changes to
  this appointment?'; setAppointmentStatus → `Mark this appointment "${i.status ?? ''}"?`;
  deleteAppointment → 'Delete this appointment?' + add `deleteAppointment` to the
  "cannot be undone" `approvalDetail` set.

### 5.6 Live screen (`src/screens/reach/appointments.tsx` + a client table)

Live server component modelled on `reach/leads.tsx`: `createClient()` →
`getReachData(supabase)` + `getViewer()`; `const appts = await data.listAppointments();`
`canEdit = !viewer.isDemo && can(viewer.role, 'edit-data')`. Render a client
`AppointmentsTable` (`'use client'`, modelled on `lead-funnel-table.tsx`): columns contact,
kind, when (`scheduled_at`), via, status; when `canEdit`: a "New appointment" dialog
(contact_name, kind, a datetime input for `scheduled_at`, via, status), row Edit, a status
`Select` → `setAppointmentStatusAction`, inline two-step confirm Delete, `role="alert"`
errors, `useTransition`. No `@/lib/ai/tools` import; no purple/violet. Add
`'reach/appointments'` to `LIVE_SCREENS`; regenerate routes. Keep the Schedule nav item.

### 5.7 Prompt

Extend `JEBAT_SYSTEM` (and confirm Tuah via the shared toolkit) to mention it can book/
edit/reschedule/cancel/complete appointments, needing the id from a listing.

> **Clean cut after 4a:** appointments CRUD ships end-to-end on its own if the slice needs
> to stop before Reports.

---

## 6. Cluster 4b — Reports (live + CSV export)

### 6.1 Derive helper (`src/lib/reach/reports.ts`, pure)

`deriveReportsModel(leads: Lead[], campaigns: Campaign[], appointments: Appointment[],
range: ReportRange, now: Date): ReportsModel` where `ReportRange = '7d' | '30d' | '90d'`.
Filters `leads`/`appointments` to `created_at >= now - range` first, then produces:

- `leadsTrend`: leads bucketed by week from `created_at` (count of leads, and count at
  stage `qualified` or beyond), oldest→newest across the range.
- `leadsByChannel`: donut slices of leads grouped by `channel`.
- `funnel`: reuse `deriveLeadSummary(leadsInRange).funnel`.
- `topChannels`: per channel `{ channel, leads, qualified, conv_pct }` (conv = qualified/
  leads), sorted by leads desc. (No RM value column — omitted, not faked.)
- `appointmentStats`: counts per status + `show_rate_pct` = completed / (completed +
  no_show) when the denominator > 0, else `null`.
- `hasGeo: false` is implicit — the screen shows leads-by-state as "Not available yet".

All math is pure and unit-tested with an explicit `now`.

### 6.2 Live screen (`src/screens/reach/reports.tsx`)

Server component: reads `range` from `searchParams` (default `30d`), loads live
campaigns/leads/appointments via `getReachData`, calls `deriveReportsModel`, renders the
charts (reusing the existing chart components). A small `'use client'` `ReportsControls`
holds the range `Select` (updates the `?range=` URL param) and the `Download` button.
Empty/honest states: leads-by-state → "Not available yet"; any widget with zero data in
range → "No data for this range yet". Add `'reach/reports'` to `LIVE_SCREENS`; regenerate
routes. (Reports has no nav/registry change — it is already a reach nav item + registry key.)

### 6.3 CSV export (server action in `src/app/(app)/reach/actions.ts`)

`exportLeadsCsv(range: ReportRange): Promise<{ ok: true; filename: string; csv: string } |
{ ok: false; error: string }>` — a read, not a write: it needs a signed-in **member** (not
`edit-data`), reads leads via the user's org-scoped session (RLS enforces the org), filters
to the range, and returns a CSV string with a header row and columns `id,name,channel,
stage,source,created_at`. Fields are CSV-escaped (wrap in quotes, double embedded quotes).
`filename` like `leads-<range>-<yyyy-mm-dd>.csv`. The client `Download` button calls the
action and, on `ok`, creates a `Blob` + object URL and triggers the download; on `!ok`
shows an inline error. A demo viewer may export (it is read-only data they can already see);
if the project prefers to block demo exports, gate on `!viewer.isDemo` — **default: allow
any member** (it exposes nothing new).

### 6.4 Testing

- `deriveReportsModel` unit tests: week bucketing within/outside range, channel grouping,
  conv math, show-rate (including the zero-denominator → null case), empty input.
- CSV export: correct header + rows for seeded leads; escaping of a name containing a comma
  and a quote; range filtering; org isolation (a second org's leads never appear) via the
  live harness or a mocked client.

---

## 7. Security & review focus

- **Appointments writes:** two-layer RLS (`appointments_write` + the SELECT policy +
  `mfa_required`); `id`/`org_id` not in the UPDATE grant; `status` constrained by CHECK;
  `org_id` always from `ctx`. Live RLS test: owner can write; a second org's writer cannot
  see/alter/delete the owner's appointment; a viewer is denied. `get_advisors(security)`
  after the migration shows no new issue beyond the by-design anon-access WARN on
  `appointments` (same as every reach/crm table).
- **AI↔UI parity & gating:** every appointment write tool shares its capability schema by
  identity and is in the gated set (approval card in Jebat AND Tuah); the exact-set
  regression now includes the 4 names and still fails if a future tool is added ungated.
- **Reports/CSV:** read-only, org-scoped by RLS; no new write surface; the export returns
  only rows the caller can already read.
- **Review focus (inputs the spec implies but a happy-path test won't hit):** an invalid /
  past `scheduled_at` (Zod `.datetime()` rejects non-ISO; past dates are allowed — a
  backdated appointment is valid); an empty-string contact/kind (rejected by `.min(1)`);
  a range with zero leads (honest "No data for this range yet", not a crash); a lead/appt
  `created_at` exactly on the range boundary (define inclusive `>=`); a CSV field with a
  comma, quote, or newline (escaped); a huge export (cap or stream — for this slice, the
  org's own leads are small; no cap needed, note it).

## 8. Files

**New:** `supabase/migrations/<ts>_reach_appointments_writes.sql`;
`src/components/reach/appointments-table.tsx`; `src/lib/reach/reports.ts`;
`src/components/reach/reports-controls.tsx`; tests
(`reach-appointments-writes.rls.test.ts`, appointments capability/actions/parity tests,
`reach-reports.test.ts`, a CSV-export test).

**Modified:** `src/lib/reach/types.ts` (Appointment +status, AppointmentStatus);
`src/lib/reach/supabase.ts` (listAppointments select); `src/lib/reach/seed.ts`
(seedAppointments +status); `src/lib/reach/capabilities.ts` (appointment caps);
`src/app/(app)/reach/actions.ts` (runAppointments + 4 actions + exportLeadsCsv);
`src/lib/ai/tools.ts` (appointment write tools + id in the read tool); the AI toolkit/
gating file(s) per the current `products.ts`/`orchestrator.ts` structure;
`src/components/chat/tool-parts.ts` (approval copy); `src/lib/ai/agents/prompts.ts`
(JEBAT appointments line); `src/screens/reach/appointments.tsx` (live);
`src/screens/reach/reports.tsx` (live + controls); `src/config/live-screens.ts`
(+`reach/appointments`, +`reach/reports`); generated route files via `gen:routes`.

## 9. Out of scope

- The **AI Agents** screen (`reach/agents`, `crm/agents`) — no data model; its own slice.
- Any CRM (Kasturi) appointments/calendar/reports work.
- Appointment↔lead/contact linking, recurring appointments, reminders/notifications.
- Report widgets with no live source (geography, deal RM value) — shown as honest empty.
- Non-CSV export formats (PDF/Excel).

## 10. Plan order (for writing-plans)

Migration → types/provider/seed → appointment capabilities → appointment actions →
appointment AI tools + id-in-read + approval + parity (**clean cut 4a**) → live
Appointments screen + nav/live-screens/prompt → `deriveReportsModel` + tests → live
Reports screen + controls + live-screens → CSV export action + Download wiring → final
sweep (tsc/eslint/suite, `get_advisors`, `gen:routes --check`).
