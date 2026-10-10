// tests/hire-tools.test.ts
import { describe, expect, it, vi } from 'vitest';
import { HIRE_TOOL_NAMES, createHireTools } from '@/lib/ai/hire-tools';
import { CRM_WRITE_TOOL_NAMES } from '@/lib/ai/crm-tools';
import { REACH_WRITE_TOOL_NAMES } from '@/lib/ai/products';
import { createReachTools } from '@/lib/ai/tools';
import { toolMeta } from '@/components/chat/tool-parts';
import { formatWhen } from '@/lib/reach/overview';
import { funnelCounts } from '@/lib/hire/applications-view';
import { timeToHire } from '@/lib/hire/dashboard';
import { createSeedHireData } from '@/lib/hire/seed';
import { createSeedReachData } from '@/lib/reach/seed';
import type { HireData } from '@/lib/hire/types';

const NOW = new Date('2026-10-10T04:00:00Z');
const data = createSeedHireData(NOW);
const tools = createHireTools(data, NOW);
// The tool results are untyped JSON; the tests read them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
type Run = (input: Record<string, unknown>) => Promise<Loose>;
const run = (name: string): Run => (input) =>
  (tools[name] as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(input, {
    toolCallId: 't', messages: [],
  });

describe('hire tools', () => {
  it('is exactly the eight lookups, none sharing a name with another product', () => {
    expect(Object.keys(tools)).toEqual([...HIRE_TOOL_NAMES]);
    expect(HIRE_TOOL_NAMES).toEqual([
      'getHiringOverview', 'listJobs', 'listApplications', 'getHiringFunnel',
      'listTalentPool', 'listInterviews', 'getTimeToHire', 'getSourceBreakdown',
    ]);
    const others = new Set([
      ...Object.keys(createReachTools(createSeedReachData())),
      ...REACH_WRITE_TOOL_NAMES,
      ...CRM_WRITE_TOOL_NAMES,
      'listCrmContacts', 'listDeals', 'listPipelines', 'getDealStats',
    ]);
    for (const name of HIRE_TOOL_NAMES) expect(others.has(name), name).toBe(false);
  });

  it('has a named card for every tool', () => {
    for (const name of HIRE_TOOL_NAMES) expect(toolMeta(name).isFallback, name).toBe(false);
  });

  it('gives the overview totals', async () => {
    expect(await run('getHiringOverview')({})).toMatchObject({
      applications: 248, open_jobs: 6, interviews_next_7_days: 6, offers_out: 2, hires_last_30_days: 2,
    });
  });

  it('lists jobs with applicant counts, filtered by status and department', async () => {
    const all = await run('listJobs')({});
    expect(all.total).toBe(9);
    const open = await run('listJobs')({ status: 'open' });
    expect(open.total).toBe(6);
    expect(open.jobs.find((j: { title: string }) => j.title === 'Software Engineer').applicants).toBe(56);
    expect((await run('listJobs')({ department: 'sales' })).total).toBe(2);
  });

  it('caps a list at 50 rows and still reports the total', async () => {
    const result = await run('listApplications')({ limit: 500 });
    expect(result.applications).toHaveLength(50);
    expect(result.total).toBe(248);
    expect((await run('listApplications')({ limit: Number.NaN })).applications.length).toBeLessThanOrEqual(50);
  });

  it('filters applications by a loosely typed job title, stage and outcome', async () => {
    const sales = await run('listApplications')({ jobTitle: 'sales exec' });
    expect(sales.total).toBe(42);
    expect(sales.applications.every((a: { job: string }) => a.job === 'Sales Executive')).toBe(true);
    expect((await run('listApplications')({ jobTitle: 'SALES EXECUTIVE' })).total).toBe(42);
    const offers = await run('listApplications')({ stage: 'offer', outcome: 'active', includeContact: true });
    expect(offers.total).toBe(2);
    expect(offers.applications[0]).toMatchObject({ stage: 'offer', label: 'Shortlisted' });
    expect(offers.applications[0].email).toMatch(/@demo\.openkuasa\.com$/);
  });

  it('leaves contact details out unless asked, and does not even read candidates', async () => {
    let candidateReads = 0;
    const counting: HireData = { ...data, listCandidates: async () => { candidateReads += 1; return data.listCandidates(); } };
    const t = createHireTools(counting, NOW);
    const exec = (name: string, input: Record<string, unknown>) =>
      (t[name] as unknown as { execute: (i: unknown, o: unknown) => Promise<Loose> }).execute(input, { toolCallId: 't', messages: [] });
    const apps = await exec('listApplications', {});
    expect(apps.applications.length).toBeGreaterThan(0);
    expect(apps.applications.some((r: object) => 'email' in r || 'phone' in r)).toBe(false);
    expect(candidateReads).toBe(0);
    const pool = await exec('listTalentPool', {});
    expect(pool.candidates.length).toBeGreaterThan(0);
    expect(pool.candidates.some((r: object) => 'email' in r || 'phone' in r)).toBe(false);
  });

  it('includes email and phone when includeContact is true', async () => {
    const apps = await run('listApplications')({ includeContact: true });
    expect(apps.applications.every((r: object) => 'email' in r && 'phone' in r)).toBe(true);
    const pool = await run('listTalentPool')({ includeContact: true });
    expect(pool.candidates.every((r: object) => 'email' in r && 'phone' in r)).toBe(true);
    expect(pool.candidates.some((r: { email: string | null }) => r.email)).toBe(true);
  });

  it('orders past interviews latest first whatever order the provider returns', async () => {
    const all = await data.listInterviews();
    const shuffled: HireData = { ...data, listInterviews: async () => [...all].reverse() };
    const t = createHireTools(shuffled, NOW);
    const result = await (t.listInterviews as unknown as { execute: (i: unknown, o: unknown) => Promise<Loose> }).execute({ when: 'past' }, { toolCallId: 't', messages: [] });
    const times = result.interviews.map((i: { scheduled_at: string }) => Date.parse(i.scheduled_at));
    expect(times.length).toBeGreaterThan(1);
    expect(times).toEqual([...times].sort((a: number, b: number) => b - a));
  });

  it('never lets the model choose the workspace', () => {
    for (const name of HIRE_TOOL_NAMES) {
      const shape = (tools[name] as unknown as { inputSchema: { shape: Record<string, unknown> } }).inputSchema.shape;
      expect(Object.keys(shape).some((k) => /org|tenant|workspace/i.test(k)), name).toBe(false);
    }
  });

  it('answers a filter that matches nothing with nothing, not everything', async () => {
    expect(await run('listApplications')({ jobTitle: 'plumber' })).toMatchObject({ total: 0, applications: [] });
    expect(await run('listJobs')({ department: 'plumbing' })).toMatchObject({ total: 0, jobs: [] });
    expect(await run('getHiringFunnel')({ jobTitle: 'plumber' })).toMatchObject({ applications: 0 });
  });

  it('gives the same funnel as the helper, overall and for one job', async () => {
    const apps = await data.listApplications();
    const all = await run('getHiringFunnel')({});
    expect(all.reached).toEqual(funnelCounts(apps));
    expect(all.applications).toBe(248);
    const one = await run('getHiringFunnel')({ jobTitle: 'Software Engineer' });
    expect(one.applications).toBe(56);
    expect(one.reached).toEqual(funnelCounts(apps.filter((a) => a.job_title === 'Software Engineer')));
  });

  it('lists the talent pool, filtered by skill', async () => {
    const pool = await run('listTalentPool')({ skill: 'react' });
    expect(pool.total).toBeGreaterThan(0);
    expect(pool.candidates.every((c: { skills: string[] }) => c.skills.includes('React'))).toBe(true);
    expect(pool.candidates.length).toBeLessThanOrEqual(50);
  });

  it('lists upcoming and past interviews', async () => {
    expect((await run('listInterviews')({ when: 'upcoming' })).total).toBe(6);
    expect((await run('listInterviews')({ when: 'past' })).total).toBe(4);
    expect((await run('listInterviews')({ status: 'no_show' })).total).toBe(1);
  });

  it('gives every interview a Kuala Lumpur `when`', async () => {
    const result = await run('listInterviews')({});
    expect(result.interviews.length).toBeGreaterThan(0);
    for (const row of result.interviews) expect(typeof row.when).toBe('string');
    const first = result.interviews[0];
    expect(first.when).toBe(formatWhen(first.scheduled_at, NOW));
  });

  it('gives the same time to hire as the helper', async () => {
    expect(await run('getTimeToHire')({})).toEqual(timeToHire(await data.listApplications()));
  });

  it('breaks applications down by source', async () => {
    const result = await run('getSourceBreakdown')({});
    expect(result.sources[0]).toMatchObject({ source: 'JobStreet', applications: 104 });
  });

  it('answers from an empty workspace without NaN', async () => {
    const empty: HireData = {
      listJobs: async () => [], listCandidates: async () => [],
      listApplications: async () => [], listInterviews: async () => [],
    };
    const t = createHireTools(empty, NOW);
    for (const name of HIRE_TOOL_NAMES) {
      const result = await (t[name] as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute({}, { toolCallId: 't', messages: [] });
      // JSON.stringify would hide NaN and Infinity (it writes them as null), so check the numbers themselves.
      const numbersIn = (value: unknown): number[] =>
        typeof value === 'number' ? [value]
        : Array.isArray(value) ? value.flatMap(numbersIn)
        : value && typeof value === 'object' ? Object.values(value).flatMap(numbersIn)
        : [];
      expect(result, name).not.toMatchObject({ ok: false });
      expect(numbersIn(result).every(Number.isFinite), name).toBe(true);
    }
  });

  it('reports a failed read as an error, without the database message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken: HireData = {
      listJobs: async () => { throw new Error('relation "hire_jobs" does not exist'); },
      listCandidates: async () => [], listApplications: async () => [], listInterviews: async () => [],
    };
    const t = createHireTools(broken, NOW);
    const result = await (t.listJobs as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute({}, { toolCallId: 't', messages: [] });
    expect(result).toEqual({ ok: false, error: 'Could not read hiring data.' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
