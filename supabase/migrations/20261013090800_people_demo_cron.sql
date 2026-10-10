-- Keep the Lekiu demo fresh. Its own migration so a pg_cron problem can never
-- block the tables or the seed. Runs at :15, away from the reach reseed at :00.
create extension if not exists pg_cron;
select cron.schedule('reseed-demo-people', '15 * * * *', $$select private.reseed_demo_people()$$);
