// tests/hire-lists.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildApplicationsModel,
  buildBoardModel,
  buildCareersModel,
  buildInterviewsModel,
  buildJobsModel,
  buildPoolModel,
} from '@/lib/hire/lists';
import { createSeedHireData } from '@/lib/hire/seed';
import type { Application, Candidate, HireData } from '@/lib/hire/types';

const NOW = new Date('2026-10-10T04:00:00Z');
const data = createSeedHireData(NOW);
const EMPTY: HireData = {
  listJobs: async () => [],
  listCandidates: async () => [],
  listApplications: async () => [],
  listInterviews: async () => [],
};

describe('jobs', () => {
  it('lists every job with its applicants and status', async () => {
    const model = await buildJobsModel(data, NOW);
    expect(model.rows).toHaveLength(9);
    expect(model.totalApplicants).toBe(248);
    expect(model.openJobs).toBe(6);
    expect(model.rows.find((r) => r.title === 'Software Engineer')).toMatchObject({ applicants: 56, status: 'Open', dept: 'Engineering' });
    expect(model.rows.find((r) => r.title === 'Marketing Lead')).toMatchObject({ applicants: 0, status: 'Draft', posted: '—' });
    expect(model.statusMix.map((s) => [s.key, s.value])).toEqual([['open', 6], ['paused', 1], ['closed', 1], ['draft', 1]]);
    expect(model.byJob).toHaveLength(6);
  });
});

describe('careers page', () => {
  it('shows open jobs as Published, closed as Closed, the rest as Draft', async () => {
    const model = await buildCareersModel(data);
    expect(model.openRoles).toBe(6);
    expect(model.rows.find((r) => r.title === 'Content Writer')?.status).toBe('Closed');
    expect(model.rows.find((r) => r.title === 'Accountant')?.status).toBe('Draft');
    expect(model.rows.find((r) => r.title === 'Customer Support')).toMatchObject({ type: 'Part-time', status: 'Published' });
  });
});

describe('candidates board', () => {
  it('puts live applications in their stage and counts the rest', async () => {
    const model = await buildBoardModel(data, NOW);
    expect(model.stages.map((s) => s.name)).toEqual(['Applied', 'Screening', 'Interview', 'Offer', 'Hired']);
    expect(model.hired).toBe(2);
    expect(model.offers).toBe(2);
    expect(model.total).toBe(model.inPipeline + model.hired);
    expect(model.stages.every((s) => s.candidates.length <= 50)).toBe(true);
    expect(model.funnel.map((f) => f.value)).toEqual([248, 96, 38, 4, 2]);
    expect(model.stages.reduce((sum, s) => sum + s.count, 0)).toBe(model.total);
    expect(model.stages.find((s) => s.key === 'offer')?.count).toBe(2);
    expect(model.stages.find((s) => s.key === 'hired')?.count).toBe(2);
  });
});

describe('applications list', () => {
  it('labels each application and counts the labels over everything', async () => {
    const model = await buildApplicationsModel(data);
    expect(model.total).toBe(248);
    expect(model.rows).toHaveLength(50);
    expect(model.statusMix.reduce((sum, s) => sum + s.value, 0)).toBe(248);
    expect(model.statusMix.map((s) => s.key)).toEqual(['New', 'In review', 'Shortlisted', 'Rejected']);
    expect(model.rows[0].applied).toMatch(/^\d{2} \w{3} \d{4}$/);
  });
});

describe('interviews', () => {
  it('lists interviews with the counts by status', async () => {
    const model = await buildInterviewsModel(data, NOW);
    expect(model.rows).toHaveLength(10);
    expect(model).toMatchObject({ scheduled: 6, completed: 3, noShow: 1, next7Days: 6 });
    // NOW is a Saturday, so some of the six fall on the weekend and are not in the weekday chart.
    const expected: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 };
    for (const i of await data.listInterviews()) {
      const at = Date.parse(i.scheduled_at);
      if (i.status !== 'scheduled' || at < NOW.getTime() || at >= NOW.getTime() + 7 * 86_400_000) continue;
      const day = new Date(i.scheduled_at).toLocaleDateString('en-MY', { weekday: 'short', timeZone: 'Asia/Kuala_Lumpur' });
      if (day in expected) expected[day] += 1;
    }
    expect(model.weekLoad.map((d) => d.count)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => expected[d]));
    expect(model.weekLoad.reduce((sum, d) => sum + d.count, 0)).toBeGreaterThan(0);
    expect(model.weekLoad.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(model.rows[0]).toMatchObject({ status: 'Scheduled' });
  });
});

describe('talent pool', () => {
  it('lists only people in the pool', async () => {
    const model = await buildPoolModel(data);
    expect(model.size).toBeGreaterThanOrEqual(94);
    expect(model.rows.length).toBeLessThanOrEqual(50);
    expect(model.rows.every((r) => ['Available', 'Shortlisted', 'Passive', 'Re-engaged'].includes(r.status))).toBe(true);
  });

  it('totals the whole pool by status, headline and source', async () => {
    const model = await buildPoolModel(data);
    const sum = (list: { value: number }[]) => list.reduce((a, b) => a + b.value, 0);
    expect(model.statusCounts.map((s) => s.key)).toEqual(['Available', 'Shortlisted', 'Passive', 'Re-engaged']);
    expect(sum(model.statusCounts)).toBe(model.size);
    expect(sum(model.byTitle)).toBe(model.size);
    expect(sum(model.bySource)).toBe(model.size);
  });

  const cand = (id: string, pool_status: Candidate['pool_status']): Candidate => ({
    id, name: id, email: null, phone: null, headline: null, location: null, skills: [], source: null,
    pool_status, created_at: '2026-01-01T00:00:00Z',
  });
  const app = (id: string, candidate_id: string, over: Partial<Application>): Application => ({
    id, candidate_id, job_id: 'j1', candidate_name: candidate_id, job_title: 'Role', stage: 'applied', outcome: 'active',
    rating: null, source: null, applied_at: '2026-10-01T00:00:00Z', offered_at: null, hired_at: null,
    created_at: '2026-10-01T00:00:00Z', ...over,
  });
  const small: HireData = {
    ...EMPTY,
    listCandidates: async () => [
      cand('outsider', 'none'),
      cand('interviewee', 'available'),
      cand('offered', 'passive'),
      cand('hiree', 're_engaged'),
      cand('rejected', 'passive'),
      cand('rated', 'available'),
      cand('unrated', 'available'),
    ],
    listApplications: async () => [
      app('a0', 'outsider', { stage: 'interview' }),
      app('a1', 'interviewee', { stage: 'interview' }),
      app('a2', 'offered', { stage: 'offer' }),
      app('a3', 'hiree', { stage: 'hired' }),
      app('a4', 'rejected', { stage: 'interview', outcome: 'rejected' }),
      app('a5', 'rated', { rating: 3 }),
      app('a6', 'rated', { rating: 5 }),
      app('a7', 'rated', { rating: 4 }),
    ],
  };

  it('leaves out people with pool_status none', async () => {
    const model = await buildPoolModel(small);
    expect(model.size).toBe(6);
    expect(model.rows.map((r) => r.id)).not.toContain('outsider');
  });

  it('shows Shortlisted for a live application at interview or beyond, and the pool label otherwise', async () => {
    const byId = Object.fromEntries((await buildPoolModel(small)).rows.map((r) => [r.id, r.status]));
    expect(byId).toMatchObject({
      interviewee: 'Shortlisted', offered: 'Shortlisted', hiree: 'Shortlisted',
      rejected: 'Passive', rated: 'Available', unrated: 'Available',
    });
  });

  it('counts Shortlisted and leaves out none over the whole pool', async () => {
    const model = await buildPoolModel(small);
    expect(model.statusCounts).toEqual([
      { key: 'Available', value: 2 },
      { key: 'Shortlisted', value: 3 },
      { key: 'Passive', value: 1 },
      { key: 'Re-engaged', value: 0 },
    ]);
    expect(model.byTitle).toEqual([{ label: '—', value: 6 }]);
    expect(model.bySource).toEqual([{ label: 'Unknown', value: 6 }]);
  });

  it('rates by the best application, and null when none is rated', async () => {
    const byId = Object.fromEntries((await buildPoolModel(small)).rows.map((r) => [r.id, r.rating]));
    expect(byId.rated).toBe(5);
    expect(byId.unrated).toBeNull();
    expect(byId.interviewee).toBeNull();
  });
});

/** Every number inside a model, however deep. */
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('an empty workspace', () => {
  it('gives zeros and empty lists, not errors', async () => {
    const jobs = await buildJobsModel(EMPTY, NOW);
    expect(jobs).toMatchObject({ isEmpty: true, rows: [], byJob: [], totalApplicants: 0, openJobs: 0 });
    expect(jobs.statusMix.map((s) => [s.key, s.value])).toEqual([['open', 0], ['paused', 0], ['closed', 0], ['draft', 0]]);

    const careers = await buildCareersModel(EMPTY);
    expect(careers).toMatchObject({ isEmpty: true, rows: [], openRoles: 0 });

    const board = await buildBoardModel(EMPTY, NOW);
    expect(board).toMatchObject({ isEmpty: true, total: 0, hired: 0, inPipeline: 0, interviewing: 0, offers: 0 });
    expect(board.stages).toHaveLength(5);
    expect(board.stages.every((s) => s.candidates.length === 0 && s.count === 0)).toBe(true);
    expect(board.funnel).toHaveLength(5);
    expect(board.funnel.every((f) => f.value === 0)).toBe(true);
    expect(board.trend).toHaveLength(8);
    expect(board.trend.every((t) => t.applied === 0 && t.shortlisted === 0)).toBe(true);

    const apps = await buildApplicationsModel(EMPTY);
    expect(apps).toMatchObject({ isEmpty: true, total: 0, rows: [], byJob: [] });
    expect(apps.statusMix.map((s) => [s.key, s.value])).toEqual([['New', 0], ['In review', 0], ['Shortlisted', 0], ['Rejected', 0]]);

    const interviews = await buildInterviewsModel(EMPTY, NOW);
    expect(interviews).toMatchObject({ isEmpty: true, rows: [], scheduled: 0, completed: 0, noShow: 0, next7Days: 0 });
    expect(interviews.weekLoad).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label) => ({ label, count: 0 })));

    const pool = await buildPoolModel(EMPTY);
    expect(pool).toMatchObject({ isEmpty: true, size: 0, rows: [], byTitle: [], bySource: [] });
    expect(pool.statusCounts.map((s) => [s.key, s.value])).toEqual([['Available', 0], ['Shortlisted', 0], ['Passive', 0], ['Re-engaged', 0]]);
  });

  it('has only finite numbers in every empty model', async () => {
    const models = [
      await buildJobsModel(EMPTY, NOW),
      await buildCareersModel(EMPTY),
      await buildBoardModel(EMPTY, NOW),
      await buildApplicationsModel(EMPTY),
      await buildInterviewsModel(EMPTY, NOW),
      await buildPoolModel(EMPTY),
    ];
    for (const model of models) {
      const leaves = numbers(model);
      expect(leaves.length).toBeGreaterThan(0);
      expect(leaves.every(Number.isFinite)).toBe(true);
    }
  });
});
