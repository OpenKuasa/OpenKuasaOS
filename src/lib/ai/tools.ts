/**
 * Jebat data tools (Layer 3 of the Ask-Jebat agent).
 *
 * Each tool reads through the {@link ReachData} seam, so swapping the seed
 * provider for an RLS-scoped Supabase one (data slice) needs no change here.
 * The `org_id` is never taken from the model — isolation is the provider's job.
 *
 * The derivation helpers are pure and take an explicit `now`, so the funnel /
 * channel / trend / conversion math is unit-tested without the model or a clock.
 */

import { tool } from 'ai';
import { z } from 'zod';
import {
  type Appointment,
  type Automation,
  type Broadcast,
  type Campaign,
  type Channel,
  type Form,
  type Lead,
  LEAD_STAGES,
  type LeadStage,
  type ReachData,
} from '@/lib/reach/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format cents as `RM 1,234.50`. */
export function rm(cents: number): string {
  return `RM ${(cents / 100).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function stageRank(stage: LeadStage): number {
  return LEAD_STAGES.indexOf(stage);
}

function withinWindow(lead: Lead, now: Date, sinceDays?: number): boolean {
  if (sinceDays == null) return true;
  const age = now.getTime() - new Date(lead.created_at).getTime();
  return age <= sinceDays * DAY_MS;
}

export type LeadSummary = {
  total_leads: number;
  /** Count of leads that *reached* each stage (the funnel). */
  funnel: Record<LeadStage, number>;
  by_channel: Record<Channel, number>;
  /** won ÷ total, as a 0–100 percentage rounded to 1 dp. */
  conversion_pct: number;
  /** Oldest → newest, 8 buckets. `qualified` = reached qualified+ that week. */
  weekly_trend: Array<{ weeks_ago: number; leads: number; qualified: number }>;
  since_days: number | null;
};

export function deriveLeadSummary(
  leads: Lead[],
  now: Date,
  sinceDays?: number,
): LeadSummary {
  const scoped = leads.filter((l) => withinWindow(l, now, sinceDays));

  const funnel = Object.fromEntries(
    LEAD_STAGES.map((stage) => [
      stage,
      scoped.filter((l) => stageRank(l.stage) >= stageRank(stage)).length,
    ]),
  ) as Record<LeadStage, number>;

  const by_channel = scoped.reduce(
    (acc, l) => {
      acc[l.channel] = (acc[l.channel] ?? 0) + 1;
      return acc;
    },
    { whatsapp: 0, facebook: 0, instagram: 0, tiktok: 0 } as Record<Channel, number>,
  );

  const total = scoped.length;
  const conversion_pct = total === 0 ? 0 : Math.round((funnel.won / total) * 1000) / 10;

  const WEEKS = 8;
  const weekly_trend = Array.from({ length: WEEKS }, (_, i) => {
    const weeksAgo = WEEKS - 1 - i;
    const inWeek = scoped.filter((l) => {
      const age = now.getTime() - new Date(l.created_at).getTime();
      const w = Math.floor(age / (7 * DAY_MS));
      return w === weeksAgo;
    });
    return {
      weeks_ago: weeksAgo,
      leads: inWeek.length,
      qualified: inWeek.filter((l) => stageRank(l.stage) >= stageRank('qualified')).length,
    };
  });

  return {
    total_leads: total,
    funnel,
    by_channel,
    conversion_pct,
    weekly_trend,
    since_days: sinceDays ?? null,
  };
}

export type SpendByChannel = {
  by_channel: Array<{ channel: Channel; spend_cents: number; spend: string }>;
  total_spend_cents: number;
  total_spend: string;
};

export function deriveSpendByChannel(campaigns: Campaign[]): SpendByChannel {
  const totals = campaigns.reduce(
    (acc, c) => {
      acc[c.channel] = (acc[c.channel] ?? 0) + c.spend_cents;
      return acc;
    },
    {} as Partial<Record<Channel, number>>,
  );
  const by_channel = (Object.entries(totals) as [Channel, number][])
    .map(([channel, spend_cents]) => ({ channel, spend_cents, spend: rm(spend_cents) }))
    .sort((a, b) => b.spend_cents - a.spend_cents);
  const total_spend_cents = by_channel.reduce((a, c) => a + c.spend_cents, 0);
  return { by_channel, total_spend_cents, total_spend: rm(total_spend_cents) };
}

export function summarizeCampaigns(
  campaigns: Campaign[],
  status?: 'active' | 'paused',
) {
  return campaigns
    .filter((c) => (status ? c.status === status : true))
    .map((c) => ({
      name: c.name,
      channel: c.channel,
      status: c.status,
      leads: c.leads_count,
      spend_cents: c.spend_cents,
      spend: rm(c.spend_cents),
      cpl_cents: c.cpl_cents,
      cpl: rm(c.cpl_cents),
    }))
    .sort((a, b) => a.cpl_cents - b.cpl_cents);
}

export function filterUpcomingAppointments(
  appointments: Appointment[],
  now: Date,
  limit = 5,
) {
  return appointments
    .filter((a) => new Date(a.scheduled_at).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, limit)
    .map((a) => ({
      contact_name: a.contact_name,
      kind: a.kind,
      via: a.via,
      scheduled_at: a.scheduled_at,
    }));
}

export type AdsOverview = {
  total_spend_cents: number;
  total_spend: string;
  total_leads: number;
  blended_cpl_cents: number;
  blended_cpl: string;
  active_campaigns: number;
  paused_campaigns: number;
};

/** Account-wide ad totals; blended CPL = total spend ÷ total platform-reported leads. */
export function deriveAdsOverview(campaigns: Campaign[]): AdsOverview {
  const total_spend_cents = campaigns.reduce((a, c) => a + c.spend_cents, 0);
  const total_leads = campaigns.reduce((a, c) => a + c.leads_count, 0);
  const blended_cpl_cents = total_leads === 0 ? 0 : Math.round(total_spend_cents / total_leads);
  return {
    total_spend_cents,
    total_spend: rm(total_spend_cents),
    total_leads,
    blended_cpl_cents,
    blended_cpl: rm(blended_cpl_cents),
    active_campaigns: campaigns.filter((c) => c.status === 'active').length,
    paused_campaigns: campaigns.filter((c) => c.status === 'paused').length,
  };
}

/** CRM contacts derived from leads, newest first, optionally filtered. */
export function deriveContacts(
  leads: Lead[],
  opts: { stage?: LeadStage; channel?: Channel; limit?: number } = {},
) {
  const { stage, channel, limit = 10 } = opts;
  return leads
    .filter((l) => (stage ? l.stage === stage : true))
    .filter((l) => (channel ? l.channel === channel : true))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((l) => ({
      name: l.name,
      channel: l.channel,
      stage: l.stage,
      source: l.source,
      created_at: l.created_at,
    }));
}

export function summarizeForms(forms: Form[], limit = 10) {
  return [...forms]
    .sort((a, b) => b.submissions_count - a.submissions_count)
    .slice(0, limit)
    .map((f) => ({
      name: f.name,
      channel: f.channel,
      submissions: f.submissions_count,
      status: f.status,
    }));
}

/** Broadcasts newest first. */
export function summarizeBroadcasts(broadcasts: Broadcast[], limit = 10) {
  return [...broadcasts]
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
    .slice(0, limit)
    .map((b) => ({
      name: b.name,
      channel: b.channel,
      sent: b.sent_count,
      opened: b.opened_count,
      clicked: b.clicked_count,
      open_rate_pct: b.sent_count === 0 ? 0 : Math.round((b.opened_count / b.sent_count) * 1000) / 10,
      sent_at: b.sent_at,
    }));
}

export function summarizeAutomations(automations: Automation[], limit = 10) {
  return [...automations]
    .sort((a, b) => b.runs_count - a.runs_count)
    .slice(0, limit)
    .map((a) => ({
      name: a.name,
      trigger: a.trigger,
      status: a.status,
      runs: a.runs_count,
    }));
}

const limitSchema = (describe: string) =>
  z.number().int().positive().max(50).optional().describe(describe);

/**
 * Build all Jebat read-only data tools over a {@link ReachData} provider. `now`
 * (a Date or a clock function) is injectable for tests; the route uses the real clock.
 */
export function createReachTools(data: ReachData, nowArg: Date | (() => Date) = () => new Date()) {
  const now = typeof nowArg === 'function' ? nowArg : () => nowArg;
  return {
    getCampaigns: tool({
      description:
        'List the org’s ad campaigns with leads, spend and cost-per-lead (RM). ' +
        'Sorted by cost-per-lead ascending (cheapest first). Optionally filter by status.',
      inputSchema: z.object({
        status: z
          .enum(['active', 'paused'])
          .optional()
          .describe('Only return campaigns with this status.'),
      }),
      execute: async ({ status }) => summarizeCampaigns(await data.listCampaigns(), status),
    }),

    getLeadSummary: tool({
      description:
        'Aggregate CRM leads into totals, the funnel (leads→contacted→qualified→booked→won), ' +
        'leads by channel, conversion rate and an 8-week trend. Optionally scope to the last N days.',
      inputSchema: z.object({
        sinceDays: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Only count leads created within this many days.'),
      }),
      execute: async ({ sinceDays }) =>
        deriveLeadSummary(await data.listLeads(), now(), sinceDays),
    }),

    getSpendByChannel: tool({
      description: 'Total ad spend (RM) broken down by channel, highest first.',
      inputSchema: z.object({}),
      execute: async () => deriveSpendByChannel(await data.listCampaigns()),
    }),

    getUpcomingAppointments: tool({
      description: 'The org’s upcoming appointments (discovery calls, demos, follow-ups), soonest first.',
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional().describe('Max appointments to return (default 5).'),
      }),
      execute: async ({ limit }) =>
        filterUpcomingAppointments(await data.listAppointments(), now(), limit ?? 5),
    }),

    getAdsOverview: tool({
      description:
        'Overall ad performance: total spend (RM), total leads, blended cost-per-lead and the count of active vs paused campaigns.',
      inputSchema: z.object({}),
      execute: async () => deriveAdsOverview(await data.listCampaigns()),
    }),

    listContacts: tool({
      description:
        'Recent CRM contacts (derived from leads), newest first: name, channel, stage, source, created_at. Optionally filter by stage or channel.',
      inputSchema: z.object({
        stage: z.enum(LEAD_STAGES as [LeadStage, ...LeadStage[]]).optional().describe('Only contacts at this stage.'),
        channel: z.enum(['whatsapp', 'facebook', 'instagram', 'tiktok']).optional().describe('Only contacts from this channel.'),
        limit: limitSchema('Max contacts to return (default 10).'),
      }),
      execute: async ({ stage, channel, limit }) =>
        deriveContacts(await data.listLeads(), { stage, channel, limit }),
    }),

    listForms: tool({
      description: 'Lead-capture forms with channel, submissions count and status, most submissions first.',
      inputSchema: z.object({ limit: limitSchema('Max forms to return (default 10).') }),
      execute: async ({ limit }) => summarizeForms(await data.listForms(), limit),
    }),

    listBroadcasts: tool({
      description: 'Email / WhatsApp broadcasts with sent, opened, clicked counts and sent date, newest first.',
      inputSchema: z.object({ limit: limitSchema('Max broadcasts to return (default 10).') }),
      execute: async ({ limit }) => summarizeBroadcasts(await data.listBroadcasts(), limit),
    }),

    listAutomations: tool({
      description: 'Automation workflows with trigger, status and number of runs, most runs first.',
      inputSchema: z.object({ limit: limitSchema('Max automations to return (default 10).') }),
      execute: async ({ limit }) => summarizeAutomations(await data.listAutomations(), limit),
    }),
  };
}

export type ReachTools = ReturnType<typeof createReachTools>;
