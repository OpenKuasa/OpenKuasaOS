import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/agents/openrouter-media', () => ({
  webSearch: vi.fn(),
  writeDigest: vi.fn(),
}));
vi.mock('@/lib/ai/key-crypto', () => ({
  hasKeySecret: () => true,
  decryptApiKey: (c: string) => `decrypted-${c}`,
}));
vi.mock('@/lib/reach/supabase', () => ({
  createSupabaseReachData: () => ({
    listCampaigns: async () => [],
    listLeads: async () => [],
    listAppointments: async () => [],
  }),
}));

import { runWeeklyStudio } from '@/lib/agents/weekly-studio';
import { webSearch, writeDigest } from '@/lib/agents/openrouter-media';

const ORG = 'org-123';

type Call = { table: string; op: string; payload?: unknown; eqs: [string, unknown][] };

function fakeService(keyRow: { ciphertext: string } | null) {
  const calls: Call[] = [];
  const runs: Record<string, unknown>[] = [];
  const service = {
    from(table: string) {
      return {
        select() {
          const call: Call = { table, op: 'select', eqs: [] };
          calls.push(call);
          const b = {
            eq(col: string, val: unknown) {
              call.eqs.push([col, val]);
              return b;
            },
            maybeSingle: async () => ({ data: keyRow, error: null }),
          };
          return b;
        },
        insert(payload: Record<string, unknown>) {
          const call: Call = { table, op: 'insert', payload, eqs: [] };
          calls.push(call);
          const row = { id: 'run-1', ...payload };
          runs.push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
        update(patch: Record<string, unknown>) {
          const call: Call = { table, op: 'update', payload: patch, eqs: [] };
          calls.push(call);
          const b = {
            eq(col: string, val: unknown) {
              call.eqs.push([col, val]);
              return b;
            },
            then(resolve: (v: { error: null }) => void) {
              Object.assign(runs[0], patch);
              resolve({ error: null });
            },
          };
          return b;
        },
      };
    },
  };
  return { service: service as never, calls, runs };
}

beforeEach(() => {
  vi.mocked(webSearch).mockReset();
  vi.mocked(writeDigest).mockReset();
});

describe('runWeeklyStudio', () => {
  it('fails with "no AI key" and makes no media call when the org has no key', async () => {
    const { service, runs } = fakeService(null);
    const res = await runWeeklyStudio(service, ORG, 'manual');
    expect(res).toEqual({ runId: 'run-1', status: 'failed' });
    expect(runs[0].status).toBe('failed');
    expect(String(runs[0].error)).toContain('no AI key');
    expect(runs[0].trigger).toBe('manual');
    expect(webSearch).not.toHaveBeenCalled();
    expect(writeDigest).not.toHaveBeenCalled();
  });

  it('runs search + digest and finishes done with summed cost', async () => {
    vi.mocked(webSearch).mockResolvedValue({ text: 'angle', cost_cents: 3 });
    vi.mocked(writeDigest).mockResolvedValue({ text: '# Digest', cost_cents: 4 });
    const { service, runs } = fakeService({ ciphertext: 'abc' });
    const res = await runWeeklyStudio(service, ORG, 'schedule');
    expect(res.status).toBe('done');
    expect(webSearch).toHaveBeenCalledWith('decrypted-abc', expect.any(String));
    expect(writeDigest).toHaveBeenCalledWith('decrypted-abc', expect.stringContaining('angle'));
    expect(runs[0]).toMatchObject({ status: 'done', digest_md: '# Digest', cost_cents: 7, trigger: 'schedule' });
    expect(runs[0].finished_at).toBeTruthy();
  });

  it('marks the run failed with a safe error when a media call throws', async () => {
    vi.mocked(webSearch).mockRejectedValue(new Error('boom sk-or-secret'));
    const { service, runs } = fakeService({ ciphertext: 'abc' });
    const res = await runWeeklyStudio(service, ORG, 'manual');
    expect(res.status).toBe('failed');
    expect(runs[0].status).toBe('failed');
    expect(String(runs[0].error)).not.toContain('secret');
    expect(writeDigest).not.toHaveBeenCalled();
  });

  it('scopes the key read and every agent_runs write by org_id', async () => {
    vi.mocked(webSearch).mockResolvedValue({ text: 'a', cost_cents: 1 });
    vi.mocked(writeDigest).mockResolvedValue({ text: 'd', cost_cents: 1 });
    const { service, calls } = fakeService({ ciphertext: 'abc' });
    await runWeeklyStudio(service, ORG, 'manual');
    const keyRead = calls.find((c) => c.table === 'org_ai_keys');
    expect(keyRead?.eqs).toContainEqual(['org_id', ORG]);
    const insert = calls.find((c) => c.table === 'agent_runs' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ org_id: ORG });
    const updates = calls.filter((c) => c.table === 'agent_runs' && c.op === 'update');
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(u.eqs).toContainEqual(['org_id', ORG]);
  });
});
