/**
 * The single write path for Lekiu's HR data. Each change is one Zod schema and
 * one function. The Employees screen's server actions parse with the schema
 * and Lekiu's change tools use it as their `inputSchema`, so the two cannot
 * drift apart. `org_id` always comes from the {@link PeopleWriteContext} (the
 * caller's session), never from the input.
 *
 * The database allows these writes for an owner or admin only, and grants
 * UPDATE per column: an update must never carry `id`, `org_id`, `created_at`
 * or `updated_at`. When a write by an owner is refused, check their second
 * factor first: the write policy includes `mfa_ok()`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Department } from './types';

export type PeopleWriteContext = { client: SupabaseClient; orgId: string };
export type CapResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type Refusal = { ok: false; error: string };

export const WRITE_FAILED = 'That change could not be saved. Please try again.';

type DbError = { code?: string; message?: string } | null | undefined;

export const refuse = (error: string): Refusal => ({ ok: false, error });

/**
 * Logs the database's code and message, and nothing of what was typed: an
 * employee change can carry an NRIC, a bank account or a salary.
 */
export function writeFailed(fn: string, error: DbError): Refusal {
  console.error(`[people-capability] ${fn} failed:`, error?.code ?? 'no-code', error?.message ?? 'no row came back');
  return refuse(WRITE_FAILED);
}

/** True for a Postgres error of this code, optionally only when its message names `needle`. */
export const violates = (error: DbError, code: string, needle?: string): boolean =>
  error?.code === code && (!needle || (error.message ?? '').includes(needle));

const UNIQUE = '23505';
const FOREIGN_KEY = '23503';

const id = z.string().uuid();

// ---- Departments ------------------------------------------------------------

const DEPARTMENT_COLUMNS = 'id,name,created_at';
const departmentName = z
  .string()
  .trim()
  .min(1, 'Give the department a name.')
  .max(80, 'Keep the department name to 80 characters.');

export const createDepartmentInput = z.object({ name: departmentName });
export const updateDepartmentInput = z.object({
  id: id.describe('The department, by its id from listDepartments.'),
  name: departmentName,
});
export const deleteDepartmentInput = z.object({
  id: id.describe('The department, by its id from listDepartments.'),
});

const NAME_TAKEN = 'A department with that name already exists.';
const DEPARTMENT_MISSING = 'That department was not found.';

export async function createDepartment(
  ctx: PeopleWriteContext,
  input: z.infer<typeof createDepartmentInput>,
): Promise<CapResult<Department>> {
  const { name } = createDepartmentInput.parse(input);
  const { data, error } = await ctx.client
    .from('hr_departments')
    .insert({ name, org_id: ctx.orgId })
    .select(DEPARTMENT_COLUMNS)
    .single();
  if (violates(error, UNIQUE)) return refuse(NAME_TAKEN);
  if (error || !data) return writeFailed('createDepartment', error);
  return { ok: true, data: data as Department };
}

export async function updateDepartment(
  ctx: PeopleWriteContext,
  input: z.infer<typeof updateDepartmentInput>,
): Promise<CapResult<Department>> {
  const { id: departmentId, name } = updateDepartmentInput.parse(input);
  const { data, error } = await ctx.client
    .from('hr_departments')
    .update({ name })
    .eq('id', departmentId)
    .eq('org_id', ctx.orgId)
    .select(DEPARTMENT_COLUMNS)
    .maybeSingle();
  if (violates(error, UNIQUE)) return refuse(NAME_TAKEN);
  if (error) return writeFailed('updateDepartment', error);
  if (!data) return refuse(DEPARTMENT_MISSING);
  return { ok: true, data: data as Department };
}

export async function deleteDepartment(
  ctx: PeopleWriteContext,
  input: z.infer<typeof deleteDepartmentInput>,
): Promise<CapResult<{ id: string; name: string }>> {
  const { id: departmentId } = deleteDepartmentInput.parse(input);
  const { data, error } = await ctx.client
    .from('hr_departments')
    .delete()
    .eq('id', departmentId)
    .eq('org_id', ctx.orgId)
    .select('id,name')
    .maybeSingle();
  if (violates(error, FOREIGN_KEY)) {
    return refuse('That department still has employees. Move them to another department first.');
  }
  if (error) return writeFailed('deleteDepartment', error);
  if (!data) return refuse(DEPARTMENT_MISSING);
  return { ok: true, data: data as { id: string; name: string } };
}
