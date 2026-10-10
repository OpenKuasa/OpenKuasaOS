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
import type { HireData } from '@/lib/hire/types';

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
    expect(model.weekLoad.reduce((sum, d) => sum + d.count, 0)).toBeLessThanOrEqual(6);
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
});

describe('an empty workspace', () => {
  it('gives empty models, not errors', async () => {
    expect((await buildJobsModel(EMPTY, NOW)).isEmpty).toBe(true);
    expect((await buildCareersModel(EMPTY)).isEmpty).toBe(true);
    expect((await buildBoardModel(EMPTY, NOW)).isEmpty).toBe(true);
    expect((await buildApplicationsModel(EMPTY)).isEmpty).toBe(true);
    expect((await buildInterviewsModel(EMPTY, NOW)).isEmpty).toBe(true);
    expect((await buildPoolModel(EMPTY)).isEmpty).toBe(true);
    expect((await buildBoardModel(EMPTY, NOW)).stages).toHaveLength(5);
  });
});
