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

const STAGE_NAME_TAKEN = 'Another stage in this pipeline already uses that name.';
export const STAGE_GONE = 'That stage no longer exists.';
const STAGES_CHANGED = 'The stages changed while this was saving. Check them and try again.';
const STAGE_ADDED_OUT_OF_PLACE =
  'The stage was added, but the order may not be right. Check it and move the stage if needed.';
export const MIN_STAGES_MESSAGE = 'A pipeline needs at least two stages.';
export const MAX_STAGES_MESSAGE = `A pipeline can have at most ${MAX_PIPELINE_STAGES} stages.`;
export const STAGE_PROBABILITY_MESSAGE = 'Enter the win chance as a whole number from 0 to 100.';

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
  { fresh = false }: { fresh?: boolean } = {},
): Promise<CrmPipeline[]> {
  let pipelinesQuery = client
    .from('crm_pipelines')
    .select('id,name,is_default')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  let stagesQuery = client
    .from('crm_pipeline_stages')
    .select('id,pipeline_id,name,position,probability_percent')
    .eq('org_id', orgId)
    .order('position', { ascending: true });

  // While a page renders, the framework answers a repeated identical read
  // from the first one's result. A read made after a write in that same
  // render must opt out, or it gets the answer from before the write. Passing
  // an abort signal is the documented way to opt out.
  if (fresh) {
    const { signal } = new AbortController();
    pipelinesQuery = pipelinesQuery.abortSignal(signal);
    stagesQuery = stagesQuery.abortSignal(signal);
  }

  // Fetched together: each trip to the database costs about the same.
  const [pipelines, stages] = await Promise.all([pipelinesQuery, stagesQuery]);

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
    throw new CrmContactFormError(MAX_STAGES_MESSAGE);
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
 * The chance of closing for each of the `count` stages of a new pipeline:
 * spread evenly, ending at 100. Five stages get 20, 40, 60, 80 and 100.
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

/** One stage's name as typed: required, at most 30 characters. */
export function parseStageName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new CrmContactFormError('Enter a name for the stage.');
  if (name.length > MAX_STAGE_NAME_LENGTH) {
    throw new CrmContactFormError(
      `Keep the stage name to ${MAX_STAGE_NAME_LENGTH} characters or fewer.`,
    );
  }
  return name;
}

/** A stage's win chance as typed: a whole number from 0 to 100. */
export function parseStageProbability(value: string): number {
  const typed = value.trim();
  // Digits only: no sign, no decimal point, and not blank.
  if (!/^\d{1,3}$/.test(typed)) throw new CrmContactFormError(STAGE_PROBABILITY_MESSAGE);
  const probability = Number(typed);
  if (probability > 100) throw new CrmContactFormError(STAGE_PROBABILITY_MESSAGE);
  return probability;
}

/**
 * The win chance a new stage starts with: halfway between the stage before it
 * and the stage after it. With none after it, halfway to 100; with none
 * before it, half of the next one's.
 */
export function newStageProbability(before?: number, after?: number): number {
  const midpoint = Math.round(((before ?? 0) + (after ?? 100)) / 2);
  return Math.min(100, Math.max(0, midpoint));
}

export type CrmStageDirection = 'up' | 'down';

/** Which way a Move up or Move down form is asking for. */
export function readStageDirection(formData: FormData): CrmStageDirection {
  const direction = String(formData.get('direction') ?? '');
  if (direction !== 'up' && direction !== 'down') {
    throw new CrmContactFormError('Choose whether to move the stage up or down.');
  }
  return direction;
}

/** Why a stage that still holds deals cannot be removed. Pass no count when it is not known. */
export function stageHasDealsMessage(count?: number): string {
  if (!count) return "Move or delete this stage's deals first.";
  return `Move or delete this stage's ${count} ${count === 1 ? 'deal' : 'deals'} first.`;
}

type StageOrderRow = Pick<CrmStageRow, 'id' | 'name' | 'position' | 'probability_percent'>;

/** What every stage write is scoped by, and the time it is stamped with. */
type StageScope = { client: SupabaseClient; orgId: string; pipelineId: string; stamp: string };

/** A pipeline's stages as stored, in board order. */
async function readStageRows(
  client: SupabaseClient,
  orgId: string,
  pipelineId: string,
): Promise<StageOrderRow[]> {
  const { data, error } = await client
    .from('crm_pipeline_stages')
    .select('id,name,position,probability_percent')
    .eq('org_id', orgId)
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StageOrderRow[];
}

function sameStageName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Changes one stage. A stage deleted meanwhile matches no row. */
async function patchStage(
  { client, orgId, pipelineId, stamp }: StageScope,
  id: string,
  patch: { name?: string; position?: number; probability_percent?: number },
): Promise<void> {
  const { data, error } = await client
    .from('crm_pipeline_stages')
    .update({ ...patch, updated_at: stamp })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('pipeline_id', pipelineId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CrmContactFormError(STAGE_GONE);
}

/**
 * Puts a pipeline's stages in the order given: positions 1, 2, 3… and nothing
 * else. A stage's probability belongs to the stage and is never written
 * here. `ordered` holds the rows as they are stored now, in the order wanted.
 *
 * Each write is its own statement with no transaction around them, and the
 * table allows one stage per position, checked row by row. Writing final
 * positions directly would collide (swapping 2 and 3 fails on the first
 * write), so the stages that have to move go in two passes:
 *
 * 1. Park. Each is moved above the highest position in use, taking the last
 *    stage first and keeping them in the order they had. Every parked
 *    position is above every one in use, so nothing collides, and at each
 *    step the stages still sort in the old order: the parked ones are the
 *    last ones, still in their order.
 * 2. Settle. Each is moved to its final position, taking the first stage
 *    first. Those positions are free: only parked
 *    stages are left above the ones already in place.
 *
 * Stages at the front that already hold their final position are not written
 * at all, so stages already numbered 1, 2, 3… in the order wanted cost nothing.
 *
 * If a write fails part-way the stages are still a valid list, read as
 * always by sorting on position. Stopped while parking, they show in the old
 * order. Stopped while settling, the settled ones come first in the new
 * order and the rest follow in the old order; for a move of one stage past
 * its neighbour that is exactly the old order or the new one, never a third.
 * Positions may be left with gaps or high numbers. Nothing reads them except
 * to sort, every function here works from a stage's place in the sorted list
 * and not its stored number, and the next change that gets through numbers
 * them 1, 2, 3… again.
 */
async function renumberStages(scope: StageScope, ordered: StageOrderRow[]): Promise<void> {
  let inPlace = 0;
  while (inPlace < ordered.length && ordered[inPlace].position === inPlace + 1) inPlace += 1;

  const moving = ordered.slice(inPlace);
  if (moving.length === 0) return;

  const highest = Math.max(...ordered.map((row) => row.position));
  const asStored = [...moving].sort((a, b) => a.position - b.position);
  for (let index = asStored.length - 1; index >= 0; index -= 1) {
    await patchStage(scope, asStored[index].id, { position: highest + index + 1 });
  }
  for (let index = inPlace; index < ordered.length; index += 1) {
    await patchStage(scope, ordered[index].id, { position: index + 1 });
  }
}

/**
 * Adds a stage to a pipeline and returns its id. It goes just before the
 * stage named "Won" when there is one, so Won stays the end of the pipeline,
 * and last otherwise. It starts with a probability halfway between its
 * neighbours there (`newStageProbability`); the other stages keep theirs.
 *
 * The stage is inserted after the last one first, where no position can
 * collide, and the stages are renumbered second. If the renumbering fails the
 * stage exists, at the end; the message says so when that is not where it
 * was meant to go.
 */
export async function addCrmPipelineStage(
  client: SupabaseClient,
  orgId: string,
  pipelineId: string,
  name: string,
  now: Date = new Date(),
): Promise<string> {
  const scope: StageScope = { client, orgId, pipelineId, stamp: now.toISOString() };
  const rows = await readStageRows(client, orgId, pipelineId);

  if (rows.length >= MAX_PIPELINE_STAGES) throw new CrmContactFormError(MAX_STAGES_MESSAGE);
  if (rows.some((row) => sameStageName(row.name, name))) {
    throw new CrmContactFormError(STAGE_NAME_TAKEN);
  }

  const wonIndex = rows.findIndex((row) => isWonStage(row.name));
  const index = wonIndex === -1 ? rows.length : wonIndex;
  const position = Math.max(0, ...rows.map((row) => row.position)) + 1;
  const probability = newStageProbability(
    rows[index - 1]?.probability_percent,
    rows[index]?.probability_percent,
  );

  const created = await client
    .from('crm_pipeline_stages')
    .insert({
      org_id: orgId,
      pipeline_id: pipelineId,
      name,
      position,
      probability_percent: probability,
    })
    .select('id')
    .single();

  if (created.error) {
    const code = errorCode(created.error);
    if (code === UNIQUE_VIOLATION) {
      // Two things are unique here. The position is taken only when someone
      // else added a stage between the read above and this insert.
      const what = String((created.error as { message?: string }).message ?? '');
      throw new CrmContactFormError(what.includes('position') ? STAGES_CHANGED : STAGE_NAME_TAKEN);
    }
    // The pipeline was deleted meanwhile.
    if (code === FOREIGN_KEY_VIOLATION) throw new CrmContactFormError(PIPELINE_GONE);
    throw created.error;
  }
  const id = (created.data as { id: string }).id;

  const stage: StageOrderRow = { id, name, position, probability_percent: probability };
  try {
    await renumberStages(scope, [...rows.slice(0, index), stage, ...rows.slice(index)]);
  } catch (error) {
    console.error('[crm/pipelines] could not renumber the stages after adding one', error);
    // With no Won stage the end is where it belongs; only the numbering has gaps.
    if (wonIndex !== -1) throw new CrmContactFormError(STAGE_ADDED_OUT_OF_PLACE);
  }
  return id;
}

export type CrmStageFields = {
  name: string;
  /** How likely a deal in the stage is to close, 0 to 100. */
  probability: number;
};

/**
 * Saves a stage's name and probability, writing whichever of the two has
 * changed and nothing when neither has. Names are unique in a pipeline
 * whatever their capitals; the database only refuses an exact match, so the
 * others are checked here first. "Won" is recognised by name (`isWonStage`),
 * so this is also how a pipeline gains or loses its Won stage; deals are not
 * touched. Probabilities are not compared across stages: they may be in any
 * order.
 */
export async function updateCrmPipelineStage(
  client: SupabaseClient,
  orgId: string,
  pipelineId: string,
  stageId: string,
  fields: CrmStageFields,
  now: Date = new Date(),
): Promise<void> {
  const scope: StageScope = { client, orgId, pipelineId, stamp: now.toISOString() };
  const rows = await readStageRows(client, orgId, pipelineId);

  const stage = rows.find((row) => row.id === stageId);
  if (!stage) throw new CrmContactFormError(STAGE_GONE);

  const patch: { name?: string; probability_percent?: number } = {};
  if (stage.name !== fields.name) {
    if (rows.some((row) => row.id !== stageId && sameStageName(row.name, fields.name))) {
      throw new CrmContactFormError(STAGE_NAME_TAKEN);
    }
    patch.name = fields.name;
  }
  if (stage.probability_percent !== fields.probability) {
    patch.probability_percent = fields.probability;
  }
  if (Object.keys(patch).length === 0) return;

  try {
    await patchStage(scope, stageId, patch);
  } catch (error) {
    if (errorCode(error) === UNIQUE_VIOLATION) throw new CrmContactFormError(STAGE_NAME_TAKEN);
    throw error;
  }
}

/**
 * Moves a stage one place earlier ('up') or later ('down') on the board. Only
 * positions change: every stage keeps its probability. Moving the first stage
 * up or the last one down changes nothing. See `renumberStages` for how the
 * positions are written and what a failure part-way leaves.
 */
export async function moveCrmPipelineStage(
  client: SupabaseClient,
  orgId: string,
  pipelineId: string,
  stageId: string,
  direction: CrmStageDirection,
  now: Date = new Date(),
): Promise<void> {
  const scope: StageScope = { client, orgId, pipelineId, stamp: now.toISOString() };
  const rows = await readStageRows(client, orgId, pipelineId);

  const from = rows.findIndex((row) => row.id === stageId);
  if (from === -1) throw new CrmContactFormError(STAGE_GONE);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= rows.length) return;

  const ordered = [...rows];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  await renumberStages(scope, ordered);
}

/**
 * Removes a stage. Refused when the pipeline would be left with fewer than
 * two, and when deals are still in the stage: they are counted first for the
 * message, and the database refuses too (a deal added after the count). The
 * stages left are then closed up, each keeping its probability; if that part
 * fails the stage is still gone, the stages still sort correctly, and the
 * next change to them finishes the job, so it is logged and not reported as
 * a failure to remove.
 */
export async function deleteCrmPipelineStage(
  client: SupabaseClient,
  orgId: string,
  pipelineId: string,
  stageId: string,
  now: Date = new Date(),
): Promise<void> {
  const scope: StageScope = { client, orgId, pipelineId, stamp: now.toISOString() };

  // Fetched together: each trip to the database costs about the same.
  const [rows, deals] = await Promise.all([
    readStageRows(client, orgId, pipelineId),
    client
      .from('crm_deals')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('stage_id', stageId),
  ]);
  if (deals.error) throw deals.error;

  if (!rows.some((row) => row.id === stageId)) throw new CrmContactFormError(STAGE_GONE);
  if (rows.length <= MIN_PIPELINE_STAGES) throw new CrmContactFormError(MIN_STAGES_MESSAGE);
  if ((deals.count ?? 0) > 0) {
    throw new CrmContactFormError(stageHasDealsMessage(deals.count ?? 0));
  }

  const removed = await client
    .from('crm_pipeline_stages')
    .delete()
    .eq('id', stageId)
    .eq('org_id', orgId)
    .eq('pipeline_id', pipelineId)
    .select('id');

  if (removed.error) {
    // A deal was added to it after the count above.
    if (errorCode(removed.error) === FOREIGN_KEY_VIOLATION) {
      throw new CrmContactFormError(stageHasDealsMessage());
    }
    throw removed.error;
  }
  if (!removed.data || removed.data.length === 0) throw new CrmContactFormError(STAGE_GONE);

  try {
    await renumberStages(
      scope,
      rows.filter((row) => row.id !== stageId),
    );
  } catch (error) {
    console.error('[crm/pipelines] could not renumber the stages after removing one', error);
  }
}
