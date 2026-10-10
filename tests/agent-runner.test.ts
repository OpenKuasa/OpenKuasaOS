import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/agents/weekly-studio', () => ({ runWeeklyStudio: vi.fn() }));
vi.mock('@/lib/agents/openrouter-media', () => ({ checkVideo: vi.fn() }));
vi.mock('@/lib/ai/key-crypto', () => ({ hasKeySecret: () => true, decryptApiKey: () => 'k' }));

import { runAgents } from '@/lib/agents/runner';
import { runWeeklyStudio } from '@/lib/agents/weekly-studio';
import { isTriggerAuthorized } from '@/lib/agents/trigger-auth';

const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Cfg = { id: string; org_id: string; enabled: boolean; cadence: string; last_run_at: string | null };

function fakeClient(configs: Cfg[], claimResult: (cfg: Cfg) => boolean = () => true) {
  const claims: { id: string; orFilter: string; patch: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      expect(table).toBe('agent_configs');
      return {
        select() {
          const q: Record<string, unknown> = {};
          const preds: ((c: Cfg) => boolean)[] = [];
          q.eq = (col: string, v: unknown) => {
            if (col === 'enabled') preds.push((c) => c.enabled === v);
            return q;
          };
          q.neq = (col: string, v: unknown) => {
            if (col === 'cadence') preds.push((c) => c.cadence !== v);
            return q;
          };
          q.then = (res: (v: unknown) => void) =>
            res({ data: configs.filter((c) => preds.every((p) => p(c))), error: null });
          return q;
        },
        update(patch: Record<string, unknown>) {
          const state = { id: '', orFilter: '' };
          const q: Record<string, unknown> = {};
          q.eq = (_c: string, v: string) => {
            state.id = v;
            return q;
          };
          q.or = (f: string) => {
            state.orFilter = f;
            return q;
          };
          q.select = () => q;
          q.maybeSingle = async () => {
            claims.push({ ...state, patch });
            const cfg = configs.find((c) => c.id === state.id)!;
            return { data: claimResult(cfg) ? { id: cfg.id, org_id: cfg.org_id } : null, error: null };
          };
          return q;
        },
      };
    },
  };
  return { client: client as never, claims };
}

const cfg = (over: Partial<Cfg>): Cfg => ({
  id: 'c1',
  org_id: 'org-1',
  enabled: true,
  cadence: 'weekly',
  last_run_at: null,
  ...over,
});

beforeEach(() => {
  vi.mocked(runWeeklyStudio).mockReset();
  vi.mocked(runWeeklyStudio).mockResolvedValue({ runId: 'r', status: 'done' });
  vi.stubEnv('AGENTS_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('runAgents', () => {
  it('runs due configs with org from the row and trigger=schedule', async () => {
    const { client } = fakeClient([cfg({ org_id: 'org-9' })]);
    const out = await runAgents(client);
    expect(runWeeklyStudio).toHaveBeenCalledWith(client, 'org-9', 'schedule');
    expect(out).toMatchObject({ ran: 1, failed: 0 });
  });

  it('skips disabled, off, and not-yet-due configs', async () => {
    const { client } = fakeClient([
      cfg({ id: 'a', enabled: false }),
      cfg({ id: 'b', cadence: 'off' }),
      cfg({ id: 'c', cadence: 'weekly', last_run_at: ago(2 * 24 * HOUR) }),
      cfg({ id: 'd', cadence: 'daily', last_run_at: ago(2 * HOUR) }),
    ]);
    await runAgents(client);
    expect(runWeeklyStudio).not.toHaveBeenCalled();
  });

  it('runs a daily config older than 24h and a weekly one older than 7d', async () => {
    const { client } = fakeClient([
      cfg({ id: 'a', org_id: 'o-a', cadence: 'daily', last_run_at: ago(25 * HOUR) }),
      cfg({ id: 'b', org_id: 'o-b', cadence: 'weekly', last_run_at: ago(8 * 24 * HOUR) }),
    ]);
    await runAgents(client);
    expect(runWeeklyStudio).toHaveBeenCalledTimes(2);
  });

  it('claims with a conditional update before running; no claimed row means no run', async () => {
    const { client, claims } = fakeClient([cfg({})], () => false);
    const out = await runAgents(client);
    expect(claims).toHaveLength(1);
    expect(claims[0].orFilter).toContain('last_run_at.is.null');
    expect(claims[0].orFilter).toContain('last_run_at.lt.');
    expect(claims[0].patch).toHaveProperty('last_run_at');
    expect(runWeeklyStudio).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ran: 0, skipped: 1 });
  });

  it('does nothing when AGENTS_ENABLED is unset or false', async () => {
    const { client, claims } = fakeClient([cfg({})]);
    vi.stubEnv('AGENTS_ENABLED', '');
    await runAgents(client);
    vi.stubEnv('AGENTS_ENABLED', 'false');
    await runAgents(client);
    expect(claims).toHaveLength(0);
    expect(runWeeklyStudio).not.toHaveBeenCalled();
  });

  it('catches a throwing run and continues with the next config', async () => {
    vi.mocked(runWeeklyStudio).mockRejectedValueOnce(new Error('boom'));
    const { client } = fakeClient([cfg({ id: 'a', org_id: 'o-a' }), cfg({ id: 'b', org_id: 'o-b' })]);
    const out = await runAgents(client);
    expect(runWeeklyStudio).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ ran: 1, failed: 1 });
  });
});

describe('isTriggerAuthorized', () => {
  const req = (h: Record<string, string>) => new Request('http://x/api', { method: 'POST', headers: h });
  beforeEach(() => vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-123'));

  it('accepts bearer and x-service-key with the right key', () => {
    expect(isTriggerAuthorized(req({ authorization: 'Bearer service-key-123' }))).toBe(true);
    expect(isTriggerAuthorized(req({ 'x-service-key': 'service-key-123' }))).toBe(true);
  });
  it('rejects missing, wrong, and different-length keys', () => {
    expect(isTriggerAuthorized(req({}))).toBe(false);
    expect(isTriggerAuthorized(req({ authorization: 'Bearer service-key-124' }))).toBe(false);
    expect(isTriggerAuthorized(req({ 'x-service-key': 'short' }))).toBe(false);
  });
  it('rejects everything when the env key is unset', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(isTriggerAuthorized(req({ 'x-service-key': '' }))).toBe(false);
    expect(isTriggerAuthorized(req({ authorization: 'Bearer ' }))).toBe(false);
  });
});

describe('run route', () => {
  it('401s without calling runAgents on a bad key; runs on a good one', async () => {
    vi.resetModules();
    const runAgentsMock = vi.fn().mockResolvedValue({ ran: 1, skipped: 0, failed: 0 });
    vi.doMock('@/lib/agents/runner', () => ({ runAgents: runAgentsMock, pollVideos: vi.fn() }));
    vi.doMock('@/lib/supabase/service', () => ({ serviceClient: () => ({}) }));
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-123');
    const { POST } = await import('@/app/api/agents/run/route');
    const bad = await POST(new Request('http://x', { method: 'POST', headers: { 'x-service-key': 'nope' } }));
    expect(bad.status).toBe(401);
    expect(runAgentsMock).not.toHaveBeenCalled();
    const ok = await POST(
      new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer service-key-123' } }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ran: 1, skipped: 0, failed: 0 });
    expect(runAgentsMock).toHaveBeenCalledTimes(1);
  });
});
