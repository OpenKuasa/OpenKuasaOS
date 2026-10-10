# Jebat Leads CRUD + Promote Implementation Plan (Slice 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make reach `leads` fully writable with AI↔UI parity, add a live reach **Lead Funnel** screen (replacing the static fake-data reach Contacts screen), and add a one-way **promote lead → Kasturi contact** bridge that reuses `createCrmContact`.

**Architecture:** Reuse slice-2 machinery exactly — one Zod schema per mutation in `src/lib/reach/capabilities.ts` consumed by both a UI server action and an approval-gated AI tool; two-layer access (column grant + `is_org_writer` RLS); `org_id` always from session; `id` in every AI read tool. Promote reuses Kasturi's `createCrmContact` (no duplicated contact logic, no cross-schema FK). Forms are out of scope (owned by another contributor).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), AI SDK v7 (`ai`, `@ai-sdk/react`), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-jebat-leads-crud-design.md` (read alongside this plan).

## Global Constraints
- **Supabase project `ugchntdgaeefmufumchx` via the `openkuasa-supabase` MCP ONLY.** Controller applies migrations with `mcp__openkuasa-supabase__apply_migration` (name + SQL) and verifies `get_advisors`; the implementer writes the migration FILE + tests. New migration timestamp must be **after `20261011120000`** → use `20261011130000_reach_leads_writes.sql`.
- **Two-layer access on `leads`:** add BOTH `grant insert/update(cols)/delete` AND a `leads_write` policy `using/with check (private.is_org_writer(org_id))`. `leads_select` + `mfa_required` already exist (slice 1). `id`/`org_id` NEVER in an UPDATE grant. Leads have **no `updated_at`** (like campaigns — do not add one).
- **`org_id` always from session** (`getViewer`/`getCurrentOrg`); never from model/client. Tool inputs are **ids-only**; `promoted_contact_id` is never set from user input (only by `promoteLeadToContact`).
- **`promoted_contact_id`** is a plain nullable `uuid` — **no FK** to `crm_contacts` (module-decoupled). Set only by promote; `Lead.promoted_contact_id: string | null`.
- **Promote reuses `createCrmContact(client, payload: CrmContactInsert)`** from `@/lib/crm/contacts` (it THROWS on error → wrap in try/catch, map to `CapResult`). `CrmContactInsert = CrmContactFields & { org_id; owner_user_id? }`; `CrmContactFields = { first_name, last_name: string|null, email, phone: string|null, company: string|null, country, status, lead_score, tags: string[] }`. Do NOT thread a user id (promote omits `owner_user_id`; the CRM user claims the contact later). crm status set = `lead|contacted|qualified|customer|archived`.
- **All new AI write tools approval-gated:** add each to `WRITE_TOOL_NAMES` in `orchestrator.ts` **only when the tool is actually built** (the all-gated regression test asserts an exact set match between built write tools and `WRITE_TOOL_NAMES`). Add approval-card copy in `ask-jebat-hero.tsx`.
- **Do NOT touch:** `src/screens/reach/contacts.tsx` (CRM reuses it), anything under forms (`forms.ts`, `lead-forms.tsx`, forms capability/actions/migration), the demo reseed, or any `crm_*`/`src/lib/crm/*` except importing `createCrmContact`.
- pnpm only. Tests: `pnpm vitest run --dir tests` (RLS/integration run against the live DB; `fileParallelism:false`). TS strict; 2-space, single quotes, semicolons; named exports. Branch `feat-060-jebat-leads-crud`; branch→PR→squash as `OpenKuasa`. **Re-check `git pull` at execution start** — the repo has parallel contributors (forms landed mid-brainstorm); if someone else started leads-writable, reconcile before building. Fictional Rimba data; no Kuasa names in `src/`; no purple/violet.

## Review Focus
1. **A lead targeted by name through chat** needs its `id` — `deriveContacts`/`listContacts` currently drop `id`, so update/delete/setStage/promote by name would fail. → Task 4 (add `id` + `promoted_contact_id` to `deriveContacts`; test).
2. **Double-promote** the same lead → must refuse (no second `crm_contact`). → Task 5 (idempotency via `promoted_contact_id`; test).
3. **Cross-org / viewer writes** on leads, and **cross-org promote** (promoting into another org) → denied. → Task 1 (RLS) + Task 5 (promote RLS).
4. **Model/client supplies `org_id` or `promoted_contact_id`** in a lead write → ignored (org from ctx; `promoted_contact_id` not in create/update schemas). → Task 2.
5. **`createCrmContact` throws** (CRM constraint/permission) during promote → surfaced as a friendly `CapResult` error, lead NOT stamped. → Task 5 (try/catch; test the error path if feasible, else document).

---

## Task 1: `leads` writable migration + type + provider + RLS write tests

**Files:** Create `supabase/migrations/20261011130000_reach_leads_writes.sql`; Modify `src/lib/reach/types.ts`, `src/lib/reach/supabase.ts`; Test `tests/reach-leads-writes.rls.test.ts`.

**Interfaces — Produces:** writable `leads` + `promoted_contact_id`; `Lead.promoted_contact_id: string | null`. **Consumes:** `private.is_org_writer`, `create_org_for_current_user` (tests).

- [ ] **Step 1: Write the migration** `supabase/migrations/20261011130000_reach_leads_writes.sql`:
```sql
-- Slice 3: make leads writable (two-layer: grant + is_org_writer policy) and add the
-- promote marker. leads_select + mfa_required already exist (slice 1). No updated_at (as campaigns).
alter table public.leads add column promoted_contact_id uuid;  -- set when promoted to a crm_contact; no FK (module-decoupled)
create policy leads_write on public.leads for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.leads to authenticated;
grant update (name, channel, stage, source, promoted_contact_id) on public.leads to authenticated;
grant delete on public.leads to authenticated;
```
- [ ] **Step 2: Controller applies** via `mcp__openkuasa-supabase__apply_migration` (name `reach_leads_writes`) + `get_advisors` (expect only the by-design `auth_allow_anonymous_sign_ins` WARN on `leads`). If the implementer can't reach the MCP, report `DONE_WITH_CONCERNS` so the controller applies it.
- [ ] **Step 3: Add `promoted_contact_id` to the `Lead` type** (`src/lib/reach/types.ts`): add `promoted_contact_id: string | null;` after `created_at` in `Lead` (keep the doc comment style).
- [ ] **Step 4: Add it to the provider select** (`src/lib/reach/supabase.ts`): change `listLeads`'s select string from `'id,name,channel,stage,source,created_at'` to `'id,name,channel,stage,source,promoted_contact_id,created_at'`.
- [ ] **Step 5: Write the RLS write test** `tests/reach-leads-writes.rls.test.ts` (mirror `tests/reach-writes.rls.test.ts`'s `owner`/`other` owned-org harness):
```ts
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = (): SupabaseClient => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
async function ownedOrg(name: string) {
  const c = client();
  const e1 = await c.auth.signInAnonymously(); expect(e1.error, e1.error?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', { org_name: name });
  expect(error, error?.message).toBeNull();
  return { c, orgId: orgId as string };
}
let owner: Awaited<ReturnType<typeof ownedOrg>>; let other: Awaited<ReturnType<typeof ownedOrg>>;
beforeAll(async () => { if (!hasSupabaseEnv) return; owner = await ownedOrg('Leads Writer Sdn Bhd'); other = await ownedOrg('Leads Other Sdn Bhd'); });
afterAll(async () => { await owner?.c.auth.signOut(); await other?.c.auth.signOut(); });

testWithSupabase('owner can insert, update (stage), and delete a lead', async () => {
  const ins = await owner.c.from('leads').insert({ org_id: owner.orgId, name: 'Aisyah Rahim', channel: 'whatsapp', stage: 'lead', source: 'Test' }).select('id,stage').single();
  expect(ins.error, ins.error?.message).toBeNull();
  const id = ins.data!.id;
  const upd = await owner.c.from('leads').update({ stage: 'qualified' }).eq('id', id).select('stage').single();
  expect(upd.error, upd.error?.message).toBeNull();
  expect(upd.data!.stage).toBe('qualified');
  const del = await owner.c.from('leads').delete().eq('id', id).select('id');
  expect(del.error, del.error?.message).toBeNull();
  expect(del.data).toHaveLength(1);
});

testWithSupabase('a different org cannot write the owner’s leads', async () => {
  const ins = await other.c.from('leads').insert({ org_id: owner.orgId, name: 'x', channel: 'facebook', stage: 'lead' });
  expect(ins.error?.code).toBe('42501');
  const mine = await owner.c.from('leads').insert({ org_id: owner.orgId, name: 'mine', channel: 'facebook', stage: 'lead' }).select('id').single();
  const upd = await other.c.from('leads').update({ name: 'hacked' }).eq('id', mine.data!.id).select('id');
  expect(upd.error).toBeNull(); expect(upd.data ?? []).toHaveLength(0);
  const after = await owner.c.from('leads').select('name').eq('id', mine.data!.id).single();
  expect(after.data!.name).toBe('mine');
  await owner.c.from('leads').delete().eq('id', mine.data!.id);
});

testWithSupabase('a viewer (demo member) cannot write leads', async () => {
  const v = client(); await v.auth.signInAnonymously();
  const { data: demoId } = await v.rpc('join_demo_org');
  expect(demoId).toBeTruthy();
  const { error } = await v.from('leads').insert({ org_id: demoId, name: 'nope', channel: 'whatsapp', stage: 'lead' });
  expect(error?.code).toBe('42501');
  await v.auth.signOut();
});
```
- [ ] **Step 6: Run — expect PASS** (migration live): `pnpm vitest run --dir tests tests/reach-leads-writes.rls.test.ts`; then `pnpm exec tsc --noEmit`.
- [ ] **Step 7: Commit.** `git add supabase/migrations src/lib/reach/types.ts src/lib/reach/supabase.ts tests/reach-leads-writes.rls.test.ts && git commit -m "feat(reach): make leads writable (two-layer RLS) + promoted_contact_id"`

---

## Task 2: Lead capability layer (create/update/setStage/delete)

**Files:** Modify `src/lib/reach/capabilities.ts`; Test `tests/reach-capabilities.test.ts` (extend).

**Interfaces — Produces:** `createLeadInput`, `updateLeadInput`, `setLeadStageInput`, `deleteLeadInput`; `createLead`, `updateLead`, `setLeadStage`, `deleteLead` (each `(ctx: ReachWriteContext, input) => Promise<CapResult<...>>`). **Consumes:** `ReachWriteContext`, `CapResult`, `writeFailed`, the `channel` zod enum, `Lead`.

- [ ] **Step 1: Write failing Zod tests** (append to `tests/reach-capabilities.test.ts`):
```ts
import { createLeadInput, updateLeadInput } from '@/lib/reach/capabilities';
describe('lead capability schemas', () => {
  it('rejects an empty name and a bad channel', () => {
    expect(createLeadInput.safeParse({ name: '', channel: 'whatsapp' }).success).toBe(false);
    expect(createLeadInput.safeParse({ name: 'x', channel: 'linkedin' }).success).toBe(false);
  });
  it('defaults stage to lead', () => {
    expect(createLeadInput.parse({ name: 'x', channel: 'whatsapp' })).toMatchObject({ stage: 'lead' });
  });
  it('update requires a uuid id and ignores org_id / promoted_contact_id', () => {
    expect(updateLeadInput.safeParse({ id: 'nope', name: 'y' }).success).toBe(false);
    const p = updateLeadInput.parse({ id: '00000000-0000-0000-0000-000000000000', name: 'y', org_id: 'evil', promoted_contact_id: 'evil' });
    expect('org_id' in p).toBe(false);
    expect('promoted_contact_id' in p).toBe(false);
  });
});
```
- [ ] **Step 2: Run — expect FAIL** (schemas missing).
- [ ] **Step 3: Add the lead section to `capabilities.ts`** (model on the campaign CRUD at lines ~51-108; `z.infer`, parse-at-boundary, org from ctx):
```ts
const leadStage = z.enum(['lead', 'contacted', 'qualified', 'booked', 'won']);
const LEAD_COLS = 'id,name,channel,stage,source,promoted_contact_id,created_at';

export const createLeadInput = z.object({
  name: z.string().trim().min(1).max(120),
  channel,
  stage: leadStage.default('lead'),
  source: z.string().trim().max(120).optional(),
});
export const updateLeadInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  channel: channel.optional(),
  stage: leadStage.optional(),
  source: z.string().trim().max(120).optional(),
});
export const setLeadStageInput = z.object({ id: z.string().uuid(), stage: leadStage });
export const deleteLeadInput = z.object({ id: z.string().uuid() });

export async function createLead(ctx: ReachWriteContext, input: z.input<typeof createLeadInput>): Promise<CapResult<Lead>> {
  const values = createLeadInput.parse(input);  // z.input param (stage has a .default) — mirrors createForm
  const { data, error } = await ctx.client.from('leads').insert({ ...values, org_id: ctx.orgId }).select(LEAD_COLS).single();
  if (error || !data) return writeFailed('createLead', error);
  return { ok: true, data: data as unknown as Lead };
}
export async function updateLead(ctx: ReachWriteContext, input: z.infer<typeof updateLeadInput>): Promise<CapResult<Lead>> {
  const { id, ...fields } = updateLeadInput.parse(input);
  if (Object.keys(fields).length === 0) return { ok: false, error: 'Nothing to update.' };
  const { data, error } = await ctx.client.from('leads').update(fields).eq('id', id).eq('org_id', ctx.orgId).select(LEAD_COLS).maybeSingle();
  if (error) return writeFailed('updateLead', error);
  if (!data) return { ok: false, error: 'That lead was not found.' };
  return { ok: true, data: data as unknown as Lead };
}
export async function setLeadStage(ctx: ReachWriteContext, input: z.infer<typeof setLeadStageInput>): Promise<CapResult<Lead>> {
  const { id, stage } = setLeadStageInput.parse(input);
  return updateLead(ctx, { id, stage });
}
export async function deleteLead(ctx: ReachWriteContext, input: z.infer<typeof deleteLeadInput>): Promise<CapResult<{ id: string }>> {
  const { id } = deleteLeadInput.parse(input);
  const { data, error } = await ctx.client.from('leads').delete().eq('id', id).eq('org_id', ctx.orgId).select('id').maybeSingle();
  if (error) return writeFailed('deleteLead', error);
  if (!data) return { ok: false, error: 'That lead was not found.' };
  return { ok: true, data: { id: data.id } };
}
```
Ensure `Lead` is imported in `capabilities.ts` (add to the `./types` import if absent).
- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run --dir tests tests/reach-capabilities.test.ts`.
- [ ] **Step 5: Add a live integration test** (append) proving org-from-ctx + round-trip, guarded by `hasSupabaseEnv` (mirror the campaign integration test): create an owned org, `createLead(ctx, {name,channel})` with a bogus `org_id` in input (`@ts-expect-error`), assert `ok` + the stored `org_id` equals `ctx.orgId`, then `deleteLead`. Run — expect PASS.
- [ ] **Step 6: Commit.** `git add src/lib/reach/capabilities.ts tests/reach-capabilities.test.ts && git commit -m "feat(reach): lead write capability layer (Zod + RLS-scoped mutations)"`

---

## Task 3: Lead server actions

**Files:** Modify `src/app/(app)/reach/actions.ts`; Test `tests/reach-actions.test.ts` (extend).

**Interfaces — Produces:** `createLeadAction`, `updateLeadAction`, `setLeadStageAction`, `deleteLeadAction` (`(input: unknown) => Promise<CapResult<...>>`). **Consumes:** the existing `writeCtx()` + the Task-2 lead capabilities; mirrors the existing `runForm` helper.

- [ ] **Step 1: Write failing guard test** (append to `tests/reach-actions.test.ts`, reuse its mock pattern — mock `getViewer`/`createClient`/`@/lib/reach/capabilities` with `createLead` recording calls):
```ts
// in the existing ctl/mocks, add a createLead spy; then:
const { createLeadAction } = await import('@/app/(app)/reach/actions');
describe('createLeadAction', () => {
  it('forbids demo + viewer, rejects invalid, calls capability for a member', async () => {
    ctl.viewer = { ...ctl.viewer, isDemo: true };
    expect(await createLeadAction({ name: 'x', channel: 'whatsapp' })).toMatchObject({ ok: false });
    ctl.viewer = { userId: 'u1', orgId: 'org1', role: 'viewer', isDemo: false };
    expect(await createLeadAction({ name: 'x', channel: 'whatsapp' })).toMatchObject({ ok: false });
    ctl.viewer = { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false }; ctl.created = [];
    expect(await createLeadAction({ name: '', channel: 'nope' })).toMatchObject({ ok: false }); // invalid
    expect(ctl.created).toHaveLength(0);
    expect(await createLeadAction({ name: 'Aisyah', channel: 'whatsapp' })).toMatchObject({ ok: true });
    expect(ctl.created).toHaveLength(1);
  });
});
```
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Add a `runLeads` helper + actions** to `src/app/(app)/reach/actions.ts` (mirror `runForm`: surface the Zod message, revalidate the leads path). Import the lead capabilities + schemas:
```ts
const LEADS_PATHS = ['/reach/leads'];
async function runLeads<I, O>(schema: ZodType<I>, input: unknown, fn: (ctx: ReachWriteContext, parsed: I) => Promise<CapResult<O>>): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'That input was not valid.' };
  const result = await fn(ctx, parsed.data);
  if (result.ok) for (const path of LEADS_PATHS) revalidatePath(path);
  return result;
}
export async function createLeadAction(input: unknown) { return runLeads(createLeadInput, input, createLead); }
export async function updateLeadAction(input: unknown) { return runLeads(updateLeadInput, input, updateLead); }
export async function setLeadStageAction(input: unknown) { return runLeads(setLeadStageInput, input, setLeadStage); }
export async function deleteLeadAction(input: unknown) { return runLeads(deleteLeadInput, input, deleteLead); }
```
- [ ] **Step 4: Run — expect PASS:** `pnpm vitest run --dir tests tests/reach-actions.test.ts`; `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Commit.** `git add "src/app/(app)/reach/actions.ts" tests/reach-actions.test.ts && git commit -m "feat(reach): server actions for lead CRUD (edit-data gated)"`

---

## Task 4: Lead AI write tools + id-bearing reads + approval wiring + parity

**Files:** Modify `src/lib/ai/tools.ts`, `src/lib/ai/agents/orchestrator.ts`, `src/components/reach/ask-jebat-hero.tsx`; Test `tests/reach-ai-parity.test.ts` (extend), `tests/reach-campaign-summary.test.ts` or a new `tests/reach-contacts-summary.test.ts`.

**Interfaces — Produces:** write tools `createLead`/`updateLead`/`setLeadStage`/`deleteLead`; `deriveContacts` output now includes `id` + `promoted_contact_id`. **Consumes:** Task-2 capabilities; `WRITE_TOOL_NAMES`.

- [ ] **Step 1: Add `id` + `promoted_contact_id` to `deriveContacts`** (`src/lib/ai/tools.ts`) — prepend to the mapped object: `id: l.id,` and add `promoted_contact_id: l.promoted_contact_id,` (so the model can target a lead and knows if it's already promoted). Write a failing unit test first (new `tests/reach-contacts-summary.test.ts`):
```ts
import { describe, expect, it } from 'vitest';
import { deriveContacts } from '@/lib/ai/tools';
import type { Lead } from '@/lib/reach/types';
const lead: Lead = { id: 'lead-1', name: 'Aisyah', channel: 'whatsapp', stage: 'qualified', source: 'ad', promoted_contact_id: null, created_at: new Date().toISOString() };
it('deriveContacts surfaces id and promoted_contact_id', () => {
  const [r] = deriveContacts([lead]);
  expect(r.id).toBe('lead-1');
  expect(r.promoted_contact_id).toBeNull();
});
```
Run → FAIL, then add the fields → PASS.
- [ ] **Step 2: Add the 4 lead write tools** in the `if (!write?.canWrite) return read;` block of `createReachTools` (after the form tools), import the capabilities aliased (e.g. `capCreateLead`) + their schemas:
```ts
createLead: tool({ description: 'Create a new lead. Needs the owner’s approval before it is saved.', inputSchema: createLeadInput, execute: async (input) => capCreateLead(ctx, input) }),
updateLead: tool({ description: 'Edit a lead by id (name, channel, stage, source). Needs approval.', inputSchema: updateLeadInput, execute: async (input) => capUpdateLead(ctx, input) }),
setLeadStage: tool({ description: 'Move a lead to a funnel stage by id (lead→contacted→qualified→booked→won). Needs approval.', inputSchema: setLeadStageInput, execute: async (input) => capSetLeadStage(ctx, input) }),
deleteLead: tool({ description: 'Delete a lead by id. Cannot be undone; needs approval.', inputSchema: deleteLeadInput, execute: async (input) => capDeleteLead(ctx, input) }),
```
- [ ] **Step 3: Add the 4 names to `WRITE_TOOL_NAMES`** in `orchestrator.ts` (`createLead`, `updateLead`, `setLeadStage`, `deleteLead`).
- [ ] **Step 4: Add approval copy** in `ask-jebat-hero.tsx` `approvalTitle` (cases: createLead → `Create lead “${i.name ?? ''}”?`; updateLead → 'Save changes to this lead?'; setLeadStage → `Move this lead to “${i.stage ?? ''}”?`; deleteLead → 'Delete this lead?') and add `'deleteLead'` to the `approvalDetail` "cannot be undone" list.
- [ ] **Step 5: Extend the parity test** (`tests/reach-ai-parity.test.ts`): assert `tools.createLead.inputSchema === createLeadInput` (+ the other 3 by identity). The existing all-write-tools-gated exact-set regression now includes the 4 new names automatically (they're in `WRITE_TOOL_NAMES` and built) — confirm it still passes.
- [ ] **Step 6: Run — expect PASS:** `pnpm vitest run --dir tests tests/reach-ai-parity.test.ts tests/reach-contacts-summary.test.ts`; `pnpm exec tsc --noEmit`; and `pnpm vitest run --dir tests tests/reach-chat-route.test.ts tests/reach-approval.test.ts` (no regression).
- [ ] **Step 7: Commit.** `git add src/lib/ai/tools.ts src/lib/ai/agents/orchestrator.ts src/components/reach/ask-jebat-hero.tsx tests/ && git commit -m "feat(reach): AI lead write tools (approval-gated) + id in lead reads; parity"`

> **Clean cut point:** after Task 4, leads CRUD is shipped end-to-end minus its screen ("3a"). Tasks 5–7 (promote + screen + prompt) can be a "3b" run if the slice needs to stop.

---

## Task 5: Promote bridge (capability + action + AI tool + tests)

**Files:** Modify `src/lib/reach/capabilities.ts`, `src/app/(app)/reach/actions.ts`, `src/lib/ai/tools.ts`, `src/lib/ai/agents/orchestrator.ts`, `src/components/reach/ask-jebat-hero.tsx`; Test `tests/reach-promote.rls.test.ts`, `tests/reach-capabilities.test.ts` (mapping unit), `tests/reach-ai-parity.test.ts`.

**Interfaces — Produces:** `promoteLeadToContactInput`, `promoteLeadToContact` (capability), `promoteLeadToContactAction`, the `promoteLeadToContact` AI tool. **Consumes:** `createCrmContact` + `CrmContactInsert` from `@/lib/crm/contacts`.

- [ ] **Step 1: Add pure mapping helpers + a failing unit test.** In `capabilities.ts` add (exported for testing):
```ts
export function leadStageToCrmStatus(stage: Lead['stage']): string {
  return ({ lead: 'lead', contacted: 'contacted', qualified: 'qualified', booked: 'qualified', won: 'customer' } as const)[stage];
}
export function leadStageToScore(stage: Lead['stage']): number {
  return ({ lead: 20, contacted: 40, qualified: 60, booked: 80, won: 100 } as const)[stage];
}
export function splitLeadName(name: string): { first_name: string; last_name: string | null } {
  const t = name.trim(); const i = t.indexOf(' ');
  return i === -1 ? { first_name: t, last_name: null } : { first_name: t.slice(0, i), last_name: t.slice(i + 1) };
}
```
Unit test (append to `reach-capabilities.test.ts`): `leadStageToCrmStatus('won')==='customer'`, `('booked')==='qualified'`; `leadStageToScore('qualified')===60`; `splitLeadName('Aisyah Rahim')` → `{first_name:'Aisyah', last_name:'Rahim'}`; `splitLeadName('Cher')` → `{first_name:'Cher', last_name:null}`. Run → FAIL → add helpers → PASS.
- [ ] **Step 2: Add the promote capability** to `capabilities.ts` (import `createCrmContact`, `type CrmContactInsert` from `@/lib/crm/contacts`):
```ts
export const promoteLeadToContactInput = z.object({ id: z.string().uuid() });

export async function promoteLeadToContact(ctx: ReachWriteContext, input: z.infer<typeof promoteLeadToContactInput>): Promise<CapResult<{ contact_id: string }>> {
  const { id } = promoteLeadToContactInput.parse(input);
  const { data: lead, error: readErr } = await ctx.client
    .from('leads').select('id,name,channel,stage,source,promoted_contact_id').eq('id', id).eq('org_id', ctx.orgId).maybeSingle();
  if (readErr) return writeFailed('promoteLeadToContact.read', readErr);
  if (!lead) return { ok: false, error: 'That lead was not found.' };
  if ((lead as { promoted_contact_id: string | null }).promoted_contact_id) return { ok: false, error: 'Already promoted to a contact.' };
  const l = lead as unknown as Lead;
  const name = splitLeadName(l.name);
  const payload: CrmContactInsert = {
    first_name: name.first_name, last_name: name.last_name,
    email: '', phone: null, company: null, country: '',
    status: leadStageToCrmStatus(l.stage), lead_score: leadStageToScore(l.stage),
    tags: [l.channel, ...(l.source ? [l.source] : [])],
    org_id: ctx.orgId,
  };
  let contactId: string;
  try {
    const contact = await createCrmContact(ctx.client, payload);
    contactId = contact.id;
  } catch (error) { return writeFailed('promoteLeadToContact.createContact', error); }
  const { error: stampErr } = await ctx.client.from('leads').update({ promoted_contact_id: contactId }).eq('id', id).eq('org_id', ctx.orgId);
  if (stampErr) console.error('[reach-capability] promoteLeadToContact.stamp failed:', stampErr); // contact exists; a re-promote would make a duplicate (rare, low-harm)
  return { ok: true, data: { contact_id: contactId } };
}
```
(`createCrmContact`'s returned `CrmContact` has an `id` field — confirm and use it.)
- [ ] **Step 3: Add the action** to `actions.ts`: `promoteLeadToContactAction` using `runLeads` but also revalidating `/crm/contacts`:
```ts
export async function promoteLeadToContactAction(input: unknown) {
  const r = await runLeads(promoteLeadToContactInput, input, promoteLeadToContact);
  if (r.ok) revalidatePath('/crm/contacts');
  return r;
}
```
- [ ] **Step 4: Add the AI tool** (`tools.ts`, write block): `promoteLeadToContact: tool({ description: 'Promote a lead to a CRM contact by id. Creates a Kasturi contact. Needs approval.', inputSchema: promoteLeadToContactInput, execute: async (input) => capPromoteLeadToContact(ctx, input) })`. Add `'promoteLeadToContact'` to `WRITE_TOOL_NAMES`. Add `approvalTitle` case (→ 'Promote this lead to a CRM contact?').
- [ ] **Step 5: Write the promote RLS/integration test** `tests/reach-promote.rls.test.ts` (owned-org harness; this needs the reach capability + a Supabase client — import `promoteLeadToContact` + build a `ReachWriteContext`):
```ts
// owner creates a lead (stage 'won'), then promoteLeadToContact(ctx,{id}):
//  - expect ok; a crm_contacts row exists for owner.orgId with status 'customer', lead_score 100, tags include the channel;
//  - the lead's promoted_contact_id is set;
//  - calling promote again → { ok:false, error:/already promoted/i };
//  - a SECOND org's ctx promoting the owner's lead id → { ok:false, error:/not found/i } (RLS hides it).
// Clean up: delete the crm_contact + lead.
```
(Use `createLead`/`deleteLead` from the capability with the owner ctx; assert `crm_contacts` via a direct `.select()` as the owner.)
- [ ] **Step 6: Extend parity test** — `tools.promoteLeadToContact.inputSchema === promoteLeadToContactInput`; confirm the all-gated regression still exact-matches.
- [ ] **Step 7: Run — expect PASS:** `pnpm vitest run --dir tests tests/reach-capabilities.test.ts tests/reach-promote.rls.test.ts tests/reach-ai-parity.test.ts`; `pnpm exec tsc --noEmit`.
- [ ] **Step 8: Commit.** `git add src/lib/reach/capabilities.ts "src/app/(app)/reach/actions.ts" src/lib/ai/tools.ts src/lib/ai/agents/orchestrator.ts src/components/reach/ask-jebat-hero.tsx tests/ && git commit -m "feat(reach): promote lead → Kasturi contact (reuses createCrmContact, idempotent)"`

---

## Task 6: Live Lead Funnel screen + nav/registry

**Files:** Create `src/screens/reach/leads.tsx`, `src/components/reach/lead-funnel-table.tsx`; Modify `src/config/nav.ts`, `src/screens/registry.ts`.

**Interfaces — Consumes:** `getReachData().listLeads()`, `getViewer`, `can`, the Task-3/5 lead actions, `rm` from `@/lib/reach/format`, types from `@/lib/reach/types`.

- [ ] **Step 1: Create the Lead Funnel screen** `src/screens/reach/leads.tsx` — a live server component modelled on `src/screens/reach/ad-studio.tsx`: `const supabase = await createClient(); const [data, viewer] = await Promise.all([getReachData(supabase), getViewer()]); const leads = await data.listLeads(); const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');` Derive the funnel KPIs (counts per stage; by-channel) from `leads` via the existing `deriveLeadSummary` helper (import from `@/lib/ai/tools`) or inline; sourceless widgets → "Not available yet" for a real org. Render `<LeadFunnelTable leads={leads} canEdit={canEdit} />`. Use the module's existing widget components + `PageHeader`.
- [ ] **Step 2: Create `src/components/reach/lead-funnel-table.tsx`** (`'use client'`) modelled on `src/components/reach/ad-studio-table.tsx`: a table of leads (name, channel, stage, source, created) with, when `canEdit`: "New Lead" dialog (name/channel/stage/source), row Edit, a stage control (advance → calls `setLeadStageAction`), inline-confirm Delete, and a **Promote** button that calls `promoteLeadToContactAction({ id })` and is **disabled / shows "Promoted ✓"** when `lead.promoted_contact_id` is set. Use `useTransition`, `role="alert"` errors, and the inline two-step confirm for Delete (per slice 2). Import `rm` from `@/lib/reach/format` and types from `@/lib/reach/types` — **never** `@/lib/ai/tools` (bundle rule). No purple/violet.
- [ ] **Step 3: Wire nav + registry.** `src/config/nav.ts`: in the reach "Leads" group, change `{ label: 'Contacts', slug: 'contacts', icon: Users }` → `{ label: 'Lead Funnel', slug: 'leads', icon: Users }` (keep the `Lead Forms` item). `src/screens/registry.ts`: add `import LeadsScreen from '@/screens/reach/leads';` and the entry `'reach/leads': LeadsScreen,`; **remove** the `'reach/contacts': ContactsScreen,` entry. **Leave `'crm/contacts': ContactsScreen` and the `ContactsScreen` import** (CRM still uses it).
- [ ] **Step 4: Verify.** `pnpm exec tsc --noEmit`; `pnpm exec eslint src/screens/reach/leads.tsx src/components/reach/lead-funnel-table.tsx src/config/nav.ts src/screens/registry.ts`; `pnpm vitest run --dir tests` (no regressions).
- [ ] **Step 5: Commit.** `git add src/screens/reach/leads.tsx src/components/reach/lead-funnel-table.tsx src/config/nav.ts src/screens/registry.ts && git commit -m "feat(reach): live Lead Funnel screen with gated lead CRUD + promote; replace static reach Contacts"`

---

## Task 7: `JEBAT_SYSTEM` lead/promote lines + final sweep

**Files:** Modify `src/lib/ai/agents/prompts.ts`; Test `tests/jebat-prompt.test.ts` (extend).

- [ ] **Step 1: Failing test** (append): assert `JEBAT_SYSTEM.toLowerCase()` contains `'lead'` guidance for changes and `'promote'` (the capability + the "promote to the CRM" phrase). Run → FAIL.
- [ ] **Step 2: Edit `JEBAT_SYSTEM`** TOOLS block: extend the capability line to mention leads + promote, e.g. "— create, edit, delete or move leads along the funnel, and **promote a lead to a CRM contact** — " and add a short note: "To promote or change a specific lead, first list leads to get its id; a lead already promoted cannot be promoted again." Keep the Bahasa/plain style; don't disturb other bullets or `TUAH_SYSTEM`.
- [ ] **Step 3: Run — expect PASS:** `pnpm vitest run --dir tests tests/jebat-prompt.test.ts`.
- [ ] **Step 4: Full sweep:** `pnpm vitest run --dir tests` (all green); `pnpm exec tsc --noEmit`; `pnpm exec eslint src tests` (0 errors).
- [ ] **Step 5: Commit.** `git add src/lib/ai/agents/prompts.ts tests/jebat-prompt.test.ts && git commit -m "feat(reach): Jebat prompt covers lead CRUD + promote-to-CRM"`

---

## Final verification (before the whole-branch review)
- [ ] `pnpm exec tsc --noEmit` clean; `pnpm vitest run --dir tests` all green; `pnpm exec eslint src tests` 0 errors.
- [ ] `get_advisors` (security) — no new warnings beyond the by-design anon-access WARN on `leads`.
- [ ] Confirm **all** reach write tools (campaigns ×4, creatives ×3, ad_settings, forms ×4, leads ×4, promote ×1) are in `WRITE_TOOL_NAMES` and the all-gated exact-set regression passes.
- [ ] Confirm no `'use client'` component imports `@/lib/ai/tools`.
- [ ] Browser smoke with a real writer account: create/edit/advance-stage/delete a lead on the Lead Funnel; **Promote** a lead → it appears in `/crm/contacts` and shows "Promoted ✓" (second promote blocked); ask Jebat by name to advance/promote a lead → approval card → executes; a viewer/demo sees read-only.
