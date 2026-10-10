-- supabase/migrations/20261013090100_hire_demo_seed.sql
-- Demo-org hiring seed. Idempotent, re-runnable and anchored to now(), so the
-- demo stays fresh (hourly cron in the next migration). Demo-only.
-- The arithmetic mirrors seedRow() in src/lib/hire/seed.ts.
create or replace function private.reseed_demo_hire()
returns void language plpgsql security definer set search_path = public as $$
declare
  demo uuid;
  firsts text[] := array['Aisyah','Faiz','Mei Ling','Rajesh','Nurul','Hafiz','Siti','Wei Jie','Nabila','Arjun',
                         'Farah','Daniel','Amira','Kavitha','Zulkifli','Li Fen','Imran','Priya','Azlan'];
  lasts text[] := array['Rahim','Hakim','Tan','Kumar','Huda','Omar','Aminah','Lim','Idris','Nair',
                        'Zaki','Wong','Yusof','Pillai','Ismail','Chong','Bakar','Menon'];
  locations text[] := array['Kuala Lumpur','Petaling Jaya','Shah Alam','Cyberjaya','Subang Jaya'];
  pool_headlines text[] := array['Software Engineer','Sales Executive','Account Manager',
                                 'Graphic Designer','Customer Support','Operations Executive'];
  pool_sources text[] := array['LinkedIn','JobStreet','Referral','Careers page'];
  pool_statuses text[] := array['available','passive','re_engaged'];
  interviewers text[] := array['Ahmad Zaki','Faiz Hakim','Nurul Huda','Siti Aminah'];
  kinds text[] := array['video','onsite','phone'];
  offsets int[] := array[5, 26, 30, 50, 74, 98, -24, -48, -72, -120];
begin
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  if demo is null then raise exception 'demo org missing'; end if;

  -- Applications and interviews go with their job and candidate (on delete cascade).
  delete from public.hire_jobs where org_id = demo;
  delete from public.hire_candidates where org_id = demo;

  insert into public.hire_jobs
    (org_id, title, department, location, employment_type, status, opened_at, closed_at, created_at)
  values
    (demo,'Software Engineer','Engineering','Kuala Lumpur','full_time','open',  now()-interval '62 days', null, now()-interval '62 days'),
    (demo,'Sales Executive','Sales','Petaling Jaya','full_time','open',         now()-interval '61 days', null, now()-interval '61 days'),
    (demo,'Account Manager','Sales','Shah Alam','full_time','open',             now()-interval '60 days', null, now()-interval '60 days'),
    (demo,'Graphic Designer','Marketing','Kuala Lumpur','contract','open',      now()-interval '59 days', null, now()-interval '59 days'),
    (demo,'Customer Support','Operations','Cyberjaya','part_time','open',       now()-interval '58 days', null, now()-interval '58 days'),
    (demo,'Operations Executive','Operations','Klang','full_time','open',       now()-interval '57 days', null, now()-interval '57 days'),
    (demo,'Content Writer','Marketing','Kuala Lumpur','contract','closed',      now()-interval '64 days', now()-interval '4 days', now()-interval '64 days'),
    (demo,'Accountant','Finance','Subang Jaya','full_time','paused',            now()-interval '63 days', null, now()-interval '63 days'),
    (demo,'Marketing Lead','Marketing','Kuala Lumpur','full_time','draft',      null, null, now()-interval '2 days');

  -- One row per application, with every derived field.
  drop table if exists pg_temp._hire_gen;
  create temp table _hire_gen on commit drop as
  with base as (
    select i, (i * 37) % 248 as k, (i * 91) % 248 as s, (i * 53) % 248 as w
    from generate_series(1, 248) as i
  ), staged as (
    select b.*,
      case when i <= 56 then 'Software Engineer' when i <= 98 then 'Sales Executive'
           when i <= 129 then 'Account Manager' when i <= 157 then 'Graphic Designer'
           when i <= 181 then 'Customer Support' when i <= 203 then 'Operations Executive'
           when i <= 230 then 'Content Writer' else 'Accountant' end as job_title,
      case when k < 2 then 'hired' when k < 4 then 'offer' when k < 38 then 'interview'
           when k < 96 then 'screening' else 'applied' end as stage,
      case when s < 104 then 'JobStreet' when s < 176 then 'LinkedIn'
           when s < 220 then 'Referral' else 'Careers page' end as source,
      case when w < 22 then 0 when w < 49 then 1 when w < 74 then 2 when w < 106 then 3
           when w < 136 then 4 when w < 173 then 5 when w < 207 then 6 else 7 end as week
    from base b
  )
  select st.*,
    case
      when stage = 'applied' and k % 40 = 3 then 'withdrawn'
      when stage = 'applied' and k % 5 < 2 then 'rejected'
      when stage = 'screening' and k % 4 = 0 then 'rejected'
      when stage = 'interview' and k >= 20 and k % 6 = 0 then 'rejected'
      else 'active' end as outcome,
    case
      when stage in ('hired','offer') then 5
      when stage = 'interview' then case when k % 3 = 0 then 5 else 4 end
      when stage = 'screening' then 3 + (k % 2)
      when k % 3 = 0 then null
      else 2 + (k % 3) end as rating,
    case when k < 14 then now() - make_interval(days => 28 + k * 2)
         else now() - make_interval(days => (7 - week) * 7 + ((i * 11) % 7), hours => (i * 5) % 24)
    end as applied_at
  from staged st;

  insert into public.hire_candidates
    (org_id, name, email, phone, headline, location, skills, source, pool_status, created_at)
  select
    demo,
    firsts[1 + (n - 1) % 19] || ' ' || lasts[1 + (n - 1) / 19],
    'calon' || n || '@demo.openkuasa.com',
    '+60 12-555 ' || lpad(n::text, 4, '0'),
    coalesce(g.job_title, pool_headlines[1 + n % 6]),
    locations[1 + n % 5],
    case n % 6
      when 0 then array['React','Node.js','TypeScript'] when 1 then array['B2B Sales','CRM']
      when 2 then array['Account Management','Negotiation'] when 3 then array['Figma','Branding']
      when 4 then array['Customer Service','Zendesk'] else array['Operations','Excel'] end,
    coalesce(g.source, pool_sources[1 + n % 4]),
    case when g.i is null then pool_statuses[1 + n % 3]
         when g.outcome = 'rejected' and g.k % 10 = 0 then 'available'
         else 'none' end,
    coalesce(g.applied_at, now() - make_interval(days => 90 + n % 60))
  from generate_series(1, 342) as n
  left join _hire_gen g on g.i = n;

  insert into public.hire_applications
    (org_id, candidate_id, job_id, stage, outcome, rating, source, applied_at, offered_at, hired_at, created_at)
  select
    demo, c.id, j.id, g.stage, g.outcome, g.rating, g.source, g.applied_at,
    case when g.k < 4 then g.applied_at + make_interval(days => 17 + g.k) end,
    case when g.k < 2 then g.applied_at + make_interval(days => 26 + g.k * 2) end,
    g.applied_at
  from _hire_gen g
  join public.hire_candidates c on c.org_id = demo and c.email = 'calon' || g.i || '@demo.openkuasa.com'
  join public.hire_jobs j on j.org_id = demo and j.title = g.job_title;

  -- Ten interviews, for the applications with k = 4..13: six ahead, three completed, one no-show.
  insert into public.hire_interviews
    (org_id, application_id, scheduled_at, kind, interviewer_name, status, created_at)
  select
    demo, a.id,
    now() + make_interval(hours => offsets[g.k - 3]),
    kinds[1 + (g.k - 4) % 3],
    interviewers[1 + (g.k - 4) % 4],
    case when g.k - 3 <= 6 then 'scheduled' when g.k - 3 <= 9 then 'completed' else 'no_show' end,
    now() - interval '6 days'
  from _hire_gen g
  join public.hire_candidates c on c.org_id = demo and c.email = 'calon' || g.i || '@demo.openkuasa.com'
  join public.hire_applications a on a.candidate_id = c.id
  where g.k between 4 and 13;
end $$;

revoke all on function private.reseed_demo_hire() from public, anon, authenticated;

select private.reseed_demo_hire();
