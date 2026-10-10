-- supabase/migrations/20261013090200_hire_demo_cron.sql
-- Keep the hiring demo fresh. Separate migration so a pg_cron problem never
-- blocks the tables or the seed (both already landed).
create extension if not exists pg_cron;
select cron.schedule('reseed-demo-hire', '0 * * * *', $$select private.reseed_demo_hire()$$);
