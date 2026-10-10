# OpenKuasa Backend — Lekir Jobs CRUD Design (slice 2a)

**Date:** 2026-10-11
**Status:** Draft for review
**Module:** Lekir (`hire`)
**Milestone:** Lekir slice 2, piece 2a of 5 — jobs become writable from the Jobs screen and from Lekir.
**Builds on:** `docs/superpowers/specs/2026-10-10-lekir-foundation-design.md` (slice 1, merged as PR #113).

---

## 1. Context & Goals

Slice 1 put hiring on Postgres read-only: four tables, eight screens reading them, and Lekir
with eight lookup tools. Nothing can be created or changed.

Slice 2 was "Jobs + Careers Page" in the roadmap. In brainstorming it grew to include a
public job board and public applications, so it is built as five pieces, each with its own
spec, plan and pull request:

| Piece | Delivers |
|---|---|
| **2a (this spec)** | Jobs CRUD from the Jobs screen and from Lekir with approval cards |
| 2b | Public, read-only job board and job pages; real branding on the Careers Page screen |
| 2c | Application form settings (the Settings screen's "Application form" card, pulled forward from slice 4) |
| 2d | Public apply form that creates a candidate and an application; CV as a link |
| 2e | CV upload as a PDF |

### Goal of this piece
A member who is not a viewer can create, edit, open, pause, close, reopen and delete jobs on
the Jobs screen, and can ask Lekir or Tuah to do the same, each change behind an Approve card.

### Success criteria
- Every job change goes through one capability function, used by both the server action and
  the AI tool, so the screen and the assistant accept exactly the same input.
- Tenancy and role are enforced in Postgres (write policy and grants), not only in the app.
- A viewer, a demo visitor and a member of another workspace cannot change a job by any route.
- Lekir's and Tuah's prompts say what can now be changed, and no more than that.
- Slice 1's read behaviour and tests are unaffected.

---

## 2. Scope

### In scope
1. Seven new columns on `hire_jobs`; write policy and grants.
2. `src/lib/hire/capabilities.ts`: `createJob`, `updateJob`, `setJobStatus`, `deleteJob`.
3. Server actions for the four capabilities.
4. Jobs screen: job form in a side panel; row actions; delete confirm.
5. Careers Page screen: its publish action opens or closes a job.
6. Four AI change tools behind approval, for Lekir and (through `askLekir`) Tuah.
7. Prompt changes for Lekir, the hire specialist and both Tuah prompts.
8. Demo seed fills the new columns.

### Out of scope
- Anything public (2b, 2d, 2e) and the settings table (2c).
- Changing candidates, applications or interviews (slices 3 and 4).
- The Jobs screen's search box and filters, which stay disabled.
- Job templates, duplication, approvals workflow, job board integrations.

---

## 3. Decisions & Rationale

| Decision | Choice | Why |
|---|---|---|
| Write pattern | RLS write policy `private.is_org_writer(org_id)` plus column-level grants | The pattern locked in the Jebat data foundation and used by every write slice since. |
| Single write path | One Zod schema and one function per change in `capabilities.ts` | The AI tool's input schema is the same schema the server action parses with. |
| New fields | Description, salary range with a show switch, closing date, work arrangement, headcount | Chosen in brainstorming. The public board (2b) needs description, salary and closing date. |
| Money | Monthly salary in sen (`bigint`) | Money is stored in cents everywhere else. |
| Opening | A job cannot be opened without a description | It will be shown publicly in 2b. A draft needs only a title. |
| Delete | Only a job with no applications | Deleting cascades to applications and interviews. Closing keeps the history. |
| Lekir "post it" | Creates a draft | Nothing becomes open, and later public, without a deliberate open. |
| Status transitions | Enforced in the capability | One place; the screen only offers the valid ones. |

---

## 4. Data model

### 4.1 Migration `hire_jobs_writes`

Additive columns on `public.hire_jobs`:

| Column | Type | Notes |
|---|---|---|
| description | text | nullable; required to open |
| salary_min_cents | bigint | nullable; check `>= 0` |
| salary_max_cents | bigint | nullable; check `>= 0` |
| show_salary | boolean not null default false | whether the public board may show the range |
| closes_on | date | nullable; last day to apply |
| work_arrangement | text | nullable; check in (`onsite`, `hybrid`, `remote`) |
| headcount | integer not null default 1 | check `>= 1` |

Table check: `salary_min_cents is null or salary_max_cents is null or salary_max_cents >= salary_min_cents`.

Access, added together in the same migration:

```sql
create policy hire_jobs_write on public.hire_jobs for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.hire_jobs to authenticated;
grant update (title, department, location, employment_type, status, opened_at, closed_at,
              description, salary_min_cents, salary_max_cents, show_salary, closes_on,
              work_arrangement, headcount) on public.hire_jobs to authenticated;
grant delete on public.hire_jobs to authenticated;
```

`id`, `org_id` and `created_at` are never in the update grant.

### 4.2 Delete guard in the database
The capability refuses to delete a job that has applications, but a direct API call could
still cascade. So the rule is also in Postgres: a `before delete` trigger on `hire_jobs`
raises when the job still has any application. Nothing needs to bypass it: the demo reseed
deletes the demo workspace's interviews and applications first and its jobs after, and
deleting a whole workspace removes rows through the `org_id` cascades, where each table's
rows go with the org. The trigger checks for applications of the job being deleted at the
time it fires, so the plan must verify that an org delete still succeeds (applications
removed by their own `org_id` cascade before or after the job's) and, if the order makes the
trigger fire wrongly, scope the trigger to deletes that are not part of an org delete by
checking that the org row still exists.

### 4.3 Demo seed
A new migration replaces `private.reseed_demo_hire()` to fill the new columns for the nine
demo jobs (a short description each, a salary range on the open ones with `show_salary`
true on four of them, `closes_on` two to four weeks ahead on three, a work arrangement, and
headcount 1 to 3) and to delete the demo workspace's interviews and applications before
its jobs. While the function is
open, interview times are snapped to working hours in Kuala Lumpur (09:00 to 17:00, on the
hour or half hour) so the demo no longer shows interviews at 1:51am. Counts, stages, sources
and the ten interviews' statuses do not change, so slice 1's parity checks still hold;
`src/lib/hire/seed.ts` gets the same changes.

### 4.4 Types
`Job` in `src/lib/hire/types.ts` gains the seven fields, with `WorkArrangement` as a union.
The provider's `JOB_COLUMNS` gains them. `ReachWriteContext`'s shape is reused under a hire
name: `HireWriteContext = { client: SupabaseClient; orgId: string }`.

---

## 5. Capability layer — `src/lib/hire/capabilities.ts`

`CapResult<T> = { ok: true; data: T } | { ok: false; error: string }`, as in reach. A
database error is logged and the caller sees a generic line; a rule the user broke gets a
specific, fixable message.

| Capability | Input | Rules |
|---|---|---|
| `createJob` | title (1 to 120), department?, location?, employment_type (default `full_time`), work_arrangement?, description? (up to 10,000), salary_min_cents?, salary_max_cents?, show_salary (default false), closes_on?, headcount (default 1) | Always created as `draft`. Max salary not below min. `closes_on` not in the past. |
| `updateJob` | id, and any of the fields above | Same field rules. Does not change status. Clearing the description of an open or paused job is refused. |
| `setJobStatus` | id, status (`open`, `paused`, `closed`) | Transitions below. Opening needs a non-empty description. |
| `deleteJob` | id | Refused when the job has applications: "This job has applications. Close it instead." |

Status transitions:

| From | Allowed to |
|---|---|
| draft | open |
| open | paused, closed |
| paused | open, closed |
| closed | open |

`opened_at` is set the first time a job becomes open and never cleared. `closed_at` is set
on close and cleared on reopen. A request for the status a job already has succeeds without
a write. Anything else returns `ok: false` with a line naming the allowed moves.

`org_id` always comes from the context. An id that matches no row in the caller's workspace
returns "That job could not be found."

---

## 6. Two surfaces over one capability

### 6.1 Server actions — `src/app/(app)/hire/actions.ts`
`createJobAction`, `updateJobAction`, `setJobStatusAction`, `deleteJobAction`. Each resolves
the viewer and current org, refuses a viewer, parses with the capability's schema, calls the
capability, and revalidates `/hire/jobs`, `/hire/careers-page`, `/hire/assistant` and
`/hire/dashboard`. They return the `CapResult` so the form can show the message.

### 6.2 AI tools — `src/lib/ai/hire-tools.ts`
`createHireTools(data, now, write?)` gains an optional `write: { ctx: HireWriteContext; canWrite: boolean }`.
With `canWrite`, it adds `createJob`, `updateJob`, `setJobStatus`, `deleteJob`, whose
`inputSchema` is the capability's schema. `HIRE_WRITE_TOOL_NAMES` lists the four, which is
what puts them behind the Approve card and what Tuah's team mode turns into prepared
proposals. A viewer gets the lookups only.

`listJobs` returns each job's `id` and the new fields, so the model can pass an id to a
change tool without asking the user for it.

### 6.3 Context
`HireAccess` becomes `{ data: HireData; write?: { ctx: HireWriteContext; canWrite: boolean } }`.
`/api/hire/chat` and `/api/chat` build `write` for a non-viewer member, as the reach route does.

### 6.4 Approval titles — `src/lib/chat/change-titles.ts`
A `job` item kind; `listJobs` registered in `KIND_OF_TOOL` so a job's title is known from an
earlier lookup; titles such as "Create the job Barista (draft)", "Open the job Sales
Executive", "Close the job …", "Delete the job …", "Edit the job …" with the changed fields
as the detail line.

---

## 7. Screens

### 7.1 Jobs
- **Post a Job** opens a side panel with the job form: title, department, location, work
  arrangement, employment type, headcount, description (multi-line), salary min and max in
  RM, "Show salary publicly", closing date. Saving creates a draft and closes the panel.
- Each row gains a menu: Edit (same panel, prefilled), the valid status moves for its status
  (Open, Pause, Close, Reopen), and Delete with a confirm dialog. Delete is disabled, with
  the reason as its title, when the job has applicants.
- The table gains a small arrangement and headcount line under the role name. Salary and
  closing date show in the panel, not the table.
- A viewer sees the table with no button and no row menu.
- Errors from the capability show in the panel or as a toast; nothing is optimistic.
- The form is a client component fed by the server screen; the rest of the screen stays a
  server component.

### 7.3 Interaction and accessibility requirements
These apply to the job form, the row menu and the delete confirm. They follow the app's
existing CRUD screens (`src/screens/crm/contacts-page.tsx`, `deals-page.tsx`,
`crm-form.ts`); read those first and reuse their panel, dialog and form-state pieces
rather than building new ones.

**Form**
- Every input has a visible `<label>` tied to it; placeholders are examples, never the label.
- Required fields (title) are marked, and the mark is explained once at the top of the form.
- Fields are grouped under three headings: "Role" (title, department, employment type,
  headcount), "Where" (location, work arrangement), "Details" (description, salary, closing
  date). Salary min and max sit side by side with "RM" and "a month" shown as text beside
  the inputs, and helper text under them: "Leave blank if you'd rather not say."
- Input types match the data: `inputmode="numeric"` for salary and headcount,
  `type="date"` for the closing date.
- A field is validated when the user leaves it, not on every keystroke. Its error appears
  directly under it, says what is wrong and how to fix it ("Maximum salary can't be lower
  than the minimum"), and is announced (`aria-describedby`, `role="alert"`).
- On a failed save, focus moves to the first field with an error. A server-side refusal
  that belongs to a field is shown under that field; anything else shows at the top of the
  panel with a way forward.
- The Save button shows a pending state and is disabled while saving, so a double click
  cannot create two jobs. Success closes the panel and shows a brief confirmation that does
  not take focus (`aria-live="polite"`).
- Closing the panel with unsaved changes asks first.

**Panel and dialogs**
- The panel and the delete confirm trap focus while open, close on Escape, and return focus
  to the control that opened them.
- The delete confirm names the job, says it cannot be undone, puts the destructive button
  in the danger style and away from Cancel, and focuses Cancel first.

**Row actions**
- The row menu button has an accessible name that includes the job ("Actions for Sales
  Executive"). Every action is reachable by keyboard.
- Status is never shown by colour alone: the pill carries the word.
- A disabled action says why in its title and in text a screen reader gets.
- Hit areas are at least 44 by 44 pixels; the screen works at 375 pixels wide without
  horizontal scrolling (the table scrolls inside its own container, as it does now).

**Motion**
- Panel and dialog transitions are 150 to 300 ms, use transform and opacity only, and are
  removed under `prefers-reduced-motion`.

### 7.2 Careers Page
The row action that reads "Publish" for a draft, paused or closed job calls
`setJobStatusAction` with `open`; for a published job it reads "Unpublish" and closes it.
The header's Publish and Preview buttons stay disabled until 2b.

---

## 8. Prompts

- **`LEKIR_SYSTEM`:** the read-only paragraph becomes: it can create, edit, open, pause,
  close, reopen and delete jobs, each behind the owner's approval; it still cannot change
  candidates, applications or interviews. It gains Jebat's change rules: call the change
  tool straight away; never ask "are you sure?"; never say a change is done before it is
  approved; a rejected change is the owner's choice, not a permissions problem; report an
  approved change in the past tense; get a job's id from `listJobs`, never from the user. It
  adds: a new job is always a draft, so say so and offer to open it; a job needs a
  description before it can be opened; a job with applications cannot be deleted, so offer
  to close it.
- **`SPECIALIST_RULES.hire`:** the lookup-only rule becomes the same list of what can be
  changed, in prepare-mode wording.
- **`TUAH_SYSTEM` and `tuahTeamSystem`:** "Hiring cannot be changed yet" becomes: jobs can
  be created, edited, opened, paused, closed and deleted; candidates, applications and
  interviews cannot be changed yet. `TEAM_AREA.hire` drops "Lookups only for now".
- The fairness, contact-details and scope rules are unchanged.

---

## 9. Error handling
- Database error → logged; the user sees "That change could not be saved. Please try again."
- Rule broken → the specific message from the capability.
- Viewer or signed-out → the action refuses; the tools are not offered.
- Job not in this workspace → "That job could not be found."
- A rejected Approve card → nothing is written.

---

## 10. Testing
- **Capabilities** (mocked client): every field rule; every allowed and refused transition;
  `opened_at` and `closed_at` behaviour; open without description refused; delete with
  applications refused; unknown id; `org_id` taken from the context even if the input
  carries one.
- **Migration** (text): columns, checks, policy, grants without `id`/`org_id`, trigger.
- **RLS, live:** a member inserts, updates and deletes; a viewer cannot; another workspace
  cannot read or write; `org_id` cannot be updated; deleting a job with an application
  fails at the database.
- **Tools:** the four change tools exist only with `canWrite`; their schemas are the
  capability schemas; `listJobs` returns ids; no name clashes across products.
- **Prompts:** the assertions for "cannot change anything yet" are replaced; a test ties the
  prompt's list of changes to `HIRE_WRITE_TOOL_NAMES` (every tool name ends in `Job` or
  `JobStatus`, so a new kind of change tool fails the test until the prompt grows).
- **Approval titles:** each of the four tools gives a title naming the job.
- **Routes:** a member gets the change tools, a viewer does not, in `/api/hire/chat`; Tuah's
  team mode prepares a job change and `applyChange` runs it.
- **Tuah question set:** one new case (create a job through Tuah, approve, the row exists),
  run only after a yes to a call estimate.
- **Smoke, local then production, as the smoke account:** create a draft; open it (refused
  without a description, then accepted with one); edit; pause; close; reopen; delete an
  empty job; then the same create and close through Lekir with approval. The jobs made are
  deleted afterwards.

---

## 11. Security & Independence
- Two layers: grants cap the verbs and columns, the policy scopes the rows to writers.
- `org_id` from the session; never from the model, the form or a request body.
- Approval is the experience, not the boundary: a forged approval still meets RLS.
- A job description is text from the user or the model; it is rendered as plain text,
  never as HTML.
- No reference-product names; no purple or violet.

---

## 12. Known state carried into this piece
- Each run of `tests/*.rls.test.ts` against the live project leaves an anonymous user and a
  test workspace ("Hire Test Sdn Bhd"). Removing them awaits a yes from the owner.
- The pool "Shortlisted" relabel can differ from Lekir's pool filter in a real workspace;
  that belongs to slice 3.

---

## 13. Delivery
- Branch `feat-091-lekir-jobs-crud` from `main` at `7380de5`.
- Migrations `20261014090000_hire_jobs_writes.sql` and `20261014090100_hire_jobs_demo_seed.sql`,
  applied to the live project before the merge deploys, each after a yes.
- One pull request, squash-merged, rebased onto `origin/main` first.

---

## 14. Affected / new files
- **New:** two migrations; `src/lib/hire/capabilities.ts`; `src/app/(app)/hire/actions.ts`;
  `src/screens/hire/job-form.tsx` and `src/screens/hire/job-row-actions.tsx` (client
  components); tests for capabilities, actions, RLS writes and approval titles.
- **Changed:** `src/lib/hire/{types,seed,supabase,lists}.ts`; `src/lib/ai/hire-tools.ts`;
  `src/lib/ai/products.ts`; `src/lib/ai/agents/{prompts,orchestrator}.ts`;
  `src/lib/chat/change-titles.ts`; `src/app/api/hire/chat/route.ts`; `src/app/api/chat/route.ts`;
  `src/screens/hire/{jobs,careers-page}.tsx`; the prompt, tool and route tests;
  `evals/tuah/cases.ts`.
