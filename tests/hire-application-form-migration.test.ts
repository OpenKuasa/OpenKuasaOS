import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations', '20261017090000_hire_application_form_settings.sql'), 'utf8',
);
const SWITCHES = ['require_cv', 'require_cover_letter', 'ask_portfolio', 'ask_expected_salary'];

describe('hire application form settings migration', () => {
  test('adds the four switches, each off by default', () => {
    expect(sql).toContain('alter table public.hire_settings');
    for (const column of SWITCHES) {
      expect(sql, column).toContain(`add column ${column} boolean not null default false`);
    }
  });

  test('lets a writer update exactly those four columns, and grants nothing else', () => {
    const update = sql.match(/grant update \(([^)]*)\) on public\.hire_settings to authenticated;/);
    expect(update?.[1].split(',').map((c) => c.trim()).sort()).toEqual([...SWITCHES].sort());
    expect(sql.match(/\bgrant\b/g)?.length).toBe(1);
    expect(sql).not.toMatch(/\banon\b/);
    expect(sql).not.toMatch(/\bdelete\b/i);
  });

  test('does not touch the public careers functions or the policies', () => {
    expect(sql).not.toContain('get_public_');
    expect(sql).not.toMatch(/create policy|drop policy/);
  });
});
