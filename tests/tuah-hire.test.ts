import { describe, expect, it, vi } from 'vitest';
import { createSeedHireData } from '@/lib/hire/seed';
import { createSeedReachData } from '@/lib/reach/seed';
import { HIRE_TOOL_NAMES } from '@/lib/ai/hire-tools';
import { HIRE_WRITE_TOOL_NAMES } from '@/lib/ai/products';

const seen = vi.hoisted(() => ({ calls: [] as { layer: string; system: string; tools: string[] }[] }));

vi.mock('@/lib/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/provider')>();
  const { MockLanguageModelV4, simulateReadableStream } = await import('ai/test');
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  return {
    ...actual,
    getModel: (layer: string) =>
      new MockLanguageModelV4({
        doStream: async (options: { prompt: { role: string; content: unknown }[]; tools?: { name: string }[] }) => {
          seen.calls.push({
            layer,
            system: String(options.prompt.find((m) => m.role === 'system')?.content ?? ''),
            tools: (options.tools ?? []).map((t) => t.name),
          });
          return {
            stream: simulateReadableStream({
              initialDelayInMs: 0,
              chunkDelayInMs: 0,
              chunks: [
                { type: 'text-start', id: '0' },
                { type: 'text-delta', id: '0', delta: 'ok' },
                { type: 'text-end', id: '0' },
                { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
              ],
            }),
          };
        },
      } as unknown as ConstructorParameters<typeof MockLanguageModelV4>[0]) as never,
  };
});

const { runTuah } = await import('@/lib/ai/agents/orchestrator');
const { TUAH_SYSTEM, tuahTeamSystem, subAgentSystem } = await import('@/lib/ai/agents/prompts');

const ask = [{ role: 'user' as const, content: 'how many jobs are open?' }];
const reach = () => ({ data: createSeedReachData() });
const hire = () => ({ data: createSeedHireData(new Date('2026-10-10T04:00:00Z')) });
const team = () => ({ transcript: '', proposals: new Map(), names: {} });

describe('Tuah with hiring', () => {
  it('holds the hiring lookups as a single agent', async () => {
    seen.calls = [];
    await runTuah(ask, reach(), undefined, undefined, null, null, null, hire()).consumeStream();
    for (const name of HIRE_TOOL_NAMES) expect(seen.calls[0].tools, name).toContain(name);
  });

  it('has no hiring tools when no hiring data is passed', async () => {
    seen.calls = [];
    await runTuah(ask, reach()).consumeStream();
    for (const name of HIRE_TOOL_NAMES) expect(seen.calls[0].tools).not.toContain(name);
  });

  it('gets askLekir on its team, and holds no hiring lookup itself', async () => {
    seen.calls = [];
    await runTuah(ask, reach(), undefined, undefined, null, null, team(), hire()).consumeStream();
    const [tuah] = seen.calls;
    expect(tuah.tools).toContain('askLekir');
    expect(tuah.tools).toContain('askJebat');
    expect(tuah.tools).not.toContain('listJobs');
    expect(tuah.system).toContain('askLekir: Lekir, for hiring');
  });
});

describe('Tuah as a single agent with hiring changes', () => {
  it('a viewer (no write access) gets the lookups and no change tools', async () => {
    seen.calls = [];
    await runTuah(ask, reach(), undefined, undefined, null, null, null, hire()).consumeStream();
    for (const name of HIRE_TOOL_NAMES) expect(seen.calls[0].tools).toContain(name);
    for (const name of HIRE_WRITE_TOOL_NAMES) expect(seen.calls[0].tools).not.toContain(name);
  });
  it('a writer gets all four change tools', async () => {
    seen.calls = [];
    const writer = { ...hire(), write: { ctx: { client: {} as never, orgId: 'org1' }, canWrite: true } };
    await runTuah(ask, reach(), undefined, undefined, null, null, null, writer).consumeStream();
    for (const name of HIRE_WRITE_TOOL_NAMES) expect(seen.calls[0].tools).toContain(name);
  });
});

describe('Tuah with hiring changes', () => {
  it('on its team holds askLekir and applyChange, and no hiring change tool itself', async () => {
    seen.calls = [];
    const writer = { ...hire(), write: { ctx: { client: {} as never, orgId: 'org1' }, canWrite: true } };
    await runTuah(ask, reach(), undefined, undefined, null, null, team(), writer).consumeStream();
    const [tuah] = seen.calls;
    expect(tuah.tools).toContain('askLekir');
    expect(tuah.tools).toContain('applyChange');
    for (const name of HIRE_WRITE_TOOL_NAMES) expect(tuah.tools).not.toContain(name);
  });
});

describe('Tuah prompts and hiring', () => {
  it('no longer says hiring cannot be looked up', () => {
    expect(TUAH_SYSTEM).not.toMatch(/payroll, staff and hiring/);
    expect(TUAH_SYSTEM).toContain('hiring in Lekir');
    const teamPrompt = tuahTeamSystem([{ name: 'Lekir', area: 'hiring' }], true, null);
    expect(teamPrompt).not.toMatch(/payroll, staff or hiring/);
  });
  it('says jobs can be changed and the rest of hiring cannot yet', () => {
    for (const prompt of [TUAH_SYSTEM, tuahTeamSystem([{ name: 'Lekir', area: 'hiring' }], true, null)]) {
      const p = prompt.toLowerCase();
      expect(p).not.toContain('hiring cannot be changed yet');
      expect(p).toContain('candidates, applications and interviews cannot be changed yet');
    }
    expect(TUAH_SYSTEM.toLowerCase()).toContain('create, edit, open, pause, close, reopen or delete jobs');
  });
  it('gives the hiring specialist the job rules in prepare mode', () => {
    const lekir = subAgentSystem('hire', true).toLowerCase();
    expect(lekir).toContain('a new job is always a draft');
    expect(lekir).toContain('a job with applications cannot be deleted');
    expect(lekir).not.toContain('you can only look things up');
  });
  it('still says finance, payroll and staff cannot be looked up', () => {
    expect(TUAH_SYSTEM).toContain('cannot see the rest of the workspace yet');
    expect(TUAH_SYSTEM).toMatch(/invoices and other finance records, payroll and staff/);
  });
  it('offers a skills-based alternative when declining to rank by protected traits', () => {
    const offer = 'offer to do it on skills and experience instead';
    expect(TUAH_SYSTEM.toLowerCase()).toContain(offer);
    expect(tuahTeamSystem([{ name: 'Lekir', area: 'hiring' }], true, null).toLowerCase()).toContain(offer);
  });
  it('tells the single agent when to fetch contact details', () => {
    expect(TUAH_SYSTEM).toContain('includeContact');
  });
  it('gives the hiring specialist its fairness rule', () => {
    const lekir = subAgentSystem('hire', false);
    expect(lekir).toMatch(/^You are Lekir/);
    expect(lekir.toLowerCase()).toContain('never infer or weigh race');
  });
});
