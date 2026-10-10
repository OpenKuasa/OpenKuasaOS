import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { CrmContactFormError } from '@/lib/crm/contacts';
import {
  createCrmDeal,
  deleteCrmDeal,
  markCrmDealLost,
  moveCrmDeal,
  parseCrmDealForm,
  parseRinggit,
  readDealId,
  readLostReason,
  readStageId,
  reopenCrmDeal,
  stageStatusPatch,
  updateCrmDeal,
  type CrmDealFields,
} from '@/lib/crm/deals';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const DEAL_ID = '22222222-2222-4222-8222-222222222222';
const CONTACT_ID = '33333333-3333-4333-8333-333333333333';
const PIPELINE_ID = '44444444-4444-4444-8444-444444444444';
const LEAD_ID = '55555555-5555-4555-8555-555555555555';
const WON_ID = '66666666-6666-4666-8666-666666666666';
const OWNER_ID = '77777777-7777-4777-8777-777777777777';

const NOW = new Date('2026-10-10T08:30:00.000Z');
const STAMP = '2026-10-10T08:30:00.000Z';

const FIELDS: CrmDealFields = {
  title: 'POS rollout',
  contact_id: CONTACT_ID,
  stage_id: LEAD_ID,
  value_cents: 1800000,
  tag: 'Inbound',
  expected_close_date: '2026-10-20',
};

const LEAD = { id: LEAD_ID, name: 'Lead', pipeline_id: PIPELINE_ID };
const WON = { id: WON_ID, name: 'Won', pipeline_id: PIPELINE_ID };

function deal(overrides: Record<string, unknown> = {}) {
  return { id: DEAL_ID, status: 'open', stage_id: LEAD_ID, pipeline_id: PIPELINE_ID, ...overrides };
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const VALID = { title: 'POS rollout', contactId: CONTACT_ID, stageId: LEAD_ID };

function expectFormError(run: () => unknown, message: string) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(CrmContactFormError);
  expect((thrown as Error).message).toBe(message);
}

async function expectRejectsWithFormError(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toBeInstanceOf(CrmContactFormError);
  await expect(promise).rejects.toThrow(message);
}

type Read = { data: unknown; error: unknown };

/**
 * A client for the deal writes. On `crm_deals`, `.select()` continues the
 * chain when reading and ends it after an update or delete, as in the real
 * client. Stages are looked up by the id the code asks for.
 */
function createClient({
  current = { data: deal(), error: null },
  stages = [LEAD, WON],
  stageError = null,
  written = { data: [{ id: DEAL_ID }], error: null },
  inserted = { error: null },
}: {
  current?: Read;
  stages?: { id: string; name: string; pipeline_id: string }[];
  stageError?: unknown;
  written?: Read;
  inserted?: { error: unknown };
} = {}) {
  let writing = false;
  const deals = {
    select: vi.fn((): unknown => (writing ? Promise.resolve(written) : deals)),
    eq: vi.fn(() => deals),
    maybeSingle: vi.fn(async () => current),
    update: vi.fn<(patch: Record<string, unknown>) => unknown>((): unknown => {
      writing = true;
      return deals;
    }),
    delete: vi.fn(() => {
      writing = true;
      return deals;
    }),
    insert: vi.fn<(row: Record<string, unknown>) => Promise<{ error: unknown }>>(async () => inserted),
  };

  let stageId = '';
  const stageQuery = {
    select: vi.fn(() => stageQuery),
    eq: vi.fn((column: string, value: string) => {
      if (column === 'id') stageId = value;
      return stageQuery;
    }),
    maybeSingle: vi.fn(async () =>
      stageError
        ? { data: null, error: stageError }
        : { data: stages.find((stage) => stage.id === stageId) ?? null, error: null },
    ),
  };

  const from = vi.fn((table: string) => (table === 'crm_deals' ? deals : stageQuery));
  return { client: { from } as unknown as SupabaseClient, from, deals, stageQuery };
}

describe('parseRinggit', () => {
  test('turns ringgit into cents without losing sen', () => {
    expect(parseRinggit('18000')).toBe(1800000);
    expect(parseRinggit('18000.5')).toBe(1800050);
    expect(parseRinggit('18000.50')).toBe(1800050);
    expect(parseRinggit('0.07')).toBe(7);
    // 1.15 * 100 is 114.99999999999999 in floating point.
    expect(parseRinggit('1.15')).toBe(115);
    expect(parseRinggit('19.99')).toBe(1999);
  });

  test('accepts the ways people write an amount', () => {
    expect(parseRinggit(' 18,000 ')).toBe(1800000);
    expect(parseRinggit('RM 18,000.50')).toBe(1800050);
    expect(parseRinggit('rm18 000')).toBe(1800000);
  });

  test('treats a blank value as zero', () => {
    expect(parseRinggit('')).toBe(0);
    expect(parseRinggit('   ')).toBe(0);
    expect(parseRinggit('0')).toBe(0);
  });

  test('rejects anything that is not a plain amount', () => {
    for (const value of ['abc', '-5', '18k', '1.234', '1e5', '18000.', '.5', '12 apples']) {
      expectFormError(
        () => parseRinggit(value),
        'Enter the value as a number of ringgit, such as 18000.',
      );
    }
  });

  test('rejects an amount too large to store exactly', () => {
    expect(parseRinggit('999999999999')).toBe(99999999999900);
    expectFormError(() => parseRinggit('1000000000000'), 'Enter a value below RM 1,000,000,000,000.');
  });
});

describe('parseCrmDealForm', () => {
  test('reads a full form into the editable columns', () => {
    const fields = parseCrmDealForm(
      form({
        title: '  POS   rollout ',
        contactId: CONTACT_ID,
        stageId: LEAD_ID,
        value: '18,000',
        tag: ' Inbound ',
        expectedCloseDate: '2026-10-20',
      }),
    );

    expect(fields).toStrictEqual(FIELDS);
  });

  test('defaults the value to zero and leaves the tag and date empty', () => {
    expect(parseCrmDealForm(form(VALID))).toStrictEqual({
      title: 'POS rollout',
      contact_id: CONTACT_ID,
      stage_id: LEAD_ID,
      value_cents: 0,
      tag: null,
      expected_close_date: null,
    });
  });

  test('requires a title', () => {
    expectFormError(
      () => parseCrmDealForm(form({ ...VALID, title: '   ' })),
      'Enter a title for the deal.',
    );
  });

  test('accepts a 200 character title and rejects a longer one', () => {
    expect(parseCrmDealForm(form({ ...VALID, title: 'a'.repeat(200) })).title).toHaveLength(200);
    expectFormError(
      () => parseCrmDealForm(form({ ...VALID, title: 'a'.repeat(201) })),
      'Keep the title to 200 characters or fewer.',
    );
  });

  test('requires a contact and a stage', () => {
    for (const contactId of ['', 'contact-1', `${CONTACT_ID},org_id.neq.x`]) {
      expectFormError(() => parseCrmDealForm(form({ ...VALID, contactId })), 'Choose a contact.');
    }
    for (const stageId of ['', 'stage-1']) {
      expectFormError(() => parseCrmDealForm(form({ ...VALID, stageId })), 'Choose a stage.');
    }
  });

  test('rejects a value that is not a number of ringgit', () => {
    expectFormError(
      () => parseCrmDealForm(form({ ...VALID, value: 'eighteen thousand' })),
      'Enter the value as a number of ringgit, such as 18000.',
    );
    expectFormError(
      () => parseCrmDealForm(form({ ...VALID, value: '-1' })),
      'Enter the value as a number of ringgit, such as 18000.',
    );
  });

  test('accepts a 30 character tag and rejects a longer one', () => {
    expect(parseCrmDealForm(form({ ...VALID, tag: 'x'.repeat(30) })).tag).toHaveLength(30);
    expectFormError(
      () => parseCrmDealForm(form({ ...VALID, tag: 'x'.repeat(31) })),
      'Keep the tag to 30 characters or fewer.',
    );
  });

  test('rejects an expected close date that is not a real YYYY-MM-DD date', () => {
    for (const expectedCloseDate of ['20/10/2026', '2026-10-1', '2026-02-30', '2026-13-01', 'soon']) {
      expectFormError(
        () => parseCrmDealForm(form({ ...VALID, expectedCloseDate })),
        'Enter a valid expected close date.',
      );
    }
  });

  test('reports the title before the contact, and the contact before the value', () => {
    expectFormError(
      () => parseCrmDealForm(form({ title: '', contactId: '', stageId: '', value: 'x' })),
      'Enter a title for the deal.',
    );
    expectFormError(
      () => parseCrmDealForm(form({ ...VALID, contactId: '', value: 'x' })),
      'Choose a contact.',
    );
  });
});

describe('readDealId, readStageId and readLostReason', () => {
  test('return a UUID and reject anything else', () => {
    expect(readDealId(form({ dealId: ` ${DEAL_ID} ` }))).toBe(DEAL_ID);
    expect(readStageId(form({ stageId: WON_ID }))).toBe(WON_ID);
    const dealIds: Record<string, string>[] = [{}, { dealId: '' }, { dealId: 'deal-1' }];
    for (const values of dealIds) {
      expectFormError(() => readDealId(form(values)), 'That deal could not be found.');
    }
    const stageIds: Record<string, string>[] = [{}, { stageId: 'won' }];
    for (const values of stageIds) {
      expectFormError(() => readStageId(form(values)), 'That stage could not be found.');
    }
  });

  test('reads an optional reason of at most 200 characters', () => {
    expect(readLostReason(form({}))).toBeNull();
    expect(readLostReason(form({ lostReason: '   ' }))).toBeNull();
    expect(readLostReason(form({ lostReason: '  Chose a   cheaper vendor ' }))).toBe(
      'Chose a cheaper vendor',
    );
    expect(readLostReason(form({ lostReason: 'x'.repeat(200) }))).toHaveLength(200);
    expectFormError(
      () => readLostReason(form({ lostReason: 'x'.repeat(201) })),
      'Keep the reason to 200 characters or fewer.',
    );
  });
});

describe('stageStatusPatch', () => {
  test('wins a deal that goes into the Won stage', () => {
    const won = { status: 'won', won_at: STAMP, lost_at: null, lost_reason: null };

    expect(stageStatusPatch('open', true, STAMP)).toStrictEqual(won);
    // A lost deal moved into Won is won, and no longer lost.
    expect(stageStatusPatch('lost', true, STAMP)).toStrictEqual(won);
  });

  test('keeps the day a deal was won when it is already won', () => {
    expect(stageStatusPatch('won', true, STAMP)).toStrictEqual({});
  });

  test('puts a won deal back to open when it leaves the Won stage', () => {
    expect(stageStatusPatch('won', false, STAMP)).toStrictEqual({ status: 'open', won_at: null });
  });

  test('leaves open and lost deals as they are between other stages', () => {
    expect(stageStatusPatch('open', false, STAMP)).toStrictEqual({});
    expect(stageStatusPatch('lost', false, STAMP)).toStrictEqual({});
  });
});

describe('createCrmDeal', () => {
  test('inserts the deal into the pipeline of its stage, owned by its creator', async () => {
    const { client, from, deals, stageQuery } = createClient();

    await expect(createCrmDeal(client, ORG_ID, FIELDS, OWNER_ID, NOW)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_pipeline_stages');
    expect(stageQuery.select).toHaveBeenCalledWith('id,name,pipeline_id');
    expect(stageQuery.eq).toHaveBeenCalledWith('id', LEAD_ID);
    expect(stageQuery.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(from).toHaveBeenCalledWith('crm_deals');
    expect(deals.insert).toHaveBeenCalledWith({
      org_id: ORG_ID,
      title: 'POS rollout',
      contact_id: CONTACT_ID,
      stage_id: LEAD_ID,
      pipeline_id: PIPELINE_ID,
      value_cents: 1800000,
      tag: 'Inbound',
      expected_close_date: '2026-10-20',
      owner_user_id: OWNER_ID,
      last_activity_at: STAMP,
    });
  });

  test('leaves the owner out when none is given', async () => {
    const { client, deals } = createClient();

    await createCrmDeal(client, ORG_ID, FIELDS, null, NOW);

    expect(deals.insert.mock.calls[0][0]).not.toHaveProperty('owner_user_id');
  });

  test('adds a deal straight into Won as won', async () => {
    const { client, deals } = createClient();

    await createCrmDeal(client, ORG_ID, { ...FIELDS, stage_id: WON_ID }, OWNER_ID, NOW);

    expect(deals.insert.mock.calls[0][0]).toMatchObject({
      stage_id: WON_ID,
      status: 'won',
      won_at: STAMP,
    });
  });

  test('says the stage is gone when it cannot be read, and inserts nothing', async () => {
    const { client, deals } = createClient({ stages: [] });

    await expectRejectsWithFormError(
      createCrmDeal(client, ORG_ID, FIELDS, OWNER_ID, NOW),
      'That stage no longer exists. Choose another.',
    );
    expect(deals.insert).not.toHaveBeenCalled();
  });

  test('says the contact is gone when its foreign key fails', async () => {
    const { client } = createClient({
      inserted: {
        error: {
          code: '23503',
          message:
            'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_contact_id_org_id_fkey"',
          details: 'Key (contact_id, org_id)=(x, y) is not present in table "crm_contacts".',
        },
      },
    });

    await expectRejectsWithFormError(
      createCrmDeal(client, ORG_ID, FIELDS, OWNER_ID, NOW),
      'That contact no longer exists. Choose another.',
    );
  });

  test('says the stage is gone when its foreign key fails', async () => {
    const { client } = createClient({
      inserted: {
        error: {
          code: '23503',
          message:
            'insert or update on table "crm_deals" violates foreign key constraint "crm_deals_stage_id_pipeline_id_fkey"',
          details: 'Key (stage_id, pipeline_id)=(x, y) is not present in table "crm_pipeline_stages".',
        },
      },
    });

    await expectRejectsWithFormError(
      createCrmDeal(client, ORG_ID, FIELDS, OWNER_ID, NOW),
      'That stage no longer exists. Choose another.',
    );
  });

  test('still gives a form error for a foreign key it cannot name', async () => {
    const { client } = createClient({ inserted: { error: { code: '23503' } } });

    await expectRejectsWithFormError(
      createCrmDeal(client, ORG_ID, FIELDS, OWNER_ID, NOW),
      'The contact or stage you chose no longer exists. Choose another.',
    );
  });

  test('rethrows any other database error untouched', async () => {
    const denied = { code: '42501', message: 'permission denied' };

    await expect(
      createCrmDeal(createClient({ inserted: { error: denied } }).client, ORG_ID, FIELDS, OWNER_ID, NOW),
    ).rejects.toBe(denied);
    await expect(
      createCrmDeal(createClient({ stageError: denied }).client, ORG_ID, FIELDS, OWNER_ID, NOW),
    ).rejects.toBe(denied);
  });
});

describe('updateCrmDeal', () => {
  test('writes the fields and both timestamps to one deal in one org', async () => {
    const { client, from, deals, stageQuery } = createClient();

    await expect(updateCrmDeal(client, ORG_ID, DEAL_ID, FIELDS, NOW)).resolves.toBeUndefined();

    expect(deals.select).toHaveBeenNthCalledWith(1, 'id,status,stage_id,pipeline_id');
    expect(deals.update).toHaveBeenCalledWith({
      ...FIELDS,
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
    // Read, then write: each scoped by id and org.
    expect(deals.eq).toHaveBeenCalledTimes(4);
    expect(deals.eq.mock.calls).toEqual([
      ['id', DEAL_ID],
      ['org_id', ORG_ID],
      ['id', DEAL_ID],
      ['org_id', ORG_ID],
    ]);
    expect(deals.select).toHaveBeenLastCalledWith('id');
    // The stage did not change, so it is not looked up.
    expect(from).not.toHaveBeenCalledWith('crm_pipeline_stages');
    expect(stageQuery.maybeSingle).not.toHaveBeenCalled();
  });

  test('wins the deal when the edit moves it into Won', async () => {
    const { client, deals } = createClient();

    await updateCrmDeal(client, ORG_ID, DEAL_ID, { ...FIELDS, stage_id: WON_ID }, NOW);

    expect(deals.update).toHaveBeenCalledWith({
      ...FIELDS,
      stage_id: WON_ID,
      status: 'won',
      won_at: STAMP,
      lost_at: null,
      lost_reason: null,
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
  });

  test('reopens a won deal when the edit moves it out of Won', async () => {
    const { client, deals } = createClient({
      current: { data: deal({ status: 'won', stage_id: WON_ID }), error: null },
    });

    await updateCrmDeal(client, ORG_ID, DEAL_ID, FIELDS, NOW);

    expect(deals.update.mock.calls[0][0]).toMatchObject({
      stage_id: LEAD_ID,
      status: 'open',
      won_at: null,
    });
  });

  test('does not win a lost deal that is edited where it sits in Won', async () => {
    const { client, deals } = createClient({
      current: { data: deal({ status: 'lost', stage_id: WON_ID }), error: null },
    });

    await updateCrmDeal(client, ORG_ID, DEAL_ID, { ...FIELDS, stage_id: WON_ID }, NOW);

    expect(deals.update.mock.calls[0][0]).not.toHaveProperty('status');
  });

  test('refuses a stage from another pipeline', async () => {
    const { client, deals } = createClient({
      stages: [LEAD, { ...WON, pipeline_id: 'another-pipeline' }],
    });

    await expectRejectsWithFormError(
      updateCrmDeal(client, ORG_ID, DEAL_ID, { ...FIELDS, stage_id: WON_ID }, NOW),
      "Choose a stage from this deal's pipeline.",
    );
    expect(deals.update).not.toHaveBeenCalled();
  });

  test('says the deal is gone when it cannot be read', async () => {
    const { client, deals } = createClient({ current: { data: null, error: null } });

    await expectRejectsWithFormError(
      updateCrmDeal(client, ORG_ID, DEAL_ID, FIELDS, NOW),
      'That deal no longer exists.',
    );
    expect(deals.update).not.toHaveBeenCalled();
  });

  test('says the deal is gone when no row was updated', async () => {
    const { client } = createClient({ written: { data: [], error: null } });

    await expectRejectsWithFormError(
      updateCrmDeal(client, ORG_ID, DEAL_ID, FIELDS, NOW),
      'That deal no longer exists.',
    );
  });

  test('says the contact is gone when its foreign key fails', async () => {
    const { client } = createClient({
      written: {
        data: null,
        error: { code: '23503', details: 'Key is not present in table "crm_contacts".' },
      },
    });

    await expectRejectsWithFormError(
      updateCrmDeal(client, ORG_ID, DEAL_ID, FIELDS, NOW),
      'That contact no longer exists. Choose another.',
    );
  });

  test('rethrows any other database error untouched', async () => {
    const denied = { code: '42501', message: 'permission denied' };

    await expect(
      updateCrmDeal(createClient({ written: { data: null, error: denied } }).client, ORG_ID, DEAL_ID, FIELDS, NOW),
    ).rejects.toBe(denied);
    await expect(
      updateCrmDeal(createClient({ current: { data: null, error: denied } }).client, ORG_ID, DEAL_ID, FIELDS, NOW),
    ).rejects.toBe(denied);
  });
});

describe('moveCrmDeal', () => {
  test('moves a deal into Won and marks it won', async () => {
    const { client, deals, stageQuery } = createClient();

    await expect(moveCrmDeal(client, ORG_ID, DEAL_ID, WON_ID, NOW)).resolves.toBeUndefined();

    expect(stageQuery.eq).toHaveBeenCalledWith('id', WON_ID);
    expect(stageQuery.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(deals.update).toHaveBeenCalledWith({
      stage_id: WON_ID,
      status: 'won',
      won_at: STAMP,
      lost_at: null,
      lost_reason: null,
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
    expect(deals.eq).toHaveBeenCalledWith('id', DEAL_ID);
    expect(deals.eq).toHaveBeenCalledWith('org_id', ORG_ID);
  });

  test('moves a won deal out of Won and reopens it', async () => {
    const { client, deals } = createClient({
      current: { data: deal({ status: 'won', stage_id: WON_ID }), error: null },
    });

    await moveCrmDeal(client, ORG_ID, DEAL_ID, LEAD_ID, NOW);

    expect(deals.update).toHaveBeenCalledWith({
      stage_id: LEAD_ID,
      status: 'open',
      won_at: null,
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
  });

  test('moves an open deal between other stages without touching its status', async () => {
    const other = { id: 'qualified', name: 'Qualified', pipeline_id: PIPELINE_ID };
    const { client, deals } = createClient({ stages: [LEAD, other, WON] });

    await moveCrmDeal(client, ORG_ID, DEAL_ID, 'qualified', NOW);

    expect(deals.update).toHaveBeenCalledWith({
      stage_id: 'qualified',
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
  });

  test('keeps a lost deal lost when it moves between other stages', async () => {
    const other = { id: 'qualified', name: 'Qualified', pipeline_id: PIPELINE_ID };
    const { client, deals } = createClient({
      current: { data: deal({ status: 'lost' }), error: null },
      stages: [LEAD, other, WON],
    });

    await moveCrmDeal(client, ORG_ID, DEAL_ID, 'qualified', NOW);

    expect(deals.update.mock.calls[0][0]).not.toHaveProperty('status');
  });

  test('does nothing when the deal is already in that stage', async () => {
    const { client, deals } = createClient();

    await expect(moveCrmDeal(client, ORG_ID, DEAL_ID, LEAD_ID, NOW)).resolves.toBeUndefined();
    expect(deals.update).not.toHaveBeenCalled();
  });

  test('refuses a stage from another pipeline', async () => {
    const { client, deals } = createClient({
      stages: [LEAD, { ...WON, pipeline_id: 'another-pipeline' }],
    });

    await expectRejectsWithFormError(
      moveCrmDeal(client, ORG_ID, DEAL_ID, WON_ID, NOW),
      "Choose a stage from this deal's pipeline.",
    );
    expect(deals.update).not.toHaveBeenCalled();
  });

  test('says which of the deal and the stage is gone', async () => {
    await expectRejectsWithFormError(
      moveCrmDeal(createClient({ current: { data: null, error: null } }).client, ORG_ID, DEAL_ID, WON_ID, NOW),
      'That deal no longer exists.',
    );
    await expectRejectsWithFormError(
      moveCrmDeal(createClient({ stages: [LEAD] }).client, ORG_ID, DEAL_ID, WON_ID, NOW),
      'That stage no longer exists. Choose another.',
    );
    await expectRejectsWithFormError(
      moveCrmDeal(createClient({ written: { data: [], error: null } }).client, ORG_ID, DEAL_ID, WON_ID, NOW),
      'That deal no longer exists.',
    );
  });
});

describe('markCrmDealLost', () => {
  test('marks one deal in one org lost, with the reason', async () => {
    const { client, from, deals } = createClient();

    await expect(
      markCrmDealLost(client, ORG_ID, DEAL_ID, 'Chose a cheaper vendor', NOW),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_deals');
    expect(deals.update).toHaveBeenCalledWith({
      status: 'lost',
      lost_at: STAMP,
      lost_reason: 'Chose a cheaper vendor',
      won_at: null,
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
    expect(deals.eq).toHaveBeenCalledTimes(2);
    expect(deals.eq).toHaveBeenCalledWith('id', DEAL_ID);
    expect(deals.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(deals.select).toHaveBeenCalledWith('id');
  });

  test('stores no reason when none was given', async () => {
    const { client, deals } = createClient();

    await markCrmDealLost(client, ORG_ID, DEAL_ID, null, NOW);

    expect(deals.update.mock.calls[0][0]).toMatchObject({ status: 'lost', lost_reason: null });
  });

  test('says the deal is gone when no row was updated', async () => {
    const { client } = createClient({ written: { data: [], error: null } });

    await expectRejectsWithFormError(
      markCrmDealLost(client, ORG_ID, DEAL_ID, null, NOW),
      'That deal no longer exists.',
    );
  });

  test('rethrows a database error', async () => {
    const denied = { code: '42501', message: 'permission denied' };
    const { client } = createClient({ written: { data: null, error: denied } });

    await expect(markCrmDealLost(client, ORG_ID, DEAL_ID, null, NOW)).rejects.toBe(denied);
  });
});

describe('reopenCrmDeal', () => {
  test('puts a lost deal back to open and clears why it was lost', async () => {
    const { client, deals } = createClient({
      current: { data: deal({ status: 'lost' }), error: null },
    });

    await expect(reopenCrmDeal(client, ORG_ID, DEAL_ID, NOW)).resolves.toBeUndefined();

    expect(deals.update).toHaveBeenCalledWith({
      status: 'open',
      won_at: null,
      lost_at: null,
      lost_reason: null,
      last_activity_at: STAMP,
      updated_at: STAMP,
    });
    expect(deals.eq).toHaveBeenCalledWith('id', DEAL_ID);
    expect(deals.eq).toHaveBeenCalledWith('org_id', ORG_ID);
  });

  test('makes a lost deal that sits in Won a won deal again', async () => {
    const { client, deals } = createClient({
      current: { data: deal({ status: 'lost', stage_id: WON_ID }), error: null },
    });

    await reopenCrmDeal(client, ORG_ID, DEAL_ID, NOW);

    expect(deals.update.mock.calls[0][0]).toMatchObject({
      status: 'won',
      won_at: STAMP,
      lost_at: null,
      lost_reason: null,
    });
  });

  test('does nothing to a deal that is not lost', async () => {
    for (const status of ['open', 'won']) {
      const { client, deals } = createClient({ current: { data: deal({ status }), error: null } });

      await expect(reopenCrmDeal(client, ORG_ID, DEAL_ID, NOW)).resolves.toBeUndefined();
      expect(deals.update).not.toHaveBeenCalled();
    }
  });

  test('says the deal is gone when it cannot be read', async () => {
    const { client } = createClient({ current: { data: null, error: null } });

    await expectRejectsWithFormError(
      reopenCrmDeal(client, ORG_ID, DEAL_ID, NOW),
      'That deal no longer exists.',
    );
  });
});

describe('deleteCrmDeal', () => {
  test('deletes one deal in one org', async () => {
    const { client, from, deals } = createClient();

    await expect(deleteCrmDeal(client, ORG_ID, DEAL_ID)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_deals');
    expect(deals.delete).toHaveBeenCalledWith();
    expect(deals.eq).toHaveBeenCalledTimes(2);
    expect(deals.eq).toHaveBeenCalledWith('id', DEAL_ID);
    expect(deals.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(deals.select).toHaveBeenCalledWith('id');
  });

  test('says the deal is gone when no row was deleted', async () => {
    const { client } = createClient({ written: { data: [], error: null } });

    await expectRejectsWithFormError(
      deleteCrmDeal(client, ORG_ID, DEAL_ID),
      'That deal no longer exists.',
    );
  });

  test('rethrows a database error', async () => {
    const denied = new Error('42501');
    const { client } = createClient({ written: { data: null, error: denied } });

    await expect(deleteCrmDeal(client, ORG_ID, DEAL_ID)).rejects.toBe(denied);
  });
});
