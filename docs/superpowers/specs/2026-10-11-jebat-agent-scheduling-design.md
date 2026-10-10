# Jebat Agent Scheduling — Design Spec

**Date:** 2026-10-11
**Status:** Draft for review
**Slice:** feat-092-agent-scheduling (follows slice 5a autonomous "Weekly Studio" agent, PR #108, + follow-ups PR #111)

## Goal

Let a workspace define **when and how often** an agent runs itself — richer than today's off/daily/weekly `cadence` — by **asking in chat** ("every Monday 9am", "a photo every hour for 8 hours") and managing the result on the Agents screen, with **hard spend caps** so an open-ended or sub-hourly schedule can never run away.

## Context (what exists today)

- Slice 5a added the autonomous Weekly Studio agent: `agent_configs` (per org+agent_key: `enabled`, `cadence` off/daily/weekly, `max_cost_cents` per-run cap, `last_run_at`), `agent_runs`/`agent_run_assets` (service-role-only writes), a service-role worker `runWeeklyStudio(service, orgId, trigger)`, the mocked media seam `openrouter-media.ts`, the live `reach/agents` screen, "Run now", and `runAgents`/`pollVideos` driven by service-key-authed routes `/api/agents/{run,poll}`.
- Follow-ups (PR #111) added `reapStaleRuns` (fails runs stuck `running` > `RUN_MAX_AGE_MS` = 15 min), a Run-now in-flight throttle, and full-digest + per-run-cost display.
- Scheduling today is a single `cadence` enum per agent, run by `runAgents` (claim loop keyed off `last_run_at` + a cadence window), ticked by an operator cron.

## Decisions (agreed in brainstorming)

1. **Expression = both.** Chat (Jebat/Tuah) is the front door — an approval-gated tool turns a natural-language ask into a stored schedule; the Agents screen shows/edits/pauses/cancels them.
2. **Granularity = fully flexible,** including sub-hourly and open-ended, with a **5-minute floor** (`interval_seconds ≥ 300`) that equals the heartbeat tick.
3. **Spend caps = Option A (defense in depth):** a per-schedule limit (max total spend and/or max runs → auto-complete) **and** a workspace rolling ceiling (daily + weekly cents → auto-pause the workspace's schedules), on top of the existing per-run `max_cost_cents` cap.
4. **Borrow from Hermes** (Nous Research's agent, the closest prior art): a human-readable schedule phrasing stored alongside the normalized schedule, and **monitor-skip** — skip a run (no spend) when nothing changed since the last run. (OpenClaw is the cautionary counter-example: flexible autonomy, weak guardrails — multiple published security analyses.)

## Architecture (Approach 1)

A dedicated **`agent_schedules`** table (many schedules per org, keyed by `agent_key` so future agents reuse it — not an abstract job framework). The runner becomes **schedule-driven** ("find due schedules") instead of cadence-driven. Existing `agent_runs`/`agent_run_assets` and `runWeeklyStudio` are reused unchanged. **One scheduling mechanism:** the old off/daily/weekly dropdown becomes a convenience that creates/deactivates a schedule row; the runner reads only `agent_schedules`.

### Data model

**New table `public.agent_schedules`** — two-layer RLS, mirroring `agent_configs`:

```
id            uuid pk default gen_random_uuid()
org_id        uuid not null references orgs(id) on delete cascade
agent_key     text not null                    -- 'weekly-studio' for now
created_by    uuid references auth.users(id) on delete set null
nl_text       text                             -- original phrasing, for display
interval_seconds integer not null check (interval_seconds >= 300)
next_run_at   timestamptz not null
last_run_at   timestamptz
end_at        timestamptz                      -- optional stop time
max_runs      integer check (max_runs is null or max_runs between 1 and 1000)
runs_used     integer not null default 0       -- WORKER-WRITTEN
max_total_cents integer check (max_total_cents is null or max_total_cents between 0 and 100000)
spent_cents   integer not null default 0       -- WORKER-WRITTEN
status        text not null default 'active' check (status in ('active','paused','completed'))
paused_reason text
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
```

- **RLS:** `agent_schedules_select` (`private.is_org_member(org_id)`), `agent_schedules_write` (`private.is_org_writer(org_id)`), restrictive `mfa_required` = `(select private.mfa_ok())`.
- **Grants:** `authenticated` gets SELECT + INSERT + DELETE + UPDATE on **only** `(nl_text, interval_seconds, next_run_at, end_at, max_runs, max_total_cents, status, updated_at)`. **`runs_used`, `spent_cents`, `last_run_at`, `paused_reason`, `id`, `org_id`, `agent_key`, `created_by`, `created_at` are NOT in the UPDATE grant** — worker/service-role only. This is the integrity rule: a tenant can edit their schedule and raise their own ceiling (their own BYOK money) but **cannot zero their spend counters** to dodge a per-schedule budget.
- Index: `agent_schedules(status, next_run_at)` for the due query; `agent_schedules(org_id)`.

**Workspace rolling ceiling — no new table.** Add to `agent_configs`: `daily_cap_cents integer not null default 500`, `weekly_cap_cents integer not null default 2000` (RM 5/day, RM 20/week defaults — safe out of the box; tenant-editable). Current spend = `SELECT coalesce(sum(cost_cents),0) FROM agent_runs WHERE org_id=? AND started_at >= now() - <window>`. `agent_runs.cost_cents` is already service-role-only, so the three cap layers (per-run → per-schedule → workspace) derive from one tamper-proof source.

### Schedule creation (chat + parity)

**The LLM is the parser — no NL-parsing dependency.** A new approval-gated AI-SDK write tool `scheduleWeeklyStudio` with a **structured Zod input** the model fills from the user's words:

```ts
{ interval_seconds: number, starts_at?: string, max_runs?: number,
  end_at?: string, max_total_cents?: number, nl_text: string }
```

"every hour for 8 hours" → `{ interval_seconds: 3600, max_runs: 8, nl_text: "every hour for 8 hours" }`. The tool is in `REACH_WRITE_TOOL_NAMES` → `toolApproval: 'user-approval'` in both Jebat and Tuah. The approval card renders the **resolved** schedule in plain terms ("Every 1 hour · 8 runs · per-schedule cap RM 2") so the user confirms the interpretation before anything is created.

**One shared capability (parity).** `createSchedule` / `updateSchedule` / `pauseSchedule` / `resumeSchedule` / `cancelSchedule` in `src/lib/reach/schedule-capabilities.ts` (one Zod schema each), consumed by **both** the chat tool **and** the Agents-screen server actions — the identity-tested parity pattern of the rest of Jebat. Server-side the capability enforces the floors regardless of caller: `interval_seconds ≥ 300`, `max_runs` 1..1000, `end_at` in the future, `max_total_cents` 0..100000, `org_id` from session. `next_run_at` = `starts_at ?? now + interval_seconds`.

### Runner & budget gate

`runSchedules(client)` in `src/lib/agents/runner.ts` replaces the cadence loop; the operator `/api/agents/run` cron goes from hourly to **every ~5 min** (no new secret, same service-key auth). `AGENTS_ENABLED` stays the master kill-switch. The loop selects `status='active' AND next_run_at <= now`, then per schedule (each in its own try/catch — one failure never stops the rest):

1. **Budget gate (before any spend):**
   - *Per-schedule:* `runs_used ≥ max_runs` or `spent_cents ≥ max_total_cents` → mark **`completed`**, skip (finished its budget — not an error).
   - *Workspace ceiling:* compute 24h and 7d `sum(agent_runs.cost_cents)` for the org; if either ≥ its cap → set all the org's `active` schedules to `paused` with `paused_reason` ("weekly budget reached"), skip. Hard stop — a human resumes (optionally after raising their cap).
2. **Claim:** conditional `update ... set next_run_at = <advanced> where id=? and status='active' and next_run_at <= now returning *` so overlapping ticks run each schedule at most once.
3. **Monitor-skip:** a cheap "any lead/appointment/campaign changed since `last_run_at`?" query. If nothing changed → write a **cost-0 `agent_runs` row with status `skipped`** (the migration extends the `agent_runs.status` CHECK to add `skipped`), so the history honestly shows "Skipped — nothing changed", then advance `next_run_at`/`last_run_at` and **spend nothing**. (The reaper only touches `running`, so a `skipped` row is inert.)
4. **Run:** `runWeeklyStudio(client, org_id, 'schedule')` (per-run `max_cost_cents` still applies inside). Then, service-role-only: `spent_cents += run cost` (from the `agent_runs` row), `runs_used += 1`, `last_run_at = now`, advance `next_run_at`; if past `end_at` / `max_runs` / `max_total_cents` → `completed`.

### UI (Agents screen) — UX rules applied

Web-adapted from the ui-ux-pro-max rules, on the existing shadcn/Tailwind language, no purple/violet, lucide icons (no emoji). The Weekly Studio card keeps **one primary CTA** (enable / Run now); schedule controls are visually subordinate (ghost/secondary). Added:

- **Schedules list** — compact rows: `nl_text`, next run, status, `runs_used/max_runs`, `spent/budget`. **Status and budget state shown by icon + text label, never color alone** (`color-not-only`). Row actions pause / resume / edit / **cancel**.
- **Edit** via **progressive disclosure** (inline reveal, not a crowded card): every field has a **visible label** (not placeholder-only), **helper text** ("Minimum 5 minutes"), and **on-blur inline validation**; the 5-min floor + ranges enforced client- and server-side.
- **Cancel = destructive:** a confirmation dialog, danger (not purple) emphasis, visually separated from edit, and an **Undo** toast after.
- **Budget strip:** a simple progress bar of spend vs cap **with the numeric values in tabular figures** (never a chart, never color-only); the daily/weekly cap inputs sit beside it. When tripped: a `role="alert"` **"Paused — weekly budget reached"** with a clear recovery path (Resume, or raise the cap).
- **Feedback:** every mutation shows **loading → success** (toast "Schedule saved") with errors inline near the field via `aria-live`/`role="alert"`.
- **Empty state:** "No schedules yet — ask Jebat ‘run every Monday 9am’, or add one here." with an action, never blank.
- Standard a11y: visible focus rings, 4.5:1 contrast on existing tokens, keyboard-operable disclosure, completed schedules shown read-only (distinct from disabled).

Schedules load server-side (session client, RLS) and pass to the panel as plain data; mutations go through shared server actions. No server/storage import in the client component.

### Security

Two-layer RLS on `agent_schedules`; `org_id` from session; **`spent_cents`/`runs_used`/`last_run_at`/`paused_reason` worker-only** (the integrity rule). The scheduler runs under the service role with `org_id` from the claimed schedule row (never from request input). The chat tool is approval-gated. The run/poll routes stay service-key-authed (constant-time). Caps protect against **accidental** runaways; a tenant deliberately spending their own BYOK credit (by raising their own cap) is in scope and acceptable — no cross-tenant blast radius.

### Testing (CI never spends — media seam mocked everywhere)

- Capability: create/update/pause/resume/cancel validation, the 5-min floor and ranges, `org_id` from ctx, update-grant integrity (a session client cannot change `spent_cents`/`runs_used`).
- Chat-tool parity: schema identity with the capability; tool is in the approval set.
- `runSchedules` (fake client + mocked `runWeeklyStudio`): due-selection; per-schedule cap → `completed`; workspace ceiling → pause-all with reason; **monitor-skip → a cost-0 `skipped` run, no media call, no spend**; claim idempotency (double tick runs once); `end_at`/`max_runs`/`max_total_cents` completion; one failure doesn't stop the loop.
- Monitor-skip query: returns false when data changed, true when quiet.
- RLS test (live): owner insert+update(granted cols); cross-org 0 rows; viewer denied 42501; **authenticated UPDATE of `spent_cents` rejected**.

### Rollout / migration / operator

- One migration: `agent_schedules` (+ RLS/grants/indexes), the two cap columns on `agent_configs` (safe defaults), and **extend `agent_runs.status` CHECK to include `skipped`** (for monitor-skip). A **data migration** converts each existing enabled `cadence != 'off'` config into an `agent_schedules` row (`interval_seconds` = 86400/604800, open-ended). The `agent_configs.cadence` column stays (the dropdown writes through to its schedule row) but is no longer what the runner reads — `runSchedules` reads only `agent_schedules`.
- Operator change: `/api/agents/run` cron hourly → **every ~5 min** (document in the operator checklist). No new secret.
- Ships safe: default caps + `AGENTS_ENABLED` master switch mean nothing runs away even with an aggressive schedule; manual "Run now" is unaffected.
- Independence: no purple/violet/indigo/fuchsia; no Kuasa names; fictional data only.

## Out of scope / deferred

- Cron-expression schedules (weekday-set like "Mon/Wed/Fri at 9am"). The interval model covers "every N units [starting at T] [for K runs / until T2]"; richer calendar rules are a later extension (reserve a nullable `cron_expr` column if cheap, but do not implement).
- Multiple agent types (only `weekly-studio` exists); the table is keyed by `agent_key` to be ready, but no second job type is built.
- Continuity (carrying prior run output into the next) beyond what `runWeeklyStudio` already does — noted as a Hermes idea, not required this slice.
- Slices 5b (guarded autonomous writes), 5c (approval queue), 5d (crew) are unaffected and unstarted.

## Review Focus (inputs the tests must pin)

- **A schedule whose `interval_seconds` is below the floor** or whose `max_runs`/`end_at` are absurd → rejected by the capability, not just the tool schema.
- **Two heartbeat ticks within the same 5-min window** → the claim ensures each schedule runs once (no double-spend).
- **A workspace at its weekly ceiling** → every active schedule pauses with a reason and no further run executes until resumed.
- **A quiet workspace on a frequent schedule** → monitor-skip advances `next_run_at` and spends nothing.
- **A tenant attempting to reset `spent_cents`/`runs_used`** via the data API → denied (not in the UPDATE grant).
- **A schedule reaching `max_runs`/`end_at`/`max_total_cents` mid-loop** → transitions to `completed` exactly once; a completed schedule is inert and shown read-only.
