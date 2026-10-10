/**
 * The single write path for Jebat reach data. Each mutation is one Zod schema +
 * one async function; the AI tool's inputSchema IS the schema and the UI server
 * action parses with it, so the two surfaces cannot diverge. org_id always comes
 * from the ReachWriteContext (the caller's session), never from the input.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Campaign } from './types';

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

export async function createCampaign(
  ctx: ReachWriteContext,
  input: z.infer<typeof createCampaignInput>,
): Promise<CapResult<Campaign>> {
  const { data, error } = await ctx.client
    .from('campaigns')
    .insert({ ...input, org_id: ctx.orgId })
    .select('id,name,channel,status,leads_count,spend_cents,cpl_cents,created_at')
    .single();
  if (error || !data) return { ok: false, error: WRITE_FAILED };
  return { ok: true, data: data as Campaign };
}

export async function updateCampaign(
  ctx: ReachWriteContext,
  input: z.infer<typeof updateCampaignInput>,
): Promise<CapResult<Campaign>> {
  const { id, ...fields } = input;
  const { data, error } = await ctx.client
    .from('campaigns')
    .update(fields)
    .eq('id', id)
    .eq('org_id', ctx.orgId)
    .select('id,name,channel,status,leads_count,spend_cents,cpl_cents,created_at')
    .maybeSingle();
  if (error) return { ok: false, error: WRITE_FAILED };
  if (!data) return { ok: false, error: 'That campaign was not found.' };
  return { ok: true, data: data as Campaign };
}

export async function setCampaignStatus(
  ctx: ReachWriteContext,
  input: z.infer<typeof setCampaignStatusInput>,
): Promise<CapResult<Campaign>> {
  return updateCampaign(ctx, { id: input.id, status: input.status });
}

export async function deleteCampaign(
  ctx: ReachWriteContext,
  input: z.infer<typeof deleteCampaignInput>,
): Promise<CapResult<{ id: string }>> {
  const { data, error } = await ctx.client
    .from('campaigns')
    .delete()
    .eq('id', input.id)
    .eq('org_id', ctx.orgId)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, error: WRITE_FAILED };
  if (!data) return { ok: false, error: 'That campaign was not found.' };
  return { ok: true, data: { id: data.id } };
}
