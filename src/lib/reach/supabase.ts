import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdSettings,
  Appointment,
  Automation,
  Broadcast,
  Campaign,
  Creative,
  Form,
  Lead,
  ReachData,
} from './types';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { createSeedReachData } from './seed';
import { FORM_COLUMNS } from './forms';

/**
 * RLS-scoped {@link ReachData} over Supabase. Reads are filtered to `orgId`
 * (the caller's current org); Postgres RLS independently guarantees no other
 * org's rows are reachable, so `orgId` is a workspace selector, not the security
 * boundary. Broadcasts/automations have no tables yet (later slices), so their
 * methods return [] rather than erroring.
 */
export function createSupabaseReachData(client: SupabaseClient, orgId: string): ReachData {
  async function rows<T>(table: string, columns: string, order: { col: string; asc: boolean }): Promise<T[]> {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('org_id', orgId)
      .order(order.col, { ascending: order.asc });
    if (error) throw error;
    return (data ?? []) as T[];
  }

  return {
    listCampaigns: () =>
      rows<Campaign>('campaigns', 'id,name,channel,status,leads_count,spend_cents,cpl_cents,created_at', {
        col: 'created_at', asc: false,
      }),
    listLeads: () =>
      rows<Lead>('leads', 'id,name,channel,stage,source,promoted_contact_id,created_at', { col: 'created_at', asc: false }),
    listAppointments: () =>
      rows<Appointment>('appointments', 'id,contact_name,kind,scheduled_at,via,created_at', {
        col: 'scheduled_at', asc: true,
      }),
    listCreatives: () =>
      rows<Creative>('creatives', 'id,campaign_id,name,type,channel,status,body,ctr,created_at', {
        col: 'created_at', asc: false,
      }),
    getAdSettings: async (): Promise<AdSettings | null> => {
      const { data, error } = await client
        .from('ad_settings')
        .select('daily_cap_cents,monthly_cap_cents,currency,automation,notifications,updated_at')
        .eq('org_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return (data as AdSettings) ?? null;
    },
    listForms: () => rows<Form>('forms', FORM_COLUMNS, { col: 'created_at', asc: false }),
    listBroadcasts: async (): Promise<Broadcast[]> => [],
    listAutomations: async (): Promise<Automation[]> => [],
  };
}

const EMPTY_REACH_DATA: ReachData = {
  listCampaigns: async () => [],
  listLeads: async () => [],
  listAppointments: async () => [],
  listForms: async () => [],
  listBroadcasts: async () => [],
  listAutomations: async () => [],
  listCreatives: async () => [],
  getAdSettings: async () => null,
};

/**
 * Request-scoped provider selection: RLS-scoped Supabase in prod, the seed
 * fixtures only when no project is configured (dev/preview/tests). One place,
 * so the route and the Overview stay consistent.
 */
export async function getReachData(client: SupabaseClient): Promise<ReachData> {
  if (!hasSupabaseEnv()) return createSeedReachData(); // dev / preview / tests only
  const org = await getCurrentOrg(client);
  // Signed in but not yet in a workspace: show nothing, never the fictional seed.
  return org ? createSupabaseReachData(client, org.orgId) : EMPTY_REACH_DATA;
}
