import { describe, expect, it } from 'vitest';
import { approvalTitle } from '@/components/chat/tool-parts';
import { CRM_WRITE_TOOL_NAMES, createCrmTools } from '@/lib/ai/crm-tools';
import {
  KASTURI_SHARED_TOOL_NAMES,
  REACH_WRITE_TOOL_NAMES,
  combineToolkits,
  crmProduct,
  kasturiSharedProduct,
  reachProduct,
} from '@/lib/ai/products';
import { filterUpcomingAppointments } from '@/lib/ai/tools';
import { nameIn } from '@/lib/chat/change-titles';
import { createSeedReachData } from '@/lib/reach/seed';

const CONTACT = '11111111-1111-4111-8111-111111111111';
const FOLLOW_UP = '22222222-2222-4222-8222-222222222222';

type Filter = [string, string, unknown];

/**
 * A stand-in for the Supabase client: each table answers with fixed rows, and
 * what was asked of it (filters, inserts, updates) is kept for the test to read.
 */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  const seen = {
    filters: [] as { table: string; filters: Filter[] }[],
    inserts: [] as { table: string; row: Record<string, unknown> }[],
    updates: [] as { table: string; patch: Record<string, unknown> }[],
  };
  const from = (table: string) => {
    const filters: Filter[] = [];
    seen.filters.push({ table, filters });
    const rows = () => tables[table] ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'limit', 'not']) builder[method] = () => builder;
    for (const method of ['eq', 'is', 'in', 'gte', 'lt', 'neq']) {
      builder[method] = (column: string, value: unknown) => {
        filters.push([method, column, value]);
        return builder;
      };
    }
    builder.insert = async (row: Record<string, unknown>) => {
      seen.inserts.push({ table, row });
      return { error: null };
    };
    builder.update = (patch: Record<string, unknown>) => {
      seen.updates.push({ table, patch });
      return builder;
    };
    builder.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: rows(), count: rows().length, error: null });
    return builder;
  };
  return { client: { from } as never, seen };
}

function tools(tables: Record<string, Record<string, unknown>[]>, canWrite = true) {
  const { client, seen } = fakeClient(tables);
  const all = createCrmTools({ client, orgId: 'org1', userId: 'user1', canWrite });
  const run = (name: string, input: unknown) =>
    (all as unknown as Record<string, { execute: (input: unknown, options: unknown) => Promise<unknown> }>)[
      name
    ].execute(input, { toolCallId: 't1', messages: [] });
  return { all, run, seen };
}

describe('Kasturi’s follow-up tools', () => {
  it('lists open follow-ups with the contact’s name and whether each is overdue', async () => {
    const { run, seen } = tools({
      crm_activities: [
        { id: FOLLOW_UP, title: 'Send quote', due_at: '2020-01-05T00:00:00.000Z', contact_id: CONTACT },
        { id: 'f2', title: 'Someday', due_at: null, contact_id: CONTACT },
      ],
      crm_contacts: [{ id: CONTACT, first_name: 'Aisyah', last_name: 'Rahim' }],
    });
    expect(await run('listFollowUps', {})).toEqual({
      total_open: 2,
      follow_ups: [
        { id: FOLLOW_UP, name: 'Send quote', contact: 'Aisyah Rahim', contact_id: CONTACT, due: '2020-01-05', overdue: true },
        { id: 'f2', name: 'Someday', contact: 'Aisyah Rahim', contact_id: CONTACT, due: null, overdue: false },
      ],
    });
    // Only this workspace's open tasks are read.
    expect(seen.filters[0]).toEqual({
      table: 'crm_activities',
      filters: [
        ['eq', 'org_id', 'org1'],
        ['eq', 'type', 'task'],
        ['is', 'completed_at', null],
      ],
    });
  });

  it('adds a follow-up for a contact, owned by whoever asked', async () => {
    const { run, seen } = tools({});
    const result = await run('createFollowUp', {
      contactId: CONTACT,
      title: ' Send the quotation ',
      dueDate: '2026-10-14',
    });
    expect(result).toEqual({ ok: true, data: { name: 'Send the quotation', due: '2026-10-14' } });
    expect(seen.inserts).toEqual([
      {
        table: 'crm_activities',
        row: {
          org_id: 'org1',
          contact_id: CONTACT,
          type: 'task',
          title: 'Send the quotation',
          due_at: '2026-10-14T00:00:00.000Z',
          owner_user_id: 'user1',
        },
      },
    ]);
  });

  it('refuses a date that does not exist, as a plain message', async () => {
    const { run, seen } = tools({});
    expect(await run('createFollowUp', { contactId: CONTACT, title: 'Call', dueDate: '2026-02-30' })).toEqual({
      ok: false,
      error: 'Enter a valid due date.',
    });
    expect(seen.inserts).toEqual([]);
  });

  it('marks a follow-up done and names it', async () => {
    const { run, seen } = tools({ crm_activities: [{ id: FOLLOW_UP, title: 'Send quote' }] });
    expect(await run('completeFollowUp', { id: FOLLOW_UP })).toEqual({
      ok: true,
      data: { id: FOLLOW_UP, name: 'Send quote', done: true },
    });
    expect(seen.updates).toHaveLength(1);
    expect(seen.updates[0].patch.completed_at).toEqual(expect.any(String));
  });

  it('a viewer can look up follow-ups and the calendar but change nothing', () => {
    const { all } = tools({}, false);
    expect(Object.keys(all)).toEqual(expect.arrayContaining(['listFollowUps', 'getCalendar']));
    for (const name of CRM_WRITE_TOOL_NAMES) expect(all).not.toHaveProperty(name);
  });
});

describe('Kasturi’s calendar tool', () => {
  it('gives the month’s entries in date order, with times in Malaysia', async () => {
    const { run } = tools({
      appointments: [
        // 23:30 UTC on the 14th is 7:30 am on the 15th in Malaysia.
        { id: 'a1', contact_name: 'Lim Wei', kind: 'Demo', scheduled_at: '2026-10-14T23:30:00.000Z', status: 'scheduled' },
      ],
      crm_activities: [{ id: FOLLOW_UP, title: 'Send quote', due_at: '2026-10-12T00:00:00.000Z' }],
    });
    const result = (await run('getCalendar', { month: '2026-10' })) as {
      month: string;
      entries: unknown[];
    };
    expect(result.month).toBe('2026-10');
    expect(result.entries).toEqual([
      { date_in_malaysia: '2026-10-12', time_in_malaysia: null, kind: 'follow-up', what: 'Send quote' },
      { date_in_malaysia: '2026-10-15', time_in_malaysia: '7:30 am', kind: 'appointment', what: 'Lim Wei · Demo' },
    ]);
  });
});

describe('upcoming appointments', () => {
  it('carry their time in Malaysia, ready to say as given', () => {
    const [first] = filterUpcomingAppointments(
      [
        {
          id: 'a1',
          contact_name: 'Lim Wei',
          kind: 'Demo',
          // 23:30 UTC on the 14th is 7:30 am on the 15th in Malaysia.
          scheduled_at: '2026-10-14T23:30:00.000Z',
          via: 'Zoom',
          status: 'scheduled',
          created_at: '2026-10-01T00:00:00.000Z',
        },
      ],
      new Date('2026-10-10T00:00:00.000Z'),
    );
    expect(first.malaysia_time).toBe('15 Oct 2026, 7:30 am');
    expect(first.scheduled_at).toBe('2026-10-14T23:30:00.000Z');
  });
});

describe('the tools Kasturi shares with Jebat', () => {
  const reach = (canWrite: boolean) => ({
    data: createSeedReachData(),
    write: canWrite ? { ctx: { client: {} as never, orgId: 'org1' }, canWrite } : undefined,
  });
  const crm = crmProduct({ client: {} as never, orgId: 'org1', userId: 'user1', canWrite: true });

  it('are the appointment and lead-form tools, and nothing else from marketing', () => {
    const shared = kasturiSharedProduct(reach(true));
    expect(Object.keys({ ...shared.read, ...shared.write }).sort()).toEqual([...KASTURI_SHARED_TOOL_NAMES].sort());
    expect(Object.keys(shared.read).sort()).toEqual(['getUpcomingAppointments', 'listForms']);
  });

  it('every change among them waits for approval', () => {
    const { toolApproval } = combineToolkits([crm, kasturiSharedProduct(reach(true))]);
    for (const name of KASTURI_SHARED_TOOL_NAMES) {
      const isWrite = (REACH_WRITE_TOOL_NAMES as readonly string[]).includes(name);
      expect(toolApproval?.[name]).toBe(isWrite ? 'user-approval' : undefined);
    }
    expect(toolApproval?.createFollowUp).toBe('user-approval');
    expect(toolApproval?.completeFollowUp).toBe('user-approval');
  });

  it('someone who may not change anything gets only the lookups', () => {
    expect(Object.keys(kasturiSharedProduct(reach(false)).write)).toEqual([]);
  });

  it('Tuah still gets each tool once: Kasturi’s own tools never repeat Jebat’s', () => {
    expect(() => combineToolkits([reachProduct(reach(true)), crm])).not.toThrow();
  });
});

describe('approval cards for follow-ups', () => {
  const named = nameIn([
    { tool: 'listCrmContacts', output: { contacts: [{ id: CONTACT, name: 'Aisyah Rahim' }] } },
    { tool: 'listFollowUps', output: { follow_ups: [{ id: FOLLOW_UP, name: 'Send quote' }] } },
  ]);

  it('name the follow-up and who it is for', () => {
    expect(approvalTitle('createFollowUp', { contactId: CONTACT, title: 'Send quote' }, named)).toBe(
      'Add follow-up “Send quote” for Aisyah Rahim?',
    );
    expect(approvalTitle('createFollowUp', { contactId: 'unknown', title: 'Send quote' }, named)).toBe(
      'Add follow-up “Send quote”?',
    );
  });

  it('name the follow-up being marked done', () => {
    expect(approvalTitle('completeFollowUp', { id: FOLLOW_UP }, named)).toBe('Mark follow-up “Send quote” as done?');
    expect(approvalTitle('completeFollowUp', { id: 'unknown' }, named)).toBe('Mark this follow-up as done?');
  });
});
