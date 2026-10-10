import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmContact = {
  id: string;
  email: string;
  company: string;
  first: string;
  last: string;
  phone: string;
  country: string;
  status: string | null;
  score: number;
  pic: string | null;
  lastInteraction: string | null;
  /** Raw values keyed by the form's field names, for prefilling the edit form. */
  form?: Record<string, string>;
};

export type CrmContactsResult = {
  contacts: CrmContact[];
  total: number;
};

/** The columns of `crm_contacts` a person can edit. */
export type CrmContactFields = {
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  country: string;
  status: string;
  lead_score: number;
};

export type CrmContactInsert = CrmContactFields & {
  org_id: string;
  owner_user_id?: string;
};

/** A problem with what was typed, safe to show beside the form. */
export class CrmContactFormError extends Error {}

type CrmContactRow = {
  id: string;
  email: string | null;
  company: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  status: string;
  lead_score: number;
  owner_user_id: string | null;
  last_interaction_at: string | null;
};

/** Columns of `crm_contacts` the Contacts screen lists. */
const CONTACT_COLUMNS = [
  'id',
  'email',
  'company',
  'first_name',
  'last_name',
  'phone',
  'country',
  'status',
  'lead_score',
  'owner_user_id',
  'last_interaction_at',
].join(',');

/** Database status -> the label the screen shows. */
const STATUS_LABELS: Record<string, string> = {
  lead: 'New Leads',
  contacted: 'Contacted',
  qualified: 'Qualified',
  customer: 'Customer',
  archived: 'Archived',
};

/** Statuses the contact form accepts; all are allowed by the table. */
const STATUSES = new Set(['lead', 'contacted', 'qualified', 'customer', 'archived']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function optionalString(value: string) {
  return value.length > 0 ? value : null;
}

function normalizeStatus(value: string) {
  const status = value.trim().toLowerCase().replaceAll(' ', '_');
  return STATUSES.has(status) ? status : 'lead';
}

function normalizeScore(value: string) {
  if (!value) return 0;
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

/** Validates the editable fields shared by the add and edit forms. */
export function parseCrmContactFields(formData: FormData): CrmContactFields {
  const firstName = readString(formData, 'firstName');
  const lastName = readString(formData, 'lastName');
  const email = readString(formData, 'email').toLowerCase();
  const phone = readString(formData, 'phone');
  const company = readString(formData, 'company');
  const country = readString(formData, 'country').toUpperCase() || 'MY';
  const status = readString(formData, 'status');
  const leadScore = readString(formData, 'leadScore');

  if (!firstName) throw new CrmContactFormError('Enter a first name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new CrmContactFormError('Enter a valid email.');
  // The table stores a two-letter country code.
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new CrmContactFormError('Use a two-letter country code, such as MY.');
  }

  return {
    first_name: firstName,
    last_name: optionalString(lastName),
    email,
    phone: optionalString(phone),
    company: optionalString(company),
    country,
    status: normalizeStatus(status),
    lead_score: normalizeScore(leadScore),
  };
}

/** The insert payload for a new contact, owned by `ownerUserId` when given. */
export function parseCrmContactForm(
  formData: FormData,
  orgId: string,
  ownerUserId?: string | null,
): CrmContactInsert {
  return {
    org_id: orgId,
    ...parseCrmContactFields(formData),
    ...(ownerUserId ? { owner_user_id: ownerUserId } : {}),
  };
}

/** The id of the contact an edit or delete form is about. */
export function readContactId(formData: FormData): string {
  const id = readString(formData, 'contactId');
  if (!UUID.test(id)) throw new CrmContactFormError('That contact could not be found.');
  return id;
}

export function mapCrmContact(row: CrmContactRow, ownerName: string | null = null): CrmContact {
  return {
    id: row.id,
    email: row.email ?? '',
    company: row.company ?? 'Personal',
    first: row.first_name,
    last: row.last_name ?? '',
    phone: row.phone ?? '',
    country: row.country ?? '—',
    status: STATUS_LABELS[row.status] ?? null,
    score: row.lead_score,
    pic: ownerName,
    lastInteraction: formatDate(row.last_interaction_at),
    form: {
      firstName: row.first_name,
      lastName: row.last_name ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      company: row.company ?? '',
      country: row.country ?? '',
      status: row.status,
      leadScore: String(row.lead_score),
    },
  };
}

/**
 * The person in charge is stored as `owner_user_id`; the name shown comes from
 * `profiles`. A name that cannot be read (no profile, or the lookup fails) is
 * shown as blank and never fails the page.
 */
async function ownerNames(client: SupabaseClient, rows: CrmContactRow[]) {
  const names = new Map<string, string>();
  const ids = [
    ...new Set(rows.map((r) => r.owner_user_id).filter((id): id is string => !!id)),
  ];
  if (ids.length === 0) return names;

  const { data, error } = await client
    .from('profiles')
    .select('user_id,full_name')
    .in('user_id', ids);
  if (error) return names;

  for (const p of (data ?? []) as { user_id: string; full_name: string | null }[]) {
    if (p.full_name) names.set(p.user_id, p.full_name);
  }
  return names;
}

export async function listCrmContacts(
  client: SupabaseClient,
  orgId: string,
  limit = 20,
): Promise<CrmContactsResult> {
  const { data, count, error } = await client
    .from('crm_contacts')
    .select(CONTACT_COLUMNS, { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as unknown as CrmContactRow[];
  const names = await ownerNames(client, rows);

  return {
    contacts: rows.map((row) =>
      mapCrmContact(row, row.owner_user_id ? (names.get(row.owner_user_id) ?? null) : null),
    ),
    total: count ?? rows.length,
  };
}

export async function createCrmContact(
  client: SupabaseClient,
  payload: CrmContactInsert,
): Promise<CrmContact> {
  const { data, error } = await client
    .from('crm_contacts')
    .insert(payload)
    .select(CONTACT_COLUMNS)
    .single();

  if (error) throw error;
  return mapCrmContact(data as unknown as CrmContactRow);
}

/**
 * Nothing in the database maintains `updated_at`, so the write sets it. A
 * contact that is gone, or belongs to another org, matches no row.
 */
export async function updateCrmContact(
  client: SupabaseClient,
  orgId: string,
  id: string,
  fields: CrmContactFields,
): Promise<void> {
  const { data, error } = await client
    .from('crm_contacts')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new CrmContactFormError('That contact no longer exists.');
  }
}

export async function deleteCrmContact(
  client: SupabaseClient,
  orgId: string,
  id: string,
): Promise<void> {
  const { data, error } = await client
    .from('crm_contacts')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new CrmContactFormError('That contact no longer exists.');
  }
}
