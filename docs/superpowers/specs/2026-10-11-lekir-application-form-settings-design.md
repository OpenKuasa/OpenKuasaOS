# OpenKuasa Backend — Lekir Application Form Settings Design (slice 2c)

**Date:** 2026-10-11
**Status:** Draft for review
**Module:** Lekir (`hire`)
**Milestone:** Lekir slice 2, piece 2c of 6 — the four switches that decide what the public apply form asks for.
**Builds on:** 2b (`2026-10-11-lekir-public-job-board-design.md`), which creates `hire_settings`. 2c cannot start until 2b is merged.

---

## 1. Context & Goals

The Settings screen's "Application form" card shows four switches as sample content. The
public apply form (2d) has to follow them, so they become real first. This piece is small on
purpose: it is the least 2d needs. It was slice 4 work in the original roadmap and is pulled
forward.

### Goal
A member who is not a viewer can set, per workspace, whether applicants must give a CV, must
write a cover letter, are asked for a portfolio link, and are asked for expected salary. The
same can be done through Lekir with approval.

### Success criteria
- The four switches persist per workspace and default to off.
- The Settings screen's "Application form" card reads and saves them; no other card changes.
- Lekir and Tuah can read and change them, the change behind an Approve card.

---

## 2. Scope

### In scope
1. Four boolean columns on `hire_settings`.
2. Capability `updateApplicationForm`, its server action, and an AI change tool.
3. The "Application form" card on the Settings screen becomes a working form.
4. `getCareersPage` (2b's lookup) also reports the four switches.

### Out of scope
- The apply form itself (2d). Until 2d ships, the switches have no visible effect, and the
  card says so in one line.
- The other Settings cards: hiring pipeline stages, job board integrations, email
  templates, hiring team, notifications. They stay sample content.
- Custom questions, per-job form settings.

---

## 3. Decisions & Rationale

| Decision | Choice | Why |
|---|---|---|
| Where the switches live | Columns on `hire_settings` | One row per workspace already exists for branding; four typed booleans are simpler to check in SQL than a JSON blob, and 2d's function reads them. |
| Defaults | All off | A new workspace's form is name, email and consent. Asking for more is a choice. |
| Screen status | `hire/settings` stays out of `LIVE_SCREENS` | Five of its six cards are still sample content, so the work-in-progress banner stays truthful. The live card carries its own "Saved to your workspace" note. |
| "Require" vs "ask" | CV and cover letter are *required* when on; portfolio and salary are *asked, optional* when on | This is what the mock's labels say. |

---

## 4. Data model

Migration `hire_application_form_settings`:

```sql
alter table public.hire_settings
  add column require_cv boolean not null default false,
  add column require_cover_letter boolean not null default false,
  add column ask_portfolio boolean not null default false,
  add column ask_expected_salary boolean not null default false;
grant update (require_cv, require_cover_letter, ask_portfolio, ask_expected_salary)
  on public.hire_settings to authenticated;
```

`HireSettings` in `src/lib/hire/types.ts` and the provider's column list gain the four fields.

---

## 5. Code

- **Capability** `updateApplicationForm` in `src/lib/hire/capabilities.ts`: any of the four
  booleans; upserts the workspace's row (creating it with the board off if none exists);
  sets `updated_at`.
- **Server action** `updateApplicationFormAction` in `src/app/(app)/hire/actions.ts`,
  revalidating `/hire/settings` and the public job paths.
- **AI change tool** `updateApplicationForm`, in `HIRE_WRITE_TOOL_NAMES`. Approval titles
  name the change in words: "Require a CV on applications", "Stop asking for expected
  salary".
- **Lookup:** `getCareersPage` returns an `application_form` object with the four switches.

---

## 6. Settings screen

Only the "Application form" card changes.

- The four switches read the workspace's settings. Each has a visible label and one line of
  helper text saying what applicants will see ("Applicants must add a CV link or file").
- Changes save with an explicit Save button on the card, not on toggle, so a recruiter can
  set several and commit once. Save shows a pending state; success shows a confirmation
  that does not take focus; a failure shows under the card with a retry.
- Leaving with unsaved changes asks first.
- A viewer sees the switches disabled, with the reason as text.
- Each switch is a real switch control (`role="switch"`, `aria-checked`), reachable by
  keyboard, with a hit area of at least 44 pixels; state is not shown by colour alone.
- The card carries a small "Saved to your workspace" note so it is clear which part of this
  screen is real. Until 2d ships it also says "Used by the public apply form, coming soon."
- The page-level "Save changes" button at the bottom of the screen stays disabled.

---

## 7. Prompts
`LEKIR_SYSTEM`, the hire specialist rule and both Tuah prompts add one clause: the
application form's requirements can be changed, behind approval. The test tying prompts to
change tools is widened to allow `updateApplicationForm`.

---

## 8. Testing
- **Migration** (text): four columns, defaults, the update grant.
- **Capability:** upsert with and without a row; partial input leaves the other switches
  untouched; `org_id` from the context.
- **RLS, live:** a member updates; a viewer cannot; another workspace cannot read or write.
- **Tool and prompt tests** as in 2a.
- **Smoke:** turn two switches on, save, reload, see them on; ask Lekir to turn one off and
  approve; restore the workspace to all off.

---

## 9. Delivery
Branch from `main` after 2b merges. One migration, applied before the merge deploys after a
yes. One pull request.

## 10. Affected / new files
- **New:** one migration; `src/screens/hire/application-form-card.tsx` (client); tests.
- **Changed:** `src/lib/hire/{types,seed,supabase,capabilities}.ts`;
  `src/app/(app)/hire/actions.ts`; `src/lib/ai/hire-tools.ts`; `src/lib/ai/agents/prompts.ts`;
  `src/lib/chat/change-titles.ts`; `src/screens/hire/settings.tsx`.
