// tests/hire-capabilities.test.ts
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  JOB_HAS_APPLICATIONS,
  JOB_LIVE_NEEDS_DESCRIPTION,
  JOB_NEEDS_DESCRIPTION,
  JOB_NOT_FOUND,
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

describe('input schemas', () => {
  it('convert to JSON Schema, so they can be tool input schemas', () => {
    for (const schema of [createJobInput, updateJobInput, setJobStatusInput, deleteJobInput]) {
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
