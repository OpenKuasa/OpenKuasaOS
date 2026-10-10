import { describe, expect, test } from 'vitest';
import {
  dailyDealReport,
  dealKpis,
  formatDay,
  formatRM,
  formatWinRate,
  klDay,
  stageColumns,
  stageCounts,
  weeklyDealTrend,
} from '@/lib/crm/deal-stats';
import type { CrmDeal } from '@/lib/crm/deals';
import type { CrmPipelineStage } from '@/lib/crm/pipelines';

/** Saturday 10 Oct 2026, 16:30 in Kuala Lumpur. */
const NOW = new Date('2026-10-10T08:30:00.000Z');

let nextId = 0;
function deal(overrides: Partial<CrmDeal> = {}): CrmDeal {
  nextId += 1;
  return {
    id: `deal-${nextId}`,
    title: 'POS rollout',
    company: 'Seri Mutiara Enterprise',
    contactName: 'Aisyah Rahim',
    value: 1000,
    owner: 'Faiz Hakim',
    status: 'open',
    pipelineId: 'p-1',
    stageId: 'lead',
    lastTouch: '—',
    expectedClose: null,
    createdAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    ...overrides,
  };
}

const STAGES: CrmPipelineStage[] = [
  { id: 'lead', name: 'Lead', position: 1, probability: 10, dot: 'bg-primary' },
  { id: 'proposal', name: 'Proposal', position: 2, probability: 50, dot: 'bg-slate-500' },
  { id: 'won', name: 'Won', position: 3, probability: 100, dot: 'bg-emerald-500' },
];

describe('klDay', () => {
  test('is the calendar day in Kuala Lumpur, eight hours ahead of UTC', () => {
    expect(klDay(NOW)).toBe('2026-10-10');
    // 15:59 UTC is 23:59 in Kuala Lumpur; a minute later it is tomorrow there.
    expect(klDay(new Date('2026-10-10T15:59:59.999Z'))).toBe('2026-10-10');
    expect(klDay(new Date('2026-10-10T16:00:00.000Z'))).toBe('2026-10-11');
    expect(klDay(new Date('2026-10-09T16:00:00.000Z'))).toBe('2026-10-10');
    expect(klDay(new Date('2026-12-31T20:00:00.000Z'))).toBe('2027-01-01');
  });
});

describe('formatDay, formatRM and formatWinRate', () => {
  test('write a day as people read it', () => {
    expect(formatDay('2026-10-12')).toBe('12 Oct 2026');
    expect(formatDay('2026-10-04', { year: false })).toBe('4 Oct');
  });

  test('write ringgit with sen only when there are some', () => {
    expect(formatRM(18000)).toBe('RM 18,000');
    expect(formatRM(0)).toBe('RM 0');
    expect(formatRM(18000.5)).toBe('RM 18,000.50');
  });

  test('write the win rate, or a dash when nothing has closed', () => {
    expect(formatWinRate(38)).toBe('38%');
    expect(formatWinRate(0)).toBe('0%');
    expect(formatWinRate(null)).toBe('—');
  });
});

describe('dealKpis', () => {
  test('sums and averages the open deals, and rates wins against losses', () => {
    const kpis = dealKpis([
      deal({ value: 18000 }),
      deal({ value: 6400 }),
      deal({ value: 9800.5 }),
      deal({ value: 28000, status: 'won' }),
      deal({ value: 7900, status: 'won' }),
      deal({ value: 50000, status: 'won' }),
      deal({ value: 12000, status: 'lost' }),
    ]);

    expect(kpis).toEqual({
      pipelineValue: 34200.5,
      openDeals: 3,
      averageDealSize: 11400.17,
      won: 3,
      lost: 1,
      winRate: 75,
    });
  });

  test('has no win rate until a deal has closed', () => {
    expect(dealKpis([deal()])).toMatchObject({ openDeals: 1, won: 0, lost: 0, winRate: null });
  });

  test('is all zeros for no deals', () => {
    expect(dealKpis([])).toEqual({
      pipelineValue: 0,
      openDeals: 0,
      averageDealSize: 0,
      won: 0,
      lost: 0,
      winRate: null,
    });
  });

  test('gives 0% when every closed deal was lost and 100% when all were won', () => {
    expect(dealKpis([deal({ status: 'lost' })]).winRate).toBe(0);
    expect(dealKpis([deal({ status: 'won' })]).winRate).toBe(100);
  });

  test('adds sen exactly', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(dealKpis([deal({ value: 0.1 }), deal({ value: 0.2 })]).pipelineValue).toBe(0.3);
  });
});

describe('stageColumns', () => {
  test('gives every stage a column in order, the empty ones too', () => {
    const a = deal({ stageId: 'lead', value: 18000 });
    const b = deal({ stageId: 'won', value: 28000, status: 'won' });
    const c = deal({ stageId: 'lead', value: 6400.5 });

    const columns = stageColumns(STAGES, [a, b, c]);

    expect(columns.map((column) => column.stage.name)).toEqual(['Lead', 'Proposal', 'Won']);
    expect(columns.map((column) => column.deals.map((d) => d.id))).toEqual([
      [a.id, c.id],
      [],
      [b.id],
    ]);
    expect(columns.map((column) => column.total)).toEqual([24400.5, 0, 28000]);
  });

  test('has no columns for a pipeline with no stages', () => {
    expect(stageColumns([], [deal()])).toEqual([]);
  });
});

describe('stageCounts', () => {
  test('counts the deals in each stage, leaving out the lost ones', () => {
    const counts = stageCounts(STAGES, [
      deal({ stageId: 'lead' }),
      deal({ stageId: 'lead' }),
      deal({ stageId: 'lead', status: 'lost' }),
      deal({ stageId: 'won', status: 'won' }),
    ]);

    expect(counts).toEqual([
      { label: 'Lead', count: 2 },
      { label: 'Proposal', count: 0 },
      { label: 'Won', count: 1 },
    ]);
  });
});

describe('weeklyDealTrend', () => {
  test('covers the last eight weeks, oldest first, the last ending today', () => {
    const trend = weeklyDealTrend([], NOW);

    expect(trend).toHaveLength(8);
    // The last week is 4 to 10 Oct; each one before starts seven days earlier.
    // Compared through formatDay: how September is abbreviated varies by runtime.
    expect(trend.map((week) => week.label)).toEqual(
      [
        '2026-08-16',
        '2026-08-23',
        '2026-08-30',
        '2026-09-06',
        '2026-09-13',
        '2026-09-20',
        '2026-09-27',
        '2026-10-04',
      ].map((day) => formatDay(day, { year: false })),
    );
    expect(trend[0].label).toBe('16 Aug');
    expect(trend[7].label).toBe('4 Oct');
    expect(trend.every((week) => week.created === 0 && week.won === 0)).toBe(true);
  });

  test('counts each deal in the week it was created and the week it was won', () => {
    const trend = weeklyDealTrend(
      [
        // Today, and the first day of this week.
        deal({ createdAt: '2026-10-10T01:00:00.000Z' }),
        deal({ createdAt: '2026-10-04T03:00:00.000Z' }),
        // 3 Oct in Kuala Lumpur: the week before.
        deal({ createdAt: '2026-10-03T15:59:00.000Z' }),
        // 16:00 UTC on 3 Oct is already 4 Oct in Kuala Lumpur: this week.
        deal({ createdAt: '2026-10-03T16:00:00.000Z' }),
        // Created in the oldest week, won this week.
        deal({
          createdAt: '2026-08-16T05:00:00.000Z',
          status: 'won',
          wonAt: '2026-10-09T05:00:00.000Z',
        }),
      ],
      NOW,
    );

    expect(trend.map((week) => week.created)).toEqual([1, 0, 0, 0, 0, 0, 1, 3]);
    expect(trend.map((week) => week.won)).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  test('leaves out what is older than eight weeks, in the future, or undated', () => {
    const trend = weeklyDealTrend(
      [
        deal({ createdAt: '2026-08-15T10:00:00.000Z' }),
        deal({ createdAt: '2026-10-11T10:00:00.000Z' }),
        deal({ createdAt: null }),
        deal({ createdAt: 'not a date' }),
      ],
      NOW,
    );

    expect(trend.reduce((sum, week) => sum + week.created, 0)).toBe(0);
  });

  test('does not count a win for a deal that is no longer won', () => {
    const trend = weeklyDealTrend(
      [
        deal({ status: 'open', wonAt: '2026-10-09T05:00:00.000Z' }),
        deal({ status: 'lost', wonAt: '2026-10-09T05:00:00.000Z' }),
        deal({ status: 'won', wonAt: null }),
      ],
      NOW,
    );

    expect(trend.reduce((sum, week) => sum + week.won, 0)).toBe(0);
  });

  test('can cover another number of weeks', () => {
    expect(weeklyDealTrend([], NOW, 2).map((week) => week.label)).toEqual([
      formatDay('2026-09-27', { year: false }),
      '4 Oct',
    ]);
  });
});

describe('dailyDealReport', () => {
  test('summarises today in Kuala Lumpur', () => {
    const closingA = deal({ title: 'Closing in a week', value: 500, expectedClose: '2026-10-17' });
    const closingB = deal({ title: 'Closing today', value: 900, expectedClose: '2026-10-10' });
    const report = dailyDealReport(
      [
        closingA,
        closingB,
        // Created today: 00:30 in Kuala Lumpur is still 9 Oct in UTC.
        deal({ value: 2000, createdAt: '2026-10-09T16:30:00.000Z' }),
        // Created late yesterday in Kuala Lumpur.
        deal({ value: 3000, createdAt: '2026-10-09T15:30:00.000Z' }),
        // Won today.
        deal({
          value: 28000.5,
          status: 'won',
          createdAt: '2026-09-01T02:00:00.000Z',
          wonAt: '2026-10-10T02:00:00.000Z',
        }),
        deal({ value: 7900, status: 'won', wonAt: '2026-10-10T07:00:00.000Z' }),
        // Won yesterday.
        deal({ value: 4000, status: 'won', wonAt: '2026-10-08T17:00:00.000Z' }),
        deal({ value: 12000, status: 'lost', createdAt: '2026-10-10T03:00:00.000Z' }),
      ],
      NOW,
    );

    expect(report).toEqual({
      day: '2026-10-10',
      createdToday: 2,
      wonToday: 2,
      wonTodayValue: 35900.5,
      openDeals: 4,
      openValue: 6400,
      closingSoon: [closingB, closingA],
      closingSoonTotal: 2,
    });
  });

  test('lists open deals due from today to seven days ahead, soonest first', () => {
    const today = deal({ title: 'today', expectedClose: '2026-10-10' });
    const lastDay = deal({ title: 'last day', expectedClose: '2026-10-17' });
    const bigger = deal({ title: 'same day, bigger', value: 9000, expectedClose: '2026-10-12' });
    const smaller = deal({ title: 'same day, smaller', value: 100, expectedClose: '2026-10-12' });

    const report = dailyDealReport(
      [
        lastDay,
        smaller,
        deal({ title: 'yesterday', expectedClose: '2026-10-09' }),
        deal({ title: 'day eight', expectedClose: '2026-10-18' }),
        deal({ title: 'no date' }),
        deal({ title: 'won already', status: 'won', expectedClose: '2026-10-11' }),
        deal({ title: 'lost', status: 'lost', expectedClose: '2026-10-11' }),
        bigger,
        today,
      ],
      NOW,
    );

    expect(report.closingSoon.map((d) => d.title)).toEqual([
      'today',
      'same day, bigger',
      'same day, smaller',
      'last day',
    ]);
    expect(report.closingSoonTotal).toBe(4);
  });

  test('lists at most five and says how many there are', () => {
    const deals = Array.from({ length: 7 }, (_, index) =>
      deal({ title: `deal ${index}`, expectedClose: `2026-10-1${index}` }),
    );

    const report = dailyDealReport(deals, NOW);

    expect(report.closingSoon).toHaveLength(5);
    expect(report.closingSoon.map((d) => d.expectedClose)).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(report.closingSoonTotal).toBe(7);
  });

  test('uses the Kuala Lumpur day when UTC is still on the day before', () => {
    // 00:30 on 11 Oct in Kuala Lumpur.
    const report = dailyDealReport(
      [
        deal({ createdAt: '2026-10-10T16:10:00.000Z' }),
        deal({ createdAt: '2026-10-10T15:50:00.000Z' }),
        deal({ expectedClose: '2026-10-10' }),
        deal({ expectedClose: '2026-10-18' }),
      ],
      new Date('2026-10-10T16:30:00.000Z'),
    );

    expect(report.day).toBe('2026-10-11');
    expect(report.createdToday).toBe(1);
    expect(report.closingSoon.map((d) => d.expectedClose)).toEqual(['2026-10-18']);
  });

  test('is empty for no deals', () => {
    expect(dailyDealReport([], NOW)).toEqual({
      day: '2026-10-10',
      createdToday: 0,
      wonToday: 0,
      wonTodayValue: 0,
      openDeals: 0,
      openValue: 0,
      closingSoon: [],
      closingSoonTotal: 0,
    });
  });
});
