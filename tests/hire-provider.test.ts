import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ hasEnv: true, org: { orgId: 'o1', role: 'member' } as unknown }));
vi.mock('@/lib/auth/viewer', () => ({ hasSupabaseEnv: () => env.hasEnv }));
vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrg: async () => env.org }));

import { getHireData } from '@/lib/hire/supabase';

const asked: { table: string; columns: string; org: unknown }[] = [];
const ROWS: Record<string, unknown[]> = {
  hire_jobs: [{ id: 'j1', title: 'Sales Executive' }],
  hire_candidates: [{ id: 'c1', name: 'Aisyah Rahim', skills: null }],
  hire_applications: [
    { id: 'a1', candidate_id: 'c1', job_id: 'j1', stage: 'applied', outcome: 'active', candidate: { name: 'Aisyah Rahim' }, job: { title: 'Sales Executive' } },
    { id: 'a2', candidate_id: 'c2', job_id: 'j2', stage: 'applied', outcome: 'active', candidate: null, job: null },
  ],
  hire_interviews: [
    { id: 'i1', application_id: 'a1', application: { candidate: { name: 'Aisyah Rahim' }, job: { title: 'Sales Executive' } } },
    { id: 'i2', application_id: 'a9', application: null },
  ],
};
const fakeClient = {
  from: (table: string) => ({
    select: (columns: string) => ({
      eq: (_column: string, org: unknown) => ({
        order: () => ({
          limit: async () => {
            asked.push({ table, columns, org });
            return { data: ROWS[table], error: null };
          },
        }),
      }),
    }),
  }),
} as never;

afterEach(() => {
  env.hasEnv = true;
  env.org = { orgId: 'o1', role: 'member' };
  asked.length = 0;
});

describe('getHireData', () => {
  it('reads each table for the current org only', async () => {
    const data = await getHireData(fakeClient);
    await Promise.all([data.listJobs(), data.listCandidates(), data.listApplications(), data.listInterviews()]);
    expect(asked.map((a) => a.table).sort()).toEqual(['hire_applications', 'hire_candidates', 'hire_interviews', 'hire_jobs']);
    expect(asked.every((a) => a.org === 'o1')).toBe(true);
  });

  it('flattens the joined candidate name and job title', async () => {
    const [first] = await (await getHireData(fakeClient)).listApplications();
    expect(first).toMatchObject({ id: 'a1', candidate_name: 'Aisyah Rahim', job_title: 'Sales Executive' });
    expect(first).not.toHaveProperty('candidate');
    const [interview] = await (await getHireData(fakeClient)).listInterviews();
    expect(interview).toMatchObject({ candidate_name: 'Aisyah Rahim', job_title: 'Sales Executive' });
  });

  it('does not throw when a joined row is missing', async () => {
    const data = await getHireData(fakeClient);
    expect((await data.listApplications())[1]).toMatchObject({ candidate_name: 'Unknown', job_title: 'Unknown' });
    expect((await data.listInterviews())[1]).toMatchObject({ candidate_name: 'Unknown', job_title: 'Unknown' });
  });

  it('turns a null skills column into an empty list', async () => {
    expect((await (await getHireData(fakeClient)).listCandidates())[0].skills).toEqual([]);
  });

  it('uses the sample data when no project is configured', async () => {
    env.hasEnv = false;
    expect(await (await getHireData(fakeClient)).listJobs()).toHaveLength(9);
  });

  it('shows nothing, never the sample data, to someone in no workspace', async () => {
    env.org = null;
    const data = await getHireData(fakeClient);
    expect(await data.listJobs()).toEqual([]);
    expect(await data.listApplications()).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('throws a query error on to the caller', async () => {
    const failing = {
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: new Error('boom') }) }) }) }) }),
    } as never;
    await expect((await getHireData(failing)).listJobs()).rejects.toThrow('boom');
  });
});
