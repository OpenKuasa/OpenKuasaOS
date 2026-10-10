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
