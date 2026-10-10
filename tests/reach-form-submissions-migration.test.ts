import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  SUBMISSION_EMAIL_MAX,
  SUBMISSION_MESSAGE_MAX,
  SUBMISSION_NAME_MAX,
  SUBMISSION_PHONE_MAX,
  submissionOutcome,
} from '@/lib/reach/form-submissions';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261012110000_reach_form_submissions.sql'),
  'utf8',
);
/** The statements, without the comments (which mention things the SQL must not do). */
const sql = migration
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const FUNCTIONS = [
  'public.get_public_form(uuid)',
  'public.record_form_view(uuid)',
  'public.submit_public_form(uuid, text, text, text, text, text)',
];

/** The text of one `create or replace function public.<name>` statement. */
function body(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `function ${name} is not defined`).toBeGreaterThanOrEqual(0);
  // The body opens with "as $$" and closes at the first "$$;" after it.
  return sql.slice(start, sql.indexOf('$$;', start) + 3);
}

describe('public lead forms migration', () => {
  test('creates form_submissions under org tenancy, with both indexes', () => {
    expect(sql).toContain('create table public.form_submissions');
    expect(sql).toContain('org_id uuid not null references public.orgs(id) on delete cascade');
    expect(sql).toContain('form_id uuid not null references public.forms(id) on delete cascade');
    expect(sql).toContain("payload jsonb not null default '{}'::jsonb");
    expect(sql).toContain('create index form_submissions_org_created_idx on public.form_submissions (org_id, created_at desc)');
    expect(sql).toContain('create index form_submissions_form_created_idx on public.form_submissions (form_id, created_at desc)');
    expect(sql).toContain('alter table public.form_submissions enable row level security');
  });

  test('a submission points at a contact in the same workspace, and outlives it', () => {
    expect(sql).toMatch(
      /foreign key \(contact_id, org_id\)\s+references public\.crm_contacts\(id, org_id\) on delete set null \(contact_id\)/,
    );
  });

  test('stores nothing that identifies the visitor beyond what they typed', () => {
    const table = sql.slice(sql.indexOf('create table public.form_submissions'), sql.indexOf('alter table public.form_submissions'));
    expect(table).not.toMatch(/\bip\b|ip_address|inet|user_agent|referr?er|fingerprint/i);
  });

  test('members read, writers delete, a second factor is required, and nobody inserts or updates', () => {
    expect(sql).toContain('create policy form_submissions_select on public.form_submissions for select to authenticated');
    expect(sql).toContain('using (private.is_org_member(org_id))');
    expect(sql).toContain('create policy form_submissions_delete on public.form_submissions for delete to authenticated');
    expect(sql).toContain('using (private.is_org_writer(org_id))');
    expect(sql).toContain('create policy mfa_required on public.form_submissions as restrictive for all to authenticated');
    expect(sql).not.toMatch(/create policy \w+ on public\.form_submissions for (insert|update|all) to/);
  });

  test('grant ceiling: revoke all, then select and delete for signed-in members only', () => {
    expect(sql).toContain('revoke all on public.form_submissions from anon, authenticated;');
    expect(sql).toContain('grant select, delete on public.form_submissions to authenticated;');
    // That is the only table grant in the file: nothing for anon, on any table.
    const tableGrants = sql.match(/grant [^;]* on public\.[a-z_]+ to [^;]*;/g) ?? [];
    expect(tableGrants).toEqual(['grant select, delete on public.form_submissions to authenticated;']);
    expect(sql).not.toMatch(/grant (?!execute)[^;]*\banon\b/);
  });

  test('every public function is SECURITY DEFINER with an empty, pinned search_path', () => {
    const defined = sql.match(/create or replace function ([a-z_.]+)\(/g) ?? [];
    expect(defined.map((d) => d.replace('create or replace function ', '').replace('(', '')).sort()).toEqual([
      'public.get_public_form',
      'public.record_form_view',
      'public.submit_public_form',
    ]);
    for (const name of ['get_public_form', 'record_form_view', 'submit_public_form']) {
      expect(body(name), name).toMatch(/security definer (stable )?set search_path = ''/);
    }
  });

  test('with an empty search_path, every table and helper is named with its schema', () => {
    for (const name of ['get_public_form', 'record_form_view', 'submit_public_form']) {
      const text = body(name);
      for (const table of ['forms', 'orgs', 'org_members', 'crm_contacts', 'form_submissions']) {
        // Wherever a table follows from/join/into/update, it is public.<table>.
        expect(text, `${name}: ${table}`).not.toMatch(new RegExp(`(from|join|into|update)\\s+${table}\\b`));
      }
      expect(text).not.toMatch(/[^.a-z_]uid\(\)/);
    }
  });

  test('each function is revoked from everyone, then granted to anon and authenticated only', () => {
    for (const fn of FUNCTIONS) {
      expect(sql).toContain(`revoke execute on function ${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function ${fn} to anon, authenticated;`);
    }
    const grants = sql.match(/grant execute on function [^;]*;/g) ?? [];
    expect(grants).toHaveLength(FUNCTIONS.length);
    // The revokes come first.
    expect(sql.lastIndexOf('revoke execute on function')).toBeLessThan(sql.indexOf('grant execute on function'));
  });

  test('the form lookup gives out names only for a form that is accepting', () => {
    const text = body('get_public_form');
    expect(text).toContain('returns table (form_name text, org_name text, accepting boolean)');
    expect(text).toContain('case when a.accepting then f.name end');
    expect(text).toContain('case when a.accepting then o.name end');
    expect(text).toContain("f.status = 'active' and o.slug is distinct from 'rimba-ventures-demo'");
    // Nothing else leaves: no ids, slug, category, counters or dates.
    expect(text).not.toMatch(/f\.(id|slug|category|channel|views_count|submissions_count|created_at)\s*[,\n]/);
  });

  test('a view is counted only for an active form, and not for its own members', () => {
    const text = body('record_form_view');
    expect(text).toContain('set views_count = f.views_count + 1');
    expect(text).toContain("f.status = 'active'");
    expect(text).toMatch(/not exists \(\s*select 1 from public\.org_members m\s+where m\.org_id = f\.org_id and m\.user_id = \(select auth\.uid\(\)\)/);
  });

  test('the submit function checks the same limits the page does', () => {
    const text = body('submit_public_form');
    expect(text).toContain(`char_length(v_name) > ${SUBMISSION_NAME_MAX}`);
    expect(text).toContain(`char_length(v_email) > ${SUBMISSION_EMAIL_MAX}`);
    expect(text).toContain(`char_length(v_phone) > ${SUBMISSION_PHONE_MAX}`);
    expect(text).toContain(`char_length(v_message) > ${SUBMISSION_MESSAGE_MAX}`);
    expect(text).toContain("v_email !~ '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'");
  });

  test('every word it can answer with is one the app understands', () => {
    const words = [...body('submit_public_form').matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(words)].sort()).toEqual([
      'closed', 'email_too_long', 'invalid_email', 'invalid_name', 'message_too_long',
      'name_too_long', 'not_found', 'ok', 'phone_too_long', 'throttled',
    ]);
    for (const word of words) expect(submissionOutcome(word).kind, word).not.toBe('failed');
  });

  test('the honeypot is checked before anything is read or written', () => {
    const text = body('submit_public_form');
    const honeypot = text.indexOf("if btrim(coalesce(p_honeypot, '')) <> '' then");
    expect(honeypot).toBeGreaterThan(0);
    expect(honeypot).toBeLessThan(text.indexOf('from public.forms'));
    expect(honeypot).toBeLessThan(text.indexOf('insert into'));
  });

  test('throttles per form, reuses a contact with the same email, and counts the submission', () => {
    const text = body('submit_public_form');
    expect(text).toContain('for update of f');
    expect(text).toMatch(/s\.created_at > now\(\) - interval '1 minute'\) >= 30/);
    expect(text).toContain('where c.org_id = v_org_id and lower(c.email) = v_email');
    expect(text).toContain("'Lead form: ' || v_form_name");
    expect(text).toContain("array['lead-form']");
    expect(text).toContain('update public.forms set submissions_count = submissions_count + 1 where id = v_form_id');
    // A new contact has no owner, and an existing one is never updated.
    expect(text).not.toContain('owner_user_id');
    expect(text).not.toMatch(/update public\.crm_contacts/);
  });

  test('leaves the demo reseed alone', () => {
    expect(sql).not.toContain('reseed_demo_reach');
  });
});
