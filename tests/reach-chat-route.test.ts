import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shared, hoisted control surface so the mock factories can read mutable state.
const ctl = vi.hoisted(() => ({
  user: null as { id: string; is_anonymous: boolean } | null,
  rpcData: 49 as number,
  rpcError: null as { message: string } | null,
  providerKey: true,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: ctl.user }, error: null }) },
    rpc: async () => ({ data: ctl.rpcData, error: ctl.rpcError }),
  }),
}));

vi.mock('@/lib/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/provider')>();
  const { MockLanguageModelV4, simulateReadableStream } = await import('ai/test');
  return {
    ...actual,
    hasProviderKey: () => ctl.providerKey,
    getModel: () =>
      new MockLanguageModelV4({
        // Minimal valid V4 text stream; cast because the spec's usage/finish
        // shapes are richer than this fixture needs (runtime ignores the extras).
        doStream: async () => ({
          stream: simulateReadableStream({
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
            chunks: [
              { type: 'text-start', id: '0' },
              { type: 'text-delta', id: '0', delta: 'The Lead Magnet eBook campaign has the best cost per lead.' },
              { type: 'text-end', id: '0' },
              { type: 'finish', finishReason: 'stop', usage: { inputTokens: 10, outputTokens: 12, totalTokens: 22 } },
            ],
          }),
        }),
      } as unknown as ConstructorParameters<typeof MockLanguageModelV4>[0]),
  };
});

const { POST } = await import('@/app/api/reach/chat/route');

function post(body: unknown): Request {
  return new Request('http://localhost/api/reach/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'which campaign has the best cost per lead?' }] }],
};

beforeEach(() => {
  ctl.user = { id: 'u1', is_anonymous: false };
  ctl.rpcData = 49;
  ctl.rpcError = null;
  ctl.providerKey = true;
});

describe('POST /api/reach/chat gating', () => {
  it('401 when not signed in', async () => {
    ctl.user = null;
    expect((await POST(post(validBody))).status).toBe(401);
  });

  it('403 for a demo / anonymous viewer', async () => {
    ctl.user = { id: 'u2', is_anonymous: true };
    expect((await POST(post(validBody))).status).toBe(403);
  });

  it('503 when the provider key is missing', async () => {
    ctl.providerKey = false;
    expect((await POST(post(validBody))).status).toBe(503);
  });

  it('429 when the daily quota is exhausted', async () => {
    ctl.rpcData = -1;
    expect((await POST(post(validBody))).status).toBe(429);
  });

  it('400 on an empty/invalid message list', async () => {
    expect((await POST(post({ messages: [] }))).status).toBe(400);
  });
});

describe('POST /api/reach/chat happy path', () => {
  it('streams a 200 response for a signed-in member', async () => {
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Lead Magnet');
  });
});
