import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const DIR = join(process.cwd(), 'supabase/migrations');
const seed = () => readFileSync(join(DIR, '20261014090700_people_demo_seed.sql'), 'utf8');
const cron = () => readFileSync(join(DIR, '20261014090800_people_demo_cron.sql'), 'utf8');

describe('Lekiu demo seed', () => {
  test('rebuilds only the demo workspace', () => {
    const text = seed();
    expect(text).toContain("select id into demo from public.orgs where slug = 'rimba-ventures-demo'");
    expect(text).toContain("if demo is null then raise exception 'demo org missing'; end if;");
    const deletes = text.match(/delete from public\.\w+[^;]*;/g) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const statement of deletes) expect(statement).toContain('where org_id = demo');
  });

  test('gives every employee a stable id, so the demo employee never changes', () => {
    const text = seed();
    expect(text).toContain("md5('rimba-emp-' || v.n)::uuid");
    expect(text).toContain("(1, 'Aisyah Rahim'");
  });

  test('is anchored to today in Malaysia, not to a fixed date', () => {
    const text = seed();
    expect(text).toContain("today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;");
    expect(text).not.toMatch(/'20\d\d-\d\d-\d\d'/);
  });

  test('cannot be called through the API, and runs once when applied', () => {
    const text = seed();
    expect(text).toContain(
      'revoke all on function private.reseed_demo_people() from public, anon, authenticated;',
    );
    expect(text.trimEnd().endsWith('select private.reseed_demo_people();')).toBe(true);
  });

  test('is scheduled hourly in its own migration', () => {
    const text = cron();
    expect(text).toContain('create extension if not exists pg_cron;');
    expect(text).toContain(
      "select cron.schedule('reseed-demo-people', '1 * * * *', $$select private.reseed_demo_people()$$);",
    );
  });

  test('leaves no time-off request waiting, so pending approvals stay at six', () => {
    const text = seed();
    const start = text.indexOf('insert into public.hr_time_off_requests');
    const block = text.slice(start, text.indexOf(') as v(n, day, start_time, end_time, reason, status);', start));
    const rows = block.split('\n').filter((line) => /^\s+\(\d+, -?\d+, '\d\d:\d\d'/.test(line));
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row).not.toContain("'pending'");
  });
});
