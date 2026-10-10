# OpenKuasa Backend — Lekir Public Job Board Design (slice 2b)

**Date:** 2026-10-11
**Status:** Draft for review
**Module:** Lekir (`hire`)
**Milestone:** Lekir slice 2, piece 2b of 6 — a public, read-only job board per workspace.
**Builds on:** `docs/superpowers/specs/2026-10-11-lekir-jobs-crud-design.md` (2a). 2b cannot start until 2a is merged: it needs the job description, salary, closing date and work arrangement fields, and writable jobs.

---

## 1. Context & Goals

After 2a a workspace can write and open jobs, but nobody outside can see them. The Careers
Page screen is an internal list with a mock preview, a mock link and sample branding.

### Goal of this piece
A workspace can switch on a public job board. Signed-out visitors can open it, read the
workspace's open jobs, and open a page per job. The Careers Page screen shows the real
preview, the real link, and editable branding.

### Success criteria
- A visitor sees only open jobs of a workspace whose board is on, and only the public fields.
- A visitor has no access to any table; everything goes through purpose-built functions.
- The board is off until a workspace switches it on.
- The demo workspace has no public board.
- The Careers Page screen shows no sample branding to a real workspace.

---

## 2. Scope

### In scope
1. `hire_settings`: one row per workspace, with the board switch, headline and tagline.
2. Two public database functions: the board, and one job.
3. Public pages `/careers/[orgId]` and `/careers/[orgId]/[jobId]`.
4. Careers Page screen: real preview, link, Preview and Copy link, the board switch, editable
   headline and tagline.
5. One capability, `updateCareersPage`, with a server action and an AI change tool; one AI
   lookup, `getCareersPage`.
6. Page metadata so open job pages can be indexed.

### Out of scope
- Applying (2d, 2e) and the application form switches (2c, which adds columns to
  `hire_settings`).
- View counts and the visitor funnel, which stay "Not available yet".
- Short names in the URL, per-workspace colours or logos, custom domains.
- A sitemap entry per workspace.

---

## 3. Decisions & Rationale

| Decision | Choice | Why |
|---|---|---|
| Address | `/careers/<workspace-id>` and `/careers/<workspace-id>/<job-id>` | Chosen in brainstorming. Works for every workspace with nothing to set up; the same style as `/f/<form-id>`. |
| Public access | `security definer` functions, no table grants to `anon` | The public lead forms' pattern: a stranger can do only what a function decides. |
| Board switch | Off by default | Nothing becomes public by opening a job alone; a workspace chooses to publish. |
| Settings table | Created here, extended in 2c | Branding needs somewhere to live now. One row per workspace, as `ad_settings` is. |
| Brand colour | Dropped | The mock's colour field has no design behind it. The board uses the app's styling. |
| Session | Pages read with a session-less client | A member previewing sees what a stranger sees. |
| Shared helper | `createAnonymousClient` moves to `src/lib/supabase/anonymous.ts` | Hire should not import from reach. Reach re-exports it so its imports keep working. |

---

## 4. Data model

### 4.1 Migration `hire_settings`

```sql
create table public.hire_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  careers_enabled boolean not null default false,
  careers_headline text check (char_length(careers_headline) <= 80),
  careers_tagline text check (char_length(careers_tagline) <= 160),
  updated_at timestamptz not null default now()
);
```

RLS enabled; `hire_settings_select` for members; `hire_settings_write` for writers;
the restrictive `mfa_required` policy (replacing the auto-added one, as slice 1's migration
does); `grant select, insert` and `grant update (careers_enabled, careers_headline,
careers_tagline, updated_at)` to `authenticated`. No delete grant. A workspace with no row
is read as the defaults (board off, no headline, no tagline).

### 4.2 Public functions
Both are `language sql security definer stable set search_path = ''`, executable by `anon`
and `authenticated`, and return nothing for a workspace whose board is off, for the demo
workspace (`slug = 'rimba-ventures-demo'`), or for an unknown id.

`public.get_public_careers(p_org_id uuid)` returns one row per open job:
`org_name, headline, tagline, job_id, title, department, location, work_arrangement,
employment_type, closes_on, accepting`. When the board is on but there are no open jobs it
returns a single row with the org fields and a null `job_id`, so the page can show the
workspace's name and "no open roles" instead of "not found".

`public.get_public_job(p_org_id uuid, p_job_id uuid)` returns at most one row: the fields
above plus `description`, and `salary_min_cents` and `salary_max_cents` only when
`show_salary` is true (null otherwise). It requires the job to belong to `p_org_id`.

`accepting` is true when `closes_on` is null or not before today in Kuala Lumpur.

Jobs are ordered by `opened_at` descending. Never returned: `headcount`, `status`,
`created_at`, `closed_at`, applicant counts, or any other workspace's rows.

---

## 5. Code

### 5.1 `src/lib/hire/public-careers.ts` (server only)
`getPublicCareers(client, orgId)` and `getPublicJob(client, orgId, jobId)` call the two
functions and map rows to `PublicCareers | null` and `PublicJob | null`. A failed call is
logged and treated as not found. Ids are validated as UUIDs before any call.

### 5.2 Pages — `src/app/careers/[orgId]/page.tsx` and `src/app/careers/[orgId]/[jobId]/page.tsx`
- Outside the `(app)` group: no sidebar, no sign-in.
- Board page: workspace name, headline (default "Join our team" when unset), tagline, and a
  list of jobs with title, department, location, arrangement, type, and "Applications
  closed" where `accepting` is false. Empty state: "No open roles right now."
- Job page: the same header, the fields, the description as plain text with line breaks
  preserved, the salary range as "RM 4,000 – RM 6,000 a month" when present, the closing
  date, and a link back to the board. No apply button until 2d.
- Unknown, off, demo or not-open → the route's `not-found.tsx`.
- `generateMetadata`: title "<job title> at <workspace>" or "Careers at <workspace>", a
  description from the tagline or the first 160 characters of the job description; indexable.
- Both pages follow the `src/app/f/[formId]` conventions; read the Next.js guide in
  `node_modules/next/dist/docs/` before writing them.

### 5.2a Public page design requirements
The board and job pages are the first Lekir surfaces strangers see, most often on a phone
from a shared link. They use the app's existing tokens, fonts and components (no new
palette, no purple or violet), following the public lead form page for tone.

- **Mobile first.** Designed at 375 pixels wide and scaled up; one column; no horizontal
  scrolling; body text at least 16px with a line height of 1.5 or more; the job description
  is held to a readable measure (about 65 to 75 characters) on wide screens.
- **Hierarchy.** One `h1` per page (the workspace's headline on the board, the job title on
  a job page), then `h2` for sections; no skipped levels.
- **Job list.** Each job is one large link target (the whole card, at least 44 pixels
  tall) with the title as the link text, then department, location, arrangement and type
  as text. "Applications closed" is a word, never colour alone.
- **Job page.** Key facts (location, arrangement, type, salary when shown, closing date)
  sit in a short definition list above the description, so they are scannable before the
  long text. A visible "All open roles" link returns to the board.
- **Dates and money** are formatted for Malaysia: "31 October 2026", "RM 4,000 – RM 6,000
  a month", using tabular figures.
- **Empty and missing states** say what happened and what to do: "No open roles right now.
  Check back soon." and, for not found, "This page isn't available. The role may have been
  filled or the link may be out of date."
- **Contrast and focus.** Text meets 4.5:1 in light and dark themes; focus rings are
  visible on every link.
- **Performance.** Server-rendered with no client JavaScript needed to read a job; no
  layout shift; no images required.
- **Keyboard and screen reader.** A skip link to the main content; landmarks (`header`,
  `main`); the page title names the job and the workspace.

On the Careers Page screen, the same form rules as 2a's job form apply to the branding
form (visible labels, errors under the field, pending Save, confirmation that does not take
focus). The Publish switch is a real switch control with a label, states its consequence in
text beside it, and confirms before switching **on** ("Make your open jobs public?"),
since that is the step that exposes data. "Copy link" confirms with "Link copied".

### 5.3 Capability and tools
- `updateCareersPage` in `src/lib/hire/capabilities.ts`: input `careers_enabled?`,
  `careers_headline?` (up to 80), `careers_tagline?` (up to 160); upserts the workspace's
  row; refuses to switch the board on for the demo workspace.
- Server action `updateCareersPageAction`, revalidating `/hire/careers-page` and the
  public board path.
- AI change tool `updateCareersPage` (in `HIRE_WRITE_TOOL_NAMES`, so behind approval), with
  titles "Turn on the public careers page", "Turn off …", "Edit the careers page headline".
- AI lookup `getCareersPage`: whether the board is on, its address, the headline and
  tagline, and how many jobs are showing. The address is built from the app's origin and
  the session's workspace id; the model never supplies an id.

### 5.4 Data seam
`HireData` gains `getSettings(): Promise<HireSettings>` (defaults when no row). The seed
provider returns the board off.

---

## 6. Careers Page screen
- **Publish switch** in the header: on or off, calling `updateCareersPageAction`. Beside it,
  one line: "When on, your open jobs are visible to anyone with the link and can appear in
  search engines."
- **Preview** opens the public board in a new tab; **Copy link** copies its address. Both
  are disabled, with the reason as a title, while the board is off.
- **Preview card** shows the real workspace name, headline, tagline and up to three open
  jobs; "Your careers page is off" when it is.
- **Page branding card**: headline and tagline become real inputs with a Save button. The
  colour field is removed.
- **Views, applies, conversion, the trend, the funnel and the source chart** stay sample
  content for demo visitors and "Not available yet" for everyone else, as today.
- The demo workspace shows its sample branding and a disabled switch with "Not available
  in the demo".
- A viewer sees everything read-only.

---

## 7. Prompts
- `LEKIR_SYSTEM`, the hire specialist rule and both Tuah prompts add: the careers page can
  be turned on or off and its headline and tagline edited, behind approval; turning it on
  makes open jobs public, so say that in the same breath when proposing it.
- The test tying the prompt to the change tools is widened to allow `updateCareersPage`.

---

## 8. Error handling
- Any failure on a public page → not found. No error detail reaches a visitor.
- Capability errors follow 2a's rule: generic for a database failure, specific for a rule.
- A malformed id in the URL → not found, without a database call.

---

## 9. Testing
- **Migration** (text): table, checks, policies, grants; both functions are `security
  definer` with an empty `search_path`; neither selects `headcount` or `status`.
- **Functions, live:** as `anon`: board off → nothing; board on → only open jobs; a draft,
  paused or closed job id → nothing from `get_public_job`; a job id of another workspace
  with the wrong org id → nothing; salary null unless `show_salary`; demo workspace →
  nothing; `anon` cannot select from `hire_jobs` or `hire_settings` directly.
- **`public-careers.ts`:** row mapping; the no-jobs row; a failed call is not found; a
  non-UUID id makes no call.
- **Pages:** render a board and a job from a mocked module; not found for null; metadata.
- **Capability:** upsert with and without an existing row; length limits; demo refusal.
- **Tools and prompts:** as 2a.
- **Smoke, local then production, as the smoke account:** switch the board on; open a job;
  open the board in a private window and see it; pause the job and see it gone; switch the
  board off and see not found; then restore the workspace to board off.

---

## 10. Security & Independence
- `anon` gets execute on two functions and nothing else. The functions take ids as their
  only input and build no dynamic SQL.
- A workspace id in a URL is not a secret and grants nothing beyond the public fields.
- Descriptions, headlines and taglines are rendered as text. No HTML, no Markdown.
- No reference-product names; no purple or violet.

---

## 11. Delivery
- Branch from `main` after 2a merges; next free number.
- Migration `hire_settings` (table and functions), applied before the merge deploys, after a yes.
- One pull request, squash-merged.

---

## 12. Affected / new files
- **New:** one migration; `src/lib/supabase/anonymous.ts`; `src/lib/hire/public-careers.ts`;
  `src/app/careers/[orgId]/{page,not-found}.tsx`; `src/app/careers/[orgId]/[jobId]/page.tsx`;
  `src/screens/hire/careers-controls.tsx` (client: switch, copy link, branding form); tests.
- **Changed:** `src/lib/hire/{types,seed,supabase,capabilities,lists}.ts`;
  `src/lib/reach/public-forms.ts` (re-export); `src/app/(app)/hire/actions.ts`;
  `src/lib/ai/hire-tools.ts`; `src/lib/ai/agents/prompts.ts`; `src/lib/chat/change-titles.ts`;
  `src/components/chat/tool-parts.ts`; `src/screens/hire/careers-page.tsx`.
