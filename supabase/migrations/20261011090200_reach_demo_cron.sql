-- Keep the demo fresh automatically. Separate migration so a pg_cron enablement
-- failure never blocks the data foundation (tables/seed already landed).
create extension if not exists pg_cron;
select cron.schedule('reseed-demo-reach', '0 * * * *', $$select private.reseed_demo_reach()$$);
