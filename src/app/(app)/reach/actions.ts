'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { can } from '@/lib/auth/permissions';
import {
  type CapResult,
  type ReachWriteContext,
  createCampaign,
  createCampaignInput,
  createCreative,
  createCreativeInput,
  deleteCampaign,
  deleteCampaignInput,
  deleteCreative,
  deleteCreativeInput,
  setCampaignStatus,
  setCampaignStatusInput,
  updateAdSettings,
  updateAdSettingsInput,
  updateCampaign,
  updateCampaignInput,
  updateCreative,
  updateCreativeInput,
} from '@/lib/reach/capabilities';
import type { ZodType } from 'zod';

const FORBIDDEN: CapResult<never> = { ok: false, error: 'You do not have permission to make changes here.' };
const INVALID: CapResult<never> = { ok: false, error: 'That input was not valid.' };

/** Resolve a write context after checking the viewer may edit data. */
async function writeCtx(): Promise<ReachWriteContext | null> {
  const viewer = await getViewer();
  if (viewer.isDemo || !can(viewer.role, 'edit-data')) return null;
  const client = await createClient();
  return { client, orgId: viewer.orgId };
}

/** Parse → guard → capability → revalidate. The screens pass a typed object. */
async function run<I, O>(
  schema: ZodType<I>,
  input: unknown,
  fn: (ctx: ReachWriteContext, parsed: I) => Promise<CapResult<O>>,
): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await fn(ctx, parsed.data);
  if (result.ok) {
    revalidatePath('/reach/ad-studio');
    revalidatePath('/reach/creative-bank');
    revalidatePath('/reach/ad-settings');
  }
  return result;
}

export async function createCampaignAction(input: unknown) {
  return run(createCampaignInput, input, createCampaign);
}
export async function updateCampaignAction(input: unknown) {
  return run(updateCampaignInput, input, updateCampaign);
}
export async function setCampaignStatusAction(input: unknown) {
  return run(setCampaignStatusInput, input, setCampaignStatus);
}
export async function deleteCampaignAction(input: unknown) {
  return run(deleteCampaignInput, input, deleteCampaign);
}
export async function createCreativeAction(input: unknown) {
  return run(createCreativeInput, input, createCreative);
}
export async function updateCreativeAction(input: unknown) {
  return run(updateCreativeInput, input, updateCreative);
}
export async function deleteCreativeAction(input: unknown) {
  return run(deleteCreativeInput, input, deleteCreative);
}

export async function updateAdSettingsAction(input: unknown) {
  return run(updateAdSettingsInput, input, updateAdSettings);
}
