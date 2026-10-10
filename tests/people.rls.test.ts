import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasSupabaseEnv, supabaseEnvSkipReason } from './setup/supabase';

const testWithSupabase = hasSupabaseEnv ? test : test.skip;
if (!hasSupabaseEnv) console.warn(supabaseEnvSkipReason);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const client = (): SupabaseClient =>
  createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const DEMO_EMPLOYEE_ID = 'dea97d89-a5b6-f264-bd42-c6df73f664a7';
const PERSONAL = [
  'employee_private', 'leave_requests', 'leave_balances', 'time_off_requests', 'claims',
  'overtime_records', 'attendance_days', 'timesheet_entries', 'shifts', 'payslips', 'goals',
  'scorecards', 'reviews', 'training_enrolments', 'documents', 'letters',
];
const HR_ONLY = ['payroll_runs', 'payment_vouchers', 'people_settings'];
const SHARED = ['departments', 'employees', 'public_holidays', 'trainings', 'announcements'];

async function ownedOrg(name: string) {
  const c = client();
  const { error: e1 } = await c.auth.signInAnonymously();
  expect(e1, e1?.message).toBeNull();
  const { data: orgId, error } = await c.rpc('create_org_for_current_user', { org_name: name });
  expect(error, error?.message).toBeNull();
  return { c, orgId: orgId as string };
}

async function demoGuest() {
  const c = client();
  const { error: e1 } = await c.auth.signInAnonymously();
  expect(e1, e1?.message).toBeNull();
  const { data: demoId, error } = await c.rpc('join_demo_org');
  expect(error, error?.message).toBeNull();
  return { c, demoId: demoId as string };
}

const count = async (c: SupabaseClient, table: string, orgId: string) => {
  const { count: n, error } = await c
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return n ?? 0;
};

let owner: Awaited<ReturnType<typeof ownedOrg>>;
let other: Awaited<ReturnType<typeof ownedOrg>>;

beforeAll(async () => {
  if (!hasSupabaseEnv) return;
  owner = await ownedOrg('People Owner Sdn Bhd');
  other = await ownedOrg('People Other Sdn Bhd');
});
afterAll(async () => {
  await owner?.c.auth.signOut();
  await other?.c.auth.signOut();
});

testWithSupabase('an owner can add, edit and delete a department and an employee with private details', async () => {
  const dept = await owner.c
    .from('departments')
    .insert({ org_id: owner.orgId, name: 'Sales' })
    .select('id')
    .single();
  expect(dept.error, dept.error?.message).toBeNull();

  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-001', name: 'Farah Idris', department_id: dept.data!.id })
    .select('id, status, user_id, updated_at')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  expect(emp.data!.status).toBe('active');
  expect(emp.data!.user_id).toBeNull();

  const priv = await owner.c
    .from('employee_private')
    .insert({ employee_id: emp.data!.id, org_id: owner.orgId, base_salary_cents: 420000, nric: '900101-14-5001' })
    .select('base_salary_cents')
    .single();
  expect(priv.error, priv.error?.message).toBeNull();
  expect(priv.data!.base_salary_cents).toBe(420000);

  const upd = await owner.c
    .from('employees')
    .update({ designation: 'Sales Executive' })
    .eq('id', emp.data!.id)
    .select('designation, updated_at')
    .single();
  expect(upd.error, upd.error?.message).toBeNull();
  expect(upd.data!.designation).toBe('Sales Executive');
  expect(new Date(upd.data!.updated_at) >= new Date(emp.data!.updated_at)).toBe(true);

  // A department that still has an employee cannot be deleted.
  const blocked = await owner.c.from('departments').delete().eq('id', dept.data!.id);
  expect(blocked.error?.code).toBe('23503');

  // Deleting the employee takes the private row with it.
  const del = await owner.c.from('employees').delete().eq('id', emp.data!.id);
  expect(del.error, del.error?.message).toBeNull();
  expect(await count(owner.c, 'employee_private', owner.orgId)).toBe(0);
  const delDept = await owner.c.from('departments').delete().eq('id', dept.data!.id);
  expect(delDept.error, delDept.error?.message).toBeNull();
});

testWithSupabase('an owner cannot link an employee to someone outside the workspace', async () => {
  const outsider = (await other.c.auth.getUser()).data.user!.id;
  const res = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-900', name: 'Not Ours', user_id: outsider })
    .select('id');
  expect(res.error?.message).toContain('not a member of this workspace');
});

testWithSupabase('an owner cannot write to a table that is read-only this slice', async () => {
  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-002', name: 'Read Only' })
    .select('id')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  const res = await owner.c.from('leave_requests').insert({
    org_id: owner.orgId, employee_id: emp.data!.id, leave_type: 'annual',
    start_date: '2026-10-20', end_date: '2026-10-21', days: 2,
  });
  expect(res.error?.code).toBe('42501'); // no insert grant
  await owner.c.from('employees').delete().eq('id', emp.data!.id);
});

testWithSupabase('one workspace cannot see or change another workspace\'s HR data', async () => {
  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-003', name: 'Private Person' })
    .select('id')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  await owner.c.from('employee_private').insert({ employee_id: emp.data!.id, org_id: owner.orgId, base_salary_cents: 500000 });

  expect(await count(other.c, 'employees', owner.orgId)).toBe(0);
  expect(await count(other.c, 'employee_private', owner.orgId)).toBe(0);

  const hijack = await other.c.from('employees').update({ name: 'Changed' }).eq('id', emp.data!.id).select('id');
  expect(hijack.data ?? []).toHaveLength(0);
  const plant = await other.c.from('employees').insert({ org_id: owner.orgId, employee_no: 'X', name: 'Planted' });
  expect(plant.error?.code).toBe('42501');

  await owner.c.from('employees').delete().eq('id', emp.data!.id);
});

testWithSupabase('a demo guest reads the whole demo workspace, and it has the promised shape', async () => {
  const d = await demoGuest();

  for (const table of [...SHARED, ...PERSONAL, ...HR_ONLY]) {
    expect(await count(d.c, table, d.demoId), table).toBeGreaterThan(0);
  }
  expect(await count(d.c, 'employees', d.demoId)).toBe(20);
  expect(await count(d.c, 'departments', d.demoId)).toBe(5);
  expect(await count(d.c, 'payroll_runs', d.demoId)).toBe(8);

  const me = await d.c.from('employees').select('name').eq('id', DEMO_EMPLOYEE_ID).single();
  expect(me.data?.name).toBe('Aisyah Rahim');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  const onLeave = await d.c
    .from('leave_requests')
    .select('id')
    .eq('org_id', d.demoId)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today);
  expect(onLeave.data ?? []).toHaveLength(3);

  const pending = async (table: string) => {
    const { count: n } = await d.c
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('org_id', d.demoId)
      .eq('status', 'pending');
    return n ?? 0;
  };
  expect(await pending('leave_requests')).toBe(3);
  expect(await pending('claims')).toBe(2);
  expect(await pending('overtime_records')).toBe(1);

  const draft = await d.c.from('payroll_runs').select('period_month').eq('org_id', d.demoId).eq('status', 'draft');
  expect(draft.data ?? []).toHaveLength(1);
  expect(draft.data![0].period_month).toBe(`${today.slice(0, 7)}-01`);

  await d.c.auth.signOut();
});

testWithSupabase('a demo guest cannot change anything', async () => {
  const d = await demoGuest();
  const ins = await d.c.from('employees').insert({ org_id: d.demoId, employee_no: 'X', name: 'Guest Edit' });
  expect(ins.error?.code).toBe('42501');
  const upd = await d.c.from('employees').update({ name: 'Changed' }).eq('id', DEMO_EMPLOYEE_ID).select('id');
  expect(upd.data ?? []).toHaveLength(0);
  const del = await d.c.from('employees').delete().eq('id', DEMO_EMPLOYEE_ID).select('id');
  expect(del.data ?? []).toHaveLength(0);
  const pay = await d.c.from('employee_private').update({ base_salary_cents: 1 }).eq('employee_id', DEMO_EMPLOYEE_ID).select('employee_id');
  expect(pay.data ?? []).toHaveLength(0);
  await d.c.auth.signOut();
});

testWithSupabase('being in the demo opens the demo only', async () => {
  // Someone who is not in the demo sees none of it.
  const demoIdRes = await demoGuest();
  for (const table of ['employees', 'payslips', 'payroll_runs']) {
    expect(await count(owner.c, table, demoIdRes.demoId), table).toBe(0);
  }
  // A demo guest sees nothing of a real workspace.
  const emp = await owner.c
    .from('employees')
    .insert({ org_id: owner.orgId, employee_no: 'EMP-004', name: 'Not For Guests' })
    .select('id')
    .single();
  expect(emp.error, emp.error?.message).toBeNull();
  expect(await count(demoIdRes.c, 'employees', owner.orgId)).toBe(0);
  await owner.c.from('employees').delete().eq('id', emp.data!.id);
  await demoIdRes.c.auth.signOut();
});
