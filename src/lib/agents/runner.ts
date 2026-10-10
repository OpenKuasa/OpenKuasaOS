import type { SupabaseClient } from '@supabase/supabase-js';
import { checkVideo } from '@/lib/agents/openrouter-media';
import { decryptApiKey, hasKeySecret } from '@/lib/ai/key-crypto';
import { runWeeklyStudio } from '@/lib/agents/weekly-studio';
import { WEEKLY_STUDIO } from '@/lib/agents/types';

const CADENCE_WINDOW_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export type RunAgentsSummary = { ran: number; skipped: number; failed: number };

/**
 * Scheduled driver. `client` MUST be the service-role client. Kill-switch:
 * does nothing unless AGENTS_ENABLED is 'true'/'1'. Each due config is CLAIMED
 * with a conditional update (last_run_at null or older than the window) before
 * running, so overlapping triggers run it at most once per window. The org comes
 * from the claimed row only; the per-run cost cap (max_cost_cents) is enforced
 * inside runWeeklyStudio from that same config row. One failure never stops the loop.
 */
export async function runAgents(client: SupabaseClient): Promise<RunAgentsSummary> {
  const summary: RunAgentsSummary = { ran: 0, skipped: 0, failed: 0 };
  const flag = (process.env.AGENTS_ENABLED ?? '').trim().toLowerCase();
  if (flag !== 'true' && flag !== '1') return summary;

  const { data, error } = await client
    .from('agent_configs')
    .select('id, org_id, cadence, last_run_at')
    .eq('agent_key', WEEKLY_STUDIO)
    .eq('enabled', true)
    .neq('cadence', 'off');
  if (error || !data) return summary;

  for (const cfg of data as { id: string; org_id: string; cadence: string; last_run_at: string | null }[]) {
    const window = CADENCE_WINDOW_MS[cfg.cadence];
    if (!window) continue;
    const now = Date.now();
    if (cfg.last_run_at && now - new Date(cfg.last_run_at).getTime() < window) continue;
    try {
      const cutoff = new Date(now - window).toISOString();
      const { data: claimed, error: claimErr } = await client
        .from('agent_configs')
        .update({ last_run_at: new Date(now).toISOString() })
        .eq('id', cfg.id)
        .eq('enabled', true)
        .or(`last_run_at.is.null,last_run_at.lt.${cutoff}`)
        .select('id, org_id')
        .maybeSingle();
      if (claimErr || !claimed) {
        summary.skipped += 1;
        continue;
      }
      await runWeeklyStudio(client, claimed.org_id as string, 'schedule');
      summary.ran += 1;
    } catch {
      // Deliberately drop the exception text; the run row records its own failure.
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * A run still in 'running' after this long is treated as dead and failed. "Run now"
 * executes the whole pipeline synchronously in a server action, so a platform/proxy
 * request timeout can kill the process between the run insert and finish(), stranding
 * the row at 'running'. This also bounds the in-flight guard on manual runs
 * (runAgentNowAction): a stuck run stops blocking new ones once it is reaped.
 */
export const RUN_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Fails runs stuck in 'running' past {@link RUN_MAX_AGE_MS}. `client` MUST be the
 * service-role client. Idempotent: only status='running' rows older than the cutoff
 * are touched, so repeated sweeps are a no-op. A bulk update across orgs is correct
 * here — it is a global background sweep, scoped by status + age, not by org.
 */
export async function reapStaleRuns(client: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - RUN_MAX_AGE_MS).toISOString();
  const { error } = await client
    .from('agent_runs')
    .update({ status: 'failed', error: 'timed out', finished_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('started_at', cutoff);
  void error; // supabase-js returns { error }; a failed sweep simply retries next poll.
}

/** A video still pending after this long is given up on. */
const VIDEO_MAX_AGE_MS = 30 * 60 * 1000;

type PendingVideo = {
  id: string;
  org_id: string;
  run_id: string;
  provider_job_id: string | null;
  created_at: string;
};

/**
 * Finalizes pending video assets. `client` MUST be the service-role client.
 * Only status='pending' videos are read, and each is transitioned at most once
 * per call, so re-polling finished assets is a no-op. Never logs or stores the
 * key or any exception text.
 */
export async function pollVideos(client: SupabaseClient): Promise<void> {
  const { data, error } = await client
    .from('agent_run_assets')
    .select('id, org_id, run_id, provider_job_id, created_at')
    .eq('kind', 'video')
    .eq('status', 'pending');
  if (error || !data) return;

  const keys = new Map<string, string | null>();
  const keyFor = async (orgId: string): Promise<string | null> => {
    if (keys.has(orgId)) return keys.get(orgId) ?? null;
    const { data: row, error: keyErr } = await client
      .from('org_ai_keys')
      .select('ciphertext')
      .eq('org_id', orgId)
      .maybeSingle();
    const key =
      !keyErr && row?.ciphertext && hasKeySecret() ? decryptApiKey(row.ciphertext as string) : null;
    keys.set(orgId, key);
    return key;
  };

  const mark = async (
    asset: PendingVideo,
    patch: { status: 'done' | 'failed'; storage_path?: string },
  ) => {
    // supabase-js returns { error } rather than throwing; a failed write leaves the
    // asset pending so the next poll retries. Only pending assets may transition.
    const { error: markErr } = await client
      .from('agent_run_assets')
      .update(patch)
      .eq('id', asset.id)
      .eq('org_id', asset.org_id)
      .eq('status', 'pending');
    void markErr;
  };

  for (const asset of data as PendingVideo[]) {
    try {
      const expired = Date.now() - new Date(asset.created_at).getTime() > VIDEO_MAX_AGE_MS;
      const apiKey = await keyFor(asset.org_id);
      if (!apiKey || !asset.provider_job_id) {
        await mark(asset, { status: 'failed' });
        continue;
      }
      const check = await checkVideo(apiKey, asset.provider_job_id);
      if (check.status === 'failed') {
        await mark(asset, { status: 'failed' });
      } else if (check.status === 'done' && check.url) {
        const res = await fetch(check.url);
        if (!res.ok) throw new Error('download failed');
        const bytes = new Uint8Array(await res.arrayBuffer());
        const path = `${asset.org_id}/${asset.run_id}/video.mp4`;
        const { error: upErr } = await client.storage
          .from('agent-assets')
          .upload(path, bytes, { contentType: 'video/mp4', upsert: true });
        if (upErr) throw new Error('upload failed');
        await mark(asset, { status: 'done', storage_path: path });
      } else if (expired) {
        // Still rendering, or done without a url, past the max age: time out.
        await mark(asset, { status: 'failed' });
      }
    } catch {
      // Deliberately drop the exception: it may carry request details or a key.
      // Leave the asset pending to retry next poll; give up once it has expired.
      try {
        if (Date.now() - new Date(asset.created_at).getTime() > VIDEO_MAX_AGE_MS) {
          await mark(asset, { status: 'failed' });
        }
      } catch {
        // Next poll will retry.
      }
    }
  }
}
