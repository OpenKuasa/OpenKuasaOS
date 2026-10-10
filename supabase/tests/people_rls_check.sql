-- Lekiu member-tier access check. Leaves nothing behind: the block always ends
-- with RAISE, so every insert below is rolled back. Read the message:
--   PEOPLE_RLS_CHECK PASSED ...   or   PEOPLE_RLS_CHECK FAILED: <what went wrong>
do $$
declare
  org uuid := gen_random_uuid();
  other_org uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  m1 uuid := gen_random_uuid();
  m2 uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  e1 uuid;
  e2 uuid;
  run_id uuid := gen_random_uuid();
  demo uuid;
  linked uuid;
  n int;
  t text;
  fails text[] := '{}';
  personal text[] := array['employee_private','leave_requests','claims','payslips','reviews','documents'];
  hr_only text[] := array['payroll_runs','payment_vouchers','people_settings'];
begin
  -- ---- people and a workspace ----------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    u.id || '@rls-check.openkuasa-test.dev', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false
  from unnest(array[admin_id, m1, m2, outsider]) as u(id);

  insert into public.orgs (id, name) values (org, 'RLS Check Sdn Bhd'), (other_org, 'RLS Other Sdn Bhd');
  insert into public.org_members (org_id, user_id, role)
  values (org, admin_id, 'admin'), (other_org, outsider, 'owner');

  -- Link on joining: the employee exists first, then the member joins.
  insert into public.employees (org_id, employee_no, name, work_email)
  values (org, 'E1', 'Member One', m1 || '@rls-check.openkuasa-test.dev') returning id into e1;
  insert into public.org_members (org_id, user_id, role) values (org, m1, 'member');
  select user_id into linked from public.employees where id = e1;
  if linked is distinct from m1 then fails := array_append(fails, 'joining did not link the employee'); end if;

  -- Link on adding: the member exists first, then the employee is added.
  insert into public.org_members (org_id, user_id, role) values (org, m2, 'member');
  insert into public.employees (org_id, employee_no, name, work_email)
  values (org, 'E2', 'Member Two', m2 || '@rls-check.openkuasa-test.dev') returning id into e2;
  select user_id into linked from public.employees where id = e2;
  if linked is distinct from m2 then fails := array_append(fails, 'adding an employee did not link the member'); end if;

  -- A link to someone outside the workspace is refused.
  begin
    update public.employees set user_id = outsider where id = e2;
    fails := array_append(fails, 'linked an employee to a non-member');
  exception when others then null;
  end;

  -- ---- one personal row each, and the HR-only rows --------------------
  insert into public.employee_private (employee_id, org_id, base_salary_cents) values (e1, org, 400000), (e2, org, 900000);
  insert into public.leave_requests (org_id, employee_id, leave_type, start_date, end_date, days)
  values (org, e1, 'annual', current_date, current_date, 1), (org, e2, 'medical', current_date, current_date, 1);
  insert into public.claims (org_id, employee_id, category, amount_cents, claim_date)
  values (org, e1, 'travel', 1000, current_date), (org, e2, 'medical', 2000, current_date);
  insert into public.payroll_runs (id, org_id, period_month) values (run_id, org, date_trunc('month', current_date)::date);
  insert into public.payslips (org_id, employee_id, payroll_run_id, period_month, gross_cents)
  values (org, e1, run_id, date_trunc('month', current_date)::date, 400000),
         (org, e2, run_id, date_trunc('month', current_date)::date, 900000);
  insert into public.reviews (org_id, employee_id, period, rating, score)
  values (org, e1, 'H1', 'meets', 3.5), (org, e2, 'H1', 'exceeds', 4.5);
  insert into public.documents (org_id, employee_id, title, doc_type)
  values (org, e1, 'Contract', 'contract'), (org, e2, 'Contract', 'contract');
  insert into public.payment_vouchers (org_id, voucher_no, payee, voucher_type, amount_cents, issued_date)
  values (org, 'PV-1', 'Someone', 'Advance', 1000, current_date);
  insert into public.people_settings (org_id) values (org);

  -- ---- as member one ---------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;

  foreach t in array personal loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 1 then fails := array_append(fails, format('a member reads %s rows of %s, expected only their own 1', n, t)); end if;
  end loop;
  execute format('select count(*) from public.payslips where employee_id = %L', e2) into n;
  if n <> 0 then fails := array_append(fails, 'a member reads a colleague''s payslip'); end if;
  foreach t in array hr_only loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 0 then fails := array_append(fails, format('a member reads %s rows of HR-only %s', n, t)); end if;
  end loop;
  execute format('select count(*) from public.employees where org_id = %L', org) into n;
  if n <> 2 then fails := array_append(fails, format('a member sees %s of 2 colleagues in the directory', n)); end if;

  begin
    execute format('insert into public.employees (org_id, employee_no, name) values (%L, ''X'', ''Planted'')', org);
    fails := array_append(fails, 'a member added an employee');
  exception when insufficient_privilege then null;
  end;
  execute format('update public.employee_private set base_salary_cents = 1 where employee_id = %L', e1);
  get diagnostics n = row_count;
  if n <> 0 then fails := array_append(fails, 'a member changed their own salary'); end if;
  execute format('delete from public.employees where id = %L', e2);
  get diagnostics n = row_count;
  if n <> 0 then fails := array_append(fails, 'a member deleted a colleague'); end if;

  reset role;

  -- ---- as the admin ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  foreach t in array personal loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 2 then fails := array_append(fails, format('the admin reads %s rows of %s, expected 2', n, t)); end if;
  end loop;
  foreach t in array hr_only loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 1 then fails := array_append(fails, format('the admin reads %s rows of %s, expected 1', n, t)); end if;
  end loop;
  reset role;

  -- ---- as the owner of another workspace -------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  foreach t in array personal || hr_only || array['employees'] loop
    execute format('select count(*) from public.%I where org_id = %L', t, org) into n;
    if n <> 0 then fails := array_append(fails, format('another workspace reads %s rows of %s', n, t)); end if;
  end loop;
  reset role;

  -- ---- a member who is removed loses their own rows at once -------------
  delete from public.org_members where org_id = org and user_id = m1;
  select user_id into linked from public.employees where id = e1;
  if linked is not null then fails := array_append(fails, 'removing a member left the employee linked'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  execute format('select count(*) from public.payslips where org_id = %L', org) into n;
  if n <> 0 then fails := array_append(fails, 'a removed member still reads their payslip'); end if;
  reset role;

  -- ---- the demo reseed keeps its shape when it runs again ---------------
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  perform private.reseed_demo_people();
  perform private.reseed_demo_people();
  select count(*) into n from public.employees where org_id = demo;
  if n <> 20 then fails := array_append(fails, format('the demo has %s employees after two reseeds, expected 20', n)); end if;
  select count(*) into n from public.employees where org_id = demo and id = 'dea97d89-a5b6-f264-bd42-c6df73f664a7' and name = 'Aisyah Rahim';
  if n <> 1 then fails := array_append(fails, 'the demo employee id changed'); end if;
  select count(*) into n from public.leave_requests
  where org_id = demo and status = 'approved'
    and (now() at time zone 'Asia/Kuala_Lumpur')::date between start_date and end_date;
  if n <> 3 then fails := array_append(fails, format('%s people on leave today in the demo, expected 3', n)); end if;
  select (select count(*) from public.leave_requests where org_id = demo and status = 'pending')
       + (select count(*) from public.claims where org_id = demo and status = 'pending')
       + (select count(*) from public.overtime_records where org_id = demo and status = 'pending') into n;
  if n <> 6 then fails := array_append(fails, format('%s pending approvals in the demo, expected 6', n)); end if;

  -- ---- a workspace with HR data can still be deleted --------------------
  begin
    delete from public.orgs where id = org;
  exception when others then
    fails := array_append(fails, ('deleting a workspace with HR data failed: ' || sqlerrm));
  end;

  raise exception 'PEOPLE_RLS_CHECK %', case
    when cardinality(fails) = 0 then 'PASSED (everything rolled back)'
    else 'FAILED: ' || array_to_string(fails, '; ')
  end;
end $$;
