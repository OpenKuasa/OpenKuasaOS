# Jebat Autonomous Agent — Weekly Studio (Slice 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one autonomous, scheduled, read-only "Weekly Studio" agent end-to-end: it reads an org's week of marketing data, web-searches an angle, and generates a digest + poster + hero image + promo video via OpenRouter, saved as a run the owner sees on a now-live Agents screen.

**Architecture:** A new `src/lib/agents/` subsystem (distinct from the chat `src/lib/ai/agents/`). All OpenRouter generation sits behind one seam (`openrouter-media.ts`) that every test mocks (CI never spends). A service-role Supabase client (the only non-session actor) runs the agent per-org from a scheduled trigger; config + run history are shown on the live Agents screen via the normal session client + RLS.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + RLS + Storage, AI SDK v7 + `@openrouter/ai-sdk-provider`, OpenRouter image + async video APIs, Zod, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-jebat-autonomous-agent-design.md` (read it; the plan argues from it).

## Global Constraints

- No Kuasa brand names in `src/`; **no purple/violet/indigo/fuchsia** in the UI; fictional data only.
- Supabase project `ugchntdgaeefmufumchx` via the `openkuasa-supabase` MCP ONLY. **Controller applies the migration AND creates the `agent-assets` storage bucket**; implementers own committed files + TS + tests.
- **Tests MUST mock OpenRouter (search/digest/image/video) and the service role. CI must NEVER spend real money or perform a real generation.** No test calls `openrouter-media`'s real implementation against the network.
- The worker is the ONLY service-role actor: **no unauthenticated public trigger** (reuse the existing `SUPABASE_SERVICE_ROLE_KEY` as the trigger's auth, or run in-container); **every** worker query is `.eq('org_id', <the org being processed>)`; the org is NEVER taken from untrusted input ("Run now" takes it from the authenticated viewer).
- `agent_runs` and `agent_run_assets` get **NO authenticated insert/update/delete grant** — only the worker's service-role writes them. `agent_configs` is two-layer: `is_org_member` read, `is_org_writer` write; `id`/`org_id` never in an UPDATE grant.
- **Never log, print, return, or embed any key** (OpenRouter, service-role). `.env*` is read/write-denied — verify env var presence by name only.
- A `'use client'` component never imports `@/lib/ai/*` or `@/lib/agents/*` server code (types only). A new live screen → add to `src/config/live-screens.ts` + `node scripts/gen-screen-routes.mjs`.
- `main` moves fast (Tuah #97–100 landing). An AI-touching task re-reads the current structure before wiring.

## Review Focus

- **Org with the agent enabled but no OpenRouter key** → the run records a clean `failed` ("no AI key"), never crashes. Pinned in Task 6.
- **A video job that never completes** → the poll marks the asset `failed` after a max-age, no infinite `pending`. Pinned in Task 9.
- **One org's asset storage path readable by another org** → bucket RLS denies it (path is `org_id/...`). Pinned in Task 8.
- **The run entry invoked twice before `last_run_at` updates** → the config is claimed first (conditional update), so no double-run. Pinned in Task 10.
- **A per-run cost cap exceeded mid-run** → generation stops, the run records what it produced + its cost, status `done`/`failed` sensibly, no runaway spend. Pinned in Task 10.
- **An unauthenticated / wrong-key call to the trigger, or a viewer calling "Run now"** → rejected. Pinned in Tasks 7 (viewer) and 10 (trigger auth).

---

## File Structure

- `supabase/migrations/<ts>_agent_runs.sql` — the 3 tables + RLS/grants (T1; bucket by controller).
- `src/lib/agents/types.ts` — `AgentConfig`, `AgentRun`, `AgentRunAsset`, enums (T1).
- `src/lib/agents/config.ts` — config capability (setAgentEnabled/Cadence/Cap + list) (T2).
- `src/lib/supabase/service.ts` — service-role client, server-only (T5).
- `src/lib/agents/openrouter-media.ts` — the generation seam (search/digest/image/video) (T5).
- `src/lib/agents/weekly-studio.ts` — `runWeeklyStudio(orgId, trigger)` (T6/T8/T9).
- `src/lib/agents/runner.ts` — `runAgents()` + `pollVideos()` + cadence/claim/caps (T10).
- `src/app/(app)/reach/actions.ts` — agent config actions + `runAgentNowAction` (T3/T7).
- `src/screens/reach/agents.tsx` (live) + `src/components/reach/agents-panel.tsx` (client) (T4/T8/T9).
- `src/config/live-screens.ts` — +`reach/agents` (T4).
- The scheduled trigger (route and/or cron entry) (T10).

---

### Task 1: Data model (migration + types + RLS test)

**Files:** Create `supabase/migrations/<ts>_agent_runs.sql` (timestamp after the latest migration), `src/lib/agents/types.ts`; Test `tests/agent-configs.rls.test.ts` (model on `tests/reach-leads-writes.rls.test.ts`).

**Interfaces — Produces:** tables `agent_configs`/`agent_runs`/`agent_run_assets`; types `AgentConfig`, `AgentRun`, `AgentRunAsset`, `AgentCadence='off'|'daily'|'weekly'`, `AgentRunStatus`, `AssetKind='poster'|'image'|'video'`, `AssetStatus`.

- [ ] **Step 1: Migration file** (committed; controller applies it) — exactly the SQL in spec §5, plus the two-layer policies/grants:
```sql
-- (the three create table statements from spec §5 go here verbatim)

alter table public.agent_configs enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_assets enable row level security;

create policy agent_configs_select on public.agent_configs for select to authenticated using (private.is_org_member(org_id));
create policy agent_configs_write on public.agent_configs for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy agent_runs_select on public.agent_runs for select to authenticated using (private.is_org_member(org_id));
create policy agent_run_assets_select on public.agent_run_assets for select to authenticated using (private.is_org_member(org_id));

-- restrictive mfa gate, matching the other tables (confirm the exact expression from an existing migration, e.g. reach_leads_writes)
create policy mfa_required on public.agent_configs as restrictive for all to authenticated using ((select private.mfa_ok()));
create policy mfa_required on public.agent_runs as restrictive for all to authenticated using ((select private.mfa_ok()));
create policy mfa_required on public.agent_run_assets as restrictive for all to authenticated using ((select private.mfa_ok()));

grant select on public.agent_configs, public.agent_runs, public.agent_run_assets to authenticated;
grant insert on public.agent_configs to authenticated;
grant update (enabled, cadence, max_cost_cents, last_run_at, updated_at) on public.agent_configs to authenticated;
grant delete on public.agent_configs to authenticated;
-- NO insert/update/delete grant on agent_runs or agent_run_assets (worker/service-role only).
```
(Read `supabase/migrations/20261012150000_reach_appointments_writes.sql` + a `mfa_required` policy on an existing table to copy the EXACT `private.mfa_ok()` / `is_org_writer` spellings.)

- [ ] **Step 2: Types** `src/lib/agents/types.ts`:
```ts
export type AgentCadence = 'off' | 'daily' | 'weekly';
export type AgentRunStatus = 'running' | 'done' | 'failed';
export type AgentRunTrigger = 'schedule' | 'manual';
export type AssetKind = 'poster' | 'image' | 'video';
export type AssetStatus = 'pending' | 'done' | 'failed';

export type AgentConfig = {
  id: string; org_id: string; agent_key: string; enabled: boolean;
  cadence: AgentCadence; max_cost_cents: number; last_run_at: string | null;
  created_at: string; updated_at: string;
};
export type AgentRun = {
  id: string; org_id: string; agent_key: string; status: AgentRunStatus;
  trigger: AgentRunTrigger; digest_md: string | null; cost_cents: number;
  error: string | null; started_at: string; finished_at: string | null;
};
export type AgentRunAsset = {
  id: string; run_id: string; org_id: string; kind: AssetKind;
  status: AssetStatus; provider_job_id: string | null; storage_path: string | null; created_at: string;
};
export const WEEKLY_STUDIO = 'weekly-studio';
```

- [ ] **Step 3: RLS test** `tests/agent-configs.rls.test.ts`, modelled on `tests/reach-leads-writes.rls.test.ts`: owner-writer can upsert + read their `agent_configs`; a second org cannot see/update it (0 rows); a viewer-role user is denied the write (42501); and an authenticated user **cannot insert** into `agent_runs` (no grant → error). Clean up in `finally`.

- [ ] **Step 4: Run** `pnpm vitest run --dir tests tests/agent-configs.rls.test.ts` (live, must pass — controller applies the migration first) + `pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit.** `git add supabase/migrations src/lib/agents/types.ts tests/agent-configs.rls.test.ts && git commit -m "feat(agents): agent_configs/runs/assets tables (two-layer RLS; runs worker-only)"`

---

### Task 2: Agent config capability

**Files:** Create `src/lib/agents/config.ts`; Test `tests/agent-config.test.ts`.

**Interfaces — Consumes:** Task-1 types; `ReachWriteContext` shape (`{ client, orgId }`) — reuse `type ReachWriteContext` from `@/lib/reach/capabilities` or define a local `AgentWriteContext = { client: SupabaseClient; orgId: string }`. **Produces:** `listAgentConfigs(client, orgId)`, `setAgentEnabledInput`/`setAgentCadenceInput`/`setAgentCapInput` + `setAgentEnabled`/`setAgentCadence`/`setAgentCap` (upsert into `agent_configs`).

- [ ] **Step 1: Failing tests** (`tests/agent-config.test.ts`, minimal fake client like `tests/reach-capabilities.test.ts`): `setAgentEnabledInput` rejects an unknown `agent_key` not in an allow-list `['weekly-studio']`; `setAgentCadenceInput` rejects a cadence outside off/daily/weekly; `setAgentCapInput` clamps/rejects `max_cost_cents` outside 0..10000; each fn writes with `org_id` from ctx (never input) via upsert on `(org_id, agent_key)`. Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/agents/config.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { WEEKLY_STUDIO, type AgentConfig } from './types';

export type AgentWriteContext = { client: SupabaseClient; orgId: string };
export type AgentCapResult<T> = { ok: true; data: T } | { ok: false; error: string };

const agentKey = z.enum([WEEKLY_STUDIO]);
const cadence = z.enum(['off', 'daily', 'weekly']);
export const setAgentEnabledInput = z.object({ agent_key: agentKey, enabled: z.boolean() });
export const setAgentCadenceInput = z.object({ agent_key: agentKey, cadence });
export const setAgentCapInput = z.object({ agent_key: agentKey, max_cost_cents: z.number().int().min(0).max(10000) });
const COLS = 'id,org_id,agent_key,enabled,cadence,max_cost_cents,last_run_at,created_at,updated_at';

export async function listAgentConfigs(client: SupabaseClient, orgId: string): Promise<AgentConfig[]> {
  const { data } = await client.from('agent_configs').select(COLS).eq('org_id', orgId);
  return (data ?? []) as unknown as AgentConfig[];
}

async function upsert(ctx: AgentWriteContext, agent_key: string, patch: Record<string, unknown>): Promise<AgentCapResult<AgentConfig>> {
  const { data, error } = await ctx.client
    .from('agent_configs')
    .upsert({ org_id: ctx.orgId, agent_key, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'org_id,agent_key' })
    .select(COLS)
    .single();
  if (error || !data) { console.error('[agent-config] upsert failed:', error); return { ok: false, error: 'That change could not be saved.' }; }
  return { ok: true, data: data as unknown as AgentConfig };
}

export async function setAgentEnabled(ctx: AgentWriteContext, input: z.infer<typeof setAgentEnabledInput>) {
  const { agent_key, enabled } = setAgentEnabledInput.parse(input);
  return upsert(ctx, agent_key, { enabled });
}
export async function setAgentCadence(ctx: AgentWriteContext, input: z.infer<typeof setAgentCadenceInput>) {
  const { agent_key, cadence } = setAgentCadenceInput.parse(input);
  return upsert(ctx, agent_key, { cadence });
}
export async function setAgentCap(ctx: AgentWriteContext, input: z.infer<typeof setAgentCapInput>) {
  const { agent_key, max_cost_cents } = setAgentCapInput.parse(input);
  return upsert(ctx, agent_key, { max_cost_cents });
}
```

- [ ] **Step 3: Run** the test → PASS; `tsc` clean. **Step 4: Commit** (`feat(agents): agent config capability (enable/cadence/cap, org-scoped upsert)`).

---

### Task 3: Agent config server actions

**Files:** Modify `src/app/(app)/reach/actions.ts`; Test `tests/reach-actions.test.ts` (extend).

**Interfaces — Consumes:** Task-2 inputs + fns; existing `writeCtx()`/`FORBIDDEN`. **Produces:** `setAgentEnabledAction`/`setAgentCadenceAction`/`setAgentCapAction`.

- [ ] **Step 1: Failing guard tests** (extend `reach-actions.test.ts`, mirror the lead guard tests): a demo/viewer gets `{ ok:false }` and the capability spy is not called; valid input as a writer reaches the capability. Run → FAIL.
- [ ] **Step 2: Implement** a `runAgentConfig` helper mirroring `runLeads` (guard via `writeCtx()` → parse → fn → `revalidatePath('/reach/agents')`), and the three actions routing through it with the Task-2 schemas/fns (the ctx is `{ client: ctx.client, orgId: ctx.orgId }`). Import from `@/lib/agents/config`.
- [ ] **Step 3: Run → PASS; tsc clean. Step 4: Commit** (`feat(agents): server actions for agent config (edit-data gated)`).

---

### Task 4: Live Agents screen (config + empty history)  **[CLEAN CUT: configurable screen]**

**Files:** Create `src/components/reach/agents-panel.tsx`; Modify `src/screens/reach/agents.tsx`, `src/config/live-screens.ts`; regenerate routes.

**Interfaces — Consumes:** `listAgentConfigs`, `getViewer`, `can`, the Task-3 actions; `AgentConfig`/`AgentRun`/`AgentRunAsset` types.

- [ ] **Step 1: Live screen** `src/screens/reach/agents.tsx` — server component modelled on `src/screens/reach/leads.tsx`: `createClient()` → load `listAgentConfigs(supabase, viewer.orgId)` + recent `agent_runs` (`select … eq org_id order started_at desc limit 10`) + their assets; `canEdit = !viewer.isDemo && can(viewer.role,'edit-data')`. Render `<AgentsPanel configs runs assets canEdit />`. Remove the 6 fictional mock crew cards; show only the real Weekly Studio agent (seed a default disabled config row in the UI if none exists — do NOT write on read; render a default-off card).
- [ ] **Step 2: Client panel** `src/components/reach/agents-panel.tsx` (`'use client'`): the Weekly Studio card with, when `canEdit`: an enabled toggle (`setAgentEnabledAction`), a cadence Select off/daily/weekly (`setAgentCadenceAction`), a cost-cap input (`setAgentCapAction`), and a "Run now" button (wired in Task 7 — placeholder no-op with a `// Task 7` comment). A run-history list (empty-state "No runs yet"). `useTransition`, `role="alert"` errors. **No `@/lib/ai/*` or `@/lib/agents/*` server import** — types only. No purple/violet.
- [ ] **Step 3: Mark live + routes.** Add `'reach/agents'` to `LIVE_SCREENS`; `node scripts/gen-screen-routes.mjs` (expect wrote 0) + `--check`.
- [ ] **Step 4: Verify** tsc + eslint the touched files + purple/violet grep + `pnpm vitest run --dir tests` (screen-routes/live-screens green). **Step 5: Commit** (`feat(agents): live Agents screen — Weekly Studio config + empty run history`).

---

### Task 5: Service-role client + the OpenRouter media seam

**Files:** Create `src/lib/supabase/service.ts`, `src/lib/agents/openrouter-media.ts`; Test `tests/openrouter-media.test.ts`.

**Interfaces — Produces:** `serviceClient()` (service-role Supabase client); `AgentMedia` = `{ webSearch(apiKey, query), writeDigest(apiKey, context), generateImage(apiKey, prompt), startVideo(apiKey, prompt), checkVideo(apiKey, jobId) }` returning typed results incl. a `cost_cents` field where OpenRouter reports usage.

- [ ] **Step 1: Service client** `src/lib/supabase/service.ts` (server-only; `import 'server-only'` at top):
```ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Service role is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
```
- [ ] **Step 2: Media seam** `src/lib/agents/openrouter-media.ts` — a module with the real OpenRouter calls behind named async functions, each taking the ORG's decrypted apiKey. **Re-read `src/lib/ai/provider.ts` (`createOpenRouter`) + the current `@openrouter/ai-sdk-provider` + AI SDK v7 image/video support before writing; OpenRouter video is a dedicated async REST API — call it with `fetch` + the apiKey.** Shape:
```ts
export type DigestResult = { text: string; cost_cents: number };
export type ImageResult = { bytes: Uint8Array; contentType: string; cost_cents: number };
export type VideoStart = { jobId: string; cost_cents: number };
export type VideoCheck = { status: 'pending' | 'done' | 'failed'; url?: string };
export async function webSearch(apiKey: string, query: string): Promise<{ text: string; cost_cents: number }> { /* OpenRouter :online generateText */ }
export async function writeDigest(apiKey: string, context: string): Promise<DigestResult> { /* generateText */ }
export async function generateImage(apiKey: string, prompt: string): Promise<ImageResult> { /* OpenRouter image model */ }
export async function startVideo(apiKey: string, prompt: string): Promise<VideoStart> { /* POST OpenRouter video API → job id */ }
export async function checkVideo(apiKey: string, jobId: string): Promise<VideoCheck> { /* GET job status */ }
```
- [ ] **Step 3: Tests** `tests/openrouter-media.test.ts`: assert the module EXPORTS these functions with these signatures (shape test) — do NOT call them against the network. (The real calls are exercised only by the manual smoke; unit tests of agents/runner MOCK this whole module.) `tsc` must type-check the real impl.
- [ ] **Step 4: Run → PASS; tsc clean. Step 5: Commit** (`feat(agents): service-role client + OpenRouter media seam (search/digest/image/video)`).

---

### Task 6: `runWeeklyStudio` (text digest) + run persistence

**Files:** Create `src/lib/agents/weekly-studio.ts`; Test `tests/weekly-studio.test.ts`.

**Interfaces — Consumes:** `serviceClient`, `AgentMedia` (mocked in tests), `decryptApiKey`/`hasKeySecret` from `@/lib/ai/key-crypto`, `getReachData` + `deriveReportsModel`. **Produces:** `runWeeklyStudio(service, orgId, trigger): Promise<{ runId: string; status: AgentRunStatus }>` — `service` is ALWAYS the **service-role** client (it writes `agent_runs`/`agent_run_assets`, which have no authenticated grant); the caller supplies a TRUSTED `orgId` (never from untrusted input) and is responsible for having authorized it.

- [ ] **Step 1: Failing tests** (`tests/weekly-studio.test.ts`, `vi.mock('@/lib/agents/openrouter-media')` + a fake service client + a fake org key source): (a) an org with NO OpenRouter key → a `failed` run row with error ~"no AI key", no media call; (b) a happy text run → reads data, calls `webSearch` + `writeDigest`, writes an `agent_runs` row `done` with `digest_md` + summed `cost_cents`; (c) org_id is used on every write. Run → FAIL.
- [ ] **Step 2: Implement** `runWeeklyStudio(client, orgId, trigger)`: insert a `running` run row; load the org's sealed OpenRouter key (`agent` reads `org_ai_keys` via the client scoped to orgId, `decryptApiKey`); if none → update run `failed` "no AI key" and return; gather context = `deriveReportsModel(leads, campaigns, appts, '7d', now)` summarized to text; `webSearch` an angle; `writeDigest`; update the run `done` with `digest_md` + `cost_cents`. All writes `.eq('org_id', orgId)`. (Image/video added in T8/T9.)
- [ ] **Step 3: Run → PASS; tsc clean. Step 4: Commit** (`feat(agents): runWeeklyStudio text digest + run persistence`).

---

### Task 7: "Run now" (manual run, end-to-end)  **[CLEAN CUT: digest agent works]**

**Files:** Modify `src/app/(app)/reach/actions.ts`, `src/components/reach/agents-panel.tsx`; Test `tests/reach-actions.test.ts` (extend).

- [ ] **Step 1: Failing test**: `runAgentNowAction` denies a demo/viewer (`{ ok:false }`, no run); as a writer it calls `runWeeklyStudio` with the org from the VIEWER (never input) + the SERVICE client + `trigger='manual'`. Run → FAIL. (Mock `runWeeklyStudio` and `serviceClient`.)
- [ ] **Step 2: Implement** `runAgentNowAction(input)`: `writeCtx()` guard (writer only); derive `orgId` from the authenticated viewer (NEVER from input); call `runWeeklyStudio(serviceClient(), viewer.orgId, 'manual')` — the run writes `agent_runs`/`agent_run_assets`, which only the service-role may write; the viewer gate is the authorization, the service client is the writer. `revalidatePath('/reach/agents')`; return `{ ok, runId }`. Wire the "Run now" button in `agents-panel.tsx` (`useTransition`, `role="alert"` on failure).
- [ ] **Step 3: Run → PASS; tsc clean. Step 4: Commit** (`feat(agents): Run now (manual, viewer-scoped) runs the digest agent`).

---

### Task 8: Image + poster generation + storage + display

**Files:** Modify `src/lib/agents/weekly-studio.ts`, `src/screens/reach/agents.tsx`, `src/components/reach/agents-panel.tsx`; Test `tests/weekly-studio.test.ts` (extend). Controller creates the `agent-assets` bucket.

- [ ] **Step 1: Failing tests** (mock media + a fake storage): a happy run also calls `generateImage` twice (poster + hero), uploads each to `agent-assets/<org>/<run>/<kind>.png`, writes `agent_run_assets` rows `done` with the `storage_path`; respects the per-run cap (if cost exceeds `max_cost_cents` before images, skip image gen + record what was produced). Run → FAIL.
- [ ] **Step 2: Implement** the image step in `runWeeklyStudio` (after the digest, before the cap is hit): `generateImage(apiKey, posterPrompt)` + `(heroPrompt)` → `serviceClient().storage.from('agent-assets').upload(path, bytes)` → insert `agent_run_assets` rows. Accumulate `cost_cents`; stop before any step that would exceed `max_cost_cents`.
- [ ] **Step 3: Display** — the Agents screen builds **signed URLs** for each `done` asset (`storage.from('agent-assets').createSignedUrl(path, 3600)`) and the panel renders the poster + hero `<img>` (and a placeholder for `pending`/`failed`). Client gets URLs as props (no server import).
- [ ] **Step 4: Run → PASS; tsc + eslint; no purple/violet. Step 5: Commit** (`feat(agents): poster + hero image generation, storage, and display`).

---

### Task 9: Video kick-off + poll + finalize

**Files:** Modify `src/lib/agents/weekly-studio.ts`, `src/lib/agents/runner.ts`; Test `tests/agent-poll.test.ts` + `tests/weekly-studio.test.ts` (extend).

- [ ] **Step 1: Failing tests** (mock media): a run calls `startVideo` → writes a `video` asset `pending` with `provider_job_id` (unless the cap is already hit); `pollVideos(serviceClient)` finds `pending` video assets, calls `checkVideo`: on `done` downloads + uploads + marks `done`; on `failed` marks `failed`; a `pending` asset older than a max-age (e.g. 30 min) is marked `failed` ("timed out"); re-polling a `done`/`failed` asset is a no-op (idempotent). Run → FAIL.
- [ ] **Step 2: Implement** the `startVideo` step in `runWeeklyStudio` (image-to-video from the hero, or text-to-video) and `pollVideos(client)` in `src/lib/agents/runner.ts`. The screen renders a `<video>` for a `done` video asset (signed URL) and "rendering…" for `pending`.
- [ ] **Step 3: Run → PASS; tsc clean. Step 4: Commit** (`feat(agents): async video kick-off + poll/finalize with timeout`).

---

### Task 10: Scheduler trigger + cadence/claim + cost caps + kill-switch

**Files:** Create the trigger entry (route and/or cron — see Step 0); Modify `src/lib/agents/runner.ts`; Test `tests/agent-runner.test.ts`.

- [ ] **Step 0 (RULING — do FIRST): pick the trigger.** Check whether `pg_net` is enabled (for `pg_cron`→HTTP) and whether Railway cron is configured. Implement ONE: (A) an in-container runner invoked by Railway cron, OR (B) `src/app/api/agents/run/route.ts` + `/poll/route.ts` (POST) that require the `SUPABASE_SERVICE_ROLE_KEY` in an `authorization`/`x-service-key` header (compare to `process.env.SUPABASE_SERVICE_ROLE_KEY`) and reject otherwise. **No new secret.** Record the choice in the report.
- [ ] **Step 1: Failing tests** (`tests/agent-runner.test.ts`, mock `runWeeklyStudio` + a fake service client): `runAgents()` runs only configs that are `enabled`, cadence-due (`last_run_at` older than the cadence window), when `AGENTS_ENABLED` is truthy; it **claims** each config first (a conditional `update … set last_run_at=now() where id=? and (last_run_at is null or last_run_at < cutoff)` returning the row) so a double-invocation runs each once; a per-run cost cap is passed through; if `AGENTS_ENABLED` is unset/false, nothing runs; the trigger auth (route option) rejects a missing/wrong key. Run → FAIL.
- [ ] **Step 2: Implement** `runAgents()`: read `AGENTS_ENABLED`; `serviceClient()`; select enabled configs; for each, CLAIM (conditional update on `last_run_at`); if claimed, `runWeeklyStudio(service, cfg.org_id, 'schedule')` in try/catch; continue on error. Wire the trigger entry from Step 0 to call `runAgents()`/`pollVideos()`.
- [ ] **Step 3: Run → PASS; tsc + eslint. Step 4: Commit** (`feat(agents): scheduled runner — cadence claim, cost cap, kill-switch, trigger`).

---

## Final verification (before the whole-branch review)

- [ ] `pnpm exec tsc --noEmit` clean; `pnpm vitest run --dir tests` all green; `pnpm exec eslint src tests` 0 errors; `node scripts/gen-screen-routes.mjs --check` green.
- [ ] **Confirm NO test performs a real OpenRouter call** (grep the agent/runner tests for `vi.mock('@/lib/agents/openrouter-media')`); no key is logged.
- [ ] `get_advisors` (security): the 3 new tables show only the by-design anon-access WARN (like other reach tables); `agent_runs`/`agent_run_assets` have no authenticated write grant; the `agent-assets` bucket is private with org-scoped RLS.
- [ ] Confirm no `'use client'` component imports `@/lib/ai/*` or `@/lib/agents/*` server code.
- [ ] **Setup checklist for the operator** (hand to the user; blocks only the real smoke, not the build): `SUPABASE_SERVICE_ROLE_KEY` present ✓; set `AGENTS_ENABLED`; the smoke org's OpenRouter (BYOK) key has image+video credit; configure the chosen trigger (Railway cron or pg_cron+pg_net).
- [ ] Browser smoke (smoke account, writer): enable the Weekly Studio agent, click **Run now**, watch a run appear → digest + poster + hero image render, video shows "rendering…" then (after poll) plays; a viewer sees it read-only. (Real generation — needs the operator setup above.)
