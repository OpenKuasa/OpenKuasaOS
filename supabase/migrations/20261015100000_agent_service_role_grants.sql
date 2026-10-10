-- Grant the service-role client the DML the agent subsystem's background workers need.
--
-- Institutional fact the original agent migrations missed: in THIS project the
-- default `GRANT ... TO service_role` on `public` tables has been stripped, so
-- `service_role` holds no INSERT/SELECT/UPDATE/DELETE on any table (verified with
-- has_table_privilege). service_role bypasses RLS, but NOT table grants -- so every
-- table the service client touches needs an explicit grant here.
--
-- 20261012160000_agent_runs.sql left only the comment "service role only" on
-- agent_runs / agent_run_assets but never wrote the matching grant, so the Weekly
-- Studio runner, "Run now", and the video/reaper pollers had no write access: the
-- first thing runWeeklyStudio does -- the `agent_runs` INSERT -- was rejected with
-- permission denied, no run row was ever created, and the error surfaced only as the
-- generic "The run could not be started." Zero agent_runs rows had ever been written.
--
-- Least-privilege, matching exactly what the service client does (no DELETE anywhere;
-- agent_configs is read-only to the runner; schedules are user-created so no INSERT):
--   agent_runs        INSERT/SELECT/UPDATE  (insert running + skipped rows; read cost;
--                                            finish() update; reapStaleRuns update)
--   agent_run_assets  INSERT/SELECT/UPDATE  (recordAsset insert; pollVideos read+mark)
--   agent_schedules   SELECT/UPDATE         (read due; claim + spend-counter updates)
--   agent_configs     SELECT                (read enabled + caps)
--   org_ai_keys       SELECT                (read the encrypted BYOK ciphertext)
--   campaigns/leads/appointments SELECT     (build the business snapshot; monitor-skip)
-- SELECT is also required on the written tables for the insert/update .select()
-- RETURNING clauses the runner relies on.

grant insert, select, update on public.agent_runs to service_role;
grant insert, select, update on public.agent_run_assets to service_role;
grant select, update on public.agent_schedules to service_role;
grant select on public.agent_configs to service_role;
grant select on public.org_ai_keys to service_role;
grant select on public.campaigns, public.leads, public.appointments to service_role;
