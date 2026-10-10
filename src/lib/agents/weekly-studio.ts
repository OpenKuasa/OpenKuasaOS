import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImage, webSearch, writeDigest } from '@/lib/agents/openrouter-media';
import {
  WEEKLY_STUDIO,
  type AgentRunStatus,
  type AgentRunTrigger,
} from '@/lib/agents/types';
import { decryptApiKey, hasKeySecret } from '@/lib/ai/key-crypto';
import { createSupabaseReachData } from '@/lib/reach/supabase';
import { deriveReportsModel, type ReportsModel } from '@/lib/reach/reports';

const DEFAULT_MAX_COST_CENTS = 200;
/** Conservative per-image estimate used to gate each paid step against the cap. */
const IMAGE_ESTIMATE_CENTS = 5;

const IMAGE_STEPS: { kind: 'poster' | 'image'; prompt: (context: string) => string }[] = [
  {
    kind: 'poster',
    prompt: (c) =>
      `A clean, eye-catching promotional poster for a small business, vertical layout, bold headline area, no small text. Business snapshot:\n${c}`,
  },
  {
    kind: 'image',
    prompt: (c) =>
      `A wide hero image for a weekly marketing update, modern and warm, no text. Business snapshot:\n${c}`,
  },
];

export type WeeklyStudioResult = { runId: string; status: AgentRunStatus };

function summarize(model: ReportsModel): string {
  const f = model.funnel;
  const channels = model.topChannels
    .map((c) => `${c.channel} ${c.leads} leads (${c.conv_pct}% qualified)`)
    .join(', ');
  const a = model.appointmentStats;
  return [
    `Last 7 days: ${model.totalLeads} new leads.`,
    `Funnel: ${f.lead} lead, ${f.contacted} contacted, ${f.qualified} qualified, ${f.booked} booked, ${f.won} won.`,
    `Top channels: ${channels || 'none yet'}.`,
    `Appointments: ${a.scheduled} scheduled, ${a.completed} completed, ${a.cancelled} cancelled, ${a.no_show} no-show.`,
  ].join('\n');
}

/**
 * Runs one org's weekly digest and persists it as an agent_runs row.
 * `service` MUST be the service-role client; `orgId` is a TRUSTED argument the
 * caller has already authorized. Never logs or returns the key or ciphertext.
 */
export async function runWeeklyStudio(
  service: SupabaseClient,
  orgId: string,
  trigger: AgentRunTrigger,
): Promise<WeeklyStudioResult> {
  const { data: run, error: insertErr } = await service
    .from('agent_runs')
    .insert({ org_id: orgId, agent_key: WEEKLY_STUDIO, status: 'running', trigger })
    .select()
    .single();
  if (insertErr || !run) throw new Error('Could not start the agent run.');
  const runId = run.id as string;

  const finish = async (
    status: 'done' | 'failed',
    patch: { digest_md?: string; cost_cents?: number; error?: string },
  ): Promise<WeeklyStudioResult> => {
    await service
      .from('agent_runs')
      .update({ status, finished_at: new Date().toISOString(), ...patch })
      .eq('org_id', orgId)
      .eq('id', runId);
    return { runId, status };
  };

  try {
    const { data: keyRow, error: keyErr } = await service
      .from('org_ai_keys')
      .select('ciphertext')
      .eq('org_id', orgId)
      .maybeSingle();
    const apiKey =
      !keyErr && keyRow?.ciphertext && hasKeySecret()
        ? decryptApiKey(keyRow.ciphertext as string)
        : null;
    if (!apiKey) return await finish('failed', { error: 'no AI key' });

    const { data: capRow } = await service
      .from('agent_configs')
      .select('max_cost_cents')
      .eq('org_id', orgId)
      .eq('agent_key', WEEKLY_STUDIO)
      .maybeSingle();
    const maxCost =
      typeof capRow?.max_cost_cents === 'number' ? capRow.max_cost_cents : DEFAULT_MAX_COST_CENTS;

    const data = createSupabaseReachData(service, orgId);
    const [campaigns, leads, appts] = await Promise.all([
      data.listCampaigns(),
      data.listLeads(),
      data.listAppointments(),
    ]);
    const context = summarize(deriveReportsModel(leads, campaigns, appts, '7d', new Date()));

    const search = await webSearch(
      apiKey,
      `Find 3 timely, practical marketing angles for a small business this week. Business snapshot:\n${context}`,
    );
    const digest = await writeDigest(
      apiKey,
      `Write a short weekly digest in markdown for the business owner.\n\nBusiness snapshot:\n${context}\n\nMarket angles:\n${search.text}`,
    );

    let cost = search.cost_cents + digest.cost_cents;

    const recordAsset = async (
      kind: 'poster' | 'image',
      status: 'done' | 'failed',
      storage_path: string | null,
    ) => {
      try {
        await service
          .from('agent_run_assets')
          .insert({ org_id: orgId, run_id: runId, kind, status, storage_path });
      } catch {
        // Asset bookkeeping must never abort the run.
      }
    };

    for (const step of IMAGE_STEPS) {
      // Gate each paid step: stop before anything that could exceed the cap.
      if (cost + IMAGE_ESTIMATE_CENTS > maxCost) break;
      const path = `${orgId}/${runId}/${step.kind}.png`;
      try {
        const img = await generateImage(apiKey, step.prompt(context));
        cost += img.cost_cents;
        const { error: upErr } = await service.storage
          .from('agent-assets')
          .upload(path, img.bytes, { contentType: img.contentType, upsert: true });
        if (upErr) throw new Error('upload failed');
        await recordAsset(step.kind, 'done', path);
      } catch {
        // Deliberately drop the exception: it may carry request details or a key.
        await recordAsset(step.kind, 'failed', null);
      }
    }

    return await finish('done', { digest_md: digest.text, cost_cents: cost });
  } catch {
    // Deliberately drop the exception: it may carry request details or a key.
    return finish('failed', { error: 'digest failed' });
  }
}
