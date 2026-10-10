/**
 * Jebat (`reach`) domain types.
 *
 * These mirror the slice-1 Postgres schema (see the Jebat backend design doc,
 * §4.2): money is stored in **cents** to avoid float drift, and every row that
 * will live in Postgres carries the same field names the tables use. Keeping the
 * shapes identical here means the data slice can swap the seed-backed
 * {@link ReachData} provider for an RLS-scoped Supabase one without touching the
 * AI tools or their aggregation math.
 */

export type Channel = 'whatsapp' | 'facebook' | 'instagram' | 'tiktok';
export type CampaignStatus = 'active' | 'paused';
export type LeadStage = 'lead' | 'contacted' | 'qualified' | 'booked' | 'won';

/** The lead lifecycle, earliest → furthest. A lead's `stage` is the furthest it reached. */
export const LEAD_STAGES: readonly LeadStage[] = [
  'lead',
  'contacted',
  'qualified',
  'booked',
  'won',
];

export type Campaign = {
  id: string;
  name: string;
  channel: Channel;
  status: CampaignStatus;
  /** Ad-platform-reported leads for the campaign (not reconciled against CRM `leads`). */
  leads_count: number;
  spend_cents: number;
  /** Cost per lead, in cents. */
  cpl_cents: number;
  created_at: string;
};

export type Lead = {
  id: string;
  name: string;
  channel: Channel;
  /** Furthest stage this lead has reached. */
  stage: LeadStage;
  source: string;
  created_at: string;
};

export type Appointment = {
  id: string;
  contact_name: string;
  kind: string;
  scheduled_at: string;
  via: string;
  created_at: string;
};

export type FormStatus = 'active' | 'paused';
export type BroadcastChannel = 'whatsapp' | 'email';
export type AutomationStatus = 'active' | 'paused' | 'draft';

/** A lead-capture form. */
export type Form = {
  id: string;
  name: string;
  channel: Channel;
  submissions_count: number;
  status: FormStatus;
  created_at: string;
};

/** A one-to-many email / WhatsApp message blast. */
export type Broadcast = {
  id: string;
  name: string;
  channel: BroadcastChannel;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  sent_at: string;
  created_at: string;
};

/** An automation workflow (trigger → actions). */
export type Automation = {
  id: string;
  name: string;
  trigger: string;
  status: AutomationStatus;
  runs_count: number;
  created_at: string;
};

/**
 * The data seam the AI tools read through. The seed provider returns in-memory
 * fixtures today; the data slice adds a Supabase provider whose methods query
 * with the caller's session so Postgres RLS scopes every read to their org.
 */
export interface ReachData {
  listCampaigns(): Promise<Campaign[]>;
  listLeads(): Promise<Lead[]>;
  listAppointments(): Promise<Appointment[]>;
  listForms(): Promise<Form[]>;
  listBroadcasts(): Promise<Broadcast[]>;
  listAutomations(): Promise<Automation[]>;
}
