import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261011100000_kasturi_crm_schema.sql'),
  'utf8',
);

describe('Kasturi CRM schema migration', () => {
  test('creates the core CRM tables under org tenancy', () => {
    for (const table of [
      'crm_pipelines',
      'crm_pipeline_stages',
      'crm_contacts',
      'crm_deals',
      'crm_activities',
      'crm_notes',
      'crm_attachments',
      'crm_audit_logs',
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  test('keeps tenant records scoped by org_id and existing helper functions', () => {
    expect(migration).toContain('references public.orgs(id) on delete cascade');
    expect(migration).toContain('private.is_org_member(org_id)');
    expect(migration).toContain('private.is_org_writer(org_id)');
  });

  test('models the minimum sales workflow from contact to deal to activity', () => {
    expect(migration).toContain('crm_deals_contact_id_idx');
    expect(migration).toContain('crm_deals_stage_id_idx');
    expect(migration).toContain('crm_activities_deal_id_idx');
    expect(migration).toContain("check (status in ('open','won','lost'))");
    expect(migration).toContain("check (type in ('call','whatsapp','email','meeting','task','note'))");
  });

  test('carries the fields the Contacts and Deals screens show', () => {
    for (const column of [
      'first_name text not null',
      'last_name text',
      'country text',
      'lead_score integer not null default 0',
      'last_interaction_at timestamptz',
      'value_cents bigint not null default 0',
      'tag text',
      'last_activity_at timestamptz',
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("'lead','contacted','qualified','customer','archived'");
  });

  test('keeps child rows inside their own workspace and pipeline', () => {
    expect(migration).toContain(
      'foreign key (contact_id, org_id) references public.crm_contacts(id, org_id)',
    );
    expect(migration).toContain(
      'foreign key (deal_id, org_id) references public.crm_deals(id, org_id)',
    );
    expect(migration).toContain(
      'foreign key (stage_id, pipeline_id) references public.crm_pipeline_stages(id, pipeline_id)',
    );
  });

  test('grants access explicitly and enforces the second factor', () => {
    expect(migration).toContain('create policy mfa_required on public.%I as restrictive');
    expect(migration).toContain('revoke all on public.%I from anon, authenticated');
    expect(migration).toContain('grant select, insert, update, delete on public.%I to authenticated');
    // audit log is append-only and the actor cannot be forged
    expect(migration).toContain('grant select, insert on public.%I to authenticated');
    expect(migration).toContain('actor_user_id = (select auth.uid())');
  });
});
