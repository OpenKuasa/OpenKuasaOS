// tests/hire-capabilities.test.ts
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  JOB_HAS_APPLICATIONS,
  JOB_LIVE_NEEDS_DESCRIPTION,
  JOB_NEEDS_DESCRIPTION,
  JOB_NOT_FOUND,
  CAREERS_DEMO,
  updateCareersPage,
  updateCareersPageInput,
  createJob,
  createJobInput,
  deleteJob,
  deleteJobInput,
  setJobStatus,
  setJobStatusInput,
  updateJob,
  updateJobInput,
  type HireWriteContext,
} from '@/lib/hire/capabilities';
import type { Job } from '@/lib/hire/types';

const NOW = new Date('2026-10-11T04:00:00Z'); // 12:00 on 11 Oct in Kuala Lumpur
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

const job = (over: Partial<Job & { org_id: string }> = {}): Job & { org_id: string } => ({
  id: ID, org_id: ORG, title: 'Barista', department: null, location: null,
  employment_type: 'full_time', status: 'draft', description: null,
  salary_min_cents: null, salary_max_cents: null, show_salary: false, closes_on: null,
  work_arrangement: null, headcount: 1, opened_at: null, closed_at: null,
  created_at: '2026-10-01T00:00:00Z', ...over,
});

/** An in-memory stand-in for the two tables the capabilities touch. */
function fake(rows: (Job & { org_id: string })[], applications: Record<string, number> = {}, failLookup = false) {
  const writes: { op: string; values?: Record<string, unknown> }[] = [];
  const strip = (row: Job & { org_id: string }) => {
    const copy: Record<string, unknown> = { ...row };
    delete copy.org_id;
    return copy as unknown as Job;
  };
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const match = () => rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
      if (table === 'hire_applications') {
        const chain = {
          select: () => chain,
          eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
          then: (resolve: (v: unknown) => void) =>
            resolve({ count: applications[String(filters.job_id)] ?? 0, error: null }),
        };
        return chain;
      }
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let values: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        insert: (v: Record<string, unknown>) => { op = 'insert'; values = v; return chain; },
        update: (v: Record<string, unknown>) => { op = 'update'; values = v; return chain; },
        delete: () => { op = 'delete'; return chain; },
        eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
        maybeSingle: async () => failLookup ? { data: null, error: { message: 'boom' } } : ({ data: match()[0] ? strip(match()[0]) : null, error: null }),
        single: async () => {
          if (op === 'insert') {
            const row = { ...job(), ...values, id: ID } as Job & { org_id: string };
            rows.push(row);
            writes.push({ op, values });
            return { data: strip(row), error: null };
          }
          const target = match()[0];
          if (!target) return { data: null, error: { message: 'no rows' } };
          Object.assign(target, values);
          writes.push({ op, values });
          return { data: strip(target), error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          if (op === 'delete') {
            const target = match()[0];
            if (target) rows.splice(rows.indexOf(target), 1);
            writes.push({ op });
          }
          resolve({ error: null });
        },
      };
      return chain;
    },
  };
  const ctx = { client: client as never, orgId: ORG } satisfies HireWriteContext;
  return { ctx, rows, writes };
}

describe('createJob', () => {
  it('creates a draft in the caller\'s workspace, whatever the input says', async () => {
    const { ctx, writes } = fake([]);
    const result = await createJob(ctx, { title: '  Barista  ', org_id: OTHER_ORG, status: 'open' } as never, NOW);
    expect(result).toMatchObject({ ok: true, data: { title: 'Barista', status: 'draft', headcount: 1, show_salary: false } });
    expect(writes[0].values).toMatchObject({ org_id: ORG, status: 'draft', title: 'Barista' });
  });
  it('refuses an empty title, a long title and a headcount of zero', async () => {
    const { ctx, writes } = fake([]);
    for (const input of [{ title: ' ' }, { title: 'x'.repeat(121) }, { title: 'Barista', headcount: 0 }]) {
      expect((await createJob(ctx, input, NOW)).ok).toBe(false);
    }
    expect(writes).toHaveLength(0);
  });
  it('refuses a maximum salary below the minimum', async () => {
    const { ctx } = fake([]);
    const result = await createJob(ctx, { title: 'Barista', salary_min_cents: 300_000, salary_max_cents: 250_000 }, NOW);
    expect(result).toEqual({ ok: false, error: 'Maximum salary can\'t be lower than the minimum.' });
  });
  it('refuses a closing date in the past, by the date in Kuala Lumpur', async () => {
    const { ctx } = fake([]);
    expect((await createJob(ctx, { title: 'Barista', closes_on: '2026-10-10' }, NOW)).ok).toBe(false);
    expect((await createJob(ctx, { title: 'Barista', closes_on: '2026-10-11' }, NOW)).ok).toBe(true);
  });
  it('refuses a date that does not exist, and says so rather than failing at the database', async () => {
    const { ctx, writes } = fake([]);
    const realDate = { ok: false, error: 'Use a real date, like 2026-10-31.' };
    expect(await createJob(ctx, { title: 'Barista', closes_on: '2026-02-31' }, NOW)).toEqual(realDate);
    expect(await createJob(ctx, { title: 'Barista', closes_on: '2027-02-30' }, NOW)).toEqual(realDate);
    expect(await createJob(ctx, { title: 'Barista', closes_on: '2026-13-01' }, NOW)).toEqual(realDate);
    expect(writes).toHaveLength(0);
    expect(await createJob(ctx, { title: 'Barista', closes_on: '2026-10-31' }, NOW)).toMatchObject({ ok: true, data: { closes_on: '2026-10-31' } });
    expect(await createJob(ctx, { title: 'Barista', closes_on: '2028-02-29' }, NOW)).toMatchObject({ ok: true });
  });
  it('uses the Kuala Lumpur date when it is already the next day in UTC', async () => {
    const lateUtc = new Date('2026-10-10T17:00:00Z'); // 01:00 on 11 Oct in Kuala Lumpur
    const { ctx } = fake([]);
    expect((await createJob(ctx, { title: 'Barista', closes_on: '2026-10-10' }, lateUtc)).ok).toBe(false);
    expect((await createJob(ctx, { title: 'Barista', closes_on: '2026-10-11' }, lateUtc)).ok).toBe(true);
  });
});

describe('updateJob', () => {
  it('changes only the fields given and never the status', async () => {
    const { ctx, rows } = fake([job({ status: 'open', description: 'Make coffee.' })]);
    const result = await updateJob(ctx, { id: ID, location: 'Shah Alam', status: 'closed' } as never, NOW);
    expect(result).toMatchObject({ ok: true, data: { location: 'Shah Alam', status: 'open' } });
    expect(rows[0].title).toBe('Barista');
  });
  it('checks a new minimum against the stored maximum', async () => {
    const { ctx, writes } = fake([job({ salary_min_cents: 200_000, salary_max_cents: 300_000 })]);
    const result = await updateJob(ctx, { id: ID, salary_min_cents: 350_000 }, NOW);
    expect(result).toEqual({ ok: false, error: 'Maximum salary can\'t be lower than the minimum.' });
    expect(writes).toHaveLength(0);
    const lowered = await updateJob(ctx, { id: ID, salary_max_cents: 150_000 }, NOW);
    expect(lowered).toEqual({ ok: false, error: 'Maximum salary can\'t be lower than the minimum.' });
    expect(writes).toHaveLength(0);
  });
  it('will not clear the description of an open or paused job, but will for a draft or closed one', async () => {
    for (const status of ['open', 'paused'] as const) {
      const { ctx } = fake([job({ status, description: 'Make coffee.' })]);
      expect(await updateJob(ctx, { id: ID, description: '   ' }, NOW)).toEqual({ ok: false, error: JOB_LIVE_NEEDS_DESCRIPTION });
    }
    for (const status of ['draft', 'closed'] as const) {
      const { ctx } = fake([job({ status, description: 'Make coffee.' })]);
      expect(await updateJob(ctx, { id: ID, description: '' }, NOW)).toMatchObject({ ok: true, data: { description: null } });
    }
  });
  it('lets an open job with no stored description be edited without touching the description', async () => {
    const { ctx } = fake([job({ status: 'open', description: null })]);
    expect(await updateJob(ctx, { id: ID, location: 'Shah Alam' }, NOW)).toMatchObject({ ok: true, data: { location: 'Shah Alam' } });
  });
  it('checks the closing date only when it changes', async () => {
    const { ctx } = fake([job({ closes_on: '2026-10-01' })]);
    expect(await updateJob(ctx, { id: ID, closes_on: '2026-10-01', title: 'New title' }, NOW)).toMatchObject({ ok: true, data: { title: 'New title' } });
    expect((await updateJob(ctx, { id: ID, closes_on: '2026-10-05' }, NOW)).ok).toBe(false);
  });
  it('refuses changing the closing date to one that does not exist', async () => {
    const { ctx, writes } = fake([job({ closes_on: '2026-10-31' })]);
    expect(await updateJob(ctx, { id: ID, closes_on: '2026-11-31' }, NOW)).toEqual({ ok: false, error: 'Use a real date, like 2026-10-31.' });
    expect(writes).toHaveLength(0);
    expect(await updateJob(ctx, { id: ID, closes_on: '2026-11-30' }, NOW)).toMatchObject({ ok: true, data: { closes_on: '2026-11-30' } });
  });
  it('reports a failed lookup as a generic failure and writes nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, writes } = fake([job()], {}, true);
    expect(await updateJob(ctx, { id: ID, title: 'X' }, NOW)).toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(log).toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    log.mockRestore();
  });
  it('cannot find a job in another workspace', async () => {
    const { ctx, writes } = fake([job({ org_id: OTHER_ORG })]);
    expect(await updateJob(ctx, { id: ID, title: 'Mine now' }, NOW)).toEqual({ ok: false, error: JOB_NOT_FOUND });
    expect(writes).toHaveLength(0);
  });
});

describe('setJobStatus', () => {
  const move = async (from: Job['status'], to: 'open' | 'paused' | 'closed', over: Partial<Job> = {}) => {
    const state = fake([job({ status: from, description: 'Make coffee.', ...over })]);
    return { result: await setJobStatus(state.ctx, { id: ID, status: to }, NOW), ...state };
  };
  it('allows exactly the listed moves', async () => {
    const allowed: [Job['status'], 'open' | 'paused' | 'closed'][] = [
      ['draft', 'open'], ['open', 'paused'], ['open', 'closed'], ['paused', 'open'], ['paused', 'closed'], ['closed', 'open'],
    ];
    for (const [from, to] of allowed) expect((await move(from, to)).result.ok, `${from}->${to}`).toBe(true);
    const refused: [Job['status'], 'open' | 'paused' | 'closed'][] = [['draft', 'paused'], ['draft', 'closed'], ['closed', 'paused']];
    for (const [from, to] of refused) {
      const { result, writes } = await move(from, to);
      expect(result.ok, `${from}->${to}`).toBe(false);
      expect(writes).toHaveLength(0);
    }
  });
  it('will not open a job with no description', async () => {
    const { result, writes } = await move('draft', 'open', { description: '  ' });
    expect(result).toEqual({ ok: false, error: JOB_NEEDS_DESCRIPTION });
    expect(writes).toHaveLength(0);
  });
  it('sets opened_at once, sets closed_at on close and clears it on reopen', async () => {
    const first = await move('draft', 'open');
    expect(first.rows[0].opened_at).toBe(NOW.toISOString());
    const reopened = await move('closed', 'open', { opened_at: '2026-09-01T00:00:00.000Z', closed_at: '2026-10-01T00:00:00.000Z' });
    expect(reopened.rows[0].opened_at).toBe('2026-09-01T00:00:00.000Z');
    expect(reopened.rows[0].closed_at).toBeNull();
    const closed = await move('open', 'closed');
    expect(closed.rows[0].closed_at).toBe(NOW.toISOString());
  });
  it('succeeds without writing when the job already has that status', async () => {
    const { result, writes } = await move('open', 'open');
    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(0);
  });
  it('cannot find a job in another workspace', async () => {
    const { ctx, writes } = fake([job({ org_id: OTHER_ORG, description: 'x' })]);
    expect(await setJobStatus(ctx, { id: ID, status: 'open' }, NOW)).toEqual({ ok: false, error: JOB_NOT_FOUND });
    expect(writes).toHaveLength(0);
  });
  it('reports a failed lookup as a generic failure and writes nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, writes } = fake([job({ description: 'x' })], {}, true);
    expect(await setJobStatus(ctx, { id: ID, status: 'open' }, NOW)).toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(log).toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    log.mockRestore();
  });
});

describe('deleteJob', () => {
  it('deletes a job with no applications and says which', async () => {
    const { ctx, rows } = fake([job()]);
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: true, data: { id: ID, title: 'Barista' } });
    expect(rows).toHaveLength(0);
  });
  it('refuses a job with applications', async () => {
    const { ctx, rows } = fake([job()], { [ID]: 3 });
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: false, error: JOB_HAS_APPLICATIONS });
    expect(rows).toHaveLength(1);
  });
  it('cannot find a job in another workspace', async () => {
    const { ctx, rows } = fake([job({ org_id: OTHER_ORG })]);
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: false, error: JOB_NOT_FOUND });
    expect(rows).toHaveLength(1);
  });
});

describe('deleteJob lookup failure', () => {
  it('reports a failed lookup as a generic failure and deletes nothing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, rows, writes } = fake([job()], {}, true);
    expect(await deleteJob(ctx, { id: ID })).toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(log).toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(rows).toHaveLength(1);
    log.mockRestore();
  });
});

/** A stand-in for `orgs` (slug lookup) and `hire_settings` (update, then insert). */
function fakeSettings(opts: {
  slug?: string | null;
  existing?: Record<string, unknown> | null;
  insertError?: { code?: string; message: string } | null;
  updateError?: { message: string } | null;
  /** rows the update returns, per call, overriding `existing` (for the raced insert) */
  updateResults?: (Record<string, unknown> | null)[];
} = {}) {
  const calls: { table: string; op: string; values?: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  let updateCount = 0;
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op = 'select';
      let values: Record<string, unknown> | undefined;
      const record = () => calls.push({ table, op, values, filters: { ...filters } });
      const chain = {
        select: () => chain,
        insert: (v: Record<string, unknown>) => { op = 'insert'; values = v; return chain; },
        update: (v: Record<string, unknown>) => { op = 'update'; values = v; return chain; },
        eq: (k: string, v: unknown) => { filters[k] = v; return chain; },
        maybeSingle: async () => {
          record();
          if (table === 'orgs') return { data: opts.slug === undefined ? null : { slug: opts.slug }, error: null };
          if (op === 'update') {
            if (opts.updateError) return { data: null, error: opts.updateError };
            // The real call selects only the settings columns, so updated_at is not returned.
            const patch = { ...values };
            delete patch.updated_at;
            const next = opts.updateResults ? (opts.updateResults[updateCount++] ?? null) : opts.existing ? { ...opts.existing, ...patch } : null;
            return { data: next, error: null };
          }
          return { data: opts.existing ?? null, error: null };
        },
        single: async () => {
          record();
          if (opts.insertError) return { data: null, error: opts.insertError };
          return { data: { ...values }, error: null };
        },
      };
      return chain;
    },
  };
  const ctx = { client: client as never, orgId: ORG } satisfies HireWriteContext;
  const writes = () => calls.filter((c) => c.table === 'hire_settings' && (c.op === 'update' || c.op === 'insert'));
  return { ctx, calls, writes };
}

describe('updateCareersPage', () => {
  it('1: updates the existing row with the sent fields and updated_at, filtered by the workspace', async () => {
    const { ctx, writes } = fakeSettings({ slug: 'acme', existing: { org_id: ORG, careers_enabled: false, careers_headline: null, careers_tagline: null } });
    const result = await updateCareersPage(ctx, { careers_enabled: true, careers_headline: 'Hi' }, NOW);
    expect(writes()).toEqual([{
      table: 'hire_settings', op: 'update',
      values: { careers_enabled: true, careers_headline: 'Hi', updated_at: NOW.toISOString() },
      filters: { org_id: ORG },
    }]);
    expect(result).toEqual({ ok: true, data: { org_id: ORG, careers_enabled: true, careers_headline: 'Hi', careers_tagline: null } });
  });
  it('2: inserts when there is no row yet, always with the workspace from the session', async () => {
    const { ctx, writes } = fakeSettings({ slug: 'acme', existing: null });
    const result = await updateCareersPage(ctx, { careers_enabled: true, org_id: 'evil' } as never, NOW);
    const inserts = writes().filter((w) => w.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual({ careers_enabled: true, org_id: ORG });
    expect(result).toMatchObject({ ok: true, data: { org_id: ORG, careers_enabled: true } });
  });
  it('3: when the insert loses a race (23505), updates the row that now exists', async () => {
    const { ctx, writes } = fakeSettings({
      slug: 'acme',
      insertError: { code: '23505', message: 'duplicate key' },
      updateResults: [null, { org_id: ORG, careers_enabled: true, careers_headline: null, careers_tagline: null }],
    });
    const result = await updateCareersPage(ctx, { careers_enabled: true }, NOW);
    expect(writes().map((w) => w.op)).toEqual(['update', 'insert', 'update']);
    expect(result).toEqual({ ok: true, data: { org_id: ORG, careers_enabled: true, careers_headline: null, careers_tagline: null } });
  });
  it('4: stores a blank headline or tagline as null, and leaves out a field that was not sent', async () => {
    const { ctx, writes } = fakeSettings({ slug: 'acme', existing: { org_id: ORG } });
    await updateCareersPage(ctx, { careers_headline: '   ', careers_tagline: '' }, NOW);
    expect(writes()[0].values).toEqual({ careers_headline: null, careers_tagline: null, updated_at: NOW.toISOString() });
    expect(writes()[0].values).not.toHaveProperty('careers_enabled');
  });
  it('5: refuses a headline over 80 characters and a tagline over 160, and writes nothing', async () => {
    const { ctx, writes } = fakeSettings({ slug: 'acme', existing: { org_id: ORG } });
    expect(await updateCareersPage(ctx, { careers_headline: 'x'.repeat(81) }, NOW))
      .toEqual({ ok: false, error: 'Keep the headline under 80 characters.' });
    expect(await updateCareersPage(ctx, { careers_tagline: 'x'.repeat(161) }, NOW))
      .toEqual({ ok: false, error: 'Keep the tagline under 160 characters.' });
    expect(writes()).toHaveLength(0);
    expect((await updateCareersPage(ctx, { careers_headline: 'x'.repeat(80), careers_tagline: 'y'.repeat(160) }, NOW)).ok).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it('6: writes nothing when nothing is sent, and returns the current settings or the defaults', async () => {
    const current = fakeSettings({ existing: { org_id: ORG, careers_enabled: true, careers_headline: 'Hi', careers_tagline: null } });
    expect(await updateCareersPage(current.ctx, {}, NOW)).toEqual({
      ok: true, data: { org_id: ORG, careers_enabled: true, careers_headline: 'Hi', careers_tagline: null },
    });
    expect(current.writes()).toHaveLength(0);
    const none = fakeSettings({ existing: null });
    expect(await updateCareersPage(none.ctx, {}, NOW)).toEqual({
      ok: true, data: { org_id: ORG, careers_enabled: false, careers_headline: null, careers_tagline: null },
    });
    expect(none.writes()).toHaveLength(0);
  });
  it('7: refuses to switch the board on in the demo workspace, but not to switch it off or edit text', async () => {
    const on = fakeSettings({ slug: 'rimba-ventures-demo', existing: { org_id: ORG } });
    expect(await updateCareersPage(on.ctx, { careers_enabled: true }, NOW)).toEqual({ ok: false, error: CAREERS_DEMO });
    expect(on.writes()).toHaveLength(0);
    const off = fakeSettings({ slug: 'rimba-ventures-demo', existing: { org_id: ORG, careers_enabled: true } });
    expect((await updateCareersPage(off.ctx, { careers_enabled: false }, NOW)).ok).toBe(true);
    expect(off.writes()).toHaveLength(1);
    const text = fakeSettings({ slug: 'rimba-ventures-demo', existing: { org_id: ORG } });
    expect((await updateCareersPage(text.ctx, { careers_headline: 'Join us' }, NOW)).ok).toBe(true);
    expect(text.writes()).toHaveLength(1);
  });
  it('7b: does not switch the board on when the workspace cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // No slug given: the orgs read comes back with no row.
    const unknown = fakeSettings({ existing: { org_id: ORG } });
    expect(await updateCareersPage(unknown.ctx, { careers_enabled: true }, NOW))
      .toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(unknown.writes()).toHaveLength(0);
    log.mockRestore();
  });
  it('8: a database error on the write gives the generic line and logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx } = fakeSettings({ slug: 'acme', updateError: { message: 'permission denied for table hire_settings' } });
    expect(await updateCareersPage(ctx, { careers_headline: 'Hi' }, NOW))
      .toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('input schemas', () => {
  it('convert to JSON Schema, so they can be tool input schemas', () => {
    for (const schema of [createJobInput, updateJobInput, setJobStatusInput, deleteJobInput, updateCareersPageInput]) {
      expect(z.toJSONSchema(schema)).toMatchObject({ type: 'object' });
    }
  });
});

describe('database failures', () => {
  it('logs the error and gives a generic line', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'permission denied for table hire_jobs' } }) }) }) }),
    };
    const result = await createJob({ client: broken as never, orgId: ORG }, { title: 'Barista' }, NOW);
    expect(result).toEqual({ ok: false, error: 'That change could not be saved. Please try again.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
