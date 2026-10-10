import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dailyDealReport,
  dealKpis,
  formatDay,
  klDay,
  weeklyDealTrend,
  type DealTrendWeek,
} from '@/lib/crm/deal-stats';
import { listCrmDeals, type CrmDeal } from '@/lib/crm/deals';
import { listCrmPipelines, type CrmPipeline } from '@/lib/crm/pipelines';

/** How many people the "Deals by owner" chart shows. */
const OWNERS_LISTED = 6;
/** How many follow-ups the Overview lists. */
export const FOLLOW_UPS_LISTED = 6;

/** An open follow-up as the Overview lists it. */
export type OverviewFollowUp = {
  id: string;
  title: string;
  /** `YYYY-MM-DD`, or null when it has no due date. */
  dueDay: string | null;
};

/** Everything the Kasturi Overview dashboard shows, worked out from the workspace's own rows. */
export type CrmOverviewModel = {
  /** No deals and no follow-ups yet. */
  isEmpty: boolean;
  kpis: {
    /** The value of every open deal, in ringgit. */
    pipelineValue: number;
    openDeals: number;
    /** Won ÷ (won + lost), 0 to 100; null when no deal has closed. */
    winRate: number | null;
    /** The value of deals won this calendar month in Kuala Lumpur, in ringgit. */
    wonThisMonth: number;
  };
  /** Deals created and won in each of the last eight weeks, oldest first. */
  trend: DealTrendWeek[];
  /** The pipeline the stage charts are about: the default one. Null when there is none. */
  pipelineName: string | null;
  /** Open deals in that pipeline, per stage, in board order. `value` is in ringgit. */
  stages: { key: string; label: string; count: number; value: number }[];
  /** Open deals per owner, most first. */
  owners: { label: string; deals: number }[];
  /** Open deals expected to close in the next seven days, soonest first; at most five. */
  closingSoon: { id: string; name: string; stage: string; value: number; closes: string }[];
  closingSoonTotal: number;
  /** Open follow-ups, soonest due first. */
  followUps: { id: string; title: string; due: string; overdue: boolean }[];
};

/** Adds ringgit amounts in whole sen, so the total has no floating-point dust. */
function sumValue(deals: CrmDeal[]) {
  return deals.reduce((sum, deal) => sum + Math.round(deal.value * 100), 0) / 100;
}

function monthOf(timestamp: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : klDay(date).slice(0, 7);
}

/** The dashboard's figures from the workspace's deals, pipelines and open follow-ups. */
export function buildCrmOverview(
  deals: CrmDeal[],
  pipelines: CrmPipeline[],
  followUps: OverviewFollowUp[],
  now: Date,
): CrmOverviewModel {
  const kpis = dealKpis(deals);
  const today = klDay(now);
  const open = deals.filter((deal) => deal.status === 'open');
  const wonThisMonth = deals.filter(
    (deal) => deal.status === 'won' && monthOf(deal.wonAt) === today.slice(0, 7),
  );

  const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
  const stages = (pipeline?.stages ?? []).map((stage) => {
    const inStage = open.filter((deal) => deal.stageId === stage.id);
    return { key: stage.id, label: stage.name, count: inStage.length, value: sumValue(inStage) };
  });

  const perOwner = new Map<string, number>();
  for (const deal of open) perOwner.set(deal.owner, (perOwner.get(deal.owner) ?? 0) + 1);
  const owners = [...perOwner]
    .map(([label, count]) => ({ label, deals: count }))
    .sort((a, b) => b.deals - a.deals || a.label.localeCompare(b.label))
    .slice(0, OWNERS_LISTED);

  const stageName = new Map(
    pipelines.flatMap((p) => p.stages.map((stage) => [stage.id, stage.name] as const)),
  );
  const report = dailyDealReport(deals, now);

  return {
    isEmpty: deals.length === 0 && followUps.length === 0,
    kpis: {
      pipelineValue: kpis.pipelineValue,
      openDeals: kpis.openDeals,
      winRate: kpis.winRate,
      wonThisMonth: sumValue(wonThisMonth),
    },
    trend: weeklyDealTrend(deals, now),
    pipelineName: pipeline?.name ?? null,
    stages,
    owners,
    closingSoon: report.closingSoon.map((deal) => ({
      id: deal.id,
      name: deal.company && deal.company !== deal.title ? `${deal.company} — ${deal.title}` : deal.title,
      stage: stageName.get(deal.stageId) ?? '',
      value: deal.value,
      closes: deal.expectedClose ? formatDay(deal.expectedClose, { year: false }) : '',
    })),
    closingSoonTotal: report.closingSoonTotal,
    followUps: followUps.map((followUp) => ({
      id: followUp.id,
      title: followUp.title,
      due:
        followUp.dueDay === null
          ? 'No date'
          : followUp.dueDay === today
            ? 'Today'
            : formatDay(followUp.dueDay, { year: false }),
      // Dates are `YYYY-MM-DD`, which compares as text.
      overdue: followUp.dueDay !== null && followUp.dueDay < today,
    })),
  };
}

/** The next open follow-ups in a workspace, soonest due first with undated ones last. */
async function listNextFollowUps(client: SupabaseClient, orgId: string): Promise<OverviewFollowUp[]> {
  const { data, error } = await client
    .from('crm_activities')
    .select('id,title,due_at')
    .eq('org_id', orgId)
    .eq('type', 'task')
    .is('completed_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(FOLLOW_UPS_LISTED);
  if (error) throw error;
  return ((data ?? []) as { id: string; title: string; due_at: string | null }[]).map((row) => ({
    id: row.id,
    title: row.title,
    // A follow-up's due date is stored as midnight UTC of the chosen day.
    dueDay: row.due_at ? row.due_at.slice(0, 10) : null,
  }));
}

/** Reads a workspace's deals, pipelines and follow-ups and builds the dashboard from them. */
export async function loadCrmOverview(
  client: SupabaseClient,
  orgId: string,
  now: Date,
): Promise<CrmOverviewModel> {
  const [{ deals }, pipelines, followUps] = await Promise.all([
    listCrmDeals(client, orgId, 500),
    listCrmPipelines(client, orgId),
    listNextFollowUps(client, orgId),
  ]);
  return buildCrmOverview(deals, pipelines, followUps, now);
}
