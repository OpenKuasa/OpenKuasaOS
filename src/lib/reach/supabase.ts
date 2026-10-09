import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Appointment,
  Automation,
  Broadcast,
  Campaign,
  Form,
  Lead,
  ReachData,
} from './types';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { createSeedReachData } from './seed';

/**
 * RLS-scoped {@link ReachData} over Supabase. Reads are filtered to `orgId`
 * (the caller's current org); Postgres RLS independently guarantees no other
 * org's rows are reachable, so `orgId` is a workspace selector, not the security
 * boundary. Forms/broadcasts/automations have no tables yet (later slices), so
 * their methods return [] rather than erroring.
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
      rows<Lead>('leads', 'id,name,channel,stage,source,created_at', { col: 'created_at', asc: false }),
    listAppointments: () =>
      rows<Appointment>('appointments', 'id,contact_name,kind,scheduled_at,via,created_at', {
        col: 'scheduled_at', asc: true,
      }),
    listForms: async (): Promise<Form[]> => [],
    listBroadcasts: async (): Promise<Broadcast[]> => [],
    listAutomations: async (): Promise<Automation[]> => [],
  };
}

/**
 * Request-scoped provider selection: RLS-scoped Supabase in prod, the seed
 * fixtures when no project is configured (dev/preview/tests) or the caller has
 * no org. One place, so the route and the Overview stay consistent.
 */
export async function getReachData(client: SupabaseClient): Promise<ReachData> {
  if (!hasSupabaseEnv()) return createSeedReachData();
  const org = await getCurrentOrg(client);
  return org ? createSupabaseReachData(client, org.orgId) : createSeedReachData();
}
