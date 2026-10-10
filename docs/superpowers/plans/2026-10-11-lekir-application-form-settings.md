# Lekir Application Form Settings (slice 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace can set, from the Settings screen or through Lekir with approval, the four switches that decide what the public apply form (2d) will ask for: require a CV, require a cover letter, ask for a portfolio link, ask for expected salary.

**Architecture:** Four boolean columns on the existing `hire_settings` row. One capability (`updateApplicationForm`) shared by a server action and an AI change tool, built on the same save helper as 2b's `updateCareersPage`. One pure module (`src/lib/hire/application-form.ts`) holds the four switches' names, labels and wording, so the screen, the approval card and the tests use the same words.

**Tech Stack:** Next.js App Router (this repo's version has breaking changes: read `node_modules/next/dist/docs/` before writing a page, server action or anything Next-specific), Supabase Postgres with RLS, Zod 4, AI SDK v7, radix-ui, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-lekir-application-form-settings-design.md`

## Global Constraints

- pnpm only. TypeScript, 2-space indent, single quotes, semicolons, named exports, `const` by default.
- No reference-product names in `src/`. No purple or violet anywhere (never `var(--chart-5)`).
- The four switches default to off. CV and cover letter are *required* when on; portfolio and expected salary are *asked, optional* when on.
- `org_id` comes only from the session's context, never from a form or the model.
- Capability schemas contain no `.transform()` and no `z.preprocess()` (they become JSON Schema for the tools).
- Only the "Application form" card on the Settings screen changes. The other five cards stay sample content, and `hire/settings` stays out of `src/config/live-screens.ts`.
- The public careers functions (`get_public_careers`, `get_public_job`) and what a visitor can see do not change in this piece.
- This shell has live database credentials. Never run a `*.rls.test.ts` file, and do not run the whole suite (`pnpm vitest run --dir tests`): the new live test cannot pass before the migration, and every live run leaves workspaces on the live database. Do not apply migrations, push, or run anything under `evals/`: those are the controller's (Task 6).

## Review Focus

1. Saving one switch must not reset the other three, the careers switch, or the headline and tagline. Tests in Task 2.
2. A workspace with no settings row yet: saving a switch creates the row with the board **off**. Task 2 (unit) and Task 5 (live).
3. A viewer opening the Settings screen: switches visibly disabled with the reason in words, and no request is ever sent. Task 4.
4. The model sends `require_cv: true` together with an `org_id` or a `careers_enabled`: neither may reach the database through this tool. Task 3.
5. Switches changed but not saved, then the tab is closed or reloaded: the browser asks first. Task 4.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261017090000_hire_application_form_settings.sql` | Four columns and their update grant |
| `src/lib/hire/application-form.ts` | The four switch keys, labels, helper text, and the words for an approval card. No imports. |
| `src/lib/hire/types.ts`, `seed.ts`, `supabase.ts` | `HireSettings` gains the four fields |
| `src/lib/hire/capabilities.ts` | `updateApplicationForm`; the save helper shared with `updateCareersPage` |
| `src/app/(app)/hire/actions.ts` | `updateApplicationFormAction` |
| `src/lib/ai/hire-tools.ts`, `src/lib/ai/products.ts` | The change tool; `getCareersPage` reports the switches |
| `src/lib/chat/change-titles.ts` | Approval card text |
| `src/lib/ai/agents/prompts.ts`, `evals/tuah/cases.ts`, `evals/tuah/harness.ts` | What the assistants may say and do; one question-set case |
| `src/screens/hire/application-form-card.tsx` (client), `src/screens/hire/settings.tsx` | The working card |
| `tests/hire-application-form.rls.test.ts` | Live checks (written, not run by implementers) |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20261017090000_hire_application_form_settings.sql`
- Test: `tests/hire-application-form-migration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hire-application-form-migration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations', '20261017090000_hire_application_form_settings.sql'), 'utf8',
);
const SWITCHES = ['require_cv', 'require_cover_letter', 'ask_portfolio', 'ask_expected_salary'];

describe('hire application form settings migration', () => {
  test('adds the four switches, each off by default', () => {
    expect(sql).toContain('alter table public.hire_settings');
    for (const column of SWITCHES) {
      expect(sql, column).toContain(`add column ${column} boolean not null default false`);
    }
  });

  test('lets a writer update exactly those four columns, and grants nothing else', () => {
    const update = sql.match(/grant update \(([^)]*)\) on public\.hire_settings to authenticated;/);
    expect(update?.[1].split(',').map((c) => c.trim()).sort()).toEqual([...SWITCHES].sort());
    expect(sql.match(/\bgrant\b/g)?.length).toBe(1);
    expect(sql).not.toMatch(/\banon\b/);
    expect(sql).not.toMatch(/\bdelete\b/i);
  });

  test('does not touch the public careers functions or the policies', () => {
    expect(sql).not.toContain('get_public_');
    expect(sql).not.toMatch(/create policy|drop policy/);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm vitest run tests/hire-application-form-migration.test.ts`
Expected: FAIL, the migration file does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261017090000_hire_application_form_settings.sql
-- Lekir slice 2c: what the public apply form asks for. Four switches on the
-- workspace's settings row, all off until a workspace turns them on. The
-- row's policies (members read, writers write) already cover them; only the
-- list of columns a writer may update needs widening.

alter table public.hire_settings
  add column require_cv boolean not null default false,
  add column require_cover_letter boolean not null default false,
  add column ask_portfolio boolean not null default false,
  add column ask_expected_salary boolean not null default false;

grant update (require_cv, require_cover_letter, ask_portfolio, ask_expected_salary) on public.hire_settings to authenticated;
```

- [ ] **Step 4: Run the test and see it pass**

Run: `pnpm vitest run tests/hire-application-form-migration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261017090000_hire_application_form_settings.sql tests/hire-application-form-migration.test.ts
git commit -m "feat(hire): application form switches on hire_settings"
```

---

### Task 2: Settings fields, the wording module, the capability and its action

**Files:**
- Create: `src/lib/hire/application-form.ts`
- Modify: `src/lib/hire/types.ts`, `src/lib/hire/capabilities.ts`, `src/app/(app)/hire/actions.ts`
- Test: `tests/hire-application-form.test.ts` (new), `tests/hire-capabilities.test.ts`, `tests/hire-actions.test.ts`, `tests/hire-provider.test.ts`, `tests/hire-seed.test.ts`

**Interfaces:**
- Produces:
  - `HireSettings` gains `require_cv`, `require_cover_letter`, `ask_portfolio`, `ask_expected_salary` (all `boolean`); `SETTINGS_COLUMNS` and `DEFAULT_HIRE_SETTINGS` include them (defaults `false`).
  - From `application-form.ts`: `APPLICATION_FORM_KEYS` (the four names, in the order above), `type ApplicationFormKey`, `type ApplicationFormValues = Record<ApplicationFormKey, boolean>`, `APPLICATION_FORM_FIELDS` (per key: `label`, `help`, `on`, `off`), `applicationFormOf(settings)`, `changedSwitches(saved, current)`, `describeFormChange(input)`.
  - From `capabilities.ts`: `updateApplicationFormInput`, `updateApplicationForm(ctx, input, now?): Promise<CapResult<HireSettings>>`.
  - `updateApplicationFormAction(input: unknown)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/hire-application-form.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  APPLICATION_FORM_FIELDS, APPLICATION_FORM_KEYS, applicationFormOf, changedSwitches, describeFormChange,
} from '@/lib/hire/application-form';
import { updateApplicationFormInput } from '@/lib/hire/capabilities';
import { DEFAULT_HIRE_SETTINGS, SETTINGS_COLUMNS } from '@/lib/hire/types';

describe('the application form switches', () => {
  it('are the same four everywhere: the wording, the schema, the columns and the defaults', () => {
    expect(APPLICATION_FORM_KEYS).toEqual(['require_cv', 'require_cover_letter', 'ask_portfolio', 'ask_expected_salary']);
    expect(Object.keys(APPLICATION_FORM_FIELDS).sort()).toEqual([...APPLICATION_FORM_KEYS].sort());
    expect(Object.keys(updateApplicationFormInput.shape).sort()).toEqual([...APPLICATION_FORM_KEYS].sort());
    for (const key of APPLICATION_FORM_KEYS) {
      expect(SETTINGS_COLUMNS.split(','), key).toContain(key);
      expect(DEFAULT_HIRE_SETTINGS[key], key).toBe(false);
    }
  });
  it('has a label and a line of help for each', () => {
    for (const key of APPLICATION_FORM_KEYS) {
      const field = APPLICATION_FORM_FIELDS[key];
      for (const text of [field.label, field.help, field.on, field.off]) expect(text.trim().length, key).toBeGreaterThan(0);
    }
    expect(APPLICATION_FORM_FIELDS.require_cv.help).toBe('Applicants must add a CV link or file.');
  });
  it('reads the four from a settings object and nothing else', () => {
    expect(applicationFormOf({ ...DEFAULT_HIRE_SETTINGS, org_id: 'o', require_cv: true, careers_enabled: true })).toEqual({
      require_cv: true, require_cover_letter: false, ask_portfolio: false, ask_expected_salary: false,
    });
  });
  it('finds only the switches that differ from what is saved', () => {
    const saved = { require_cv: true, require_cover_letter: false, ask_portfolio: false, ask_expected_salary: true };
    expect(changedSwitches(saved, saved)).toEqual({});
    expect(changedSwitches(saved, { ...saved, require_cv: false, ask_portfolio: true })).toEqual({ require_cv: false, ask_portfolio: true });
  });
  it('says a change in words, one phrase per switch sent', () => {
    expect(describeFormChange({ require_cv: true })).toEqual(['Require a CV']);
    expect(describeFormChange({ require_cv: false, ask_expected_salary: false }))
      .toEqual(['Stop requiring a CV', 'Stop asking for expected salary']);
    expect(describeFormChange({ require_cover_letter: true, ask_portfolio: true }))
      .toEqual(['Require a cover letter', 'Ask for a portfolio link']);
    // Not booleans, not switches: ignored.
    expect(describeFormChange({ require_cv: 'yes', careers_enabled: true, org_id: 'x' })).toEqual([]);
    expect(describeFormChange(null)).toEqual([]);
  });
  it('the schema converts to JSON Schema, so it can be a tool input schema', () => {
    expect(() => z.toJSONSchema(updateApplicationFormInput)).not.toThrow();
  });
});
```

In `tests/hire-capabilities.test.ts`, read the existing `describe('updateCareersPage')` block and its `fakeSettings` helper first, then add `describe('updateApplicationForm')` with the same helper (extend it minimally if a case needs it; do not weaken an existing case):

1. An existing row: `update` on `hire_settings` is called with exactly the switches sent plus `updated_at`, filtered by `org_id = ctx.orgId`. Sending `{ require_cv: true }` puts no other switch, no `careers_enabled`, no headline and no tagline in the update.
2. No row yet: `insert` is called with `{ require_cv: true, org_id: ctx.orgId }` and nothing about `careers_enabled` (the column default keeps the board off).
3. `{ require_cv: true, org_id: 'evil', careers_enabled: true }`: only `require_cv` and the session's `org_id` reach the database.
4. A raced insert (`23505`) retries the update.
5. Nothing sent (`{}`): no write; the current settings (or the defaults) come back, including the four switches.
6. A non-boolean (`{ require_cv: 'yes' }`) is refused and nothing is written.
7. A database error on the write gives `That change could not be saved. Please try again.` and logs.
8. The result carries all four switches as booleans, with the saved values merged over the defaults.
9. `updateCareersPage` still behaves as before: re-run its existing cases unchanged (they must stay green after the refactor in Step 3), and add one assertion that its patch never contains a form switch.
10. The demo workspace is NOT refused here (this change exposes nothing); the `orgs` table is never read by `updateApplicationForm`.

In `tests/hire-actions.test.ts` (read it first; add `updateApplicationForm` to the capability stub list): `updateApplicationFormAction` refuses a viewer role, a demo visitor and a demo owner without calling the capability; for an owner it calls the capability with the session context (a foreign `org_id` in the input does not change the context) and revalidates `/hire/settings`, `/hire/assistant` and `/careers/<orgId>`; a refused result revalidates nothing.

In `tests/hire-provider.test.ts` and `tests/hire-seed.test.ts`: the existing `getSettings` expectations gain the four switches (`false` by default; a stored `true` is returned).

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run tests/hire-application-form.test.ts tests/hire-capabilities.test.ts tests/hire-actions.test.ts tests/hire-provider.test.ts tests/hire-seed.test.ts`
Expected: FAIL (module not found; missing exports).

- [ ] **Step 3: Implement**

`src/lib/hire/application-form.ts`:

```ts
// src/lib/hire/application-form.ts
/**
 * The four switches that decide what the public apply form asks for. Nothing
 * is imported here, so the Settings card (a client component), the approval
 * card and the capability can all use the same names and the same words.
 * A CV and a cover letter are required when on; a portfolio link and expected
 * salary are asked for, and optional, when on.
 */

export const APPLICATION_FORM_KEYS = [
  'require_cv', 'require_cover_letter', 'ask_portfolio', 'ask_expected_salary',
] as const;
export type ApplicationFormKey = (typeof APPLICATION_FORM_KEYS)[number];
export type ApplicationFormValues = Record<ApplicationFormKey, boolean>;

export const APPLICATION_FORM_FIELDS: Record<ApplicationFormKey, {
  /** Beside the switch. */
  label: string;
  /** Under the label: what applicants will see when it is on. */
  help: string;
  /** What switching it on does, for an approval card. */
  on: string;
  /** What switching it off does. */
  off: string;
}> = {
  require_cv: {
    label: 'Require a CV',
    help: 'Applicants must add a CV link or file.',
    on: 'Require a CV',
    off: 'Stop requiring a CV',
  },
  require_cover_letter: {
    label: 'Require a cover letter',
    help: 'Applicants must write a short cover letter.',
    on: 'Require a cover letter',
    off: 'Stop requiring a cover letter',
  },
  ask_portfolio: {
    label: 'Ask for a portfolio link',
    help: 'Applicants can add a link to their work. Optional for them.',
    on: 'Ask for a portfolio link',
    off: 'Stop asking for a portfolio link',
  },
  ask_expected_salary: {
    label: 'Ask for expected salary (RM)',
    help: 'Applicants can say the monthly salary they expect. Optional for them.',
    on: 'Ask for expected salary',
    off: 'Stop asking for expected salary',
  },
};

/** The four switches out of a settings object. */
export function applicationFormOf(settings: ApplicationFormValues): ApplicationFormValues {
  return {
    require_cv: settings.require_cv,
    require_cover_letter: settings.require_cover_letter,
    ask_portfolio: settings.ask_portfolio,
    ask_expected_salary: settings.ask_expected_salary,
  };
}

/** Only the switches whose value differs from what is saved: what a Save sends. */
export function changedSwitches(saved: ApplicationFormValues, current: ApplicationFormValues): Partial<ApplicationFormValues> {
  const changed: Partial<ApplicationFormValues> = {};
  for (const key of APPLICATION_FORM_KEYS) if (current[key] !== saved[key]) changed[key] = current[key];
  return changed;
}

/** A change in words, one phrase per switch sent, in the fixed order. Anything that is not a switch set to true or false is left out. */
export function describeFormChange(input: unknown): string[] {
  const sent = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return APPLICATION_FORM_KEYS.flatMap((key) =>
    sent[key] === true ? [APPLICATION_FORM_FIELDS[key].on] : sent[key] === false ? [APPLICATION_FORM_FIELDS[key].off] : [],
  );
}
```

`src/lib/hire/types.ts`: add the four `boolean` fields to `HireSettings` (each with a one-line doc comment), append `,require_cv,require_cover_letter,ask_portfolio,ask_expected_salary` to `SETTINGS_COLUMNS`, and add the four `false` defaults to `DEFAULT_HIRE_SETTINGS`. `seed.ts` and `supabase.ts` already spread the defaults; check they need no other change.

`src/lib/hire/capabilities.ts`: pull the "update, else insert, else update again" part of `updateCareersPage` into one helper and use it from both capabilities. Behaviour of `updateCareersPage` must not change.

```ts
/** The settings row as it stands, or the defaults when there is none. */
async function readSettings(ctx: HireWriteContext, fnName: string): Promise<CapResult<HireSettings>> {
  const { data, error } = await ctx.client
    .from('hire_settings').select(SETTINGS_COLUMNS).eq('org_id', ctx.orgId).maybeSingle();
  if (error) return writeFailed(fnName, error);
  return { ok: true, data: asSettings(ctx.orgId, data) };
}

/**
 * Writes some columns of the workspace's settings row, making the row if
 * there is none. Not an upsert: the update grant leaves out org_id, which an
 * upsert's "do update" would set. A new row takes the column defaults for
 * everything not in the patch, so the board stays off.
 */
async function saveSettings(
  ctx: HireWriteContext, patch: Record<string, unknown>, now: Date, fnName: string,
): Promise<CapResult<HireSettings>> {
  const update = () =>
    ctx.client.from('hire_settings')
      .update({ ...patch, updated_at: now.toISOString() })
      .eq('org_id', ctx.orgId).select(SETTINGS_COLUMNS).maybeSingle();

  const first = await update();
  if (first.error) return writeFailed(fnName, first.error);
  if (first.data) return { ok: true, data: asSettings(ctx.orgId, first.data) };

  const inserted = await ctx.client.from('hire_settings')
    .insert({ ...patch, org_id: ctx.orgId }).select(SETTINGS_COLUMNS).single();
  if (!inserted.error && inserted.data) return { ok: true, data: asSettings(ctx.orgId, inserted.data) };
  // Someone else made the row between the two calls: update it after all.
  if ((inserted.error as { code?: string } | null)?.code !== '23505') return writeFailed(fnName, inserted.error);
  const second = await update();
  if (second.error || !second.data) return writeFailed(fnName, second.error);
  return { ok: true, data: asSettings(ctx.orgId, second.data) };
}
```

`updateCareersPage` keeps its parsing, its "nothing sent" branch (now `return readSettings(ctx, 'updateCareersPage')`) and its demo check, and ends with `return saveSettings(ctx, patch, now, 'updateCareersPage');`.

New, after it:

```ts
// ─── application form (four switches on the same settings row) ───────────────

const formSwitch = (what: string) => z.boolean().optional().describe(what);

export const updateApplicationFormInput = z.object({
  require_cv: formSwitch('true makes a CV (a link or a file) required on applications; false makes it optional.'),
  require_cover_letter: formSwitch('true makes a cover letter required on applications; false removes that.'),
  ask_portfolio: formSwitch('true adds an optional portfolio link to the application form; false removes it.'),
  ask_expected_salary: formSwitch('true adds an optional expected monthly salary (RM) to the application form; false removes it.'),
});

export async function updateApplicationForm(
  ctx: HireWriteContext,
  input: z.input<typeof updateApplicationFormInput>,
  now: Date = new Date(),
): Promise<CapResult<HireSettings>> {
  const parsed = updateApplicationFormInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  // Only the switches the caller sent; undefined means "leave as it is".
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (Object.keys(patch).length === 0) return readSettings(ctx, 'updateApplicationForm');
  return saveSettings(ctx, patch, now, 'updateApplicationForm');
}
```

Zod's default message for a non-boolean is acceptable for case 6; assert that the result is `{ ok: false }` with a non-empty `error`, not its exact text.

`src/app/(app)/hire/actions.ts`: import `updateApplicationForm` and add

```ts
/** What the apply form asks for: the Settings card, the assistant's view of it, and the public job pages that will carry the form. */
export async function updateApplicationFormAction(input: unknown) {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const result = await updateApplicationForm(ctx, input as never);
  if (result.ok) {
    revalidatePath('/hire/settings');
    revalidatePath('/hire/assistant');
    revalidatePath(careersPath(ctx.orgId));
  }
  return result;
}
```

- [ ] **Step 4: Run and see them pass**

Run the Step 2 command plus `tests/hire-careers-form.test.ts tests/hire-lists.test.ts tests/hire-tools.test.ts`, then `pnpm exec tsc --noEmit`. Any other object typed `HireSettings` that tsc now flags (fakes in tests, `evals/`) gets the four `false` fields; list each such file in the report.
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hire/application-form.ts src/lib/hire/types.ts src/lib/hire/capabilities.ts "src/app/(app)/hire/actions.ts" tests/hire-application-form.test.ts tests/hire-capabilities.test.ts tests/hire-actions.test.ts tests/hire-provider.test.ts tests/hire-seed.test.ts
# plus any other file tsc made you add the four fields to, by name
git commit -m "feat(hire): updateApplicationForm capability, its action, and the four switches' wording"
```

---

### Task 3: The assistants: change tool, lookup, approval text, prompts

**Files:**
- Modify: `src/lib/ai/hire-tools.ts`, `src/lib/ai/products.ts`, `src/lib/chat/change-titles.ts`, `src/lib/ai/agents/prompts.ts`, `evals/tuah/cases.ts`, `evals/tuah/harness.ts`
- Test: `tests/hire-tools.test.ts`, `tests/hire-tools-write.test.ts`, `tests/hire-change-titles.test.ts`, `tests/lekir-prompt.test.ts`

**Interfaces:**
- Consumes: `updateApplicationForm`, `updateApplicationFormInput`, `applicationFormOf`, `describeFormChange` (Task 2).
- Produces: change tool `updateApplicationForm`; `HIRE_WRITE_TOOL_NAMES` gains `'updateApplicationForm'`; `getCareersPage`'s result gains `application_form: { require_cv, require_cover_letter, ask_portfolio, ask_expected_salary }`.

- [ ] **Step 1: Write the failing tests**

`tests/hire-tools.test.ts` (use the file's existing helpers for running a tool):
- `getCareersPage` returns `application_form` equal to the four switches from `data.getSettings()` (set two to `true` in the fake and expect exactly those), whether the careers page is on or off, and for the sample data (all `false`).
- The existing set-equality test ("a writer gets nothing beyond the lookups except the listed change tools") keeps passing once the names are updated; update any literal list of write names.

`tests/hire-tools-write.test.ts`: mock `updateApplicationForm` as `updateCareersPage` is mocked there and add a case: the tool reaches the capability with the very same `ctx` object, and passes the model's input through unchanged (the capability's own schema is what drops an `org_id`).

`tests/hire-change-titles.test.ts` (adapt the calls to `approvalTitle` / `approvalDetail`'s real signatures; keep the expected strings):

```ts
it('names an application form change by what it does', () => {
  expect(approvalTitle('updateApplicationForm', { require_cv: true })).toBe('Require a CV on applications?');
  expect(approvalTitle('updateApplicationForm', { require_cv: false })).toBe('Stop requiring a CV on applications?');
  expect(approvalTitle('updateApplicationForm', { ask_expected_salary: false })).toBe('Stop asking for expected salary on applications?');
  expect(approvalTitle('updateApplicationForm', { ask_portfolio: true })).toBe('Ask for a portfolio link on applications?');
  // Several at once: one question, and the detail line lists them.
  expect(approvalTitle('updateApplicationForm', { require_cv: true, ask_portfolio: false })).toBe('Change what the application form asks for?');
  expect(approvalTitle('updateApplicationForm', {})).toBe('Change what the application form asks for?');
});
it('lists each switch being changed when there is more than one', () => {
  expect(approvalDetail('updateApplicationForm', { require_cv: true, ask_portfolio: false }))
    .toBe('Require a CV · Stop asking for a portfolio link');
  // One change is already the title.
  expect(approvalDetail('updateApplicationForm', { require_cv: true })).toBeNull();
  expect(approvalDetail('updateApplicationForm', null)).toBeNull();
});
```

`tests/lekir-prompt.test.ts`: widen the write-tool regex to `/Job(Status)?$|^updateCareersPage$|^updateApplicationForm$/` and add, for each of `LEKIR_SYSTEM`, the hire specialist rule, `TUAH_SYSTEM` and the team prompt (in the blocks the file already has for them, lower-cased as the file does), a check that the text contains `what the application form asks for`.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run tests/hire-tools.test.ts tests/hire-tools-write.test.ts tests/hire-change-titles.test.ts tests/lekir-prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/ai/hire-tools.ts`:
- In `getCareersPage`'s result add `application_form: applicationFormOf(settings),` and extend its description with: ` Also what the application form asks for: whether a CV and a cover letter are required, and whether a portfolio link and expected salary are asked for.`
- Beside `updateCareersPage`:

```ts
    updateApplicationForm: tool({
      description:
        'Change what the public application form asks for. Send only the switches that change. ' +
        'A CV and a cover letter are required when on; a portfolio link and expected salary are asked for, and optional, when on. ' +
        'Use getCareersPage to see the current switches.',
      inputSchema: updateApplicationFormInput,
      execute: async (input) => updateApplicationForm(ctx, input, now()),
    }),
```

`src/lib/ai/products.ts`: append `'updateApplicationForm'` to `HIRE_WRITE_TOOL_NAMES`.

`src/lib/chat/change-titles.ts` (import `describeFormChange` from `@/lib/hire/application-form`):
- Title, beside the `updateCareersPage` case:

```ts
    case 'updateApplicationForm': {
      const changes = describeFormChange(i);
      return changes.length === 1 ? `${changes[0]} on applications?` : 'Change what the application form asks for?';
    }
```
- Detail, beside the `updateCareersPage` branch:

```ts
  if (toolName === 'updateApplicationForm') {
    const changes = describeFormChange(i);
    // One change is already the question; several are listed.
    return changes.length > 1 ? changes.join(' · ') : null;
  }
```

`src/lib/ai/agents/prompts.ts` — keep every sentence the tests already pin; add:
- `LEKIR_SYSTEM`, after the careers page bullet: `- You can also change what the application form asks for, behind the same approval: whether a CV and a cover letter are required, and whether a portfolio link and expected salary are asked for. Use getCareersPage to see the current switches.`
- `SPECIALIST_RULES.hire`: `'When you have change tools, you can also prepare a change to what the application form asks for: CV and cover letter required or not, portfolio link and expected salary asked for or not. getCareersPage shows the current switches.'`
- `TUAH_SYSTEM`, in the Lekir changes bullet: append ` You can also change what the application form asks for: whether a CV and a cover letter are required, and whether a portfolio link and expected salary are asked for.`
- `tuahTeamSystem`, in the Lekir changes bullet: append ` Lekir can also prepare a change to what the application form asks for.`
After editing, read each of the four prompts once for a sentence your addition contradicts; report any existing sentence you had to touch, quoting before and after. Do not touch Jebat's, Kasturi's or Lekiu's prompts.

`evals/tuah/cases.ts`: read the `careers-page-on` case and add one modelled on it, id `application-form-cv`, question `Make a CV required when people apply.`; it passes when one change was put up for approval and, after approval, the workspace's `hire_settings` row read from the database has `require_cv === true` and `careers_enabled` is not `true` (the board was not switched on as a side effect). `evals/tuah/harness.ts`: extend the existing settings clean-up to also set the four switches to `false`. Do not run it.

- [ ] **Step 4: Run and see them pass**

Run the Step 2 command plus `tests/hire-chat-route.test.ts tests/tuah-hire.test.ts tests/tuah-team.test.ts tests/reach-approval.test.ts tests/crm-approval.test.ts`, then `pnpm exec tsc --noEmit`.
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/hire-tools.ts src/lib/ai/products.ts src/lib/chat/change-titles.ts src/lib/ai/agents/prompts.ts evals/tuah/cases.ts evals/tuah/harness.ts tests/hire-tools.test.ts tests/hire-tools-write.test.ts tests/hire-change-titles.test.ts tests/lekir-prompt.test.ts
git commit -m "feat(hire): Lekir can read and change what the application form asks for"
```

---

### Task 4: The "Application form" card on the Settings screen

**Files:**
- Create: `src/screens/hire/application-form-card.tsx` (client)
- Modify: `src/screens/hire/settings.tsx`
- Test: none new (no component-test setup; do not add one). The pure logic the card uses is tested in Task 2.

**Interfaces:**
- Consumes: `APPLICATION_FORM_KEYS`, `APPLICATION_FORM_FIELDS`, `applicationFormOf`, `changedSwitches`, `type ApplicationFormValues` (Task 2); `updateApplicationFormAction` (Task 2); `HireData.getSettings()`.

Before writing, read: `src/screens/hire/settings.tsx` in full (a static screen today: no data, sample content for everyone); `src/screens/hire/careers-controls.tsx` (the house pattern for a settings form in this product: the transition with try/catch and the "could not be sent" line, `aria-disabled` Save that keeps focus, `role="alert"` errors, the `aria-live` notice that never takes focus, the 44px `TARGET` class, how the switch's hit area is enlarged, and the `'edit' | 'view' | 'demo'` mode); `src/screens/hire/careers-page.tsx` (how a server screen reads the viewer and settings and picks the mode); `src/screens/hire/parts.tsx` (`loadHire`); `src/components/ui/switch.tsx`.

**Rules (each is a requirement):**

1. `settings.tsx` becomes an async server component that reads the viewer (`getViewer()`) and the settings (`loadHire('settings', (data) => data.getSettings())`), and renders the new card in place of the old "Application form" card, in the same grid cell with the same title, subtitle and icon. Nothing else on the screen changes except rule 9.
2. Mode: `demo` when the visitor is a demo or signed-out visitor (as `careers-page.tsx` decides it); `view` when the viewer may not `edit-data`; else `edit`. If the settings could not be read (`model` is null), the card shows the screen family's "could not load" text (`LOAD_FAILED` from `parts.tsx`) and no switches.
3. Demo mode keeps today's sample look for this card: the four rows with the sample states the mock had (CV on, cover letter off, portfolio on, salary on), every switch disabled, and the line "Not available in the demo". No request can be sent.
4. In `edit` and `view` the card lists the four switches from `APPLICATION_FORM_KEYS` in order. Each row: the label from `APPLICATION_FORM_FIELDS` as a real `<label>` for the switch, the help line under it (linked with `aria-describedby`), the `Switch` (`role="switch"`), and the state in words ("On" / "Off") beside it, so state is not shown by colour alone. Each switch's hit area is at least 44px tall, done the way `careers-controls.tsx` does it.
5. Toggling a switch changes only local state. Nothing is sent until **Save**. The card has one Save button; it sends only the switches that differ from what is saved (`changedSwitches`) through `updateApplicationFormAction`. With nothing changed, Save is inert (`aria-disabled`, as the branding form does) and sends nothing on click or Enter.
6. While saving: Save reads "Saving…", the switches are disabled, and a second click sends nothing. On success: the saved values become the baseline (take them from the action's result with `applicationFormOf`), the notice "Application form saved." appears in an `aria-live="polite"` region, and focus stays where it was. On a refusal or a failed send: a `role="alert"` under the switches with the message, the switches keep what the user chose (so they can retry), and a **Try again** button that re-sends the same change.
7. Unsaved changes: while any switch differs from the saved value, the card shows "Unsaved changes" in words beside Save, and a `beforeunload` listener is registered so closing or reloading the tab asks first; the listener is removed as soon as nothing is unsaved and on unmount. A **Discard** button, shown only when there are unsaved changes, puts the switches back to the saved values. (In-app navigation cannot be intercepted reliably in this Next.js version; the visible "Unsaved changes" text is the guard there. Say so in a code comment.)
8. `view` mode: every switch disabled, no Save, Discard or Try again rendered, and the reason in visible words: "You do not have permission to change this". No code path calls the action.
9. Under the card's switches, in every mode except `demo`: a small note "Saved to your workspace. Used by the public apply form, coming soon." And the page-level "Save changes" button at the bottom of the screen gets the `disabled` attribute (the spec: it stays disabled; today it is clickable and does nothing).
10. The client component receives only plain data: the four saved booleans and the mode. It imports the server action itself, as `careers-controls.tsx` does. It must not import `src/lib/hire/lists.ts`, `capabilities.ts` or anything that pulls server code into the browser bundle: `application-form.ts` has no imports for this reason.
11. Existing tokens only; no purple or violet; nothing scrolls sideways at 375px; visible focus rings on every control.
12. The other five cards (pipeline, integrations, email templates, hiring team, notifications) and their sample content are untouched, including their `ToggleItem` rows.

- [ ] **Step 1:** Write `application-form-card.tsx` and change `settings.tsx` to the rules.
- [ ] **Step 2:** `pnpm exec tsc --noEmit`, `pnpm exec eslint src/screens/hire`, and `pnpm vitest run tests/hire-screen-parts.test.ts tests/hire-application-form.test.ts`. Expected: clean, PASS. If a route-check or screen-registry test exists that renders or lists `hire/settings` (search `tests/` for `hire/settings` and `SettingsScreen`), run it too: the screen is now async.
- [ ] **Step 3:** Re-read each rule against the finished files and list in the report the file and line that meets it, plus what can only be confirmed in a browser.
- [ ] **Step 4: Commit**

```bash
git add src/screens/hire/application-form-card.tsx src/screens/hire/settings.tsx
git commit -m "feat(hire): the Settings screen's application form card saves to the workspace"
```

---

### Task 5: Live checks (written, not run)

**Files:**
- Create: `tests/hire-application-form.rls.test.ts`

Read `tests/hire-careers.rls.test.ts` first and reuse its exact way of making signed-in owners with fresh workspaces, its skip condition, its viewer (via `join_demo_org` on the demo workspace) and its clean-up. Do NOT run the file.

Cases (one `it` each; a positive case must assert returned values, not merely "no error"):
1. An owner with no settings row inserts `{ org_id, require_cv: true }`: the row comes back with `require_cv` true, the other three switches false, and `careers_enabled` false.
2. The owner updates `{ ask_portfolio: true }`: `ask_portfolio` is true and `require_cv` is still true (one switch does not reset another).
3. The owner cannot update `org_id` on the row (expect an error), and the four switches are each updatable (update all four to a known pattern and read it back).
4. A second workspace's owner cannot read the first's row (empty result) and an update filtered to the first's `org_id` changes nothing: read the first row again as its owner and assert it is unchanged.
5. A viewer (in the demo workspace) cannot insert or update switches there: an error or zero rows, and afterwards no settings row for the demo has any of the four true, as far as the viewer can read.
6. A signed-out visitor cannot read `hire_settings` (permission denied, code `42501`).
7. The public board is unaffected: with the owner's board on and one open, described job, `get_public_careers` returns that job with the same eleven columns as before (assert the exact key set), and none of the four switch names is a key.
8. Last, clean-up state: the owner sets all four switches to false and `careers_enabled` to false, and reads that back.

- [ ] **Step 1:** Write the file. Do NOT run it.
- [ ] **Step 2:** `pnpm exec tsc --noEmit` and `pnpm exec eslint tests/hire-application-form.rls.test.ts`. Expected: clean.
- [ ] **Step 3: Commit**

```bash
git add tests/hire-application-form.rls.test.ts
git commit -m "test(hire): live checks for the application form switches"
```

---

### Task 6 (controller): apply, verify, smoke, pull request

Not for an implementer. The migration, the question-set run and the push each wait for the user's yes.

- [ ] Rebase onto `origin/main`; if another migration took version `20261017090000`, renumber this one and its test.
- [ ] Apply `hire_application_form_settings` through the `openkuasa-supabase` MCP (one call).
- [ ] Verify live: four columns, `not null default false`; update grant now covers eight columns; existing rows all have the four switches false; `anon` still has no table privilege; the two public functions' definitions are unchanged.
- [ ] Run `tests/hire-application-form.rls.test.ts`, then the full suite, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.
- [ ] Local smoke as the smoke account: open Settings; toggle two switches and see "Unsaved changes"; reload and see the browser ask; Save and see one request, the notice, and focus unmoved; reload and see them on; Discard puts an unsaved toggle back; offline Save shows the alert and Try again works once back online; 375px; ask Lekir "what does our application form ask for?" and "stop requiring a CV" (approval card names the change); then restore all four to off and remove chat threads.
- [ ] After a yes: `EVAL_ONLY=application-form-cv EVAL_RUNS=1 pnpm eval:tuah`.
- [ ] After a yes: next free branch number, push, open the pull request (title = branch name; no close keyword unless a tracking issue exists). Do not merge until asked. After merge: smoke test production the same way, with the user signed in to the smoke account.
