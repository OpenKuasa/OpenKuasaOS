import type { CrmDeal } from '@/lib/crm/deals';
import type { CrmPipelineStage } from '@/lib/crm/pipelines';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Asia/Kuala_Lumpur is UTC+8 all year; it has no daylight saving. */
const KL_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The calendar day in Kuala Lumpur, counted in days since 1 Jan 1970. */
function klDayNumber(date: Date) {
  return Math.floor((date.getTime() + KL_OFFSET_MS) / DAY_MS);
}

function dayNumberToIso(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The calendar day in Kuala Lumpur, as `YYYY-MM-DD`. */
export function klDay(date: Date): string {
  return dayNumberToIso(klDayNumber(date));
}

/** `YYYY-MM-DD` as people read it: '12 Oct 2026'. Pass `year: false` for '12 Oct'. */
export function formatDay(day: string, { year = true }: { year?: boolean } = {}): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00.000Z`));
}

/** Ringgit as the page shows it: whole amounts bare, others with their sen. */
export function formatRM(amount: number): string {
  const whole = Number.isInteger(amount);
  return `RM ${amount.toLocaleString('en-MY', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** Adds ringgit amounts in whole sen, so the total has no floating-point dust. */
function sumValue(deals: CrmDeal[]) {
  return deals.reduce((sum, deal) => sum + Math.round(deal.value * 100), 0) / 100;
}

function isOn(timestamp: string | null, day: number) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime()) && klDayNumber(date) === day;
}

export type DealKpis = {
  /** The value of every open deal, in ringgit. */
  pipelineValue: number;
  openDeals: number;
  /** Across open deals; 0 when there are none. */
  averageDealSize: number;
  won: number;
  lost: number;
  /** Won ÷ (won + lost), 0 to 100; null when no deal has closed. */
  winRate: number | null;
};

/** The four figures at the top of the page. */
export function dealKpis(deals: CrmDeal[]): DealKpis {
  const open = deals.filter((deal) => deal.status === 'open');
  const won = deals.filter((deal) => deal.status === 'won').length;
  const lost = deals.filter((deal) => deal.status === 'lost').length;
  const pipelineValue = sumValue(open);

  return {
    pipelineValue,
    openDeals: open.length,
    averageDealSize:
      open.length > 0 ? Math.round((pipelineValue / open.length) * 100) / 100 : 0,
    won,
    lost,
    winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
  };
}

/** '38%', or '—' when no deal has closed yet. */
export function formatWinRate(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`;
}

export type DealStageColumn = {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  /** The value of those deals, in ringgit. */
  total: number;
};

/** One board column per stage, in stage order, including the empty ones. */
export function stageColumns(stages: CrmPipelineStage[], deals: CrmDeal[]): DealStageColumn[] {
  return stages.map((stage) => {
    const inStage = deals.filter((deal) => deal.stageId === stage.id);
    return { stage, deals: inStage, total: sumValue(inStage) };
  });
}

/** How many deals sit in each stage, leaving out the lost ones. */
export function stageCounts(
  stages: CrmPipelineStage[],
  deals: CrmDeal[],
): { label: string; count: number }[] {
  return stages.map((stage) => ({
    label: stage.name,
    count: deals.filter((deal) => deal.stageId === stage.id && deal.status !== 'lost').length,
  }));
}

export type DealTrendWeek = {
  /** The first day of the week, such as '4 Oct'. */
  label: string;
  created: number;
  won: number;
};

/**
 * Deals created and won in each of the last `weeks` weeks, oldest first. A
 * week is seven Kuala Lumpur days and the last one ends today. A deal counts
 * as won in the week of its `won_at`, while it is still won.
 */
export function weeklyDealTrend(deals: CrmDeal[], now: Date, weeks = 8): DealTrendWeek[] {
  const today = klDayNumber(now);
  const trend: DealTrendWeek[] = Array.from({ length: weeks }, (_, index) => ({
    label: formatDay(dayNumberToIso(today - (weeks - index) * 7 + 1), { year: false }),
    created: 0,
    won: 0,
  }));

  const weekOf = (timestamp: string | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    const daysAgo = today - klDayNumber(date);
    if (daysAgo < 0) return null;
    const weeksAgo = Math.floor(daysAgo / 7);
    return weeksAgo < weeks ? trend[weeks - 1 - weeksAgo] : null;
  };

  for (const deal of deals) {
    const created = weekOf(deal.createdAt);
    if (created) created.created += 1;
    const won = deal.status === 'won' ? weekOf(deal.wonAt) : null;
    if (won) won.won += 1;
  }
  return trend;
}

/** How many closing-soon deals the Daily Report lists. */
export const CLOSING_SOON_LISTED = 5;
/** "Soon" is today and the seven days after it. */
export const CLOSING_SOON_DAYS = 7;

export type DealDailyReport = {
  /** Today in Kuala Lumpur, as `YYYY-MM-DD`. */
  day: string;
  createdToday: number;
  wonToday: number;
  /** In ringgit. */
  wonTodayValue: number;
  openDeals: number;
  /** In ringgit. */
  openValue: number;
  /** Open deals expected to close within the next seven days, soonest first; at most five. */
  closingSoon: CrmDeal[];
  /** How many there are in all, which can be more than are listed. */
  closingSoonTotal: number;
};

/** Today's summary for one pipeline's deals. "Today" is the day in Kuala Lumpur. */
export function dailyDealReport(deals: CrmDeal[], now: Date): DealDailyReport {
  const today = klDayNumber(now);
  const day = dayNumberToIso(today);
  const lastDay = dayNumberToIso(today + CLOSING_SOON_DAYS);

  const open = deals.filter((deal) => deal.status === 'open');
  const wonToday = deals.filter((deal) => deal.status === 'won' && isOn(deal.wonAt, today));
  // Dates are `YYYY-MM-DD`, which sorts and compares as text.
  const closing = open
    .filter(
      (deal) =>
        deal.expectedClose !== null && deal.expectedClose >= day && deal.expectedClose <= lastDay,
    )
    .sort(
      (a, b) =>
        (a.expectedClose ?? '').localeCompare(b.expectedClose ?? '') || b.value - a.value,
    );

  return {
    day,
    createdToday: deals.filter((deal) => isOn(deal.createdAt, today)).length,
    wonToday: wonToday.length,
    wonTodayValue: sumValue(wonToday),
    openDeals: open.length,
    openValue: sumValue(open),
    closingSoon: closing.slice(0, CLOSING_SOON_LISTED),
    closingSoonTotal: closing.length,
  };
}
