import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, test, vi } from 'vitest';
import {
  createCrmContact,
  parseCrmContactForm,
} from '@/lib/crm/contacts';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function createInsertClient() {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: {
        id: 'contact-1',
        email: 'aisyah@example.com',
        company: 'Rimba Ventures',
        first_name: 'Aisyah',
        last_name: 'Rahim',
        phone: '+60123456789',
        country: 'MY',
        status: 'qualified',
        lead_score: 72,
        owner_user_id: null,
        last_interaction_at: null,
      },
      error: null,
    })),
  };
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, from, query };
}

describe('create Kasturi contact', () => {
  test('parses form data into an org-scoped insert payload', () => {
    const payload = parseCrmContactForm(
      form({
        firstName: ' Aisyah ',
        lastName: ' Rahim ',
        email: ' AISYAH@EXAMPLE.COM ',
        phone: ' +60123456789 ',
        company: ' Rimba Ventures ',
        country: ' my ',
        status: 'Qualified',
        leadScore: '72',
      }),
      'org-1',
    );

    expect(payload).toEqual({
      org_id: 'org-1',
      first_name: 'Aisyah',
      last_name: 'Rahim',
      email: 'aisyah@example.com',
      phone: '+60123456789',
      company: 'Rimba Ventures',
      country: 'MY',
      status: 'qualified',
      lead_score: 72,
    });
  });

  test('accepts archived as a status', () => {
    const payload = parseCrmContactForm(
      form({ firstName: 'Aisyah', email: 'aisyah@example.com', status: 'Archived' }),
      'org-1',
    );

    expect(payload.status).toBe('archived');
  });

  test('sets the owner only when an owner id is passed', () => {
    const values = form({ firstName: 'Aisyah', email: 'aisyah@example.com' });

    expect(parseCrmContactForm(values, 'org-1', 'user-1').owner_user_id).toBe('user-1');
    expect(parseCrmContactForm(values, 'org-1')).not.toHaveProperty('owner_user_id');
    expect(parseCrmContactForm(values, 'org-1', null)).not.toHaveProperty('owner_user_id');
    expect(parseCrmContactForm(values, 'org-1', '')).not.toHaveProperty('owner_user_id');
  });

  test('rejects an invalid email before insert', () => {
    expect(() =>
      parseCrmContactForm(
        form({ firstName: 'Aisyah', email: 'bad-email' }),
        'org-1',
      ),
    ).toThrow('Enter a valid email.');
  });

  test('defaults to the status and country the table accepts', () => {
    const payload = parseCrmContactForm(
      form({ firstName: 'Aisyah', email: 'aisyah@example.com', status: 'new' }),
      'org-1',
    );

    // crm_contacts.status allows lead, contacted, qualified, customer, archived.
    expect(payload.status).toBe('lead');
    expect(payload.country).toBe('MY');
    expect(payload).not.toHaveProperty('company_name');
  });

  test('rejects a country that is not a two-letter code', () => {
    expect(() =>
      parseCrmContactForm(
        form({ firstName: 'Aisyah', email: 'aisyah@example.com', country: 'Malaysia' }),
        'org-1',
      ),
    ).toThrow('Use a two-letter country code, such as MY.');
  });

  test('inserts the contact and maps the returned row', async () => {
    const { client, from, query } = createInsertClient();

    const contact = await createCrmContact(client, {
      org_id: 'org-1',
      first_name: 'Aisyah',
      last_name: 'Rahim',
      email: 'aisyah@example.com',
      phone: '+60123456789',
      company: 'Rimba Ventures',
      country: 'MY',
      status: 'qualified',
      lead_score: 72,
    });

    expect(from).toHaveBeenCalledWith('crm_contacts');
    expect(query.insert).toHaveBeenCalledWith({
      org_id: 'org-1',
      first_name: 'Aisyah',
      last_name: 'Rahim',
      email: 'aisyah@example.com',
      phone: '+60123456789',
      company: 'Rimba Ventures',
      country: 'MY',
      status: 'qualified',
      lead_score: 72,
    });
    expect(query.select).toHaveBeenCalled();
    expect(query.single).toHaveBeenCalled();
    expect(contact.email).toBe('aisyah@example.com');
    expect(contact.status).toBe('Qualified');
  });
});
