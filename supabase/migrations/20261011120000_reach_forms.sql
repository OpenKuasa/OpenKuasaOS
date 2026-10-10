-- Slice 3 (forms): lead forms become a real, writable entity. Two-layer access
-- as in slice 2 (grant ceiling + is_org_member / is_org_writer RLS + restrictive
-- mfa_required). A lead form here is the record describing a form; the public
-- page and form_submissions arrive later, so both counters stay at 0 until then.

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  category text,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  channel text check (channel in ('whatsapp','facebook','instagram','tiktok')),
  status text not null default 'draft' check (status in ('draft','active','paused')),
  views_count int not null default 0,
  submissions_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forms_org_slug_key unique (org_id, slug)
);
alter table public.forms enable row level security;
create index forms_org_created_idx on public.forms (org_id, created_at desc);
create policy forms_select on public.forms for select to authenticated
  using (private.is_org_member(org_id));
create policy forms_write on public.forms for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy mfa_required on public.forms as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.forms from anon, authenticated;
grant select on public.forms to authenticated;
-- Column-level INSERT as well as UPDATE: id, created_at and the two counters are
-- in neither list, so the API can never set them (they take their defaults).
-- org_id is insertable (RLS checks it) but never updatable.
grant insert (org_id, name, category, slug, channel, status) on public.forms to authenticated;
grant update (name, category, slug, channel, status, updated_at) on public.forms to authenticated;
grant delete on public.forms to authenticated;

-- Demo reseed: the body below is 20261011093100_reach_ads_demo_seed.sql verbatim,
-- plus the forms delete and the six-form insert at the end.
create or replace function private.reseed_demo_reach()
returns void language plpgsql security definer set search_path = public as $$
declare demo uuid;
begin
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  if demo is null then raise exception 'demo org missing'; end if;

  delete from public.creatives where org_id = demo;
  delete from public.campaigns where org_id = demo;
  delete from public.leads where org_id = demo;
  delete from public.appointments where org_id = demo;
  delete from public.forms where org_id = demo;

  insert into public.campaigns (org_id, name, channel, status, leads_count, spend_cents, created_at)
  values
    (demo,'Ramadan–Raya Promo','facebook','active', 96, 96*1250, now()-interval '40 days'),
    (demo,'Lead Magnet — eBook','whatsapp','active', 61, 61*688,  now()-interval '33 days'),
    (demo,'Retargeting — Cart','instagram','active', 54, 54*1185, now()-interval '26 days'),
    (demo,'New Product Launch','tiktok','paused',    70, 70*2640, now()-interval '19 days'),
    (demo,'Brand Awareness','facebook','paused',     18, 18*5000, now()-interval '12 days');

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

  -- Creatives linked by name to the freshly-inserted campaigns (null campaign_name = unlinked).
  insert into public.creatives (org_id, campaign_id, name, type, channel, status, body, ctr, created_at)
  select demo, c.id, v.name, v.type, v.channel, v.status, v.body, v.ctr, now() - make_interval(days => v.age)
  from (values
    ('Ramadan–Raya Promo','Raya hero image','image','facebook','active','https://assets.openkuasa.com/raya-hero.jpg',3.2,39),
    ('Ramadan–Raya Promo','Raya carousel copy','copy','facebook','active','Raya datang! Jimat sampai 30%.',2.8,38),
    ('Lead Magnet — eBook','eBook promo video','video','whatsapp','active','https://assets.openkuasa.com/ebook.mp4',4.1,32),
    ('Retargeting — Cart','Cart reminder copy','copy','instagram','active','Troli anda menunggu — habiskan pembelian hari ni.',1.9,25),
    ('New Product Launch','Launch teaser','video','tiktok','draft',null,null,18),
    (null,'Evergreen brand image','image','facebook','active','https://assets.openkuasa.com/brand.jpg',1.2,11),
    (null,'Testimoni pelanggan','copy','whatsapp','archived','Servis terbaik, respons pantas!',null,7),
    ('Brand Awareness','Awareness banner','image','facebook','active','https://assets.openkuasa.com/awareness.jpg',0.8,5)
  ) as v(campaign_name, name, type, channel, status, body, ctr, age)
  left join public.campaigns c on c.org_id = demo and c.name = v.campaign_name;

  insert into public.ad_settings (org_id, daily_cap_cents, monthly_cap_cents, currency, automation, notifications, updated_at)
  values (demo, 15000, 300000, 'MYR',
          '{"auto_pause_low_ctr": true, "auto_boost_winners": false, "daily_budget_guard": true}'::jsonb,
          '{"spend_alerts": true, "weekly_summary": true}'::jsonb, now())
  on conflict (org_id) do update set
    daily_cap_cents = excluded.daily_cap_cents, monthly_cap_cents = excluded.monthly_cap_cents,
    currency = excluded.currency, automation = excluded.automation,
    notifications = excluded.notifications, updated_at = excluded.updated_at;

  -- The six lead forms the sample screen shows (views 2,378, contacts 428).
  -- Fixed dates, matching the sample; no channel (a form is not tied to one).
  insert into public.forms (org_id, name, category, slug, status, views_count, submissions_count, created_at, updated_at)
  select demo, v.name, v.category, v.slug, v.status, v.views, v.contacts, v.created::timestamptz, v.created::timestamptz
  from (values
    ('Raya Promo Signup','Promotions','raya-promo','active',612,128,'2026-03-12T04:00:00Z'),
    ('Free Consultation','Sales','free-consult','active',540,96,'2026-02-28T04:00:00Z'),
    ('Newsletter','Marketing','newsletter','active',488,84,'2026-01-05T04:00:00Z'),
    ('Product Demo Request','Sales','demo-request','active',354,62,'2026-01-19T04:00:00Z'),
    ('eBook Download','Content','ebook-sme-growth','draft',246,38,'2026-03-02T04:00:00Z'),
    ('Event RSVP','Events','usahawan-meetup','draft',138,20,'2026-03-08T04:00:00Z')
  ) as v(name, category, slug, status, views, contacts, created);
end $$;

revoke execute on function private.reseed_demo_reach() from public, anon, authenticated;

-- Seed once now.
select private.reseed_demo_reach();
