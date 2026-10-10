-- Keep the Lekiu demo fresh. Its own migration so a pg_cron problem can never
-- block the tables or the seed. Runs at :01, just after the reach reseed at :00,
-- so the demo is at most a minute behind a new day in Malaysia.
create extension if not exists pg_cron;
select cron.schedule('reseed-demo-people', '1 * * * *', $$select private.reseed_demo_people()$$);
