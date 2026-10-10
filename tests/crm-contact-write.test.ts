import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  CrmContactFormError,
  deleteCrmContact,
  mapCrmContact,
  parseCrmContactFields,
  readContactId,
  updateCrmContact,
  type CrmContactFields,
} from '@/lib/crm/contacts';

const CONTACT_ID = '3f2b8c1e-6a4d-4e2b-9c1f-0a1b2c3d4e5f';

const FIELDS: CrmContactFields = {
  first_name: 'Aisyah',
  last_name: 'Rahim',
  email: 'aisyah@example.com',
  phone: null,
  company: 'Rimba Ventures',
  country: 'MY',
  status: 'customer',
  lead_score: 80,
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** A `crm_contacts` write whose final `.select('id')` resolves to `result`. */
function createWriteClient(result: { data: { id: string }[] | null; error: unknown }) {
  const query = {
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(async () => result),
  };
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, from, query };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('edit form values on a mapped contact', () => {
  test('carries the raw column values keyed by the form field names', () => {
    const contact = mapCrmContact({
      id: CONTACT_ID,
      email: 'aisyah@example.com',
      company: null,
      first_name: 'Aisyah',
      last_name: null,
      phone: null,
      country: null,
      status: 'lead',
      lead_score: 72,
      owner_user_id: null,
      last_interaction_at: null,
    });

    expect(contact.form).toEqual({
      firstName: 'Aisyah',
      lastName: '',
      email: 'aisyah@example.com',
      phone: '',
      company: '',
      country: '',
      status: 'lead',
      leadScore: '72',
    });
    // The display fields keep their labels and placeholders.
    expect(contact.company).toBe('Personal');
    expect(contact.status).toBe('New Leads');
  });
});

describe('parseCrmContactFields', () => {
  test('returns the editable columns only', () => {
    const fields = parseCrmContactFields(
      form({
        firstName: ' Aisyah ',
        lastName: 'Rahim',
        email: 'AISYAH@example.com',
        company: 'Rimba Ventures',
        status: 'archived',
        leadScore: '140',
      }),
    );

    expect(fields).toEqual({
      first_name: 'Aisyah',
      last_name: 'Rahim',
      email: 'aisyah@example.com',
      phone: null,
      company: 'Rimba Ventures',
      country: 'MY',
      status: 'archived',
      lead_score: 100,
    });
    expect(fields).not.toHaveProperty('org_id');
  });

  test('requires a first name', () => {
    expect(() => parseCrmContactFields(form({ email: 'aisyah@example.com' }))).toThrow(
      CrmContactFormError,
    );
  });
});

describe('readContactId', () => {
  test('returns a UUID contact id', () => {
    expect(readContactId(form({ contactId: ` ${CONTACT_ID} ` }))).toBe(CONTACT_ID);
  });

  test('rejects a missing or malformed id', () => {
    expect(() => readContactId(form({}))).toThrow(CrmContactFormError);
    expect(() => readContactId(form({ contactId: 'contact-1' }))).toThrow(
      'That contact could not be found.',
    );
    expect(() => readContactId(form({ contactId: `${CONTACT_ID},org_id.neq.x` }))).toThrow(
      'That contact could not be found.',
    );
  });
});

describe('updateCrmContact', () => {
  test('writes the fields and updated_at to one contact in one org', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T08:30:00.000Z'));
    const { client, from, query } = createWriteClient({ data: [{ id: CONTACT_ID }], error: null });

    await expect(updateCrmContact(client, 'org-1', CONTACT_ID, FIELDS)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_contacts');
    expect(query.update).toHaveBeenCalledWith({
      ...FIELDS,
      updated_at: '2026-10-10T08:30:00.000Z',
    });
    expect(query.eq).toHaveBeenCalledTimes(2);
    expect(query.eq).toHaveBeenCalledWith('id', CONTACT_ID);
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(query.select).toHaveBeenCalledWith('id');
  });

  test('throws a form error when no row was updated', async () => {
    const { client } = createWriteClient({ data: [], error: null });

    const update = updateCrmContact(client, 'org-1', CONTACT_ID, FIELDS);

    await expect(update).rejects.toBeInstanceOf(CrmContactFormError);
    await expect(update).rejects.toThrow('That contact no longer exists.');
  });

  test('rethrows a database error', async () => {
    const failure = new Error('42501');
    const { client } = createWriteClient({ data: null, error: failure });

    await expect(updateCrmContact(client, 'org-1', CONTACT_ID, FIELDS)).rejects.toBe(failure);
  });
});

describe('deleteCrmContact', () => {
  test('deletes one contact in one org', async () => {
    const { client, from, query } = createWriteClient({ data: [{ id: CONTACT_ID }], error: null });

    await expect(deleteCrmContact(client, 'org-1', CONTACT_ID)).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith('crm_contacts');
    expect(query.delete).toHaveBeenCalledWith();
    expect(query.eq).toHaveBeenCalledTimes(2);
    expect(query.eq).toHaveBeenCalledWith('id', CONTACT_ID);
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(query.select).toHaveBeenCalledWith('id');
  });

  test('throws a form error when no row was deleted', async () => {
    const { client } = createWriteClient({ data: [], error: null });

    const removal = deleteCrmContact(client, 'org-1', CONTACT_ID);

    await expect(removal).rejects.toBeInstanceOf(CrmContactFormError);
    await expect(removal).rejects.toThrow('That contact no longer exists.');
  });

  test('rethrows a database error', async () => {
    const failure = new Error('42501');
    const { client } = createWriteClient({ data: null, error: failure });

    await expect(deleteCrmContact(client, 'org-1', CONTACT_ID)).rejects.toBe(failure);
  });
});
