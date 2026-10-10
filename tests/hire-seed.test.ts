import { describe, expect, it } from 'vitest';
import { createSeedHireData, seedRow } from '@/lib/hire/seed';
import { APPLICATION_STAGES } from '@/lib/hire/types';

const NOW = new Date('2026-10-10T04:00:00Z');
const data = createSeedHireData(NOW);

describe('hire seed', () => {
  it('has 9 jobs, 342 candidates, 248 applications and 10 interviews', async () => {
    expect(await data.listJobs()).toHaveLength(9);
    expect(await data.listCandidates()).toHaveLength(342);
    expect(await data.listApplications()).toHaveLength(248);
    expect(await data.listInterviews()).toHaveLength(10);
  });

  it('reaches each stage the stated number of times', async () => {
    const apps = await data.listApplications();
    const reached = (stage: (typeof APPLICATION_STAGES)[number]) =>
      apps.filter((a) => APPLICATION_STAGES.indexOf(a.stage) >= APPLICATION_STAGES.indexOf(stage)).length;
    expect(APPLICATION_STAGES.map(reached)).toEqual([248, 96, 38, 4, 2]);
  });

  it('has the stated source mix and applicants per job', async () => {
    const apps = await data.listApplications();
    const count = (key: 'source' | 'job_title', value: string) => apps.filter((a) => a[key] === value).length;
    expect(['JobStreet', 'LinkedIn', 'Referral', 'Careers page'].map((s) => count('source', s))).toEqual([104, 72, 44, 28]);
    expect(count('job_title', 'Software Engineer')).toBe(56);
    expect(count('job_title', 'Sales Executive')).toBe(42);
    expect(count('job_title', 'Marketing Lead')).toBe(0);
  });

  it('gives every candidate a unique name and email', async () => {
    const candidates = await data.listCandidates();
    expect(new Set(candidates.map((c) => c.name)).size).toBe(342);
    expect(new Set(candidates.map((c) => c.email)).size).toBe(342);
    expect(candidates.every((c) => c.email?.endsWith('@demo.openkuasa.com'))).toBe(true);
  });

  it('never dates anything applied, offered or hired in the future', async () => {
    for (const a of await data.listApplications()) {
      expect(Date.parse(a.applied_at)).toBeLessThanOrEqual(NOW.getTime());
      if (a.offered_at) expect(Date.parse(a.offered_at)).toBeLessThanOrEqual(NOW.getTime());
      if (a.hired_at) expect(Date.parse(a.hired_at)).toBeLessThanOrEqual(NOW.getTime());
      if (a.offered_at) expect(Date.parse(a.offered_at)).toBeGreaterThan(Date.parse(a.applied_at));
    }
  });

  it('has six interviews ahead, three completed and one no-show, all with active interview-stage applications', async () => {
    const interviews = await data.listInterviews();
    const apps = new Map((await data.listApplications()).map((a) => [a.id, a]));
    expect(interviews.filter((i) => i.status === 'scheduled' && Date.parse(i.scheduled_at) > NOW.getTime())).toHaveLength(6);
    expect(interviews.filter((i) => i.status === 'completed')).toHaveLength(3);
    expect(interviews.filter((i) => i.status === 'no_show')).toHaveLength(1);
    for (const i of interviews) {
      expect(apps.get(i.application_id)).toMatchObject({ stage: 'interview', outcome: 'active' });
    }
  });

  it('is the same for the same now', async () => {
    expect(await createSeedHireData(NOW).listApplications()).toEqual(await data.listApplications());
  });

  it('seedRow is a pure rule: application 1', () => {
    expect(seedRow(1)).toMatchObject({ k: 37, jobIndex: 0, stage: 'interview', outcome: 'active' });
  });
});
