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
  createForm,
  createFormInput,
  deleteCampaign,
  deleteCampaignInput,
  deleteCreative,
  deleteCreativeInput,
  deleteForm,
  deleteFormInput,
  setCampaignStatus,
  setCampaignStatusInput,
  setFormStatus,
  setFormStatusInput,
  updateAdSettings,
  updateAdSettingsInput,
  updateCampaign,
  updateCampaignInput,
  updateCreative,
  updateCreativeInput,
  updateForm,
  updateFormInput,
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

// ─── lead forms ──────────────────────────────────────────────────────────────

/** The one screen behind both products' Lead Forms item. */
const LEAD_FORMS_PATHS = ['/reach/lead-forms', '/crm/lead-forms'];

/**
 * Same order as {@link run} (guard → parse → capability → revalidate), but a
 * rejected input answers with the schema's own message, which is written for
 * the person filling the form in, and both Lead Forms routes are refreshed.
 */
async function runForm<I, O>(
  schema: ZodType<I>,
  input: unknown,
  fn: (ctx: ReachWriteContext, parsed: I) => Promise<CapResult<O>>,
): Promise<CapResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That input was not valid.' };
  }
  const result = await fn(ctx, parsed.data);
  if (result.ok) for (const path of LEAD_FORMS_PATHS) revalidatePath(path);
  return result;
}

export async function createFormAction(input: unknown) {
  return runForm(createFormInput, input, createForm);
}
export async function updateFormAction(input: unknown) {
  return runForm(updateFormInput, input, updateForm);
}
export async function setFormStatusAction(input: unknown) {
  return runForm(setFormStatusInput, input, setFormStatus);
}
export async function deleteFormAction(input: unknown) {
  return runForm(deleteFormInput, input, deleteForm);
}
