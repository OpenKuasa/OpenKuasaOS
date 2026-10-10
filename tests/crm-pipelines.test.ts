import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { CrmContactFormError } from '@/lib/crm/contacts';
import {
  DEFAULT_PIPELINE_NAME,
  DEFAULT_STAGE_LIST,
  DEFAULT_STAGES,
  createCrmPipeline,
  deleteCrmPipeline,
  ensureDefaultPipeline,
  isWonStage,
  listCrmPipelines,
  needsDefaultPipeline,
  parseCrmPipelineForm,
  parsePipelineName,
  parseStageList,
  pipelineHasDealsMessage,
  readPipelineId,
  renameCrmPipeline,
  setDefaultCrmPipeline,
  stageDot,
  stageProbabilities,
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
