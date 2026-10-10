import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations', '20261016090000_hire_settings.sql'), 'utf8');
/** The text of one function, from its `create` to the end of its body. */
const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', start));
};
const returnsOf = (body: string) => body.slice(body.indexOf('returns table'), body.indexOf('language sql'));

describe('hire settings migration', () => {
  test('creates the table with the board off by default and the length checks', () => {
    expect(sql).toContain('create table public.hire_settings');
    expect(sql).toContain('org_id uuid primary key references public.orgs(id) on delete cascade');
    expect(sql).toContain('careers_enabled boolean not null default false');
    expect(sql).toContain('check (char_length(careers_headline) <= 80)');
    expect(sql).toContain('check (char_length(careers_tagline) <= 160)');
    expect(sql).toContain('alter table public.hire_settings enable row level security');
  });

  test('members read, writers write, and nobody deletes or rewrites org_id', () => {
    expect(sql).toContain('create policy hire_settings_select on public.hire_settings for select to authenticated');
    expect(sql).toContain('create policy hire_settings_write on public.hire_settings for all to authenticated');
    expect(sql).toContain('drop policy if exists mfa_required on public.hire_settings');
    expect(sql).toContain('revoke all on public.hire_settings from anon, authenticated');
    expect(sql).toContain('grant select, insert on public.hire_settings to authenticated');
    const update = sql.match(/grant update \(([^)]*)\) on public\.hire_settings to authenticated;/);
    expect(update?.[1].split(',').map((c) => c.trim()).sort()).toEqual(
      ['careers_enabled', 'careers_headline', 'careers_tagline', 'updated_at'],
    );
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*hire_settings/);
    expect(sql).not.toMatch(/grant[^;]*hire_settings to anon/);
  });

  test.each(['get_public_careers', 'get_public_job'])('%s is a locked-down definer function', (name) => {
    const body = fn(name);
    expect(body).toContain('language sql security definer stable set search_path = \'\'');
    // What a visitor is handed never includes these.
    for (const hidden of ['headcount', 'status', 'created_at', 'closed_at', 'show_salary']) {
      expect(returnsOf(body), `${name} returns ${hidden}`).not.toContain(hidden);
    }
    expect(body).toContain('s.careers_enabled');
    expect(body).toContain("o.slug is distinct from 'rimba-ventures-demo'");
    expect(body).toContain("j.status = 'open'");
    // An open job with a blank description is not shown.
    expect(body).toContain("nullif(btrim(j.description), '') is not null");
    expect(body).not.toMatch(/execute\s/i);
  });

  test('the job function only gives a salary that may be shown, and ties the job to the workspace', () => {
    const body = fn('get_public_job');
    expect(body).toContain('case when j.show_salary then j.salary_min_cents end');
    expect(body).toContain('case when j.show_salary then j.salary_max_cents end');
    expect(body).toContain('j.org_id = o.id');
    expect(body).toContain('j.id = p_job_id');
  });

  test('anon and authenticated may execute the two functions and nothing else is granted to anon', () => {
    expect(sql).toContain('revoke execute on function public.get_public_careers(uuid) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.get_public_careers(uuid) to anon, authenticated');
    expect(sql).toContain('revoke execute on function public.get_public_job(uuid, uuid) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.get_public_job(uuid, uuid) to anon, authenticated');
    expect(sql.match(/to anon/g)?.length).toBe(2);
  });
});
