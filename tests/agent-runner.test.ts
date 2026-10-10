import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/agents/weekly-studio', () => ({ runWeeklyStudio: vi.fn() }));
vi.mock('@/lib/agents/openrouter-media', () => ({ checkVideo: vi.fn() }));
vi.mock('@/lib/ai/key-crypto', () => ({ hasKeySecret: () => true, decryptApiKey: () => 'k' }));

import { isTriggerAuthorized } from '@/lib/agents/trigger-auth';

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
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined as unknown as string);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(isTriggerAuthorized(req({ 'x-service-key': 'anything' }))).toBe(false);
    expect(isTriggerAuthorized(req({ authorization: 'Bearer anything' }))).toBe(false);
  });
});

describe('run route', () => {
  it('401s without calling runSchedules on a bad key; runs on a good one', async () => {
    vi.resetModules();
    const runSchedulesMock = vi.fn().mockResolvedValue({ ran: 1, skipped: 0, paused: 0, completed: 0, failed: 0 });
    vi.doMock('@/lib/agents/runner', () => ({ runSchedules: runSchedulesMock, pollVideos: vi.fn() }));
    vi.doMock('@/lib/supabase/service', () => ({ serviceClient: () => ({}) }));
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key-123');
    const { POST } = await import('@/app/api/agents/run/route');
    const bad = await POST(new Request('http://x', { method: 'POST', headers: { 'x-service-key': 'nope' } }));
    expect(bad.status).toBe(401);
    expect(runSchedulesMock).not.toHaveBeenCalled();
    const ok = await POST(
      new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer service-key-123' } }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ran: 1, skipped: 0, paused: 0, completed: 0, failed: 0 });
    expect(runSchedulesMock).toHaveBeenCalledTimes(1);
  });
});
