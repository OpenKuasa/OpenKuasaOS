import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

type Kind = 'shared' | 'personal' | 'hr';

const DIR = join(process.cwd(), 'supabase/migrations');
const CORE = '20261013090000_people_core.sql';
const LEAVE = '20261013090100_people_leave.sql';
const CLAIMS = '20261013090200_people_claims_overtime.sql';

/** Every Lekiu table, the file that creates it, and who may read it. */
const TABLES: { file: string; table: string; kind: Kind }[] = [
  { file: CORE, table: 'departments', kind: 'shared' },
  { file: CORE, table: 'employees', kind: 'shared' },
  { file: CORE, table: 'employee_private', kind: 'personal' },
  { file: LEAVE, table: 'leave_requests', kind: 'personal' },
  { file: LEAVE, table: 'leave_balances', kind: 'personal' },
  { file: LEAVE, table: 'time_off_requests', kind: 'personal' },
  { file: CLAIMS, table: 'claims', kind: 'personal' },
  { file: CLAIMS, table: 'overtime_records', kind: 'personal' },
];

const sql = (file: string) => readFileSync(join(DIR, file), 'utf8');

describe('Lekiu schema', () => {
  test.each(TABLES)('$table is created and secured as $kind', ({ file, table, kind }) => {
    const text = sql(file);
    expect(text).toContain(`create table public.${table} (`);
    expect(text).toContain(`select private.people_secure_table('${table}', '${kind}');`);
  });

  test.each(TABLES)('$table belongs to a workspace', ({ file, table }) => {
    const text = sql(file);
    const start = text.indexOf(`create table public.${table} (`);
    const body = text.slice(start, text.indexOf('\n);', start));
    expect(body).toContain('references public.orgs(id) on delete cascade');
  });

  test('a table with employee_id cannot point at another workspace', () => {
    for (const { file, table } of TABLES) {
      const text = sql(file);
      const start = text.indexOf(`create table public.${table} (`);
      const body = text.slice(start, text.indexOf('\n);', start));
      if (!body.includes('employee_id uuid')) continue;
      expect(body, table).toContain(
        'foreign key (employee_id, org_id) references public.employees(id, org_id) on delete cascade',
      );
    }
  });

  test('the three read rules are the ones in the spec', () => {
    const text = sql(CORE);
    expect(text).toContain("when 'shared' then 'private.is_org_member(org_id)'");
    expect(text).toContain(
      "when 'personal' then 'private.is_org_admin(org_id) or private.is_own_employee(employee_id) "
        + "or (private.is_demo_org(org_id) and private.is_org_member(org_id))'"
    );
    expect(text).toContain(
      "when 'hr' then 'private.is_org_admin(org_id) "
        + "or (private.is_demo_org(org_id) and private.is_org_member(org_id))'"
    );
    expect(text).toContain('create policy mfa_required on public.%I as restrictive');
    expect(text).toContain("execute format('revoke all on public.%I from anon, authenticated', t)");
  });

  test('only the core file grants writes, and only to admins', () => {
    const files = [...new Set(TABLES.map((t) => t.file))];
    for (const file of files) {
      const grants = sql(file).match(/grant (insert|update|delete)[^;]*;/g) ?? [];
      if (file === CORE) {
        for (const g of grants) expect(g).toMatch(/on public\.(departments|employees|employee_private) to authenticated;/);
      } else {
        expect(grants, file).toEqual([]);
      }
    }
    const core = sql(CORE);
    for (const table of ['departments', 'employees', 'employee_private']) {
      expect(core).toContain(
        `create policy ${table}_write on public.${table} for all to authenticated\n`
          + '  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));',
      );
    }
  });

  test('pay and identity fields are not on the directory table', () => {
    const text = sql(CORE);
    const start = text.indexOf('create table public.employees (');
    const directory = text.slice(start, text.indexOf('\n);', start));
    for (const column of ['nric', 'base_salary_cents', 'bank_account', 'address', 'date_of_birth date']) {
      expect(directory).not.toContain(column);
    }
  });

  test('own-record access needs current membership, and links are guarded', () => {
    const text = sql(CORE);
    expect(text).toContain('join public.org_members m on m.org_id = e.org_id and m.user_id = e.user_id');
    expect(text).toContain("raise exception 'that user is not a member of this workspace'");
    expect(text).toContain('create unique index employees_org_user_idx on public.employees (org_id, user_id) where user_id is not null');
    expect(text).toContain('after delete on public.org_members');
    expect(text).not.toContain('on delete restrict');
  });
});
