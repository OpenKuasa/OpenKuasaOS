import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', is_anonymous: false } }, error: null }) },
    rpc: async (name: string) =>
      name === 'consume_free_question' ? { data: 2, error: null } : { data: null, error: null },
    from: () => {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        gte: () => query,
        lte: () => query,
        order: () => query,
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  }),
}));

vi.mock('@/lib/auth/current-org', () => ({ getCurrentOrg: async () => ({ orgId: 'org1', role: 'owner' }) }));
vi.mock('@/lib/auth/viewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/viewer')>()),
  hasSupabaseEnv: () => true,
}));

vi.mock('@/lib/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/provider')>();
  const { MockLanguageModelV4, simulateReadableStream } = await import('ai/test');
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  return {
    ...actual,
    hasProviderKey: () => true,
    getModel: () =>
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
            chunks: [
              {
                type: 'tool-call',
                toolCallId: 't1',
                toolName: 'createEmployee',
                // department_id is not a uuid, so the tool's schema rejects the whole input.
                input: JSON.stringify({
                  name: 'Farah',
                  department_id: 'Sales',
                  private: { nric: '900101-14-5678', base_salary: 4500 },
                }),
              },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
            ],
          }),
        }),
      } as unknown as ConstructorParameters<typeof MockLanguageModelV4>[0]) as never,
  };
});

process.env.AI_KEYS_ENCRYPTION_SECRET = 'test-secret-for-sealing-workspace-keys-0123456789';
const { POST } = await import('@/app/api/people/chat/route');
const { streamErrorName } = await import('@/lib/people/stream-error');

afterEach(() => vi.restoreAllMocks());

describe('Ask-Lekiu logging', () => {
  it('never logs what a rejected change carried', async () => {
    const spies = (['error', 'warn', 'info', 'log'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const res = await POST(
      new Request('http://localhost/api/people/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Add Farah to Sales' }] }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    await res.text();
    const logged = JSON.stringify(
      spies.flatMap((s) => s.mock.calls),
      (_k, v) => (v instanceof Error ? v.message + v.stack : v),
    );
    expect(logged).not.toContain('900101-14-5678');
    expect(logged).not.toContain('4500');
  });

  it('streamErrorName gives only a name, never a message or a raw value', () => {
    const err = new Error('Value: {"nric":"900101-14-5678"}');
    err.name = 'AI_TypeValidationError';
    expect(streamErrorName(err)).toBe('AI_TypeValidationError');
    expect(streamErrorName('900101-14-5678')).toBe('non-error');
    expect(streamErrorName({ nric: '900101-14-5678' })).toBe('non-error');
  });
});
