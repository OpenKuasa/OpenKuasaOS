import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmContactFormError } from '@/lib/crm/contacts';

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

/** Postgres foreign-key violation: deals still point at the pipeline. */
const FOREIGN_KEY_VIOLATION = '23503';

export const MAX_PIPELINE_NAME_LENGTH = 60;
export const MIN_PIPELINE_STAGES = 2;
export const MAX_PIPELINE_STAGES = 12;
export const MAX_STAGE_NAME_LENGTH = 30;

/** What the New pipeline form starts with: the stages of the starting pipeline. */
export const DEFAULT_STAGE_LIST = DEFAULT_STAGES.map((stage) => stage.name).join(', ');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_TAKEN = 'Another pipeline already uses that name.';
const PIPELINE_GONE = 'That pipeline no longer exists.';
export const LAST_PIPELINE_MESSAGE = 'A workspace needs at least one pipeline.';

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

/** A pipeline's name as typed: required, at most 60 characters. */
export function parsePipelineName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new CrmContactFormError('Enter a name for the pipeline.');
  if (name.length > MAX_PIPELINE_NAME_LENGTH) {
    throw new CrmContactFormError(
      `Keep the pipeline name to ${MAX_PIPELINE_NAME_LENGTH} characters or fewer.`,
    );
  }
  return name;
}

/**
 * The stages of a new pipeline, typed on one line with commas between them,
 * in board order. Blank entries (a comma at the end) are ignored.
 */
export function parseStageList(value: string): string[] {
  const names = value
    .split(',')
    .map((name) => name.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  if (names.length < MIN_PIPELINE_STAGES) {
    throw new CrmContactFormError('Enter at least two stages, separated by commas.');
  }
  if (names.length > MAX_PIPELINE_STAGES) {
    throw new CrmContactFormError(`A pipeline can have at most ${MAX_PIPELINE_STAGES} stages.`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.length > MAX_STAGE_NAME_LENGTH) {
      throw new CrmContactFormError(
        `Keep each stage name to ${MAX_STAGE_NAME_LENGTH} characters or fewer. "${name.slice(0, MAX_STAGE_NAME_LENGTH)}…" is too long.`,
      );
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      throw new CrmContactFormError(`Use each stage name once. "${name}" appears twice.`);
    }
    seen.add(key);
  }
  return names;
}

/**
 * The chance of closing for each of `count` stages: spread evenly, ending at
 * 100. Five stages get 20, 40, 60, 80 and 100.
 */
export function stageProbabilities(count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.round(((index + 1) / count) * 100));
}

export type CrmPipelineFields = {
  name: string;
  /** Stage names in board order. */
  stages: string[];
};

/** Reads the New pipeline form: `name`, and `stages` as one comma-separated line. */
export function parseCrmPipelineForm(formData: FormData): CrmPipelineFields {
  return {
    name: parsePipelineName(String(formData.get('name') ?? '')),
    stages: parseStageList(String(formData.get('stages') ?? '')),
  };
}

/** The id of the pipeline a rename, make-default or delete form is about. */
export function readPipelineId(formData: FormData): string {
  const id = String(formData.get('pipelineId') ?? '').trim();
  if (!UUID.test(id)) throw new CrmContactFormError('That pipeline could not be found.');
  return id;
}

/** Why a pipeline that still holds deals cannot be deleted. Pass no count when it is not known. */
export function pipelineHasDealsMessage(count?: number): string {
  if (!count) return "Move or delete this pipeline's deals first.";
  return `Move or delete this pipeline's ${count} ${count === 1 ? 'deal' : 'deals'} first.`;
}

/**
 * Adds a pipeline with its stages and returns its id. The stages go in as
 * one statement after the pipeline; if they fail, the pipeline is taken out
 * again so none is left without stages, and the stages' error is thrown.
 */
export async function createCrmPipeline(
  client: SupabaseClient,
  orgId: string,
  fields: CrmPipelineFields,
): Promise<string> {
  const created = await client
    .from('crm_pipelines')
    .insert({ org_id: orgId, name: fields.name, is_default: false })
    .select('id')
    .single();

  if (created.error) {
    if (errorCode(created.error) === UNIQUE_VIOLATION) throw new CrmContactFormError(NAME_TAKEN);
    throw created.error;
  }
  const pipelineId = (created.data as { id: string }).id;

  const probabilities = stageProbabilities(fields.stages.length);
  const stages = await client.from('crm_pipeline_stages').insert(
    fields.stages.map((name, index) => ({
      org_id: orgId,
      pipeline_id: pipelineId,
      name,
      position: index + 1,
      probability_percent: probabilities[index],
    })),
  );

  if (stages.error) {
    const cleanup = await client
      .from('crm_pipelines')
      .delete()
      .eq('id', pipelineId)
      .eq('org_id', orgId);
    if (cleanup.error) {
      // The empty pipeline stays listed, where it can be deleted by hand.
      console.error(
        '[crm/pipelines] could not remove a pipeline left without stages',
        cleanup.error,
      );
    }
    throw stages.error;
  }

  return pipelineId;
}

/** Gives a pipeline another name. */
export async function renameCrmPipeline(
  client: SupabaseClient,
  orgId: string,
  id: string,
  name: string,
  now: Date = new Date(),
): Promise<void> {
  const { data, error } = await client
    .from('crm_pipelines')
    .update({ name, updated_at: now.toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id');

  if (error) {
    if (errorCode(error) === UNIQUE_VIOLATION) throw new CrmContactFormError(NAME_TAKEN);
    throw error;
  }
  if (!data || data.length === 0) throw new CrmContactFormError(PIPELINE_GONE);
}

/**
 * Makes one pipeline the default, the one the Deals page opens on. Nothing in
 * the database keeps this to one per workspace, so it takes two updates: the
 * chosen pipeline is marked first and the others are cleared second. If the
 * second fails the workspace has two defaults for a while, never none, and
 * doing this again puts it right.
 */
export async function setDefaultCrmPipeline(
  client: SupabaseClient,
  orgId: string,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const stamp = now.toISOString();

  const marked = await client
    .from('crm_pipelines')
    .update({ is_default: true, updated_at: stamp })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id');
  if (marked.error) throw marked.error;
  if (!marked.data || marked.data.length === 0) throw new CrmContactFormError(PIPELINE_GONE);

  const cleared = await client
    .from('crm_pipelines')
    .update({ is_default: false, updated_at: stamp })
    .eq('org_id', orgId)
    .eq('is_default', true)
    .neq('id', id);
  if (cleared.error) throw cleared.error;
}

/**
 * Deletes a pipeline and, through the table's cascade, its stages. Refused
 * for the workspace's last pipeline and for one that still holds deals. When
 * the default goes, the oldest other pipeline is made the default first, so
 * the workspace is never without one; that is undone if the delete fails.
 */
export async function deleteCrmPipeline(
  client: SupabaseClient,
  orgId: string,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  const stamp = now.toISOString();

  // Fetched together: each trip to the database costs about the same.
  const [pipelines, deals] = await Promise.all([
    client
      .from('crm_pipelines')
      .select('id,is_default')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true }),
    client
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('pipeline_id', id),
  ]);
  if (pipelines.error) throw pipelines.error;
  if (deals.error) throw deals.error;

  const rows = (pipelines.data ?? []) as unknown as { id: string; is_default: boolean }[];
  const target = rows.find((row) => row.id === id);
  if (!target) throw new CrmContactFormError(PIPELINE_GONE);
  const others = rows.filter((row) => row.id !== id);
  if (others.length === 0) throw new CrmContactFormError(LAST_PIPELINE_MESSAGE);
  if ((deals.count ?? 0) > 0) {
    throw new CrmContactFormError(pipelineHasDealsMessage(deals.count ?? 0));
  }

  // Not needed when another pipeline is marked as a default already.
  const successor =
    target.is_default && !others.some((row) => row.is_default) ? others[0] : null;
  if (successor) {
    const promoted = await client
      .from('crm_pipelines')
      .update({ is_default: true, updated_at: stamp })
      .eq('id', successor.id)
      .eq('org_id', orgId);
    if (promoted.error) throw promoted.error;
  }

  const removed = await client.from('crm_pipelines').delete().eq('id', id).eq('org_id', orgId);

  if (removed.error) {
    if (successor) {
      const undone = await client
        .from('crm_pipelines')
        .update({ is_default: false, updated_at: stamp })
        .eq('id', successor.id)
        .eq('org_id', orgId);
      if (undone.error) {
        console.error('[crm/pipelines] could not undo a change of default', undone.error);
      }
    }
    // A deal was added to it after the count above.
    if (errorCode(removed.error) === FOREIGN_KEY_VIOLATION) {
      throw new CrmContactFormError(pipelineHasDealsMessage());
    }
    throw removed.error;
  }
}
