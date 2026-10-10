import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { FORM_SLUG_PATTERN } from '@/lib/reach/forms';

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');

const migration = read('20261011120000_reach_forms.sql');
const previousSeed = read('20261011093100_reach_ads_demo_seed.sql');

/** The column list of one `grant <verb> (...) on public.forms` statement. */
function grantColumns(verb: 'insert' | 'update'): string[] {
  const match = migration.match(new RegExp(`grant ${verb} \\(([^)]*)\\) on public\\.forms to authenticated;`));
  expect(match, `no column-level ${verb} grant on forms`).not.toBeNull();
  return match![1].split(',').map((c) => c.trim());
}

describe('lead forms migration', () => {
  test('creates forms under org tenancy with RLS and the workspace index', () => {
    expect(migration).toContain('create table public.forms');
    expect(migration).toContain('org_id uuid not null references public.orgs(id) on delete cascade');
    expect(migration).toContain('alter table public.forms enable row level security');
    expect(migration).toContain('create index forms_org_created_idx on public.forms (org_id, created_at desc)');
    expect(migration).not.toMatch(/create table public\.form_submissions/);
  });

  test('checks the slug with the same rule the app uses, unique per workspace', () => {
    expect(migration).toContain(`check (slug ~ '${FORM_SLUG_PATTERN.source}')`);
    expect(migration).toContain('unique (org_id, slug)');
  });

  test('statuses are draft, active and paused, defaulting to draft', () => {
    expect(migration).toContain("status text not null default 'draft' check (status in ('draft','active','paused'))");
  });

  test('members read, writers write, and a second factor is required', () => {
    expect(migration).toContain('create policy forms_select on public.forms for select to authenticated');
    expect(migration).toContain('using (private.is_org_member(org_id))');
    expect(migration).toContain('create policy forms_write on public.forms for all to authenticated');
    expect(migration).toContain('using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id))');
    expect(migration).toContain('create policy mfa_required on public.forms as restrictive for all to authenticated');
  });

  test('grant ceiling: revoke all, then only what the API needs', () => {
    expect(migration).toContain('revoke all on public.forms from anon, authenticated;');
    expect(migration).toContain('grant select on public.forms to authenticated;');
    expect(migration).toContain('grant delete on public.forms to authenticated;');
    // No table-wide insert or update, and nothing at all for anon.
    expect(migration).not.toMatch(/grant (insert|update) on public\.forms/);
    expect(migration).not.toMatch(/grant [^;]* on public\.forms to [^;]*anon/);
  });

  test('the counters and the ids cannot be written through the API', () => {
    const update = grantColumns('update');
    expect([...update].sort()).toEqual(['category', 'channel', 'name', 'slug', 'status', 'updated_at']);
    const insert = grantColumns('insert');
    expect([...insert].sort()).toEqual(['category', 'channel', 'name', 'org_id', 'slug', 'status']);
    for (const cols of [update, insert]) {
      expect(cols).not.toContain('id');
      expect(cols).not.toContain('views_count');
      expect(cols).not.toContain('submissions_count');
      expect(cols).not.toContain('created_at');
    }
    expect(update).not.toContain('org_id');
  });

  test('the demo reseed keeps everything it did before and adds the six forms', () => {
    const body = (sql: string) =>
      sql.slice(sql.indexOf('create or replace function private.reseed_demo_reach()'));
    const before = body(previousSeed).split('\n');
    const after = body(migration).split('\n');
    // Every earlier line is still there, in order; only lines about forms were added.
    let at = 0;
    const added: string[] = [];
    for (const line of after) {
      if (line === before[at]) at += 1;
      else added.push(line);
    }
    expect(at).toBe(before.length);
    expect(added.join('\n')).toContain('delete from public.forms where org_id = demo;');
    expect(added.join('\n')).toContain('insert into public.forms');
    for (const slug of ['raya-promo', 'free-consult', 'newsletter', 'demo-request', 'ebook-sme-growth', 'usahawan-meetup']) {
      expect(migration).toContain(`'${slug}'`);
    }
    expect(migration).toContain('revoke execute on function private.reseed_demo_reach() from public, anon, authenticated;');
  });
});
