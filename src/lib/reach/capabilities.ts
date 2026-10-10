/**
 * The single write path for Jebat reach data. Each mutation is one Zod schema +
 * one async function; the AI tool's inputSchema IS the schema and the UI server
 * action parses with it, so the two surfaces cannot diverge. org_id always comes
 * from the ReachWriteContext (the caller's session), never from the input.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AdSettings, Campaign, Creative } from './types';

export type ReachWriteContext = { client: SupabaseClient; orgId: string };
export type CapResult<T> = { ok: true; data: T } | { ok: false; error: string };

const channel = z.enum(['whatsapp', 'facebook', 'instagram', 'tiktok']);
const campaignStatus = z.enum(['active', 'paused']);

export const createCampaignInput = z.object({
  name: z.string().trim().min(1).max(120),
  channel,
  status: campaignStatus.default('active'),
  spend_cents: z.number().int().min(0).default(0),
  leads_count: z.number().int().min(0).default(0),
});
export const updateCampaignInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  channel: channel.optional(),
  status: campaignStatus.optional(),
  spend_cents: z.number().int().min(0).optional(),
  leads_count: z.number().int().min(0).optional(),
});
export const setCampaignStatusInput = z.object({ id: z.string().uuid(), status: campaignStatus });
export const deleteCampaignInput = z.object({ id: z.string().uuid() });

const WRITE_FAILED = 'That change could not be saved. Please try again.';

/** Logs the DB error for triage; callers only ever see the generic user-facing message. */
function writeFailed(fnName: string, error: unknown): { ok: false; error: string } {
  console.error(`[reach-capability] ${fnName} failed:`, error);
  return { ok: false, error: WRITE_FAILED };
}

export async function createCampaign(
  ctx: ReachWriteContext,
  input: z.infer<typeof createCampaignInput>,
): Promise<CapResult<Campaign>> {
  const values = createCampaignInput.parse(input);
  const { data, error } = await ctx.client
    .from('campaigns')
    .insert({ ...values, org_id: ctx.orgId })
    .select('id,name,channel,status,leads_count,spend_cents,cpl_cents,created_at')
    .single();
  if (error || !data) return writeFailed('createCampaign', error);
  return { ok: true, data: data as Campaign };
}

export async function updateCampaign(
  ctx: ReachWriteContext,
  input: z.infer<typeof updateCampaignInput>,
): Promise<CapResult<Campaign>> {
  const { id, ...fields } = updateCampaignInput.parse(input);
  if (Object.values(fields).every((v) => v === undefined)) {
    return { ok: false, error: 'Nothing to update.' };
  }
  const { data, error } = await ctx.client
    .from('campaigns')
    .update(fields)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id,name,channel,status,leads_count,spend_cents,cpl_cents,created_at')
    .maybeSingle();
  if (error) return writeFailed('updateCampaign', error);
  if (!data) return { ok: false, error: 'That campaign was not found.' };
  return { ok: true, data: data as Campaign };
}

export async function setCampaignStatus(
  ctx: ReachWriteContext,
  input: z.infer<typeof setCampaignStatusInput>,
): Promise<CapResult<Campaign>> {
  const { id, status } = setCampaignStatusInput.parse(input);
  return updateCampaign(ctx, { id, status });
}

export async function deleteCampaign(
  ctx: ReachWriteContext,
  input: z.infer<typeof deleteCampaignInput>,
): Promise<CapResult<{ id: string }>> {
  const { id } = deleteCampaignInput.parse(input);
  const { data, error } = await ctx.client
    .from('campaigns')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return writeFailed('deleteCampaign', error);
  if (!data) return { ok: false, error: 'That campaign was not found.' };
  return { ok: true, data: { id: data.id } };
}

const creativeType = z.enum(['image', 'video', 'copy']);
const creativeStatus = z.enum(['draft', 'active', 'archived']);

export const createCreativeInput = z.object({
  name: z.string().trim().min(1).max(120),
  type: creativeType,
  channel,
  status: creativeStatus.default('draft'),
  campaign_id: z.string().uuid().nullable().default(null),
  body: z.string().trim().max(2000).nullable().default(null),
  ctr: z.number().min(0).max(100).nullable().default(null),
});
export const updateCreativeInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  type: creativeType.optional(),
  channel: channel.optional(),
  status: creativeStatus.optional(),
  campaign_id: z.string().uuid().nullable().optional(),
  body: z.string().trim().max(2000).nullable().optional(),
  ctr: z.number().min(0).max(100).nullable().optional(),
});
export const deleteCreativeInput = z.object({ id: z.string().uuid() });

const CREATIVE_COLS = 'id,campaign_id,name,type,channel,status,body,ctr,created_at';

export async function createCreative(
  ctx: ReachWriteContext,
  input: z.infer<typeof createCreativeInput>,
): Promise<CapResult<Creative>> {
  const values = createCreativeInput.parse(input);
  const { data, error } = await ctx.client
    .from('creatives')
    .insert({ ...values, org_id: ctx.orgId })
    .select(CREATIVE_COLS)
    .single();
  if (error || !data) return writeFailed('createCreative', error);
  return { ok: true, data: data as Creative };
}

export async function updateCreative(
  ctx: ReachWriteContext,
  input: z.infer<typeof updateCreativeInput>,
): Promise<CapResult<Creative>> {
  const { id, ...fields } = updateCreativeInput.parse(input);
  if (Object.values(fields).every((v) => v === undefined)) {
    return { ok: false, error: 'Nothing to update.' };
  }
  const { data, error } = await ctx.client
    .from('creatives')
    .update(fields)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select(CREATIVE_COLS)
    .maybeSingle();
  if (error) return writeFailed('updateCreative', error);
  if (!data) return { ok: false, error: 'That creative was not found.' };
  return { ok: true, data: data as Creative };
}

export async function deleteCreative(
  ctx: ReachWriteContext,
  input: z.infer<typeof deleteCreativeInput>,
): Promise<CapResult<{ id: string }>> {
  const { id } = deleteCreativeInput.parse(input);
  const { data, error } = await ctx.client
    .from('creatives')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return writeFailed('deleteCreative', error);
  if (!data) return { ok: false, error: 'That creative was not found.' };
  return { ok: true, data: { id: data.id } };
}

// ─── ad settings (one row per org, upserted) ─────────────────────────────────

export const updateAdSettingsInput = z.object({
  daily_cap_cents: z.number().int().min(0).nullable().optional(),
  monthly_cap_cents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  automation: z.record(z.string(), z.boolean()).optional(),
  notifications: z.record(z.string(), z.boolean()).optional(),
});

export async function updateAdSettings(
  ctx: ReachWriteContext,
  input: z.infer<typeof updateAdSettingsInput>,
): Promise<CapResult<AdSettings>> {
  const parsed = updateAdSettingsInput.parse(input);
  const cols = 'daily_cap_cents,monthly_cap_cents,currency,automation,notifications,updated_at';
  // Update-first: an UPDATE must never SET org_id (not granted); insert only if no row exists yet.
  const upd = await ctx.client
    .from('ad_settings')
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq('org_id', ctx.orgId)
    .select(cols)
    .maybeSingle();
  if (upd.error) return writeFailed('updateAdSettings', upd.error);
  if (upd.data) return { ok: true, data: upd.data as AdSettings };
  const ins = await ctx.client
    .from('ad_settings')
    .insert({ ...parsed, org_id: ctx.orgId })
    .select(cols)
    .single();
  if (ins.error || !ins.data) return writeFailed('updateAdSettings', ins.error);
  return { ok: true, data: ins.data as AdSettings };
}
