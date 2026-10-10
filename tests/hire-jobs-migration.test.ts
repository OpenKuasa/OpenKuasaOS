import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const read = (name: string) => readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');
const sql = read('20261014090000_hire_jobs_writes.sql');

describe('hire jobs writes migration', () => {
  test('adds the seven job fields with their checks', () => {
    for (const column of [
      'description text', 'salary_min_cents bigint', 'salary_max_cents bigint',
      'show_salary boolean not null default false', 'closes_on date',
      'work_arrangement text', 'headcount integer not null default 1',
    ]) {
      expect(sql, column).toContain(column);
    }
    expect(sql).toContain("check (work_arrangement in ('onsite','hybrid','remote'))");
    expect(sql).toContain('check (headcount >= 1)');
    expect(sql).toContain('salary_max_cents >= salary_min_cents');
  });

  test('adds the write policy and the grants together', () => {
    expect(sql).toContain('create policy hire_jobs_write on public.hire_jobs for all to authenticated');
    expect(sql).toContain('private.is_org_writer(org_id)');
    expect(sql).toContain('grant insert on public.hire_jobs to authenticated');
    expect(sql).toContain('grant delete on public.hire_jobs to authenticated');
  });

  test('never lets id, org_id or created_at be updated', () => {
    const match = sql.match(/grant update \(([^)]*)\) on public\.hire_jobs to authenticated;/);
    expect(match).not.toBeNull();
    const columns = match![1].split(',').map((c) => c.trim());
    expect(columns).toEqual(expect.arrayContaining(['title', 'status', 'description', 'headcount', 'opened_at', 'closed_at']));
    for (const forbidden of ['id', 'org_id', 'created_at']) expect(columns).not.toContain(forbidden);
  });

  test('guards deleting a job that has applications, except when the whole workspace is going', () => {
    expect(sql).toContain('create trigger hire_jobs_delete_guard');
    expect(sql).toContain('before delete on public.hire_jobs');
    expect(sql).toContain('from public.hire_applications');
    expect(sql).toContain('from public.orgs');
  });

  test('touches no other hiring table', () => {
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*hire_(candidates|applications|interviews)/);
    expect(sql).not.toMatch(/create policy \w+ on public\.hire_(candidates|applications|interviews)/);
  });
});

const seed = read('20261014090100_hire_jobs_demo_seed.sql');
const previous = read('20261013090100_hire_demo_seed.sql');

describe('hire jobs demo seed migration', () => {
  test('replaces the reseed function and keeps it private', () => {
    expect(seed).toContain('create or replace function private.reseed_demo_hire()');
    expect(seed).toContain('security definer');
    expect(seed).toContain('revoke all on function private.reseed_demo_hire() from public, anon, authenticated');
    expect(seed).toContain('select private.reseed_demo_hire();');
  });
  test('deletes applications before jobs, so the delete guard never fires', () => {
    const apps = seed.indexOf('delete from public.hire_applications where org_id = demo');
    const jobs = seed.indexOf('delete from public.hire_jobs where org_id = demo');
    expect(apps).toBeGreaterThan(-1);
    expect(jobs).toBeGreaterThan(apps);
  });
  test('fills the new job fields', () => {
    for (const column of ['description', 'salary_min_cents', 'salary_max_cents', 'show_salary', 'closes_on', 'work_arrangement', 'headcount']) {
      expect(seed, column).toContain(column);
    }
    expect(seed.match(/, true,/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
  test('keeps the application arithmetic unchanged', () => {
    for (const line of ['(i * 37) % 248', '(i * 91) % 248', '(i * 53) % 248', 'generate_series(1, 248)', 'generate_series(1, 342)', '28 + k * 2']) {
      expect(seed, line).toContain(line);
      expect(previous, line).toContain(line);
    }
  });
  test('snaps interview times to working hours in Kuala Lumpur', () => {
    expect(seed).toContain("at time zone 'Asia/Kuala_Lumpur'");
    expect(seed).toMatch(/interval '9 hours'/);
    expect(seed).toMatch(/interval '17 hours'/);
  });
});
