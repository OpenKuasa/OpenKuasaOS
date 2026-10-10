import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import { listCrmContacts } from '@/lib/crm/contacts';

type Result = { data: unknown[] | null; count?: number | null; error: unknown };

function createClient(contacts: Result, profiles: Result = { data: [], error: null }) {
  const contactsQuery = {
    select: vi.fn(() => contactsQuery),
    eq: vi.fn(() => contactsQuery),
    order: vi.fn(() => contactsQuery),
    limit: vi.fn(async () => contacts),
  };
  const profilesQuery = {
    select: vi.fn(() => profilesQuery),
    in: vi.fn(async () => profiles),
  };
  const from = vi.fn((table: string) => (table === 'profiles' ? profilesQuery : contactsQuery));
  return { client: { from } as unknown as SupabaseClient, from, contactsQuery, profilesQuery };
}

const ROW = {
  id: 'contact-1',
  email: 'aisyah@example.com',
  company: 'Rimba Ventures Sdn Bhd',
  first_name: 'Aisyah',
  last_name: 'Rahim',
  phone: '+60123456789',
  country: 'MY',
  status: 'qualified',
  lead_score: 92,
  owner_user_id: 'user-1',
  last_interaction_at: '2026-10-09T10:00:00.000Z',
};

describe('listCrmContacts', () => {
  test('reads contacts for one org and maps database rows to the screen model', async () => {
    const { client, from, contactsQuery, profilesQuery } = createClient(
      { data: [ROW], count: 8, error: null },
      { data: [{ user_id: 'user-1', full_name: 'Faiz Hakim' }], error: null },
    );

    const result = await listCrmContacts(client, 'org-1', 25);

    expect(from).toHaveBeenCalledWith('crm_contacts');
    // Exactly the columns of crm_contacts in the Kasturi schema migration.
    expect(contactsQuery.select).toHaveBeenCalledWith(
      'id,email,company,first_name,last_name,phone,country,status,lead_score,owner_user_id,last_interaction_at',
      { count: 'exact' },
    );
    expect(contactsQuery.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(contactsQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(contactsQuery.limit).toHaveBeenCalledWith(25);
    expect(profilesQuery.in).toHaveBeenCalledWith('user_id', ['user-1']);
    expect(result).toEqual({
      total: 8,
      contacts: [
        {
          id: 'contact-1',
          email: 'aisyah@example.com',
          company: 'Rimba Ventures Sdn Bhd',
          first: 'Aisyah',
          last: 'Rahim',
          phone: '+60123456789',
          country: 'MY',
          status: 'Qualified',
          score: 92,
          pic: 'Faiz Hakim',
          lastInteraction: '9 Oct 2026',
          form: {
            firstName: 'Aisyah',
            lastName: 'Rahim',
            email: 'aisyah@example.com',
            phone: '+60123456789',
            company: 'Rimba Ventures Sdn Bhd',
            country: 'MY',
            status: 'qualified',
            leadScore: '92',
          },
        },
      ],
    });
  });

  test('labels a new lead the way the screen does and leaves an unowned contact blank', async () => {
    const { client, from } = createClient({
      data: [
        { ...ROW, status: 'lead', owner_user_id: null, last_interaction_at: null, country: null },
      ],
      count: 1,
      error: null,
    });

    const { contacts } = await listCrmContacts(client, 'org-1');

    expect(contacts[0]).toMatchObject({
      status: 'New Leads',
      pic: null,
      lastInteraction: null,
      country: '—',
    });
    expect(from).not.toHaveBeenCalledWith('profiles');
  });

  test('still returns contacts when the owner names cannot be read', async () => {
    const { client } = createClient(
      { data: [ROW], count: 1, error: null },
      { data: null, error: new Error('denied') },
    );

    const { contacts } = await listCrmContacts(client, 'org-1');

    expect(contacts[0].pic).toBeNull();
  });

  test('throws when the contacts query fails, so the page can fall back', async () => {
    const { client } = createClient({ data: null, count: null, error: new Error('42P01') });

    await expect(listCrmContacts(client, 'org-1')).rejects.toThrow('42P01');
  });

  test('returns an empty list when the org has no contacts', async () => {
    const { client } = createClient({ data: [], count: 0, error: null });

    await expect(listCrmContacts(client, 'org-2')).resolves.toEqual({
      total: 0,
      contacts: [],
    });
  });
});
