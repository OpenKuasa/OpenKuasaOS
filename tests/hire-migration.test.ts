import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261013090000_hire_foundation.sql'),
  'utf8',
);
const TABLES = ['hire_jobs', 'hire_candidates', 'hire_applications', 'hire_interviews'];

describe('hire foundation migration', () => {
  test('creates the four tables under org tenancy with RLS', () => {
    for (const t of TABLES) {
      expect(sql).toContain(`create table public.${t}`);
      expect(sql).toContain(`alter table public.${t} enable row level security`);
    }
    expect(sql.match(/org_id uuid not null references public\.orgs\(id\) on delete cascade/g)).toHaveLength(4);
  });

  test('fixes the stages, outcomes and statuses', () => {
    expect(sql).toContain("check (stage in ('applied','screening','interview','offer','hired'))");
    expect(sql).toContain("check (outcome in ('active','rejected','withdrawn'))");
    expect(sql).toContain("check (status in ('draft','open','paused','closed'))");
    expect(sql).toContain("check (status in ('scheduled','completed','cancelled','no_show'))");
    expect(sql).toContain("check (pool_status in ('none','available','passive','re_engaged'))");
  });

  test('one application per candidate per job', () => {
    expect(sql).toContain('unique (candidate_id, job_id)');
  });

  test('is read-only: select granted, no write grant or write policy', () => {
    expect(sql).toContain("'grant select on public.%I to authenticated'");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/i);
    expect(sql).not.toMatch(/for\s+(insert|update|delete)\s+to/i);
    expect(sql).not.toContain('is_org_writer');
  });

  test('every table gets the member select policy and the MFA policy', () => {
    expect(sql).toContain('private.is_org_member(org_id)');
    expect(sql).toContain('create policy mfa_required on public.%I as restrictive');
    expect(sql).toContain("array['hire_jobs','hire_candidates','hire_applications','hire_interviews']");
  });
});

const seedSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261013090100_hire_demo_seed.sql'),
  'utf8',
);
const cronSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261013090200_hire_demo_cron.sql'),
  'utf8',
);

describe('hire demo seed migration', () => {
  test('reseeds only the demo org, as a definer function nobody else can call', () => {
    expect(seedSql).toContain('create or replace function private.reseed_demo_hire()');
    expect(seedSql).toContain('security definer');
    expect(seedSql).toContain("where slug = 'rimba-ventures-demo'");
    expect(seedSql).toMatch(/delete from public\.hire_jobs where org_id = demo/);
    expect(seedSql).toMatch(/delete from public\.hire_candidates where org_id = demo/);
    expect(seedSql).not.toMatch(/delete from public\.hire_\w+\s*;/);
    expect(seedSql).toContain('revoke all on function private.reseed_demo_hire() from public, anon, authenticated');
  });

  test('uses the same arithmetic as the TypeScript seed', () => {
    expect(seedSql).toContain('(i * 37) % 248');
    expect(seedSql).toContain('(i * 91) % 248');
    expect(seedSql).toContain('(i * 53) % 248');
    expect(seedSql).toContain('generate_series(1, 248)');
    expect(seedSql).toContain('generate_series(1, 342)');
  });

  test('uses only made-up contact details', () => {
    expect(seedSql).toContain("'@demo.openkuasa.com'");
    expect(seedSql).toContain("'+60 12-555 '");
  });

  test('schedules the reseed hourly, in its own migration', () => {
    expect(cronSql).toContain("cron.schedule('reseed-demo-hire', '0 * * * *'");
    expect(cronSql).toContain('private.reseed_demo_hire()');
    expect(seedSql).not.toContain('cron.schedule');
  });
});
