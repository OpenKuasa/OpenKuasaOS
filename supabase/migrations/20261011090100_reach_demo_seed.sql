-- Demo-org reach seed. Idempotent + re-runnable + anchored to now(), so the
-- demo stays fresh (nightly cron added in the next migration). Demo-only.
create or replace function private.reseed_demo_reach()
returns void language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  if demo is null then raise exception 'demo org missing'; end if;

  delete from public.campaigns where org_id = demo;
  delete from public.leads where org_id = demo;
  delete from public.appointments where org_id = demo;

  insert into public.campaigns (org_id, name, channel, status, leads_count, spend_cents, cpl_cents, created_at)
  values
    (demo,'Ramadan–Raya Promo','facebook','active', 96, 96*1250, 1250, now()-interval '40 days'),
    (demo,'Lead Magnet — eBook','whatsapp','active', 61, 61*688,  688,  now()-interval '33 days'),
    (demo,'Retargeting — Cart','instagram','active', 54, 54*1185, 1185, now()-interval '26 days'),
    (demo,'New Product Launch','tiktok','paused',    70, 70*2640, 2640, now()-interval '19 days'),
    (demo,'Brand Awareness','facebook','paused',     18, 18*5000, 5000, now()-interval '12 days');

  -- 342 leads. Each of channel/stage/week honors its exact marginal
  -- (CHANNEL 142/96/68/36, STAGE 78/106/62/48/48, WEEKLY 30/34/36/42/46/50/50/54),
  -- decorrelated via independent hash orderings. created_at spread within each week.
  insert into public.leads (org_id, name, channel, stage, source, created_at)
  select demo,
    (array['Aisyah','Faiz','Nurul','Hafiz','Siti','Danial','Farah','Amir',
           'Liyana','Zikri','Balqis','Hakim','Intan','Rizal','Maya','Syafiq'])[1 + (i % 16)]
    || ' ' ||
    (array['Rahim','Hakim','Huda','Ismail','Osman','Tan','Lim','Kaur',
           'Abdullah','Yusof','Chong','Devi','Karim','Noor','Salleh','Wong'])[1 + ((i*7) % 16)],
    case when rc<=142 then 'whatsapp' when rc<=238 then 'facebook'
         when rc<=306 then 'instagram' else 'tiktok' end,
    case when rs<=78 then 'lead' when rs<=184 then 'contacted'
         when rs<=246 then 'qualified' when rs<=294 then 'booked' else 'won' end,
    (array['WhatsApp click ad','Facebook lead form','Instagram DM',
           'TikTok bio link','Website form','Customer referral'])[1 + (i % 6)],
    now() - make_interval(days => wa*7 + (i % 7))
  from (
    select i,
      row_number() over (order by md5(i::text||'ch')) as rc,
      row_number() over (order by md5(i::text||'st')) as rs,
      row_number() over (order by md5(i::text||'wk')) as rw
    from generate_series(1,342) as g(i)
  ) base
  cross join lateral (select case
      when rw<=30 then 7 when rw<=64 then 6 when rw<=100 then 5 when rw<=142 then 4
      when rw<=188 then 3 when rw<=238 then 2 when rw<=288 then 1 else 0 end as wa) wk;

  insert into public.appointments (org_id, contact_name, kind, scheduled_at, via, created_at)
  values
    (demo,'Aisyah Rahim','Discovery call', now()+interval '5 hours','WhatsApp', now()-interval '2 days'),
    (demo,'Faiz Hakim','Product demo',     now()+interval '26 hours','Zoom',    now()-interval '2 days'),
    (demo,'Nurul Huda','Follow-up',        now()+interval '72 hours','Call',    now()-interval '2 days');
end $$;

revoke execute on function private.reseed_demo_reach() from public, anon, authenticated;

-- Seed once now.
select private.reseed_demo_reach();
