import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { CrmContactFormError } from '@/lib/crm/contacts';
import {
  DEFAULT_PIPELINE_NAME,
  DEFAULT_STAGE_LIST,
  DEFAULT_STAGES,
  addCrmPipelineStage,
  createCrmPipeline,
  deleteCrmPipeline,
  deleteCrmPipelineStage,
  ensureDefaultPipeline,
  isWonStage,
  listCrmPipelines,
  moveCrmPipelineStage,
  needsDefaultPipeline,
  newStageProbability,
  parseCrmPipelineForm,
  parsePipelineName,
  parseStageList,
  parseStageName,
  parseStageProbability,
  pipelineHasDealsMessage,
  readPipelineId,
  readStageDirection,
  renameCrmPipeline,
  setDefaultCrmPipeline,
  stageDot,
  stageHasDealsMessage,
  stageProbabilities,
  updateCrmPipelineStage,
  type CrmPipeline,
} from '@/lib/crm/pipelines';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PIPELINE_ID = '22222222-2222-4222-8222-222222222222';

type Result = { data: unknown; error: unknown };

/** Two reads: pipelines and stages, each ending in `.order()`, optionally `.abortSignal()`. */
function createListClient(pipelines: Result, stages: Result) {
  const chain = (result: Result) => {
    // Awaitable like a real query, and still chainable after `.order()`.
    const ordered = {
      abortSignal: vi.fn(() => ordered),
      then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => ordered),
      ordered,
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
  test('a plain read can be answered from an earlier identical read', async () => {
    const { client, pipelinesQuery, stagesQuery } = createListClient(
      { data: [], error: null },
      { data: [], error: null },
    );

    await listCrmPipelines(client, ORG_ID);

    expect(pipelinesQuery.ordered.abortSignal).not.toHaveBeenCalled();
    expect(stagesQuery.ordered.abortSignal).not.toHaveBeenCalled();
  });

  test('a fresh read opts out of that, so a read after a write sees the write', async () => {
    const { client, pipelinesQuery, stagesQuery } = createListClient(
      { data: [{ id: 'p-1', name: 'Sales pipeline', is_default: true }], error: null },
      {
        data: [{ id: 's-1', pipeline_id: 'p-1', name: 'Lead', position: 1, probability_percent: 10 }],
        error: null,
      },
    );

    const pipelines = await listCrmPipelines(client, ORG_ID, { fresh: true });

    expect(pipelinesQuery.ordered.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(stagesQuery.ordered.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].stages.map((stage) => stage.name)).toEqual(['Lead']);
  });

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

/* ---- making, renaming and deleting pipelines ---------------------- */

const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-10T08:30:00.000Z');
const STAMP = '2026-10-10T08:30:00.000Z';

type Step = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; ops: unknown[][] };

/**
 * A client that answers each `.from()` in turn with the next step. Every
 * builder method chains, and awaiting the chain gives the step's result, as
 * with the real client. `calls` records what each chain was asked to do.
 */
function createScriptedClient(steps: Step[]) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const step = steps[calls.length];
    if (!step) throw new Error(`Unexpected query on ${table}`);
    const call: Call = { table, ops: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const method of ['insert', 'update', 'delete', 'select', 'eq', 'neq', 'order', 'single']) {
      builder[method] = (...args: unknown[]) => {
        call.ops.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, count: null, ...step }).then(resolve);
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

async function expectFormError(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toBeInstanceOf(CrmContactFormError);
  await expect(promise).rejects.toThrow(message);
}

function formError(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CrmContactFormError);
    return (error as Error).message;
  }
  throw new Error('Expected a form error');
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('parsePipelineName', () => {
  test('trims the name and closes up its spaces', () => {
    expect(parsePipelineName('  Partner   deals ')).toBe('Partner deals');
    expect(parsePipelineName('x'.repeat(60))).toHaveLength(60);
  });

  test('asks for a name, and for a shorter one past 60 characters', () => {
    expect(formError(() => parsePipelineName('   '))).toBe('Enter a name for the pipeline.');
    expect(formError(() => parsePipelineName('x'.repeat(61)))).toBe(
      'Keep the pipeline name to 60 characters or fewer.',
    );
  });
});

describe('parseStageList', () => {
  test('reads the names in the order typed', () => {
    expect(DEFAULT_STAGE_LIST).toBe('Lead, Qualified, Proposal, Negotiation, Won');
    expect(parseStageList(DEFAULT_STAGE_LIST)).toEqual([
      'Lead',
      'Qualified',
      'Proposal',
      'Negotiation',
      'Won',
    ]);
    expect(parseStageList(' Site  visit ,Quote,, Won, ')).toEqual(['Site visit', 'Quote', 'Won']);
  });

  test('takes two to twelve stages', () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => `S${i + 1}`).join(',');

    expect(parseStageList('Open, Won')).toEqual(['Open', 'Won']);
    expect(parseStageList(many(12))).toHaveLength(12);
    for (const tooFew of ['', ' , ', 'Lead', 'Lead,']) {
      expect(formError(() => parseStageList(tooFew))).toBe(
        'Enter at least two stages, separated by commas.',
      );
    }
    expect(formError(() => parseStageList(many(13)))).toBe(
      'A pipeline can have at most 12 stages.',
    );
  });

  test('refuses a name over 30 characters, and names the one', () => {
    expect(parseStageList(`Lead, ${'x'.repeat(30)}`)).toHaveLength(2);
    expect(formError(() => parseStageList(`Lead, ${'x'.repeat(31)}`))).toBe(
      `Keep each stage name to 30 characters or fewer. "${'x'.repeat(30)}…" is too long.`,
    );
  });

  test('refuses a repeat, ignoring capitals', () => {
    expect(formError(() => parseStageList('Lead, Quote, lead'))).toBe(
      'Use each stage name once. "lead" appears twice.',
    );
  });
});

describe('stageProbabilities', () => {
  test('spreads evenly and ends at 100', () => {
    expect(stageProbabilities(2)).toEqual([50, 100]);
    expect(stageProbabilities(3)).toEqual([33, 67, 100]);
    expect(stageProbabilities(5)).toEqual([20, 40, 60, 80, 100]);
    expect(stageProbabilities(12)[0]).toBe(8);
    expect(stageProbabilities(12).at(-1)).toBe(100);
  });
});

describe('the pipeline forms', () => {
  test('parseCrmPipelineForm reads the name and the stages', () => {
    expect(parseCrmPipelineForm(form({ name: ' Partners ', stages: 'Intro, Won' }))).toEqual({
      name: 'Partners',
      stages: ['Intro', 'Won'],
    });
    expect(formError(() => parseCrmPipelineForm(form({ stages: 'Intro, Won' })))).toBe(
      'Enter a name for the pipeline.',
    );
    expect(formError(() => parseCrmPipelineForm(form({ name: 'Partners' })))).toBe(
      'Enter at least two stages, separated by commas.',
    );
  });

  test('readPipelineId takes only a uuid', () => {
    expect(readPipelineId(form({ pipelineId: ` ${PIPELINE_ID} ` }))).toBe(PIPELINE_ID);
    for (const bad of [{}, { pipelineId: 'sample' }, { pipelineId: `${PIPELINE_ID},x` }]) {
      expect(formError(() => readPipelineId(form(bad as Record<string, string>)))).toBe(
        'That pipeline could not be found.',
      );
    }
  });
});

describe('pipelineHasDealsMessage', () => {
  test('counts the deals when it knows how many', () => {
    expect(pipelineHasDealsMessage(3)).toBe("Move or delete this pipeline's 3 deals first.");
    expect(pipelineHasDealsMessage(1)).toBe("Move or delete this pipeline's 1 deal first.");
    expect(pipelineHasDealsMessage()).toBe("Move or delete this pipeline's deals first.");
  });
});

describe('createCrmPipeline', () => {
  const FIELDS = { name: 'Partners', stages: ['Intro', 'Quote', 'Won'] };
  const stageRow = (name: string, position: number, probability_percent: number) => ({
    org_id: ORG_ID,
    pipeline_id: PIPELINE_ID,
    name,
    position,
    probability_percent,
  });

  test('adds the pipeline, then its stages in the order given', async () => {
    const { client, calls } = createScriptedClient([{ data: { id: PIPELINE_ID } }, {}]);

    await expect(createCrmPipeline(client, ORG_ID, FIELDS)).resolves.toBe(PIPELINE_ID);

    expect(calls).toEqual([
      {
        table: 'crm_pipelines',
        ops: [
          ['insert', { org_id: ORG_ID, name: 'Partners', is_default: false }],
          ['select', 'id'],
          ['single'],
        ],
      },
      {
        table: 'crm_pipeline_stages',
        ops: [
          ['insert', [stageRow('Intro', 1, 33), stageRow('Quote', 2, 67), stageRow('Won', 3, 100)]],
        ],
      },
    ]);
  });

  test('says so when the name is taken, and adds no stages', async () => {
    const { client, calls } = createScriptedClient([{ error: { code: '23505' } }]);

    await expectFormError(
      createCrmPipeline(client, ORG_ID, FIELDS),
      'Another pipeline already uses that name.',
    );
    expect(calls).toHaveLength(1);
  });

  test('rethrows any other error from adding the pipeline', async () => {
    const denied = { code: '42501', message: 'permission denied' };
    const { client } = createScriptedClient([{ error: denied }]);

    await expect(createCrmPipeline(client, ORG_ID, FIELDS)).rejects.toBe(denied);
  });

  test('takes the pipeline out again when its stages cannot be added', async () => {
    const failure = { code: '23514', message: 'check constraint' };
    const { client, calls } = createScriptedClient([
      { data: { id: PIPELINE_ID } },
      { error: failure },
      {},
    ]);

    await expect(createCrmPipeline(client, ORG_ID, FIELDS)).rejects.toBe(failure);

    expect(calls[2]).toEqual({
      table: 'crm_pipelines',
      ops: [['delete'], ['eq', 'id', PIPELINE_ID], ['eq', 'org_id', ORG_ID]],
    });
  });

  test('still reports the stages error when the clean-up fails too', async () => {
    const failure = { code: '23514' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = createScriptedClient([
      { data: { id: PIPELINE_ID } },
      { error: failure },
      { error: { code: '42501' } },
    ]);

    await expect(createCrmPipeline(client, ORG_ID, FIELDS)).rejects.toBe(failure);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe('renameCrmPipeline', () => {
  test('renames one pipeline in one org and stamps it', async () => {
    const { client, calls } = createScriptedClient([{ data: [{ id: PIPELINE_ID }] }]);

    await expect(
      renameCrmPipeline(client, ORG_ID, PIPELINE_ID, 'Partners', NOW),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      {
        table: 'crm_pipelines',
        ops: [
          ['update', { name: 'Partners', updated_at: STAMP }],
          ['eq', 'id', PIPELINE_ID],
          ['eq', 'org_id', ORG_ID],
          ['select', 'id'],
        ],
      },
    ]);
  });

  test('says so when the name is taken or the pipeline has gone', async () => {
    await expectFormError(
      renameCrmPipeline(
        createScriptedClient([{ error: { code: '23505' } }]).client,
        ORG_ID,
        PIPELINE_ID,
        'Partners',
      ),
      'Another pipeline already uses that name.',
    );
    await expectFormError(
      renameCrmPipeline(createScriptedClient([{ data: [] }]).client, ORG_ID, PIPELINE_ID, 'Partners'),
      'That pipeline no longer exists.',
    );
  });

  test('rethrows any other database error', async () => {
    const denied = { code: '42501' };

    await expect(
      renameCrmPipeline(createScriptedClient([{ error: denied }]).client, ORG_ID, PIPELINE_ID, 'P'),
    ).rejects.toBe(denied);
  });
});

describe('setDefaultCrmPipeline', () => {
  test('marks the chosen pipeline first, then clears the others', async () => {
    const { client, calls } = createScriptedClient([{ data: [{ id: PIPELINE_ID }] }, {}]);

    await expect(
      setDefaultCrmPipeline(client, ORG_ID, PIPELINE_ID, NOW),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      {
        table: 'crm_pipelines',
        ops: [
          ['update', { is_default: true, updated_at: STAMP }],
          ['eq', 'id', PIPELINE_ID],
          ['eq', 'org_id', ORG_ID],
          ['select', 'id'],
        ],
      },
      {
        table: 'crm_pipelines',
        ops: [
          ['update', { is_default: false, updated_at: STAMP }],
          ['eq', 'org_id', ORG_ID],
          ['eq', 'is_default', true],
          ['neq', 'id', PIPELINE_ID],
        ],
      },
    ]);
  });

  test('clears nothing when the pipeline has gone, so the old default stays', async () => {
    const { client, calls } = createScriptedClient([{ data: [] }]);

    await expectFormError(
      setDefaultCrmPipeline(client, ORG_ID, PIPELINE_ID),
      'That pipeline no longer exists.',
    );
    expect(calls).toHaveLength(1);
  });

  test('rethrows an error from either update', async () => {
    const denied = { code: '42501' };

    await expect(
      setDefaultCrmPipeline(createScriptedClient([{ error: denied }]).client, ORG_ID, PIPELINE_ID),
    ).rejects.toBe(denied);
    await expect(
      setDefaultCrmPipeline(
        createScriptedClient([{ data: [{ id: PIPELINE_ID }] }, { error: denied }]).client,
        ORG_ID,
        PIPELINE_ID,
      ),
    ).rejects.toBe(denied);
  });
});

describe('deleteCrmPipeline', () => {
  const TWO = [
    { id: OTHER_ID, is_default: true },
    { id: PIPELINE_ID, is_default: false },
  ];
  const DEFAULT_AND_OTHER = [
    { id: PIPELINE_ID, is_default: true },
    { id: OTHER_ID, is_default: false },
  ];
  const DELETE_OPS = [['delete'], ['eq', 'id', PIPELINE_ID], ['eq', 'org_id', ORG_ID]];

  test('checks the workspace and the deals, then deletes within the org', async () => {
    const { client, calls } = createScriptedClient([{ data: TWO }, { count: 0 }, {}]);

    await expect(deleteCrmPipeline(client, ORG_ID, PIPELINE_ID, NOW)).resolves.toBeUndefined();

    expect(calls).toEqual([
      {
        table: 'crm_pipelines',
        ops: [
          ['select', 'id,is_default'],
          ['eq', 'org_id', ORG_ID],
          ['order', 'created_at', { ascending: true }],
        ],
      },
      {
        table: 'crm_deals',
        ops: [
          ['select', 'id', { count: 'exact', head: true }],
          ['eq', 'org_id', ORG_ID],
          ['eq', 'pipeline_id', PIPELINE_ID],
        ],
      },
      { table: 'crm_pipelines', ops: DELETE_OPS },
    ]);
  });

  test('refuses the last pipeline', async () => {
    const { client, calls } = createScriptedClient([
      { data: [{ id: PIPELINE_ID, is_default: true }] },
      { count: 0 },
    ]);

    await expectFormError(
      deleteCrmPipeline(client, ORG_ID, PIPELINE_ID),
      'A workspace needs at least one pipeline.',
    );
    expect(calls).toHaveLength(2);
  });

  test('refuses a pipeline that still has deals, and says how many', async () => {
    const { client, calls } = createScriptedClient([{ data: TWO }, { count: 3 }]);

    await expectFormError(
      deleteCrmPipeline(client, ORG_ID, PIPELINE_ID),
      "Move or delete this pipeline's 3 deals first.",
    );
    expect(calls).toHaveLength(2);

    await expectFormError(
      deleteCrmPipeline(
        createScriptedClient([{ data: TWO }, { count: 1 }]).client,
        ORG_ID,
        PIPELINE_ID,
      ),
      "Move or delete this pipeline's 1 deal first.",
    );
  });

  test('says the pipeline has gone when it is not in the org', async () => {
    await expectFormError(
      deleteCrmPipeline(
        createScriptedClient([{ data: [{ id: OTHER_ID, is_default: true }] }, { count: 0 }]).client,
        ORG_ID,
        PIPELINE_ID,
      ),
      'That pipeline no longer exists.',
    );
  });

  test('turns the foreign-key error into the same refusal', async () => {
    const { client } = createScriptedClient([
      { data: TWO },
      { count: 0 },
      { error: { code: '23503', message: 'violates foreign key constraint' } },
    ]);

    await expectFormError(
      deleteCrmPipeline(client, ORG_ID, PIPELINE_ID),
      "Move or delete this pipeline's deals first.",
    );
  });

  test('makes the oldest other pipeline the default before deleting the default', async () => {
    const { client, calls } = createScriptedClient([
      { data: [...DEFAULT_AND_OTHER, { id: 'p-newest', is_default: false }] },
      { count: 0 },
      {},
      {},
    ]);

    await expect(deleteCrmPipeline(client, ORG_ID, PIPELINE_ID, NOW)).resolves.toBeUndefined();

    expect(calls.slice(2)).toEqual([
      {
        table: 'crm_pipelines',
        ops: [
          ['update', { is_default: true, updated_at: STAMP }],
          ['eq', 'id', OTHER_ID],
          ['eq', 'org_id', ORG_ID],
        ],
      },
      { table: 'crm_pipelines', ops: DELETE_OPS },
    ]);
  });

  test('leaves the defaults alone when another pipeline is one already', async () => {
    const { client, calls } = createScriptedClient([
      {
        data: [
          { id: PIPELINE_ID, is_default: true },
          { id: OTHER_ID, is_default: true },
        ],
      },
      { count: 0 },
      {},
    ]);

    await expect(deleteCrmPipeline(client, ORG_ID, PIPELINE_ID)).resolves.toBeUndefined();
    expect(calls[2].ops).toEqual(DELETE_OPS);
  });

  test('deletes nothing when the next default cannot be set', async () => {
    const denied = { code: '42501' };
    const { client, calls } = createScriptedClient([
      { data: DEFAULT_AND_OTHER },
      { count: 0 },
      { error: denied },
    ]);

    await expect(deleteCrmPipeline(client, ORG_ID, PIPELINE_ID)).rejects.toBe(denied);
    expect(calls).toHaveLength(3);
  });

  test('gives the default back when the delete then fails', async () => {
    const { client, calls } = createScriptedClient([
      { data: DEFAULT_AND_OTHER },
      { count: 0 },
      {},
      { error: { code: '23503' } },
      {},
    ]);

    await expectFormError(
      deleteCrmPipeline(client, ORG_ID, PIPELINE_ID, NOW),
      "Move or delete this pipeline's deals first.",
    );
    expect(calls[4]).toEqual({
      table: 'crm_pipelines',
      ops: [
        ['update', { is_default: false, updated_at: STAMP }],
        ['eq', 'id', OTHER_ID],
        ['eq', 'org_id', ORG_ID],
      ],
    });
  });

  test('rethrows any other database error', async () => {
    const denied = { code: '42501' };
    const run = (steps: Step[]) =>
      deleteCrmPipeline(createScriptedClient(steps).client, ORG_ID, PIPELINE_ID);

    await expect(run([{ error: denied }, { count: 0 }])).rejects.toBe(denied);
    await expect(run([{ data: TWO }, { error: denied }])).rejects.toBe(denied);
    await expect(run([{ data: TWO }, { count: 0 }, { error: denied }])).rejects.toBe(denied);
  });
});

describe('the stage forms', () => {
  test('a stage name is trimmed, required and at most 30 characters', () => {
    expect(parseStageName('  Site   visit ')).toBe('Site visit');
    expect(parseStageName('x'.repeat(30))).toHaveLength(30);
    expect(formError(() => parseStageName('  '))).toBe('Enter a name for the stage.');
    expect(formError(() => parseStageName('x'.repeat(31)))).toBe(
      'Keep the stage name to 30 characters or fewer.',
    );
  });

  test('a win chance is a whole number from 0 to 100', () => {
    expect(parseStageProbability('0')).toBe(0);
    expect(parseStageProbability('7')).toBe(7);
    expect(parseStageProbability(' 50 ')).toBe(50);
    expect(parseStageProbability('100')).toBe(100);
    expect(parseStageProbability('007')).toBe(7);

    for (const typed of ['', '  ', '101', '-1', '2.5', '50.0', '1e1', '+5', '5%', 'half', '1000']) {
      expect(formError(() => parseStageProbability(typed))).toBe(
        'Enter the win chance as a whole number from 0 to 100.',
      );
    }
  });

  test('a new stage starts halfway between its neighbours', () => {
    expect(newStageProbability(70, 100)).toBe(85);
    expect(newStageProbability(10, 30)).toBe(20);
    // A half rounds up.
    expect(newStageProbability(30, 55)).toBe(43);
    // The neighbours need not be in order.
    expect(newStageProbability(50, 30)).toBe(40);
    // Nothing after it: halfway to 100.
    expect(newStageProbability(70)).toBe(85);
    expect(newStageProbability(100)).toBe(100);
    // Nothing before it: half of the next one's.
    expect(newStageProbability(undefined, 100)).toBe(50);
    expect(newStageProbability(undefined, 25)).toBe(13);
    // Neither, in a pipeline with no stages.
    expect(newStageProbability()).toBe(50);
    // Never outside 0 to 100, whatever is stored.
    expect(newStageProbability(140, 100)).toBe(100);
    expect(newStageProbability(-40, 10)).toBe(0);
  });

  test('a move is up or down and nothing else', () => {
    expect(readStageDirection(form({ direction: 'up' }))).toBe('up');
    expect(readStageDirection(form({ direction: 'down' }))).toBe('down');
    expect(formError(() => readStageDirection(form({ direction: 'sideways' })))).toBe(
      'Choose whether to move the stage up or down.',
    );
    expect(formError(() => readStageDirection(form({})))).toBe(
      'Choose whether to move the stage up or down.',
    );
  });

  test('says how many deals are in the way when it knows', () => {
    expect(stageHasDealsMessage(1)).toBe("Move or delete this stage's 1 deal first.");
    expect(stageHasDealsMessage(3)).toBe("Move or delete this stage's 3 deals first.");
    expect(stageHasDealsMessage()).toBe("Move or delete this stage's deals first.");
  });
});

type StoredStage = { id: string; name: string; position: number; probability_percent: number };

const stageId = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const NEW_STAGE_ID = stageId(99);

/** Stages numbered 1, 2, 3… with ids `stageId(1)`, `stageId(2)`…, and the probabilities given or the rule's. */
function storedStages(names: string[], probabilities = stageProbabilities(names.length)) {
  return names.map<StoredStage>((name, index) => ({
    id: stageId(index + 1),
    name,
    position: index + 1,
    probability_percent: probabilities[index],
  }));
}

const STAGE_NAMES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
/** The starting five with a new pipeline's even 20 to 100. */
const FIVE = storedStages(STAGE_NAMES);
const [LEAD, QUALIFIED, PROPOSAL, NEGOTIATION, WON] = FIVE.map((stage) => stage.id);

const READ_STAGES: Call = {
  table: 'crm_pipeline_stages',
  ops: [
    ['select', 'id,name,position,probability_percent'],
    ['eq', 'org_id', ORG_ID],
    ['eq', 'pipeline_id', PIPELINE_ID],
    ['order', 'position', { ascending: true }],
  ],
};

/** One write to one stage, scoped the way every stage write must be. */
function stagePatch(id: string, values: Record<string, unknown>): Call {
  return {
    table: 'crm_pipeline_stages',
    ops: [
      ['update', { ...values, updated_at: STAMP }],
      ['eq', 'id', id],
      ['eq', 'org_id', ORG_ID],
      ['eq', 'pipeline_id', PIPELINE_ID],
      ['select', 'id'],
    ],
  };
}

/** As `ensureDefaultPipeline` makes them: 10, 30, 50, 70 and 100. */
const STARTING = storedStages(
  STAGE_NAMES,
  DEFAULT_STAGES.map((stage) => stage.probability),
);

/** A stage put on its final position. Nothing else about it is written. */
const settle = (id: string, position: number) => stagePatch(id, { position });

function insertStage(name: string, position: number, probability_percent: number): Call {
  return {
    table: 'crm_pipeline_stages',
    ops: [
      ['insert', { org_id: ORG_ID, pipeline_id: PIPELINE_ID, name, position, probability_percent }],
      ['select', 'id'],
      ['single'],
    ],
  };
}

/** A write that matched its row. */
const DONE: Step = { data: [{ id: 'matched' }] };
const done = (count: number) => Array.from({ length: count }, () => DONE);

/**
 * A pipeline's stages held in memory behind the same chainable calls, with
 * no deals in them. It refuses a position already taken, as the table does,
 * and after every change of a stage notes the order the stages would be
 * shown in. `positionsOnly` says whether any update so far set a probability.
 * `failAt` makes that update (counting from 1) fail and change
 * nothing.
 */
function createStageStore(initial: StoredStage[], { failAt = 0 }: { failAt?: number } = {}) {
  const rows = initial.map((row) => ({ ...row }));
  const sorted = () => [...rows].sort((a, b) => a.position - b.position);
  const taken = (position: number, except?: StoredStage) =>
    rows.some((row) => row !== except && row.position === position);
  const orders: string[][] = [];
  const writes: Partial<StoredStage>[] = [];
  let updates = 0;

  const from = vi.fn((table: string) => {
    let kind: 'read' | 'insert' | 'update' | 'delete' = 'read';
    let values: Partial<StoredStage> = {};
    let id: string | null = null;

    const answer = (): { data?: unknown; error?: unknown; count?: number } => {
      if (table === 'crm_deals') return { count: 0 };
      if (kind === 'read') return { data: sorted().map((row) => ({ ...row })) };
      if (kind === 'insert') {
        if (taken(values.position ?? 0)) return { error: { code: '23505', message: 'position' } };
        rows.push({
          id: NEW_STAGE_ID,
          name: values.name ?? '',
          position: values.position ?? 0,
          probability_percent: values.probability_percent ?? 0,
        });
        orders.push(sorted().map((row) => row.name));
        return { data: { id: NEW_STAGE_ID } };
      }

      const row = rows.find((r) => r.id === id);
      if (kind === 'delete') {
        if (!row) return { data: [] };
        rows.splice(rows.indexOf(row), 1);
        orders.push(sorted().map((r) => r.name));
        return { data: [{ id }] };
      }

      updates += 1;
      if (updates === failAt) return { error: { code: '08006' } };
      writes.push(values);
      if (!row) return { data: [] };
      if (values.position !== undefined && taken(values.position, row)) {
        return { error: { code: '23505', message: 'position' } };
      }
      if (values.position !== undefined) row.position = values.position;
      if (values.name !== undefined) row.name = values.name;
      if (values.probability_percent !== undefined) {
        row.probability_percent = values.probability_percent;
      }
      orders.push(sorted().map((r) => r.name));
      return { data: [{ id }] };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      single: () => builder,
      insert: (row: Partial<StoredStage>) => {
        kind = 'insert';
        values = row;
        return builder;
      },
      update: (patch: Partial<StoredStage>) => {
        kind = 'update';
        values = patch;
        return builder;
      },
      delete: () => {
        kind = 'delete';
        return builder;
      },
      eq: (column: string, value: string) => {
        if (column === 'id') id = value;
        return builder;
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null, count: null, ...answer() }).then(resolve),
    };
    return builder;
  });

  const shown = () => sorted().map((row) => [row.name, row.position, row.probability_percent]);
  /** True when no update so far has set a probability. */
  const positionsOnly = () => writes.every((patch) => !('probability_percent' in patch));
  return { client: { from } as unknown as SupabaseClient, sorted, shown, orders, positionsOnly };
}

describe('addCrmPipelineStage', () => {
  test('puts the stage before Won, halfway between its neighbours, and moves only positions', async () => {
    const { client, calls } = createScriptedClient([
      { data: STARTING },
      { data: { id: NEW_STAGE_ID } },
      ...done(4),
    ]);

    await expect(
      addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Site visit', NOW),
    ).resolves.toBe(NEW_STAGE_ID);

    expect(calls).toEqual([
      READ_STAGES,
      // After the last stage, where nothing can be in the way. Between
      // Negotiation's 70 and Won's 100: 85.
      insertStage('Site visit', 6, 85),
      // Parked above every position in use, the last stage first.
      stagePatch(NEW_STAGE_ID, { position: 8 }),
      stagePatch(WON, { position: 7 }),
      settle(NEW_STAGE_ID, 5),
      settle(WON, 6),
      // The four before it are where they belong: no write.
    ]);
  });

  test('ends numbered 1 to 6 with Won last, every other percentage as it was', async () => {
    const store = createStageStore(STARTING);

    await addCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, 'Site visit', NOW);

    expect(store.shown()).toEqual([
      ['Lead', 1, 10],
      ['Qualified', 2, 30],
      ['Proposal', 3, 50],
      ['Negotiation', 4, 70],
      ['Site visit', 5, 85],
      ['Won', 6, 100],
    ]);
    expect(store.positionsOnly()).toBe(true);
    // On the way it is at the end, where it was inserted, or in its place.
    const atEnd = [...STAGE_NAMES, 'Site visit'];
    const inPlace = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Site visit', 'Won'];
    for (const order of store.orders) expect([atEnd, inPlace]).toContainEqual(order);
  });

  test('takes the midpoint of whatever its neighbours hold, rounding a half up', async () => {
    // The even spread: between 80 and 100.
    const even = createStageStore(FIVE);
    await addCrmPipelineStage(even.client, ORG_ID, PIPELINE_ID, 'Site visit', NOW);
    expect(even.shown()[4]).toEqual(['Site visit', 5, 90]);

    // Between 25 and 100 is 62.5.
    const half = createStageStore(storedStages(['Lead', 'Won'], [25, 100]));
    await addCrmPipelineStage(half.client, ORG_ID, PIPELINE_ID, 'Quote', NOW);
    expect(half.shown()).toEqual([
      ['Lead', 1, 25],
      ['Quote', 2, 63],
      ['Won', 3, 100],
    ]);

    // Percentages out of order are taken as they are.
    const mixed = createStageStore(storedStages(['Lead', 'Qualified', 'Won'], [50, 30, 20]));
    await addCrmPipelineStage(mixed.client, ORG_ID, PIPELINE_ID, 'Quote', NOW);
    expect(mixed.shown()).toEqual([
      ['Lead', 1, 50],
      ['Qualified', 2, 30],
      ['Quote', 3, 25],
      ['Won', 4, 20],
    ]);
  });

  test('finds the Won stage whatever its capitals', async () => {
    const store = createStageStore(storedStages(['Lead', 'WON']));

    await addCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, 'Quote', NOW);

    expect(store.shown()).toEqual([
      ['Lead', 1, 50],
      ['Quote', 2, 75],
      ['WON', 3, 100],
    ]);
  });

  test('goes last, halfway to 100, when the pipeline has no Won stage', async () => {
    const { client, calls } = createScriptedClient([
      { data: storedStages(['Intro', 'Quote'], [20, 60]) },
      { data: { id: NEW_STAGE_ID } },
    ]);

    await addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Signed', NOW);

    // Nothing has to move, so the insert is the only write.
    expect(calls).toEqual([READ_STAGES, insertStage('Signed', 3, 80)]);
  });

  test('stays at 100 after a last stage that is already there', async () => {
    const { client, calls } = createScriptedClient([
      { data: storedStages(['Intro', 'Signed']) },
      { data: { id: NEW_STAGE_ID } },
    ]);

    await addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Paid', NOW);

    expect(calls[1]).toEqual(insertStage('Paid', 3, 100));
  });

  test('gets half of Won when Won has been moved to the front', async () => {
    const store = createStageStore(storedStages(['Won', 'Lead'], [90, 10]));

    await addCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, 'Intro', NOW);

    expect(store.shown()).toEqual([
      ['Intro', 1, 45],
      ['Won', 2, 90],
      ['Lead', 3, 10],
    ]);
    expect(store.positionsOnly()).toBe(true);
  });

  test('is the first stage of a pipeline that has none', async () => {
    const { client, calls } = createScriptedClient([{ data: [] }, { data: { id: NEW_STAGE_ID } }]);

    await addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Lead', NOW);

    // No neighbour on either side: halfway between 0 and 100.
    expect(calls).toEqual([READ_STAGES, insertStage('Lead', 1, 50)]);
  });

  test('numbers the stages 1, 2, 3 again after an earlier change stopped part-way', async () => {
    const left = [
      { id: stageId(1), name: 'Lead', position: 1, probability_percent: 33 },
      { id: stageId(2), name: 'Quote', position: 7, probability_percent: 67 },
      { id: stageId(3), name: 'Won', position: 8, probability_percent: 100 },
    ];
    const { client, calls } = createScriptedClient([
      { data: left },
      { data: { id: NEW_STAGE_ID } },
      ...done(6),
    ]);

    await addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Visit', NOW);

    expect(calls).toEqual([
      READ_STAGES,
      // Between Quote's 67 and Won's 100 is 83.5.
      insertStage('Visit', 9, 84),
      stagePatch(NEW_STAGE_ID, { position: 12 }),
      stagePatch(stageId(3), { position: 11 }),
      stagePatch(stageId(2), { position: 10 }),
      settle(stageId(2), 2),
      settle(NEW_STAGE_ID, 3),
      settle(stageId(3), 4),
    ]);
  });

  test('refuses a thirteenth stage without writing', async () => {
    const twelve = storedStages(Array.from({ length: 12 }, (_, index) => `Stage ${index + 1}`));
    const { client, calls } = createScriptedClient([{ data: twelve }]);

    await expectFormError(
      addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'One more'),
      'A pipeline can have at most 12 stages.',
    );
    expect(calls).toEqual([READ_STAGES]);
  });

  test('allows a twelfth', async () => {
    const eleven = storedStages(Array.from({ length: 11 }, (_, index) => `Stage ${index + 1}`));
    const store = createStageStore(eleven);

    await addCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, 'One more', NOW);

    expect(store.sorted()).toHaveLength(12);
    expect(store.sorted()[11]).toMatchObject({ name: 'One more', position: 12 });
  });

  test('refuses a name already used, whatever its capitals, without writing', async () => {
    for (const name of ['proposal', 'PROPOSAL', 'won']) {
      const { client, calls } = createScriptedClient([{ data: FIVE }]);

      await expectFormError(
        addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, name),
        'Another stage in this pipeline already uses that name.',
      );
      expect(calls).toHaveLength(1);
    }
  });

  test('turns what the database refuses into a message', async () => {
    const add = (error: unknown) =>
      addCrmPipelineStage(
        createScriptedClient([{ data: FIVE }, { error }]).client,
        ORG_ID,
        PIPELINE_ID,
        'Site visit',
      );

    // Someone else added the same name first.
    await expectFormError(
      add({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "crm_pipeline_stages_pipeline_id_name_key"',
      }),
      'Another stage in this pipeline already uses that name.',
    );
    await expectFormError(
      add({ code: '23505' }),
      'Another stage in this pipeline already uses that name.',
    );
    // Someone else added a different stage first, and took the position.
    await expectFormError(
      add({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "crm_pipeline_stages_pipeline_id_position_key"',
      }),
      'The stages changed while this was saving. Check them and try again.',
    );
    // The pipeline was deleted.
    await expectFormError(add({ code: '23503' }), 'That pipeline no longer exists.');

    const denied = { code: '42501' };
    await expect(add(denied)).rejects.toBe(denied);
  });

  test('says the stage is in, but maybe out of place, when the renumbering fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = createScriptedClient([
      { data: FIVE },
      { data: { id: NEW_STAGE_ID } },
      DONE,
      { error: { code: '08006' } },
    ]);

    await expect(
      addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Site visit'),
    ).rejects.toThrow(
      'The stage was added, but the order may not be right. Check it and move the stage if needed.',
    );
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  test('counts as added when only the numbering could not be closed up', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A gap left by an earlier change, so there is numbering to do.
    const gapped = [
      { id: stageId(1), name: 'Intro', position: 1, probability_percent: 50 },
      { id: stageId(2), name: 'Quote', position: 4, probability_percent: 100 },
    ];
    const { client, calls } = createScriptedClient([
      { data: gapped },
      { data: { id: NEW_STAGE_ID } },
      { error: { code: '08006' } },
    ]);

    // With no Won stage the end is where it was meant to go.
    await expect(addCrmPipelineStage(client, ORG_ID, PIPELINE_ID, 'Signed', NOW)).resolves.toBe(
      NEW_STAGE_ID,
    );
    expect(calls).toEqual([
      READ_STAGES,
      insertStage('Signed', 5, 100),
      stagePatch(NEW_STAGE_ID, { position: 7 }),
    ]);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  test('rethrows an error from reading the stages', async () => {
    const denied = { code: '42501' };

    await expect(
      addCrmPipelineStage(createScriptedClient([{ error: denied }]).client, ORG_ID, PIPELINE_ID, 'X'),
    ).rejects.toBe(denied);
  });
});

describe('updateCrmPipelineStage', () => {
  // Proposal as FIVE stores it.
  const PROPOSAL_NOW = { name: 'Proposal', probability: 60 };

  test('writes only the name when only the name changed', async () => {
    const { client, calls } = createScriptedClient([{ data: FIVE }, DONE]);

    await expect(
      updateCrmPipelineStage(
        client,
        ORG_ID,
        PIPELINE_ID,
        PROPOSAL,
        { name: 'Quote sent', probability: 60 },
        NOW,
      ),
    ).resolves.toBeUndefined();

    // One stage of one pipeline in one org, and nothing else about it.
    expect(calls).toEqual([READ_STAGES, stagePatch(PROPOSAL, { name: 'Quote sent' })]);
  });

  test('writes only the percentage when only the percentage changed', async () => {
    const { client, calls } = createScriptedClient([{ data: FIVE }, DONE]);

    await updateCrmPipelineStage(
      client,
      ORG_ID,
      PIPELINE_ID,
      PROPOSAL,
      { name: 'Proposal', probability: 45 },
      NOW,
    );

    expect(calls).toEqual([READ_STAGES, stagePatch(PROPOSAL, { probability_percent: 45 })]);
  });

  test('writes both in one statement when both changed', async () => {
    const { client, calls } = createScriptedClient([{ data: FIVE }, DONE]);

    await updateCrmPipelineStage(
      client,
      ORG_ID,
      PIPELINE_ID,
      PROPOSAL,
      { name: 'Quote sent', probability: 0 },
      NOW,
    );

    expect(calls).toEqual([
      READ_STAGES,
      stagePatch(PROPOSAL, { name: 'Quote sent', probability_percent: 0 }),
    ]);
  });

  test('writes nothing when neither changed', async () => {
    const { client, calls } = createScriptedClient([{ data: FIVE }]);

    await expect(
      updateCrmPipelineStage(client, ORG_ID, PIPELINE_ID, PROPOSAL, PROPOSAL_NOW),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([READ_STAGES]);
  });

  test('takes any percentage from 0 to 100, in order with its neighbours or not', async () => {
    // Above the stage after it, below the stage before it, and both ends.
    for (const probability of [0, 10, 95, 100]) {
      const { client, calls } = createScriptedClient([{ data: FIVE }, DONE]);

      await updateCrmPipelineStage(
        client,
        ORG_ID,
        PIPELINE_ID,
        PROPOSAL,
        { name: 'Proposal', probability },
        NOW,
      );

      expect(calls[1]).toEqual(stagePatch(PROPOSAL, { probability_percent: probability }));
    }
  });

  test('leaves every other stage as it was', async () => {
    const store = createStageStore(STARTING);

    await updateCrmPipelineStage(
      store.client,
      ORG_ID,
      PIPELINE_ID,
      QUALIFIED,
      { name: 'Vetted', probability: 35 },
      NOW,
    );

    expect(store.shown()).toEqual([
      ['Lead', 1, 10],
      ['Vetted', 2, 35],
      ['Proposal', 3, 50],
      ['Negotiation', 4, 70],
      ['Won', 5, 100],
    ]);
  });

  test('lets the Won stage be renamed, and another stage take the name once it is free', async () => {
    const renamed = createScriptedClient([{ data: FIVE }, DONE]);
    await updateCrmPipelineStage(
      renamed.client,
      ORG_ID,
      PIPELINE_ID,
      WON,
      { name: 'Signed', probability: 100 },
      NOW,
    );
    expect(renamed.calls[1]).toEqual(stagePatch(WON, { name: 'Signed' }));

    const noWon = FIVE.map((stage) => (stage.id === WON ? { ...stage, name: 'Signed' } : stage));
    const taken = createScriptedClient([{ data: noWon }, DONE]);
    await updateCrmPipelineStage(
      taken.client,
      ORG_ID,
      PIPELINE_ID,
      PROPOSAL,
      { name: 'Won', probability: 60 },
      NOW,
    );
    expect(taken.calls[1]).toEqual(stagePatch(PROPOSAL, { name: 'Won' }));
  });

  test('changes only the capitals of a stage name', async () => {
    const { client, calls } = createScriptedClient([{ data: FIVE }, DONE]);

    await updateCrmPipelineStage(
      client,
      ORG_ID,
      PIPELINE_ID,
      PROPOSAL,
      { name: 'PROPOSAL', probability: 60 },
      NOW,
    );

    expect(calls[1]).toEqual(stagePatch(PROPOSAL, { name: 'PROPOSAL' }));
  });

  test("refuses another stage's name whatever its capitals, so never two called Won", async () => {
    for (const name of ['Lead', 'lead', 'won', 'WON']) {
      const { client, calls } = createScriptedClient([{ data: FIVE }]);

      // A changed percentage sent with it is not written either.
      await expectFormError(
        updateCrmPipelineStage(client, ORG_ID, PIPELINE_ID, PROPOSAL, { name, probability: 45 }),
        'Another stage in this pipeline already uses that name.',
      );
      expect(calls).toHaveLength(1);
    }
  });

  test('says so when the database finds the name taken, or the stage gone', async () => {
    const update = (steps: Step[], id = PROPOSAL) =>
      updateCrmPipelineStage(createScriptedClient(steps).client, ORG_ID, PIPELINE_ID, id, {
        name: 'Quote',
        probability: 45,
      });

    await expectFormError(
      update([{ data: FIVE }, { error: { code: '23505' } }]),
      'Another stage in this pipeline already uses that name.',
    );
    // Not among the pipeline's stages.
    await expectFormError(update([{ data: FIVE }], stageId(42)), 'That stage no longer exists.');
    // Deleted between the read and the write.
    await expectFormError(update([{ data: FIVE }, { data: [] }]), 'That stage no longer exists.');
  });

  test('rethrows any other database error', async () => {
    const denied = { code: '42501' };
    const update = (steps: Step[]) =>
      updateCrmPipelineStage(createScriptedClient(steps).client, ORG_ID, PIPELINE_ID, PROPOSAL, {
        name: 'Quote',
        probability: 60,
      });

    await expect(update([{ data: FIVE }, { error: denied }])).rejects.toBe(denied);
    await expect(update([{ error: denied }])).rejects.toBe(denied);
  });
});

describe('moveCrmPipelineStage', () => {
  test('parks the stages from the moved pair on, then settles them, in that order', async () => {
    const { client, calls } = createScriptedClient([{ data: STARTING }, ...done(8)]);

    await expect(
      moveCrmPipelineStage(client, ORG_ID, PIPELINE_ID, QUALIFIED, 'down', NOW),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      READ_STAGES,
      // Park: above the highest position (5), the last stage first.
      stagePatch(WON, { position: 9 }),
      stagePatch(NEGOTIATION, { position: 8 }),
      stagePatch(PROPOSAL, { position: 7 }),
      stagePatch(QUALIFIED, { position: 6 }),
      // Settle: final positions only, the first stage first.
      settle(PROPOSAL, 2),
      settle(QUALIFIED, 3),
      settle(NEGOTIATION, 4),
      settle(WON, 5),
      // Lead stays at 1: no write. No probability is written anywhere.
    ]);
  });

  test('moving up is the same swap seen from the other stage', async () => {
    const down = createScriptedClient([{ data: FIVE }, ...done(8)]);
    await moveCrmPipelineStage(down.client, ORG_ID, PIPELINE_ID, QUALIFIED, 'down', NOW);
    const up = createScriptedClient([{ data: FIVE }, ...done(8)]);
    await moveCrmPipelineStage(up.client, ORG_ID, PIPELINE_ID, PROPOSAL, 'up', NOW);

    expect(up.calls).toEqual(down.calls);
  });

  test('touches only the last two stages when they are the ones swapped', async () => {
    const { client, calls } = createScriptedClient([{ data: FIVE }, ...done(4)]);

    await moveCrmPipelineStage(client, ORG_ID, PIPELINE_ID, WON, 'up', NOW);

    expect(calls).toEqual([
      READ_STAGES,
      stagePatch(WON, { position: 7 }),
      stagePatch(NEGOTIATION, { position: 6 }),
      settle(WON, 4),
      settle(NEGOTIATION, 5),
    ]);
  });

  test("keeps the starting pipeline's 10 to 100 attached to their stages", async () => {
    const { client, calls } = createScriptedClient([{ data: STARTING }, ...done(6)]);

    await moveCrmPipelineStage(client, ORG_ID, PIPELINE_ID, NEGOTIATION, 'up', NOW);

    expect(calls).toEqual([
      READ_STAGES,
      stagePatch(WON, { position: 8 }),
      stagePatch(NEGOTIATION, { position: 7 }),
      stagePatch(PROPOSAL, { position: 6 }),
      settle(NEGOTIATION, 3),
      settle(PROPOSAL, 4),
      settle(WON, 5),
      // The two that kept their place are not written at all.
    ]);

    const store = createStageStore(STARTING);
    await moveCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, NEGOTIATION, 'up', NOW);
    expect(store.shown()).toEqual([
      ['Lead', 1, 10],
      ['Qualified', 2, 30],
      ['Negotiation', 3, 70],
      ['Proposal', 4, 50],
      ['Won', 5, 100],
    ]);
    expect(store.positionsOnly()).toBe(true);
  });

  test('a stage moved all the way down and back keeps its percentage throughout', async () => {
    const store = createStageStore(STARTING);

    for (let step = 0; step < 4; step += 1) {
      await moveCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, LEAD, 'down', NOW);
    }
    expect(store.shown()).toEqual([
      ['Qualified', 1, 30],
      ['Proposal', 2, 50],
      ['Negotiation', 3, 70],
      ['Won', 4, 100],
      ['Lead', 5, 10],
    ]);

    for (let step = 0; step < 4; step += 1) {
      await moveCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, LEAD, 'up', NOW);
    }
    expect(store.shown()).toEqual(STARTING.map((s) => [s.name, s.position, s.probability_percent]));
    expect(store.positionsOnly()).toBe(true);
  });

  test('moving the first stage up or the last one down writes nothing', async () => {
    const first = createScriptedClient([{ data: FIVE }]);
    await expect(
      moveCrmPipelineStage(first.client, ORG_ID, PIPELINE_ID, LEAD, 'up'),
    ).resolves.toBeUndefined();
    expect(first.calls).toEqual([READ_STAGES]);

    const last = createScriptedClient([{ data: FIVE }]);
    await expect(
      moveCrmPipelineStage(last.client, ORG_ID, PIPELINE_ID, WON, 'down'),
    ).resolves.toBeUndefined();
    expect(last.calls).toEqual([READ_STAGES]);
  });

  test('says so when the stage has gone, before or during the move', async () => {
    await expectFormError(
      moveCrmPipelineStage(
        createScriptedClient([{ data: FIVE }]).client,
        ORG_ID,
        PIPELINE_ID,
        stageId(42),
        'up',
      ),
      'That stage no longer exists.',
    );
    await expectFormError(
      moveCrmPipelineStage(
        createScriptedClient([{ data: FIVE }, DONE, { data: [] }]).client,
        ORG_ID,
        PIPELINE_ID,
        QUALIFIED,
        'down',
      ),
      'That stage no longer exists.',
    );
  });

  test('stops at the write that fails and rethrows its error', async () => {
    const lost = { code: '08006' };
    const { client, calls } = createScriptedClient([{ data: FIVE }, DONE, DONE, { error: lost }]);

    await expect(
      moveCrmPipelineStage(client, ORG_ID, PIPELINE_ID, QUALIFIED, 'down', NOW),
    ).rejects.toBe(lost);
    expect(calls).toHaveLength(4);
  });

  test('never asks for a position that is taken, and never shows a third order', async () => {
    // Each stage's percentage, which it must still have wherever it ends up.
    const percentOf = Object.fromEntries(
      STARTING.map((stage) => [stage.name, stage.probability_percent]),
    );

    for (let from = 0; from < STAGE_NAMES.length - 1; from += 1) {
      const wanted = [...STAGE_NAMES];
      [wanted[from], wanted[from + 1]] = [wanted[from + 1], wanted[from]];
      const moved = stageId(from + 1);

      // Run to the end. The store refuses a taken position, which would fail this.
      const whole = createStageStore(STARTING);
      await moveCrmPipelineStage(whole.client, ORG_ID, PIPELINE_ID, moved, 'down', NOW);
      expect(whole.shown()).toEqual(wanted.map((name, i) => [name, i + 1, percentOf[name]]));
      expect(whole.positionsOnly()).toBe(true);
      for (const order of whole.orders) expect([STAGE_NAMES, wanted]).toContainEqual(order);

      // Then again, stopping at each write in turn.
      for (let failAt = 1; failAt <= whole.orders.length; failAt += 1) {
        const store = createStageStore(STARTING, { failAt });
        await expect(
          moveCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, moved, 'down', NOW),
        ).rejects.toEqual({ code: '08006' });

        // What is left is the old order or the new one, with no position shared.
        const left = store.sorted();
        const leftNames = left.map((row) => row.name);
        expect([STAGE_NAMES, wanted]).toContainEqual(leftNames);
        expect(new Set(left.map((row) => row.position)).size).toBe(STAGE_NAMES.length);
        // Stopping part-way has not cost any stage its percentage.
        for (const row of left) expect(row.probability_percent).toBe(percentOf[row.name]);

        // The next move works from what was left and ends with 1 to 5 again.
        const next = createStageStore(left);
        await moveCrmPipelineStage(next.client, ORG_ID, PIPELINE_ID, WON, 'up', NOW);
        const wonAt = leftNames.indexOf('Won');
        const after = [...leftNames];
        [after[wonAt - 1], after[wonAt]] = [after[wonAt], after[wonAt - 1]];
        expect(next.shown()).toEqual(after.map((name, i) => [name, i + 1, percentOf[name]]));
      }
    }
  });
});

describe('deleteCrmPipelineStage', () => {
  const countDeals = (id: string): Call => ({
    table: 'crm_deals',
    ops: [
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'org_id', ORG_ID],
      ['eq', 'stage_id', id],
    ],
  });
  const deleteStage = (id: string): Call => ({
    table: 'crm_pipeline_stages',
    ops: [
      ['delete'],
      ['eq', 'id', id],
      ['eq', 'org_id', ORG_ID],
      ['eq', 'pipeline_id', PIPELINE_ID],
      ['select', 'id'],
    ],
  });

  test('checks the stages and the deals, deletes within the pipeline, then closes up', async () => {
    const { client, calls } = createScriptedClient([
      { data: STARTING },
      { count: 0 },
      DONE,
      ...done(4),
    ]);

    await expect(
      deleteCrmPipelineStage(client, ORG_ID, PIPELINE_ID, PROPOSAL, NOW),
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      READ_STAGES,
      countDeals(PROPOSAL),
      deleteStage(PROPOSAL),
      // The two after the gap are parked, then settled one place earlier.
      stagePatch(WON, { position: 7 }),
      stagePatch(NEGOTIATION, { position: 6 }),
      settle(NEGOTIATION, 3),
      settle(WON, 4),
      // The two before it are not written, and no probability is.
    ]);
  });

  test('writes nothing more when the last stage goes, and the new last stage keeps its percentage', async () => {
    const { client, calls } = createScriptedClient([{ data: STARTING }, { count: 0 }, DONE]);

    await deleteCrmPipelineStage(client, ORG_ID, PIPELINE_ID, WON, NOW);

    expect(calls).toEqual([READ_STAGES, countDeals(WON), deleteStage(WON)]);

    const store = createStageStore(STARTING);
    await deleteCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, WON, NOW);
    // Negotiation is last now and still 70, not 100.
    expect(store.shown()).toEqual([
      ['Lead', 1, 10],
      ['Qualified', 2, 30],
      ['Proposal', 3, 50],
      ['Negotiation', 4, 70],
    ]);
  });

  test('leaves the stages numbered 1 to 4 with no gap, in the order and with the percentages they had', async () => {
    const store = createStageStore(STARTING);

    await deleteCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, QUALIFIED, NOW);

    expect(store.shown()).toEqual([
      ['Lead', 1, 10],
      ['Proposal', 2, 50],
      ['Negotiation', 3, 70],
      ['Won', 4, 100],
    ]);
    expect(store.positionsOnly()).toBe(true);
    for (const order of store.orders) {
      expect(order).toEqual(['Lead', 'Proposal', 'Negotiation', 'Won']);
    }
  });

  test('keeps a pipeline at two stages', async () => {
    const { client, calls } = createScriptedClient([
      { data: storedStages(['Open', 'Won']) },
      { count: 0 },
    ]);

    await expectFormError(
      deleteCrmPipelineStage(client, ORG_ID, PIPELINE_ID, stageId(1)),
      'A pipeline needs at least two stages.',
    );
    expect(calls).toHaveLength(2);
  });

  test('takes a pipeline of three down to two', async () => {
    const store = createStageStore(storedStages(['Open', 'Quote', 'Won']));

    await deleteCrmPipelineStage(store.client, ORG_ID, PIPELINE_ID, stageId(1), NOW);

    expect(store.shown()).toEqual([
      ['Quote', 1, 67],
      ['Won', 2, 100],
    ]);
  });

  test('refuses a stage that still has deals, and says how many', async () => {
    const three = createScriptedClient([{ data: FIVE }, { count: 3 }]);
    await expectFormError(
      deleteCrmPipelineStage(three.client, ORG_ID, PIPELINE_ID, PROPOSAL),
      "Move or delete this stage's 3 deals first.",
    );
    expect(three.calls).toHaveLength(2);

    await expectFormError(
      deleteCrmPipelineStage(
        createScriptedClient([{ data: FIVE }, { count: 1 }]).client,
        ORG_ID,
        PIPELINE_ID,
        PROPOSAL,
      ),
      "Move or delete this stage's 1 deal first.",
    );
  });

  test('gives the same reason when the database refuses for a deal added meanwhile', async () => {
    const { client, calls } = createScriptedClient([
      { data: FIVE },
      { count: 0 },
      { error: { code: '23503' } },
    ]);

    await expectFormError(
      deleteCrmPipelineStage(client, ORG_ID, PIPELINE_ID, PROPOSAL),
      "Move or delete this stage's deals first.",
    );
    // Nothing is renumbered around a stage that is still there.
    expect(calls).toHaveLength(3);
  });

  test('says so when the stage has gone, before or at the delete', async () => {
    await expectFormError(
      deleteCrmPipelineStage(
        createScriptedClient([{ data: FIVE }, { count: 0 }]).client,
        ORG_ID,
        PIPELINE_ID,
        stageId(42),
      ),
      'That stage no longer exists.',
    );
    await expectFormError(
      deleteCrmPipelineStage(
        createScriptedClient([{ data: FIVE }, { count: 0 }, { data: [] }]).client,
        ORG_ID,
        PIPELINE_ID,
        PROPOSAL,
      ),
      'That stage no longer exists.',
    );
  });

  test('rethrows an error from the reads or the delete', async () => {
    const denied = { code: '42501' };
    const remove = (steps: Step[]) =>
      deleteCrmPipelineStage(createScriptedClient(steps).client, ORG_ID, PIPELINE_ID, PROPOSAL);

    await expect(remove([{ error: denied }, { count: 0 }])).rejects.toBe(denied);
    await expect(remove([{ data: FIVE }, { error: denied }])).rejects.toBe(denied);
    await expect(remove([{ data: FIVE }, { count: 0 }, { error: denied }])).rejects.toBe(denied);
  });

  test('is still a removal when closing up afterwards fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, calls } = createScriptedClient([
      { data: FIVE },
      { count: 0 },
      DONE,
      { error: { code: '08006' } },
    ]);

    await expect(
      deleteCrmPipelineStage(client, ORG_ID, PIPELINE_ID, PROPOSAL, NOW),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(4);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
