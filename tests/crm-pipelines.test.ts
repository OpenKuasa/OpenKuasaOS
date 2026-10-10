import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_PIPELINE_NAME,
  DEFAULT_STAGES,
  ensureDefaultPipeline,
  isWonStage,
  listCrmPipelines,
  needsDefaultPipeline,
  stageDot,
  type CrmPipeline,
} from '@/lib/crm/pipelines';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PIPELINE_ID = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: unknown };

/** Two reads: pipelines and stages, each ending in `.order()`. */
function createListClient(pipelines: Result, stages: Result) {
  const chain = (result: Result) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(async () => result),
    };
    return query;
  };
  const pipelinesQuery = chain(pipelines);
  const stagesQuery = chain(stages);
  const from = vi.fn((table: string) =>
    table === 'crm_pipelines' ? pipelinesQuery : stagesQuery,
  );
  return { client: { from } as unknown as SupabaseClient, from, pipelinesQuery, stagesQuery };
}

/** The writes `ensureDefaultPipeline` makes, and the re-read after a race. */
function createEnsureClient({
  created,
  existing = { data: null, error: null },
  stages = { error: null },
}: {
  created: Result;
  existing?: Result;
  stages?: { error: unknown };
}) {
  const insertPipeline = {
    select: vi.fn(() => insertPipeline),
    single: vi.fn(async () => created),
  };
  const readPipeline = {
    eq: vi.fn(() => readPipeline),
    maybeSingle: vi.fn(async () => existing),
  };
  const pipelines = {
    insert: vi.fn(() => insertPipeline),
    select: vi.fn(() => readPipeline),
  };
  const stageTable = { insert: vi.fn(async () => stages) };
  const from = vi.fn((table: string) => (table === 'crm_pipelines' ? pipelines : stageTable));
  return {
    client: { from } as unknown as SupabaseClient,
    pipelines,
    readPipeline,
    stageTable,
  };
}

const STAGE_ROWS = DEFAULT_STAGES.map((stage, index) => ({
  org_id: ORG_ID,
  pipeline_id: PIPELINE_ID,
  name: stage.name,
  position: index + 1,
  probability_percent: stage.probability,
}));

function pipeline(overrides: Partial<CrmPipeline> = {}): CrmPipeline {
  return { id: PIPELINE_ID, name: DEFAULT_PIPELINE_NAME, isDefault: true, stages: [], ...overrides };
}

describe('the starting pipeline', () => {
  test('is Sales pipeline with five stages ending in Won', () => {
    expect(DEFAULT_PIPELINE_NAME).toBe('Sales pipeline');
    expect(DEFAULT_STAGES).toEqual([
      { name: 'Lead', probability: 10 },
      { name: 'Qualified', probability: 30 },
      { name: 'Proposal', probability: 50 },
      { name: 'Negotiation', probability: 70 },
      { name: 'Won', probability: 100 },
    ]);
  });
});

describe('isWonStage', () => {
  test('matches the name Won whatever its capitals or padding', () => {
    for (const name of ['Won', 'won', 'WON', '  Won ']) expect(isWonStage(name)).toBe(true);
    for (const name of ['Closed won', 'Wonder', 'Lost', '', null, undefined]) {
      expect(isWonStage(name)).toBe(false);
    }
  });
});

describe('stageDot', () => {
  test('gives known stages their colour and others a neutral one', () => {
    expect(stageDot('Lead')).toBe('bg-primary');
    expect(stageDot(' negotiation ')).toBe('bg-amber-500');
    expect(stageDot('Won')).toBe('bg-emerald-500');
    expect(stageDot('Site visit')).toBe('bg-slate-500');
  });
});

describe('listCrmPipelines', () => {
  test('reads the org pipelines with their stages in order, default first', async () => {
    const { client, from, pipelinesQuery, stagesQuery } = createListClient(
      {
        data: [
          { id: 'p-old', name: 'Partners', is_default: false },
          { id: 'p-default', name: 'Sales pipeline', is_default: true },
          { id: 'p-new', name: 'Renewals', is_default: false },
        ],
        error: null,
      },
      {
        // Already in `position` order, as the query asks for.
        data: [
          { id: 's-1', pipeline_id: 'p-default', name: 'Lead', position: 1, probability_percent: 10 },
          { id: 's-9', pipeline_id: 'p-old', name: 'Intro', position: 1, probability_percent: 5 },
          { id: 's-2', pipeline_id: 'p-default', name: 'Won', position: 2, probability_percent: 100 },
        ],
        error: null,
      },
    );

    const pipelines = await listCrmPipelines(client, ORG_ID);

    expect(from).toHaveBeenCalledWith('crm_pipelines');
    expect(from).toHaveBeenCalledWith('crm_pipeline_stages');
    expect(pipelinesQuery.select).toHaveBeenCalledWith('id,name,is_default');
    expect(pipelinesQuery.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(pipelinesQuery.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(stagesQuery.select).toHaveBeenCalledWith(
      'id,pipeline_id,name,position,probability_percent',
    );
    expect(stagesQuery.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(stagesQuery.order).toHaveBeenCalledWith('position', { ascending: true });
    expect(pipelines).toEqual([
      {
        id: 'p-default',
        name: 'Sales pipeline',
        isDefault: true,
        stages: [
          { id: 's-1', name: 'Lead', position: 1, probability: 10, dot: 'bg-primary' },
          { id: 's-2', name: 'Won', position: 2, probability: 100, dot: 'bg-emerald-500' },
        ],
      },
      {
        id: 'p-old',
        name: 'Partners',
        isDefault: false,
        stages: [{ id: 's-9', name: 'Intro', position: 1, probability: 5, dot: 'bg-slate-500' }],
      },
      { id: 'p-new', name: 'Renewals', isDefault: false, stages: [] },
    ]);
  });

  test('returns nothing for a workspace with no pipeline', async () => {
    const { client } = createListClient({ data: [], error: null }, { data: [], error: null });

    await expect(listCrmPipelines(client, ORG_ID)).resolves.toEqual([]);
  });

  test('rethrows an error from either read', async () => {
    const failure = new Error('42P01');

    await expect(
      listCrmPipelines(
        createListClient({ data: null, error: failure }, { data: [], error: null }).client,
        ORG_ID,
      ),
    ).rejects.toBe(failure);
    await expect(
      listCrmPipelines(
        createListClient({ data: [], error: null }, { data: null, error: failure }).client,
        ORG_ID,
      ),
    ).rejects.toBe(failure);
  });
});

describe('needsDefaultPipeline', () => {
  test('is true with no pipeline, or only a half-made starting one', () => {
    expect(needsDefaultPipeline([])).toBe(true);
    expect(needsDefaultPipeline([pipeline()])).toBe(true);
  });

  test('is false once any pipeline can hold deals, or the workspace made its own', () => {
    const stage = { id: 's-1', name: 'Lead', position: 1, probability: 10, dot: 'bg-primary' };

    expect(needsDefaultPipeline([pipeline({ stages: [stage] })])).toBe(false);
    expect(needsDefaultPipeline([pipeline({ name: 'Partners', isDefault: false })])).toBe(false);
    expect(
      needsDefaultPipeline([pipeline(), pipeline({ id: 'p-2', name: 'Partners', stages: [stage] })]),
    ).toBe(false);
  });
});

describe('ensureDefaultPipeline', () => {
  test('creates the pipeline, then its five stages in order', async () => {
    const { client, pipelines, stageTable } = createEnsureClient({
      created: { data: { id: PIPELINE_ID }, error: null },
    });

    await expect(ensureDefaultPipeline(client, ORG_ID)).resolves.toBeUndefined();

    expect(pipelines.insert).toHaveBeenCalledWith({
      org_id: ORG_ID,
      name: 'Sales pipeline',
      is_default: true,
    });
    expect(pipelines.select).not.toHaveBeenCalled();
    expect(stageTable.insert).toHaveBeenCalledTimes(1);
    expect(stageTable.insert).toHaveBeenCalledWith(STAGE_ROWS);
  });

  test('uses the pipeline another request created first', async () => {
    const { client, readPipeline, stageTable } = createEnsureClient({
      created: { data: null, error: { code: '23505', message: 'duplicate key value' } },
      existing: { data: { id: PIPELINE_ID }, error: null },
    });

    await expect(ensureDefaultPipeline(client, ORG_ID)).resolves.toBeUndefined();

    expect(readPipeline.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(readPipeline.eq).toHaveBeenCalledWith('name', 'Sales pipeline');
    // Its stages are added in case that request stopped before it got to them.
    expect(stageTable.insert).toHaveBeenCalledWith(STAGE_ROWS);
  });

  test('accepts that the other request already added the stages', async () => {
    const { client } = createEnsureClient({
      created: { data: null, error: { code: '23505' } },
      existing: { data: { id: PIPELINE_ID }, error: null },
      stages: { error: { code: '23505', message: 'duplicate key value' } },
    });

    await expect(ensureDefaultPipeline(client, ORG_ID)).resolves.toBeUndefined();
  });

  test('adds no stages when the pipeline cannot be found after a race', async () => {
    const { client, stageTable } = createEnsureClient({
      created: { data: null, error: { code: '23505' } },
      existing: { data: null, error: null },
    });

    await expect(ensureDefaultPipeline(client, ORG_ID)).resolves.toBeUndefined();
    expect(stageTable.insert).not.toHaveBeenCalled();
  });

  test('rethrows any other database error', async () => {
    const denied = { code: '42501', message: 'permission denied' };

    await expect(
      ensureDefaultPipeline(createEnsureClient({ created: { data: null, error: denied } }).client, ORG_ID),
    ).rejects.toBe(denied);
    await expect(
      ensureDefaultPipeline(
        createEnsureClient({
          created: { data: null, error: { code: '23505' } },
          existing: { data: null, error: denied },
        }).client,
        ORG_ID,
      ),
    ).rejects.toBe(denied);
    await expect(
      ensureDefaultPipeline(
        createEnsureClient({
          created: { data: { id: PIPELINE_ID }, error: null },
          stages: { error: denied },
        }).client,
        ORG_ID,
      ),
    ).rejects.toBe(denied);
  });
});
