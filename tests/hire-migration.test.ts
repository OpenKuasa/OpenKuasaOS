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
