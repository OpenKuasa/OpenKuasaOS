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
  updateApplicationForm,
  updateCareersPage,
  updateJob,
} from '@/lib/hire/capabilities';
import { careersPath } from '@/lib/hire/public-careers';
import { createClient } from '@/lib/supabase/server';

const FORBIDDEN: CapResult<never> = { ok: false, error: 'You do not have permission to make changes here.' };
/** Every screen that shows jobs, job titles or numbers worked out from them. */
const JOB_PATHS = [
  '/hire/jobs',
  '/hire/careers-page',
  '/hire/assistant',
  '/hire/dashboard',
  '/hire/applications',
  '/hire/candidates',
  '/hire/interviews',
];

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

/** The careers page is its own thing: it does not change what the job screens show. */
export async function updateCareersPageAction(input: unknown) {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const result = await updateCareersPage(ctx, input as never);
  if (result.ok) {
    revalidatePath('/hire/careers-page');
    revalidatePath('/hire/assistant');
    // The public pages render on every request, so this is not needed today. It is cheap, and it keeps the
    // board right if the pages are ever cached. A literal path takes no `type`.
    revalidatePath(careersPath(ctx.orgId));
  }
  return result;
}

/** What the apply form asks for: the Settings card, the assistant's view of it, and the public job pages that will carry the form. */
export async function updateApplicationFormAction(input: unknown) {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const result = await updateApplicationForm(ctx, input as never);
  if (result.ok) {
    revalidatePath('/hire/settings');
    revalidatePath('/hire/assistant');
    revalidatePath(careersPath(ctx.orgId));
  }
  return result;
}
