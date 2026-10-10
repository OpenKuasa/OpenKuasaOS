'use server';

import { revalidatePath } from 'next/cache';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import {
  type CapResult,
  type HireWriteContext,
  createJob,
  deleteJob,
  setJobStatus,
  updateJob,
} from '@/lib/hire/capabilities';
import { createClient } from '@/lib/supabase/server';

const FORBIDDEN: CapResult<never> = { ok: false, error: 'You do not have permission to make changes here.' };
/** Every screen that shows jobs or numbers worked out from them. */
const JOB_PATHS = ['/hire/jobs', '/hire/careers-page', '/hire/assistant', '/hire/dashboard'];

/** Resolve a write context after checking the viewer may edit data. */
async function writeCtx(): Promise<HireWriteContext | null> {
  const viewer = await getViewer();
  if (viewer.isDemo || !can(viewer.role, 'edit-data')) return null;
  return { client: await createClient(), orgId: viewer.orgId };
}

/** Guard, then the capability (which parses with its own schema), then revalidate. */
async function run<O>(fn: (ctx: HireWriteContext) => Promise<CapResult<O>>): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const result = await fn(ctx);
  if (result.ok) for (const path of JOB_PATHS) revalidatePath(path);
  return result;
}

export async function createJobAction(input: unknown) {
  return run((ctx) => createJob(ctx, input as never));
}
export async function updateJobAction(input: unknown) {
  return run((ctx) => updateJob(ctx, input as never));
}
export async function setJobStatusAction(input: unknown) {
  return run((ctx) => setJobStatus(ctx, input as never));
}
export async function deleteJobAction(input: unknown) {
  return run((ctx) => deleteJob(ctx, input as never));
}
