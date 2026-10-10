import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDepartment,
  createDepartmentInput,
  deleteDepartment,
  updateDepartment,
} from '@/lib/people/capabilities';
import { fakeSupabase } from './setup/fake-supabase';

const ORG = 'org-1';
const DEPT = '11111111-1111-4111-8111-111111111111';
const ctxOf = (client: never) => ({ client, orgId: ORG });

afterEach(() => vi.restoreAllMocks());

describe('department schemas', () => {
  it('refuses a blank name with a message for the person typing', () => {
    const parsed = createDepartmentInput.safeParse({ name: '   ' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toBe('Give the department a name.');
  });
  it('trims the name', () => {
    expect(createDepartmentInput.parse({ name: '  Sales ' })).toEqual({ name: 'Sales' });
  });
  it('refuses a name over 80 characters', () => {
    expect(createDepartmentInput.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('createDepartment', () => {
  it('saves the name under the workspace from the context, never one from the input', async () => {
    const { client, calls } = fakeSupabase({
      'hr_departments.insert': { data: { id: DEPT, name: 'Sales', created_at: '2026-10-11T00:00:00Z' } },
    });
    const result = await createDepartment(ctxOf(client), { name: 'Sales', org_id: 'someone-else' } as never);
    expect(result).toEqual({ ok: true, data: { id: DEPT, name: 'Sales', created_at: '2026-10-11T00:00:00Z' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: 'hr_departments', op: 'insert', values: { name: 'Sales', org_id: ORG } });
  });

  it('says so when the name is taken', async () => {
    const { client } = fakeSupabase({
      'hr_departments.insert': {
        error: { code: '23505', message: 'duplicate key value violates unique constraint "hr_departments_org_name_idx"' },
      },
    });
    expect(await createDepartment(ctxOf(client), { name: 'Sales' })).toEqual({
      ok: false,
      error: 'A department with that name already exists.',
    });
  });

  it('gives a plain message for any other failure and logs no input', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeSupabase({
      'hr_departments.insert': { error: { code: '42501', message: 'permission denied for table hr_departments' } },
    });
    expect(await createDepartment(ctxOf(client), { name: 'Secret Projects' })).toEqual({
      ok: false,
      error: 'That change could not be saved. Please try again.',
    });
    expect(JSON.stringify(log.mock.calls)).toContain('42501');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Secret Projects');
  });
});

describe('updateDepartment', () => {
  it('renames within the workspace and sends only the name', async () => {
    const { client, calls } = fakeSupabase({
      'hr_departments.update': { data: { id: DEPT, name: 'Field Sales', created_at: '2026-10-11T00:00:00Z' } },
    });
    const result = await updateDepartment(ctxOf(client), { id: DEPT, name: 'Field Sales' });
    expect(result.ok).toBe(true);
    expect(calls[0]).toMatchObject({ op: 'update', values: { name: 'Field Sales' }, filters: { id: DEPT, org_id: ORG } });
    expect(Object.keys(calls[0].values as object)).toEqual(['name']);
  });

  it('says when the department is not there', async () => {
    const { client } = fakeSupabase({ 'hr_departments.update': { data: null } });
    expect(await updateDepartment(ctxOf(client), { id: DEPT, name: 'X' })).toEqual({
      ok: false,
      error: 'That department was not found.',
    });
  });

  it('says so when the new name is taken', async () => {
    const { client } = fakeSupabase({
      'hr_departments.update': {
        error: { code: '23505', message: 'duplicate key value violates unique constraint "hr_departments_org_name_idx"' },
      },
    });
    expect(await updateDepartment(ctxOf(client), { id: DEPT, name: 'Sales' })).toEqual({
      ok: false,
      error: 'A department with that name already exists.',
    });
  });
});

describe('deleteDepartment', () => {
  it('refuses while employees are still in it', async () => {
    const { client } = fakeSupabase({
      'hr_departments.delete': { error: { code: '23503', message: 'violates foreign key constraint' } },
    });
    expect(await deleteDepartment(ctxOf(client), { id: DEPT })).toEqual({
      ok: false,
      error: 'That department still has employees. Move them to another department first.',
    });
  });

  it('deletes within the workspace and hands back what it deleted', async () => {
    const { client, calls } = fakeSupabase({ 'hr_departments.delete': { data: { id: DEPT, name: 'Sales' } } });
    expect(await deleteDepartment(ctxOf(client), { id: DEPT })).toEqual({ ok: true, data: { id: DEPT, name: 'Sales' } });
    expect(calls[0].filters).toEqual({ id: DEPT, org_id: ORG });
  });

  it('says when the department is not there', async () => {
    const { client } = fakeSupabase({ 'hr_departments.delete': { data: null } });
    expect(await deleteDepartment(ctxOf(client), { id: DEPT })).toEqual({
      ok: false,
      error: 'That department was not found.',
    });
  });
});
