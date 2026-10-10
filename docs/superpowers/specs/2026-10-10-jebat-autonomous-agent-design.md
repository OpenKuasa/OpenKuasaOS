# Jebat Autonomous Agent — Weekly Studio (Slice 5a) — Design

**Status:** approved in chat 2026-10-10. Source of truth for the plan. First vertical of the autonomous-agent feature (decomposition: **5a this**, 5b guarded actions, 5c proposal/approval queue, 5d full crew).

## 1. Goal

Make Jebat's **AI Agents** screen (`reach/agents`) real by shipping ONE autonomous agent end-to-end: a scheduled **Weekly Studio** agent that, without a human in the chat, reads the org's week of marketing data, researches a seasonal/trend angle (web search), and produces a **digest + a poster + a hero image + a short promo video** — all via OpenRouter — saved as a run the owner can see. This proves the full autonomous pipeline (schedule → trigger → read → generate → persist → display) at the lowest safe risk: **the agent is read-only on the org's data** (it never edits campaigns/leads/etc.; it only *produces* new assets), so it does not touch the approval-card safety model.

## 2. Context (surveyed 2026-10-10)

- `reach/agents` is **Jebat's own** screen (`@/screens/reach/agents`) — SEPARATE from `crm/agents` and `finance/agents` (not a shared screen, so no `/crm/*` spillover). Today it is a **static mock** of a fictional 6-agent crew; not in `LIVE_SCREENS`.
- The real AI today is on-demand only: the Jebat/Tuah chat assistants + per-product **specialists** (`src/lib/ai/specialists.ts`, `products.ts`, `orchestrator.ts`). Nothing runs autonomously. `call-log.ts` logs model calls to the console (no table). No `agents`/`agent_runs`/`agent_settings` table exists.
- **OpenRouter now provides image AND video generation** (verified 2026): ~52 image models (Nano Banana 2 / Gemini Flash Image, GPT Image, Seedream), and a **dedicated async video API** (text-to-video + image-to-video: Seedance, Veo 3.1, Wan, Sora 2 Pro, HeyGen). Web search via OpenRouter `:online`. **So all four modalities use the existing OpenRouter key — no new provider/account.**
- Per-org **OpenRouter key** (BYOK) already exists, sealed + decryptable (`src/lib/ai/key-crypto.ts`, `src/lib/ai/gate.ts`; `set_org_ai_key`/`org_ai_key_ciphertext` DB functions). The agent bills to the org's own key.
- `pg_cron` is already used (demo reseed). Supabase storage exists (avatars, chat_attachments buckets). **Service-role is NOT used anywhere in `src/` today** — the worker introduces it (see §7 security boundary).

## 3. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| First vertical | ONE agent: **Weekly Studio** (`agent_key='weekly-studio'`), outputs digest + poster + hero image + promo video | Prove the pipeline + all four modalities once |
| Safety posture | **Read-only** on org data — the agent only READS reach data and PRODUCES assets; never writes campaigns/leads/etc. | Avoids the approval-card conflict; autonomy is safe |
| Providers | **OpenRouter only** — text digest, `:online` web search, image models, async video API — on the **org's own OpenRouter key** | No new provider; org pays for its agent |
| Runner | **Next.js worker route on Railway**, triggered by a scheduler; reuses reach provider + AI SDK + OpenRouter | No Deno reimplementation; handles async/long work |
| Video (async) | kick-off in the run → store asset `pending` with the provider job id → a separate **poll tick** finalizes it | OpenRouter video is async (minutes); one invocation can't block |
| Cost/safety | Per-run cost cap + per-org weekly run cap + global kill-switch env + enabled-per-agent; cost recorded per run; a run needs the org's OpenRouter key or it is skipped | Autonomous + video = real money on a timer |
| Config surface | Agent config (enable/disable, cadence, cap) + "Run now" are **UI server actions only** (edit-data gated). No AI tools configure agents in 5a | Keep the AI↔UI-parity pattern for reach *data*, not meta-config |
| Elevated access | The worker uses the **service-role** client, scoped EXPLICITLY per org on every query; it is the ONLY non-session actor | No session exists for an autonomous job |

## 4. Global constraints (carry into every task)

- No Kuasa brand names in `src/`; **no purple/violet/indigo/fuchsia** in the UI; fictional data only (Rimba Ventures).
- Supabase project `ugchntdgaeefmufumchx` via the `openkuasa-supabase` MCP ONLY. Controller applies migrations; implementers own the committed file + TS + tests.
- TypeScript strict; 2-space indent, single quotes, semicolons; named exports; functional components + hooks; pnpm.
- `'use client'` never imports `@/lib/ai/*` (server bundle). A new live screen → add to `src/config/live-screens.ts` + regenerate routes (`gen:routes`).
- **Never log, print, or commit any API key** (OpenRouter, service-role). `.env*` is read/write-denied — verify env var presence by name only.
- **CI must not spend real money**: every test mocks OpenRouter image/video/search; no test performs a real generation.

## 5. Data model

Migration adds (public schema, two-layer RLS like the reach tables; all FK `org_id → orgs(id) on delete cascade`):

```sql
-- One config row per (org, agent). Owner-editable.
create table public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  enabled boolean not null default false,
  cadence text not null default 'weekly' check (cadence in ('off','daily','weekly')),
  max_cost_cents integer not null default 200 check (max_cost_cents between 0 and 10000),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, agent_key)
);

-- One row per autonomous (or manual) run. Written by the worker only.
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  agent_key text not null,
  status text not null default 'running' check (status in ('running','done','failed')),
  trigger text not null default 'schedule' check (trigger in ('schedule','manual')),
  digest_md text,
  cost_cents integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One row per generated asset on a run. Video rows start 'pending'.
create table public.agent_run_assets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  kind text not null check (kind in ('poster','image','video')),
  status text not null default 'pending' check (status in ('pending','done','failed')),
  provider_job_id text,
  storage_path text,
  created_at timestamptz not null default now()
);

-- Storage bucket for generated assets (private; served via signed URLs).
-- created via the storage API in the migration or a setup step.
```

**RLS (two-layer, mirroring reach tables):** `*_select` = `is_org_member(org_id)`; `mfa_required` restrictive on each. `agent_configs` write policy + grants = `is_org_writer` (the UI config actions); **`agent_runs` and `agent_run_assets` get NO authenticated insert/update/delete grant** — only the worker's service-role writes them (members read only). Storage bucket `agent-assets`: private; RLS so a member can read their org's objects (path prefixed by `org_id/`); worker (service role) writes.

## 6. The worker & scheduler

- **Trigger (NO new shared secret):** two acceptable shapes, plan picks after checking what's enabled on the stack — (A) an **in-deployment runner**: a **Railway cron** runs the worker inside the app container (no public endpoint exists, so nothing to protect); or (B) an **HTTP worker route authenticated by the EXISTING `SUPABASE_SERVICE_ROLE_KEY`** (the caller — `pg_cron`+`pg_net` or Railway cron — presents that key in a header; the route rejects anything else). Either way there is **no dedicated `AGENT_RUNNER_SECRET`** to invent. A bare public route with no check is forbidden (it would let a stranger trigger paid runs).
- **`runAgents()` (the scheduled entry, however triggered):** iterates `agent_configs` where `enabled` and the cadence has elapsed since `last_run_at` (and the global kill-switch `AGENTS_ENABLED` is on). For EACH due config, in its own try/catch, it runs the agent **scoped to that `org_id`** and updates `last_run_at`. Uses the **service-role** Supabase client; every query includes `.eq('org_id', cfg.org_id)` (defence in depth even though service role bypasses RLS).
- **`runWeeklyStudio(orgId)`** (the agent): (1) load the org's OpenRouter key (decrypt; if none → record a `failed` run "no AI key" and stop); (2) gather the week's reach data (reuse `getReachData` + `deriveReportsModel` over the service-role client scoped to the org); (3) **web search** a seasonal/trend angle via an OpenRouter `:online` call; (4) generate the **digest** (text) via OpenRouter; (5) generate **poster + hero image** via an OpenRouter image model → upload to `agent-assets/<org>/<run>/...` → asset rows `done`; (6) **kick off the video** (OpenRouter async video API) → asset row `pending` with `provider_job_id`; (7) write the `agent_runs` row with `digest_md`, `cost_cents` (summed from OpenRouter usage), status `done` (video still pending is fine). Enforce the per-run `max_cost_cents` cap (stop generating once exceeded; record what was produced).
- **`pollVideos()` (the poll entry, triggered the same way as the runner):** for each `agent_run_assets` where `kind='video' and status='pending'`, check the OpenRouter video job; on completion download the video → `agent-assets` → mark `done`; on failure/timeout mark `failed`. Ticked on a schedule (e.g. every few minutes), by the same trigger mechanism as the runner.
- **"Run now":** a UI server action (`edit-data` gated) that calls `/api/agents/run` for ONLY the caller's org+agent with `trigger='manual'`, respecting caps. For manual it may run synchronously and return the run id.

## 7. Security boundary (the one elevated actor)

The worker is the FIRST and ONLY code using the **service-role** key (`SUPABASE_SERVICE_ROLE_KEY`, already present in the deployment env; the operator sets it once — it is NOT per-tenant). It therefore must: (a) have **no unauthenticated public trigger** — the scheduled entry is either an in-deployment runner (no public endpoint) or an HTTP route that requires the existing service-role key in a header; a stranger must not be able to invoke it; (b) scope EVERY read/write to the specific `org_id` it is processing; (c) never accept an `org_id` from an untrusted caller (the runner derives orgs from `agent_configs`; "Run now" derives the org from the authenticated viewer, never from input). The service-role key and the OpenRouter key are never logged, returned, or embedded in an asset. Autonomous runs never modify campaigns/leads/appointments/etc. **Operator env (one-time, global, not per-user):** `SUPABASE_SERVICE_ROLE_KEY` (already set) + `AGENTS_ENABLED` (global kill-switch). **Per-tenant (self-service, in-app):** each org toggles its own agent (`agent_configs`) and runs on its own OpenRouter key, paying its own generation cost.

## 8. Config capability + actions (UI surface)

- Capability-style module (server): `setAgentEnabled(ctx, {agent_key, enabled})`, `setAgentCadence(ctx, {agent_key, cadence})`, `setAgentCap(ctx, {agent_key, max_cost_cents})` — upsert into `agent_configs` scoped to `ctx.orgId` (Zod-validated; `is_org_writer` via the session client, so RLS enforces). Server actions wrap them (`edit-data` gated, revalidate `/reach/agents`). `runAgentNowAction` triggers a manual run.
- No AI chat tools for agent config in 5a.

## 9. Live Agents screen (`src/screens/reach/agents.tsx`)

Rework the static screen to a live server component: load `agent_configs` + recent `agent_runs` (+ their assets) for the org via the session client. Render the **Weekly Studio** agent card: enabled toggle, cadence select, cost cap, "Run now" (all `edit-data` gated; viewers read-only), and a **run history**: each run shows the digest (rendered markdown, plain styling), the poster + hero image (from signed URLs), the video (a `<video>` with the signed URL, or "rendering…" while `pending`), cost, status, timestamp. Honest empty state before the first run. Add `'reach/agents'` to `LIVE_SCREENS`; regenerate routes. The other 5 fictional crew cards are removed (or shown as a single muted "more agents coming" note) — no fake-live data. No purple/violet. Client components read types only, never `@/lib/ai/*`.

## 10. Security & review focus

- **Service-role containment:** the run/poll routes reject a missing/wrong secret; "run now" never takes an org from input; every worker query is org-scoped. A member can read only their org's configs/runs/assets (RLS); no authenticated write to runs/assets.
- **Cost control:** a run respects `max_cost_cents` (stops generating past it) and the per-org weekly cap; the global kill-switch disables all runs; a missing org OpenRouter key yields a clean `failed` run, not a crash. The poll route is idempotent (re-ticking a done asset is a no-op).
- **Review focus (inputs the spec implies but a happy path won't hit):** an org with the agent enabled but no OpenRouter key (clean skip/failed run); a video job that never completes (poll marks `failed` after a timeout, no infinite pending); an asset storage-path for org A never readable by org B (RLS on the bucket); a digest/web-search returning nothing (honest run, no crash); the run route called twice before `last_run_at` updates (no double-run — claim the config first); a manual "run now" by a viewer (denied).

## 11. Files

**New:** migration `<ts>_agent_runs.sql`; `src/lib/agents/weekly-studio.ts` (the agent) + `src/lib/agents/runner.ts` (iterate/claim/poll) + `src/lib/agents/openrouter-media.ts` (image/video/search calls on the org key) + `src/lib/agents/config.ts` (capability) + `src/lib/agents/types.ts`; `src/app/api/agents/run/route.ts` + `src/app/api/agents/poll/route.ts`; `src/lib/supabase/service.ts` (service-role client, server-only); `src/components/reach/agents-panel.tsx` (client); tests (RLS, config capability, runner-with-mocked-OpenRouter, cost-cap, poll-idempotency, cost/secret guards).

**Modified:** `src/screens/reach/agents.tsx` (live); `src/config/live-screens.ts` (+`reach/agents`); `src/app/(app)/reach/actions.ts` (agent config + run-now actions); generated route via `gen:routes`.

## 12. Out of scope (later sub-slices / never)

- 5b guarded autonomous *writes* (auto-pause etc.); 5c proposal/approval queue; 5d multi-agent crew + richer dashboard.
- Kasturi/Finance agents screens; AI chat tools that configure or trigger agents.
- Editing/branding the generated assets; promoting an asset into Creative Bank (future).
- User-defined cron expressions (only off/daily/weekly in 5a).

## 13. Plan order (for writing-plans)

Spine first, clean cut after each vertical layer so a partial slice still ships value:
migration + types + RLS test → service-role client + trigger scaffolding (the runner/poll entry, authed by the existing service-role key or run in-container; a health check only, no generation) → agent_configs capability + actions + config RLS test → **live Agents screen (config + empty history)** [cut: screen configurable, no runs yet] → `openrouter-media` (search + digest text, mocked in tests) + `runWeeklyStudio` text-only + run persistence → "Run now" wired (manual text run end-to-end) [cut: digest agent works] → image/poster generation + storage bucket + asset display → video kick-off + `/api/agents/poll` + asset finalize → scheduler trigger (pg_cron/pg_net or Railway cron) + cadence/last_run claim + cost caps + kill-switch → final sweep (tsc/eslint/suite, get_advisors, gen:routes --check; browser smoke of Run-now on the smoke account).
