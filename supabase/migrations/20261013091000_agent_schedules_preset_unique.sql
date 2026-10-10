-- At most one cadence-preset schedule per (org, agent); makes the off/daily/weekly
-- dropdown sync idempotent and prevents a concurrent double-insert from breaking
-- the single-row read.
create unique index agent_schedules_preset_uniq
  on public.agent_schedules (org_id, agent_key)
  where nl_text = 'cadence preset';
