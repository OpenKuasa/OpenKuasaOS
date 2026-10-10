import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAppointment,
  createAppointmentInput,
  deleteAppointment,
  setAppointmentStatus,
  updateAppointment,
  type ReachWriteContext,
} from '@/lib/reach/capabilities';

const ID = '3f2b8c1e-5a4d-4e7b-9c6a-1d2e3f4a5b6c';
const ORG = '00000000-0000-0000-0000-0000000000aa';

type Call = { op: string; args: unknown[] };

/** Minimal chainable fake: records every call, resolves with `result` on single()/maybeSingle(). */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['from', 'insert', 'update', 'delete', 'select', 'eq']) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  return { client: chain as unknown as SupabaseClient, calls };
}

const valid = {
  contact_name: 'Aisyah Rahim',
  kind: 'Site visit',
  scheduled_at: '2026-10-12T03:00:00.000Z',
};

describe('appointment capability schemas', () => {
  it('rejects an empty contact_name and an empty kind', () => {
    expect(createAppointmentInput.safeParse({ ...valid, contact_name: '' }).success).toBe(false);
    expect(createAppointmentInput.safeParse({ ...valid, kind: '' }).success).toBe(false);
  });
  it('rejects a non-ISO scheduled_at', () => {
    expect(createAppointmentInput.safeParse({ ...valid, scheduled_at: 'tomorrow' }).success).toBe(false);
  });
  it('accepts a past ISO scheduled_at', () => {
    expect(createAppointmentInput.safeParse({ ...valid, scheduled_at: '2001-01-01T00:00:00.000Z' }).success).toBe(true);
  });
  it('defaults status to scheduled', () => {
    expect(createAppointmentInput.parse(valid)).toMatchObject({ status: 'scheduled' });
  });
});

describe('appointment capabilities', () => {
  it('createAppointment inserts with org_id from ctx', async () => {
    const row = { id: ID, ...valid, via: null, status: 'scheduled', created_at: 'x' };
    const { client, calls } = fakeClient({ data: row, error: null });
    const ctx: ReachWriteContext = { client, orgId: ORG };
    const res = await createAppointment(ctx, valid);
    expect(res).toEqual({ ok: true, data: row });
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toMatchObject({ org_id: ORG, status: 'scheduled' });
  });

  it('updateAppointment with only an id returns Nothing to update.', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    const res = await updateAppointment({ client, orgId: ORG }, { id: ID });
    expect(res).toEqual({ ok: false, error: 'Nothing to update.' });
    expect(calls).toHaveLength(0);
  });

  it('updateAppointment reports not found when no row matches', async () => {
    const { client } = fakeClient({ data: null, error: null });
    const res = await updateAppointment({ client, orgId: ORG }, { id: ID, kind: 'Call' });
    expect(res).toEqual({ ok: false, error: 'That appointment was not found.' });
  });

  it('setAppointmentStatus round-trips through update, scoped by id and org', async () => {
    const row = { id: ID, ...valid, via: null, status: 'completed', created_at: 'x' };
    const { client, calls } = fakeClient({ data: row, error: null });
    const res = await setAppointmentStatus({ client, orgId: ORG }, { id: ID, status: 'completed' });
    expect(res).toEqual({ ok: true, data: row });
    expect(calls.find((c) => c.op === 'update')?.args[0]).toEqual({ status: 'completed' });
    const eqs = calls.filter((c) => c.op === 'eq').map((c) => c.args);
    expect(eqs).toEqual([['id', ID], ['org_id', ORG]]);
  });

  it('deleteAppointment returns the id, and not found when nothing deleted', async () => {
    const ok = fakeClient({ data: { id: ID }, error: null });
    expect(await deleteAppointment({ client: ok.client, orgId: ORG }, { id: ID })).toEqual({ ok: true, data: { id: ID } });
    const missing = fakeClient({ data: null, error: null });
    expect(await deleteAppointment({ client: missing.client, orgId: ORG }, { id: ID })).toEqual({
      ok: false,
      error: 'That appointment was not found.',
    });
  });
});
