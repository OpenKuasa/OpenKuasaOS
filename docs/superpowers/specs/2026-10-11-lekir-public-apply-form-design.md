# OpenKuasa Backend — Lekir Public Apply Form Design (slice 2d)

**Date:** 2026-10-11
**Status:** Draft for review
**Module:** Lekir (`hire`)
**Milestone:** Lekir slice 2, piece 2d of 6 — strangers can apply to an open job.
**Builds on:** 2b (public job pages) and 2c (application form settings). 2d cannot start until both are merged.

---

## 1. Context & Goals

After 2b a visitor can read an open job but cannot apply. This piece adds the apply form.
It is the first public write path in Lekir and the first thing that creates candidates and
applications, ahead of slice 3's editing screens.

### Goal
A visitor on an open job's page can apply. The application appears at once on the
workspace's Applications and Candidates screens, and its members are notified.

### Success criteria
- A stranger can do exactly one thing: submit an application to an open job of a workspace
  whose board is on. They gain no read access and learn nothing about other applicants.
- The form asks for what the workspace's settings say, and the database enforces the same
  requirements.
- Spam is limited by a honeypot and a per-job rate limit.
- Consent to store personal data is required and recorded.
- An existing candidate's details are never overwritten by a form.

---

## 2. Scope

### In scope
1. New columns on `hire_applications` and one on `hire_candidates`.
2. One public database function, `submit_public_application`.
3. The apply form on `/careers/[orgId]/[jobId]`, with its server action.
4. `get_public_job` (2b) also returns the form's requirements.
5. An in-app notification to the workspace's members.
6. The Applications screen shows an application's details; Lekir's lookup returns them.

### Out of scope
- CV file upload (2e) and Lekir reading CVs (2f). In this piece a CV is a link.
- Editing, moving or rejecting applications (slice 3).
- Email to the applicant or the workspace; applicant accounts; saving a draft.
- CAPTCHA. The honeypot and rate limit are the public lead forms' defences; a CAPTCHA is a
  follow-up if abuse appears.

---

## 3. Decisions & Rationale

| Decision | Choice | Why |
|---|---|---|
| Write path | One `security definer` function; no table grants to `anon` | The public lead forms' pattern (`submit_public_form`). |
| Matching a candidate | By lowercased email within the workspace | The same rule lead forms use for contacts. |
| Existing candidate | Fill only fields that are empty; never overwrite | A stranger must not be able to change a known candidate's name or phone by submitting a form with their email. Agreed in brainstorming. |
| Repeat application | Same "thank you", nothing new recorded | The form must not reveal whether an email has already applied. |
| Answers | A word, never an id | As `submit_public_form`: the caller learns only `ok` or which rule failed. |
| Consent | Required tick; time stored on the application | Personal data is being collected by the workspace through the platform. |
| Requirements | Checked in the page and again in the function | Anyone can call the function directly. |
| Source | `'Careers page'` | So the source breakdown and funnel count these correctly. |

---

## 4. Data model

Migration `hire_public_applications`:

`public.hire_applications` gains:

| Column | Type | Notes |
|---|---|---|
| cover_letter | text | up to 4,000 characters |
| cv_url | text | `http` or `https`, up to 500 characters |
| portfolio_url | text | same rule |
| expected_salary_cents | bigint | monthly, `>= 0` |
| consented_at | timestamptz | set by the function |

`public.hire_candidates` gains a partial unique index on `(org_id, lower(email)) where
email is not null`, so matching by email is unambiguous. The plan must check the demo
seed's emails are unique per org (they are: `calon<n>@demo.openkuasa.com`).

No new grants to `anon` or `authenticated` on tables. Members already have `select`.

### 4.1 `public.submit_public_application`
Parameters: `p_org_id uuid, p_job_id uuid, p_name text, p_email text, p_phone text,
p_cover_letter text, p_cv_url text, p_portfolio_url text, p_expected_salary_cents bigint,
p_consent boolean, p_honeypot text`. Returns `text`. `language plpgsql security definer
set search_path = ''`. Execute granted to `anon` and `authenticated`.

Order of checks, each returning its word:

1. Honeypot filled → `ok`, nothing recorded.
2. Lengths: name ≤ 120, email ≤ 254, phone ≤ 40, cover letter ≤ 4,000, links ≤ 500 →
   `name_too_long`, `email_too_long`, `phone_too_long`, `cover_letter_too_long`,
   `url_too_long`.
3. Name empty → `invalid_name`. Email not shaped like an address → `invalid_email`. A link
   not starting `http://` or `https://` → `invalid_url`. Negative salary → `invalid_salary`.
4. Job not found for that org → `not_found`.
5. Board off, demo workspace, job not open, or past `closes_on` (Kuala Lumpur date) →
   `closed`.
6. `p_consent` not true → `consent_required`.
7. Settings: `require_cv` and no `cv_url` → `cv_required`; `require_cover_letter` and no
   cover letter → `cover_letter_required`. Portfolio and salary are ignored (stored as
   null) when their "ask" switch is off.
8. Rate limit: 30 or more applications to this job in the last minute → `throttled`.
9. Find the candidate by `(org_id, lower(email))`. If none, insert one with name, email,
   phone, `source = 'Careers page'`, `pool_status = 'none'`. If one exists, set `phone` only
   when it is currently null; change nothing else.
10. Insert the application (`stage 'applied'`, `outcome 'active'`, `source 'Careers page'`,
    the new fields, `consented_at = now()`). On a unique violation for `(candidate_id,
    job_id)` do nothing and still return `ok`.
11. When an application was inserted, insert one notification per member of the workspace
    using the existing notifications mechanism (the plan must read how `log_event` and
    `public.notifications` are used and follow it): title "New application", body
    "<name> applied for <job title>", link `/hire/applications`.
12. Return `ok`.

The function writes no row for a refused submission.

### 4.2 `get_public_job` gains
`require_cv, require_cover_letter, ask_portfolio, ask_expected_salary`, so the page can draw
the right form. These reveal only what the form itself shows.

---

## 5. Code

### 5.1 `src/lib/hire/public-applications.ts` (server only)
- `applicationInput`: a Zod schema with the same limits as the function.
- `submitPublicApplication(client, orgId, jobId, input)`: validates, converts RM to sen,
  calls the function, maps its word to `{ ok: true } | { ok: false; field?: string;
  message: string }` with a fixable message per word.

### 5.2 Server action — `src/app/careers/[orgId]/[jobId]/actions.ts`
`applyAction(prevState, formData)`: reads the form, calls `submitPublicApplication` with a
session-less client, returns the state for `useActionState`. No redirect; the page swaps
the form for a thank-you panel. Read the Next.js forms guide in
`node_modules/next/dist/docs/` first.

### 5.3 The form — `src/app/careers/[orgId]/[jobId]/apply-form.tsx` (client)

Fields, in order: full name*, email*, phone, CV link (when `require_cv`, required and
labelled so; hidden otherwise until 2e adds upload), cover letter (when
`require_cover_letter`, required), portfolio link (when `ask_portfolio`, optional),
expected monthly salary in RM (when `ask_expected_salary`, optional), the consent tick*,
and the hidden honeypot.

Design requirements (applicants are strangers, most on a phone):

- **One column, large targets.** Inputs at least 44 pixels tall, 16px text so iOS does not
  zoom, generous spacing; no horizontal scrolling at 375 pixels.
- **Visible labels** above every input, tied to it; required fields marked with an asterisk
  explained once ("* Required"); optional fields say "(optional)" in the label.
- **Right keyboards and autofill:** `type="email"` with `autocomplete="email"`,
  `type="tel"` with `autocomplete="tel"`, `autocomplete="name"`, `type="url"` for links,
  `inputmode="numeric"` for salary with "RM" and "a month" shown as text.
- **Helper text** under the fields that need it: "Paste a link to your CV, for example
  Google Drive or LinkedIn. Make sure anyone with the link can view it."
- **Validation when leaving a field**, not on each keystroke. The error sits directly under
  its field, says what is wrong and how to fix it ("Enter a link that starts with
  https://"), and is tied to the field with `aria-describedby`.
- **On submit with errors:** a short summary at the top ("2 things need fixing") with links
  to each field, and focus moves to the first invalid field.
- **Cover letter** shows a live character count against 4,000.
- **Consent** is an unticked checkbox with the full sentence as its label: "I agree that
  <workspace> may store and use the details I've given to consider me for this role, and
  that they are processed through OpenKuasa." with a link to the privacy page. It is never
  pre-ticked.
- **Submit button** reads "Send application", shows a pending state and is disabled while
  sending, so a double tap sends once.
- **Success** replaces the form with a panel: "Application sent. Thanks, <first name>.
  <workspace> has your details and will be in touch if there's a match." Focus moves to its
  heading. The same panel is shown for a repeat application.
- **Refusals** are plain: `closed` → "This role is no longer taking applications.";
  `throttled` → "Lots of people are applying right now. Please try again in a minute.",
  with what they typed kept in the form; anything unexpected → "Something went wrong on our
  side. Your application wasn't sent. Please try again."
- **The honeypot** is hidden from sight and from assistive technology
  (`aria-hidden`, `tabindex="-1"`, off-screen), with a name a bot will fill.
- **When the job is not accepting** (past its closing date), the page shows "Applications
  closed" where the form would be.
- **Works without JavaScript:** the form posts to the server action and the page shows the
  result; the client behaviour above is an enhancement.
- Contrast, focus rings and reduced-motion follow 2b's page requirements.

### 5.4 Inside the app
- `Application` gains the five new fields; the provider selects them.
- **Applications screen:** each row gets a "Details" control that expands a panel with the
  cover letter (plain text, line breaks kept), the CV and portfolio as links opening in a
  new tab with `rel="noopener noreferrer"` and the visible text being the address's host,
  and the expected salary. Read-only. The expand control is a button with
  `aria-expanded`.
- **`listApplications` tool:** returns the new fields only with `includeContact: true`,
  under the existing "only when asked" rule; the prompt's contact-details wording is
  extended to name them.

---

## 6. Error handling
- A failed database call on submit → the generic "wasn't sent" message; nothing is recorded.
- The page never shows a database error or an id.
- A notification that fails to insert must not fail the application: the function catches
  it and still returns `ok`.

---

## 7. Testing
- **Migration** (text): columns, checks, the unique index; the function is `security
  definer` with an empty `search_path`; no table grant to `anon`.
- **Function, live, as `anon`:** each refusal word in §4.1 with nothing recorded; a valid
  submission creates one candidate and one application with `source 'Careers page'` and
  `consented_at` set; a repeat returns `ok` and adds nothing; an existing candidate's name
  is unchanged and a null phone is filled; requirements follow the settings; the 31st
  submission in a minute is `throttled`; the demo workspace and a board that is off are
  `closed`; a job id with the wrong org id is `not_found`; `anon` still cannot select from
  either table. Rows created are removed afterwards by id.
- **`public-applications.ts`:** schema limits; RM to sen; each word maps to its message and
  field.
- **Action and form:** a valid post returns success; an invalid one returns field errors;
  the form renders the right fields for each combination of settings; required marks and
  labels are present; the honeypot is hidden from assistive technology.
- **Applications screen and tool:** the new fields render and are gated by `includeContact`.
- **Smoke, local then production, as the smoke account plus a private window:** switch the
  board on, open a job, apply from the private window on a phone-sized viewport, see the
  application and the notification inside the app, apply again and see the same thank-you
  with nothing added; then delete the test candidate and application by id and restore the
  board to off.

---

## 8. Security & Independence
- The function takes only values and ids, builds no dynamic SQL, and returns only a word.
- Links are stored as text, validated to `http(s)`, and rendered as links with
  `rel="noopener noreferrer"`; they are never fetched by the server.
- Cover letters are rendered as plain text.
- Applicant details are personal data: inside the workspace's RLS, returned to the model
  only when asked, never logged.
- The rate limit is per job, so one workspace's flood cannot block another's.

---

## 9. Delivery
Branch from `main` after 2c merges. One migration, applied before the merge deploys after a
yes. One pull request.

## 10. Affected / new files
- **New:** one migration; `src/lib/hire/public-applications.ts`;
  `src/app/careers/[orgId]/[jobId]/{actions.ts,apply-form.tsx}`;
  `src/screens/hire/application-details.tsx` (client); tests.
- **Changed:** `src/lib/hire/{types,seed,supabase,public-careers,lists}.ts`;
  `src/app/careers/[orgId]/[jobId]/page.tsx`; `src/lib/ai/hire-tools.ts`;
  `src/lib/ai/agents/prompts.ts`; `src/screens/hire/applications.tsx`.
