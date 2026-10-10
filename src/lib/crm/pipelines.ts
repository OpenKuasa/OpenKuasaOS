import type { SupabaseClient } from '@supabase/supabase-js';

/** A column of the Deals board. */
export type CrmPipelineStage = {
  id: string;
  name: string;
  position: number;
  /** How likely a deal in this stage is to close, 0 to 100. */
  probability: number;
  /** The Tailwind class of the dot beside the stage's name. */
  dot: string;
};

export type CrmPipeline = {
  id: string;
  name: string;
  isDefault: boolean;
  /** In `position` order. */
  stages: CrmPipelineStage[];
};

type CrmPipelineRow = {
  id: string;
  name: string;
  is_default: boolean;
};

type CrmStageRow = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability_percent: number;
};

/** The pipeline a workspace starts with. */
export const DEFAULT_PIPELINE_NAME = 'Sales pipeline';

/** Its stages, in board order. */
export const DEFAULT_STAGES: { name: string; probability: number }[] = [
  { name: 'Lead', probability: 10 },
  { name: 'Qualified', probability: 30 },
  { name: 'Proposal', probability: 50 },
  { name: 'Negotiation', probability: 70 },
  { name: 'Won', probability: 100 },
];

/** Postgres unique violation: another request created the same row first. */
const UNIQUE_VIOLATION = '23505';

const STAGE_DOTS: Record<string, string> = {
  lead: 'bg-primary',
  qualified: 'bg-blue-500',
  proposal: 'bg-slate-500',
  negotiation: 'bg-amber-500',
  won: 'bg-emerald-500',
  lost: 'bg-red-500',
};

export function stageDot(name: string) {
  const key = name.trim().toLowerCase().replace(/\s+/g, '_');
  return STAGE_DOTS[key] ?? 'bg-slate-500';
}

/** A deal moved into the stage called "Won" (any capitals) counts as won. */
export function isWonStage(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase() === 'won';
}

function errorCode(error: unknown) {
  return (error as { code?: string } | null)?.code;
}

/**
 * A workspace's pipelines with their stages. The default pipeline comes
 * first, then the others oldest first.
 */
export async function listCrmPipelines(
  client: SupabaseClient,
  orgId: string,
): Promise<CrmPipeline[]> {
  // Fetched together: each trip to the database costs about the same.
  const [pipelines, stages] = await Promise.all([
    client
      .from('crm_pipelines')
      .select('id,name,is_default')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
    client
      .from('crm_pipeline_stages')
      .select('id,pipeline_id,name,position,probability_percent')
      .eq('org_id', orgId)
      .order('position', { ascending: true }),
  ]);

  if (pipelines.error) throw pipelines.error;
  if (stages.error) throw stages.error;

  const byPipeline = new Map<string, CrmPipelineStage[]>();
  for (const row of (stages.data ?? []) as unknown as CrmStageRow[]) {
    const list = byPipeline.get(row.pipeline_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      position: row.position,
      probability: row.probability_percent,
      dot: stageDot(row.name),
    });
    byPipeline.set(row.pipeline_id, list);
  }

  const rows = (pipelines.data ?? []) as unknown as CrmPipelineRow[];
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      isDefault: row.is_default,
      stages: byPipeline.get(row.id) ?? [],
    }))
    // Array.sort is stable, so the others keep their oldest-first order.
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/**
 * True when the workspace has nothing to put deals in: no pipeline at all, or
 * only the starting pipeline left without stages by a request that stopped
 * halfway through setting it up.
 */
export function needsDefaultPipeline(pipelines: CrmPipeline[]) {
  if (pipelines.length === 0) return true;
  return pipelines.every(
    (pipeline) => pipeline.name === DEFAULT_PIPELINE_NAME && pipeline.stages.length === 0,
  );
}

/**
 * Creates the starting pipeline and its stages, for a workspace that has
 * none. Safe to run twice at once (two tabs): whatever the other request
 * already created is left as it is. The caller reads the pipelines again
 * afterwards.
 */
export async function ensureDefaultPipeline(
  client: SupabaseClient,
  orgId: string,
): Promise<void> {
  let pipelineId: string | null = null;

  const created = await client
    .from('crm_pipelines')
    .insert({ org_id: orgId, name: DEFAULT_PIPELINE_NAME, is_default: true })
    .select('id')
    .single();

  if (created.error) {
    if (errorCode(created.error) !== UNIQUE_VIOLATION) throw created.error;
    // Another request got there first; use its pipeline.
    const existing = await client
      .from('crm_pipelines')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', DEFAULT_PIPELINE_NAME)
      .maybeSingle();
    if (existing.error) throw existing.error;
    pipelineId = (existing.data as { id: string } | null)?.id ?? null;
  } else {
    pipelineId = (created.data as { id: string }).id;
  }
  if (!pipelineId) return;

  // One statement, so the stages arrive together or not at all. A unique
  // violation means the other request has already added them.
  const stages = await client.from('crm_pipeline_stages').insert(
    DEFAULT_STAGES.map((stage, index) => ({
      org_id: orgId,
      pipeline_id: pipelineId,
      name: stage.name,
      position: index + 1,
      probability_percent: stage.probability,
    })),
  );
  if (stages.error && errorCode(stages.error) !== UNIQUE_VIOLATION) throw stages.error;
}
