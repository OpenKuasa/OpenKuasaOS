-- supabase/migrations/20261014090100_hire_jobs_demo_seed.sql
-- Demo-org hiring seed, slice 2a: jobs carry the new fields; interviews fall in working hours.
-- Replaces the function from 20261013090100.
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

  -- Children first: hire_jobs has a delete guard for jobs that still have applications.
  delete from public.hire_interviews where org_id = demo;
  delete from public.hire_applications where org_id = demo;
  delete from public.hire_jobs where org_id = demo;
  delete from public.hire_candidates where org_id = demo;

  insert into public.hire_jobs
    (org_id, title, department, location, employment_type, status, opened_at, closed_at, created_at,
     work_arrangement, headcount, salary_min_cents, salary_max_cents, show_salary, closes_on, description)
  select demo, j.title, j.department, j.location, j.employment_type, j.status,
         case when j.opened_days is null then null else now() - make_interval(days => j.opened_days) end,
         case when j.closed_days is null then null else now() - make_interval(days => j.closed_days) end,
         now() - make_interval(days => coalesce(j.opened_days, 2)),
         j.work_arrangement, j.headcount, j.salary_min * 100, j.salary_max * 100, j.show_salary,
         case when j.closes_in is null then null
              else ((now() at time zone 'Asia/Kuala_Lumpur')::date + j.closes_in) end,
         case when j.status = 'draft' then null else
           'Rimba Ventures is hiring a ' || j.title || ' for our ' || j.department || E' team.\n\n' ||
           'You will own day-to-day ' || lower(j.department) || ' work, report to the head of ' || j.department ||
           E', and work closely with the rest of the company.\n\n' ||
           'We are looking for relevant experience, clear communication in Bahasa Malaysia and English, ' ||
           'and someone who finishes what they start.' end
  from (values
    ('Software Engineer','Engineering','Kuala Lumpur','full_time','open',   62, null::int, 'hybrid', 2, 5000, 8000, true,  21),
    ('Sales Executive','Sales','Petaling Jaya','full_time','open',          61, null,      'onsite', 3, 3000, 4500, true,  14),
    ('Account Manager','Sales','Shah Alam','full_time','open',              60, null,      'hybrid', 1, 4500, 6500, true,  null::int),
    ('Graphic Designer','Marketing','Kuala Lumpur','contract','open',       59, null,      'remote', 1, 3500, 5000, true,  28),
    ('Customer Support','Operations','Cyberjaya','part_time','open',        58, null,      'onsite', 2, 2200, 3000, false, null),
    ('Operations Executive','Operations','Klang','full_time','open',        57, null,      'onsite', 1, 3000, 4000, false, null),
    ('Content Writer','Marketing','Kuala Lumpur','contract','closed',       64, 4,         'remote', 1, null::int, null::int, false, null),
    ('Accountant','Finance','Subang Jaya','full_time','paused',             63, null,      'onsite', 1, 4000, 5500, false, null),
    ('Marketing Lead','Marketing','Kuala Lumpur','full_time','draft',       null, null,    'hybrid', 1, null, null, false, null)
  ) as j(title, department, location, employment_type, status, opened_days, closed_days,
         work_arrangement, headcount, salary_min, salary_max, show_salary, closes_in);

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
    demo, t.application_id,
    -- A scheduled interview that the clamp moved to before now goes to the next day.
    case when t.status = 'scheduled' and t.clamped <= now() then t.clamped + interval '1 day' else t.clamped end,
    t.kind, t.interviewer, t.status, now() - interval '6 days'
  from (
    select
      a.id as application_id,
      kinds[1 + (g.k - 4) % 3] as kind,
      interviewers[1 + (g.k - 4) % 4] as interviewer,
      case when g.k - 3 <= 6 then 'scheduled' when g.k - 3 <= 9 then 'completed' else 'no_show' end as status,
      (
        date_trunc('day', r.raw at time zone 'Asia/Kuala_Lumpur')
        + least(interval '17 hours', greatest(interval '9 hours',
            make_interval(mins => (round(
              (extract(hour from r.raw at time zone 'Asia/Kuala_Lumpur') * 60
               + extract(minute from r.raw at time zone 'Asia/Kuala_Lumpur')) / 30.0
            ) * 30)::int)))
      ) at time zone 'Asia/Kuala_Lumpur' as clamped
    from _hire_gen g
    join public.hire_candidates c on c.org_id = demo and c.email = 'calon' || g.i || '@demo.openkuasa.com'
    join public.hire_applications a on a.candidate_id = c.id
    cross join lateral (select now() + make_interval(hours => offsets[g.k - 3]) as raw) r
    where g.k between 4 and 13
  ) t;
end $$;

revoke all on function private.reseed_demo_hire() from public, anon, authenticated;

select private.reseed_demo_hire();
