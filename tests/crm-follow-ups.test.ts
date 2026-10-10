import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { CrmContactFormError } from '@/lib/crm/contacts';
import {
  completeFollowUp,
  createFollowUp,
  listOpenFollowUps,
  parseFollowUpForm,
  readFollowUpId,
  type CrmFollowUpInsert,
} from '@/lib/crm/follow-ups';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_CONTACT_ID = '33333333-3333-4333-8333-333333333333';
const FOLLOW_UP_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_ID = '55555555-5555-4555-8555-555555555555';

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

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

describe('parseFollowUpForm', () => {
  test('reads a full form into a task row for the contact', () => {
    const payload = parseFollowUpForm(
      form({ contactId: CONTACT_ID, title: '  Send the proposal  ', dueDate: '2026-10-12' }),
      ORG_ID,
      OWNER_ID,
    );

    expect(payload).toStrictEqual({
      org_id: ORG_ID,
      contact_id: CONTACT_ID,
      type: 'task',
      title: 'Send the proposal',
      due_at: '2026-10-12T00:00:00.000Z',
      owner_user_id: OWNER_ID,
    });
  });

  test('leaves the owner out when none is given and the due date null when blank', () => {
    const values = { contactId: CONTACT_ID, title: 'Call back', dueDate: '' };

    for (const payload of [
      parseFollowUpForm(form(values), ORG_ID),
      parseFollowUpForm(form(values), ORG_ID, null),
    ]) {
      expect(payload).not.toHaveProperty('owner_user_id');
      expect(payload.due_at).toBeNull();
    }
    expect(parseFollowUpForm(form({ contactId: CONTACT_ID, title: 'Call back' }), ORG_ID)).toStrictEqual({
      org_id: ORG_ID,
      contact_id: CONTACT_ID,
      type: 'task',
      title: 'Call back',
      due_at: null,
    });
  });

  test('rejects a missing or malformed contact id', () => {
    for (const contactId of ['', 'contact-1']) {
      expectFormError(
        () => parseFollowUpForm(form({ contactId, title: 'Call back' }), ORG_ID),
        'That contact could not be found.',
      );
    }
    expectFormError(
      () => parseFollowUpForm(form({ title: 'Call back' }), ORG_ID),
      'That contact could not be found.',
    );
  });

  test('rejects an empty title', () => {
    expectFormError(
      () => parseFollowUpForm(form({ contactId: CONTACT_ID, title: '   ' }), ORG_ID),
      'Enter what to follow up on.',
    );
  });

  test('accepts a 200 character title and rejects a longer one', () => {
    const ok = parseFollowUpForm(form({ contactId: CONTACT_ID, title: 'a'.repeat(200) }), ORG_ID);
    expect(ok.title).toHaveLength(200);

    expectFormError(
      () => parseFollowUpForm(form({ contactId: CONTACT_ID, title: 'a'.repeat(201) }), ORG_ID),
      'Keep the follow-up under 200 characters.',
    );
  });

  test('rejects a due date that is not a real YYYY-MM-DD date', () => {
    for (const dueDate of ['12/10/2026', '2026-10-1', '2026-02-30', '2026-13-01', 'tomorrow']) {
      expectFormError(
        () => parseFollowUpForm(form({ contactId: CONTACT_ID, title: 'Call back', dueDate }), ORG_ID),
        'Enter a valid due date.',
      );
    }
  });
});

describe('readFollowUpId', () => {
  test('returns the follow-up id', () => {
    expect(readFollowUpId(form({ followUpId: ` ${FOLLOW_UP_ID} ` }))).toBe(FOLLOW_UP_ID);
  });

  test('rejects a missing or malformed id', () => {
    const cases: Record<string, string>[] = [{}, { followUpId: '' }, { followUpId: 'not-a-uuid' }];
    for (const values of cases) {
      expectFormError(() => readFollowUpId(form(values)), 'That follow-up could not be found.');
    }
  });
});

describe('createFollowUp', () => {
  const PAYLOAD: CrmFollowUpInsert = {
    org_id: ORG_ID,
    contact_id: CONTACT_ID,
    type: 'task',
    title: 'Send the proposal',
    due_at: '2026-10-12T00:00:00.000Z',
  };

  function createClient(error: unknown) {
    const insert = vi.fn(async () => ({ error }));
    const from = vi.fn(() => ({ insert }));
    return { client: { from } as unknown as SupabaseClient, from, insert };
  }

  test('inserts the payload into crm_activities', async () => {
    const { client, from, insert } = createClient(null);

    await expect(createFollowUp(client, PAYLOAD)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_activities');
    expect(insert).toHaveBeenCalledWith(PAYLOAD);
  });

  test('rethrows a database error untouched', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    const { client } = createClient(dbError);

    await expect(createFollowUp(client, PAYLOAD)).rejects.toBe(dbError);
  });

  test('says the contact is gone when the foreign key fails', async () => {
    const { client } = createClient({ code: '23503', message: 'violates foreign key constraint' });

    const failure = createFollowUp(client, PAYLOAD);

    await expect(failure).rejects.toBeInstanceOf(CrmContactFormError);
    await expect(failure).rejects.toThrow('That contact no longer exists.');
  });
});

describe('completeFollowUp', () => {
  function createClient(result: { data: unknown[] | null; error: unknown }) {
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      select: vi.fn(async () => result),
    };
    const from = vi.fn(() => query);
    return { client: { from } as unknown as SupabaseClient, from, query };
  }

  test('stamps the task done, scoped by id, org and type', async () => {
    const { client, from, query } = createClient({ data: [{ id: FOLLOW_UP_ID }], error: null });
    const before = Date.now();

    await expect(completeFollowUp(client, ORG_ID, FOLLOW_UP_ID)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_activities');
    const [[patch]] = query.update.mock.calls as unknown as [[Record<string, string>]];
    expect(Object.keys(patch).sort()).toEqual(['completed_at', 'updated_at']);
    expect(patch.updated_at).toBe(patch.completed_at);
    expect(new Date(patch.completed_at).toISOString()).toBe(patch.completed_at);
    expect(Date.parse(patch.completed_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(patch.completed_at)).toBeLessThanOrEqual(Date.now());

    expect(query.eq.mock.calls).toEqual([
      ['id', FOLLOW_UP_ID],
      ['org_id', ORG_ID],
      ['type', 'task'],
    ]);
    expect(query.select).toHaveBeenCalledWith('id');
  });

  test('rethrows a database error untouched', async () => {
    const dbError = { code: '42501', message: 'permission denied' };
    const { client } = createClient({ data: null, error: dbError });

    await expect(completeFollowUp(client, ORG_ID, FOLLOW_UP_ID)).rejects.toBe(dbError);
  });

  test('says the follow-up is gone when no row was updated', async () => {
    for (const data of [[], null]) {
      const { client } = createClient({ data, error: null });

      const failure = completeFollowUp(client, ORG_ID, FOLLOW_UP_ID);

      await expect(failure).rejects.toBeInstanceOf(CrmContactFormError);
      await expect(failure).rejects.toThrow('That follow-up no longer exists.');
    }
  });
});

describe('listOpenFollowUps', () => {
  const NOW = new Date('2026-10-10T23:59:00.000Z');

  function createClient(result: { data: unknown[] | null; error: unknown }) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(async () => result),
    };
    const from = vi.fn(() => query);
    return { client: { from } as unknown as SupabaseClient, from, query };
  }

  test('reads the open tasks of one org, soonest due first', async () => {
    const { client, from, query } = createClient({ data: [], error: null });

    await expect(listOpenFollowUps(client, ORG_ID, 50, NOW)).resolves.toEqual({});

    expect(from).toHaveBeenCalledWith('crm_activities');
    expect(query.select).toHaveBeenCalledWith('id,contact_id,title,due_at');
    expect(query.eq.mock.calls).toEqual([
      ['org_id', ORG_ID],
      ['type', 'task'],
    ]);
    expect(query.is).toHaveBeenCalledWith('completed_at', null);
    expect(query.not).toHaveBeenCalledWith('contact_id', 'is', null);
    expect(query.order).toHaveBeenCalledWith('due_at', { ascending: true, nullsFirst: false });
    expect(query.limit).toHaveBeenCalledWith(50);
  });

  test('reads at most 200 rows by default', async () => {
    const { client, query } = createClient({ data: null, error: null });

    await expect(listOpenFollowUps(client, ORG_ID)).resolves.toEqual({});

    expect(query.limit).toHaveBeenCalledWith(200);
  });

  test('groups by contact, formats the due date and flags what is overdue', async () => {
    const { client } = createClient({
      data: [
        { id: 'f-1', contact_id: CONTACT_ID, title: 'Chase invoice', due_at: '2026-10-09T00:00:00.000Z' },
        { id: 'f-2', contact_id: OTHER_CONTACT_ID, title: 'Call back', due_at: '2026-10-10T00:00:00.000Z' },
        { id: 'f-3', contact_id: CONTACT_ID, title: 'Send proposal', due_at: '2026-10-12T00:00:00.000Z' },
        { id: 'f-4', contact_id: CONTACT_ID, title: 'Check in sometime', due_at: null },
      ],
      error: null,
    });

    const result = await listOpenFollowUps(client, ORG_ID, 200, NOW);

    expect(result).toEqual({
      [CONTACT_ID]: [
        { id: 'f-1', contactId: CONTACT_ID, title: 'Chase invoice', due: '9 Oct 2026', overdue: true },
        { id: 'f-3', contactId: CONTACT_ID, title: 'Send proposal', due: '12 Oct 2026', overdue: false },
        { id: 'f-4', contactId: CONTACT_ID, title: 'Check in sometime', due: null, overdue: false },
      ],
      [OTHER_CONTACT_ID]: [
        // Due today is not overdue, even late in the day.
        { id: 'f-2', contactId: OTHER_CONTACT_ID, title: 'Call back', due: '10 Oct 2026', overdue: false },
      ],
    });
  });

  test('compares dates in UTC, not the instant', async () => {
    const { client } = createClient({
      data: [{ id: 'f-1', contact_id: CONTACT_ID, title: 'Call back', due_at: '2026-10-10T00:00:00.000Z' }],
      error: null,
    });

    const early = await listOpenFollowUps(client, ORG_ID, 200, new Date('2026-10-10T00:00:01.000Z'));
    const nextDay = await listOpenFollowUps(client, ORG_ID, 200, new Date('2026-10-11T00:00:00.000Z'));

    expect(early[CONTACT_ID][0].overdue).toBe(false);
    expect(nextDay[CONTACT_ID][0].overdue).toBe(true);
  });

  test('throws when the query fails', async () => {
    const dbError = { code: '42P01', message: 'relation does not exist' };
    const { client } = createClient({ data: null, error: dbError });

    await expect(listOpenFollowUps(client, ORG_ID, 200, NOW)).rejects.toBe(dbError);
  });
});
