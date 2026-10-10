import { describe, expect, it, vi } from 'vitest';
import { createSeedReachData } from '@/lib/reach/seed';

const executed = vi.hoisted(() => ({ deletes: 0 }));

vi.mock('@/lib/reach/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/reach/capabilities')>();
  return {
    ...actual,
    deleteCampaign: async () => {
      executed.deletes += 1;
      return { ok: true, data: { id: 'x' } };
    },
  };
});

vi.mock('@/lib/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/provider')>();
  const { MockLanguageModelV4, simulateReadableStream } = await import('ai/test');
  return {
    ...actual,
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
                toolName: 'deleteCampaign',
                input: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000' }),
              },
              {
                type: 'finish',
                // The SDK reads finishReason.unified: a bare string would silently disable tool execution.
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              },
            ],
          }),
        }),
      } as unknown as ConstructorParameters<typeof MockLanguageModelV4>[0]) as never,
  };
});

const { runJebat } = await import('@/lib/ai/agents/orchestrator');

describe('AI writes require approval', () => {
  it('a write tool call does not execute until approved', async () => {
    executed.deletes = 0;
    const result = runJebat(
      [{ role: 'user', content: 'delete the Brand Awareness campaign' }],
      {
        data: createSeedReachData(),
        write: { ctx: { client: {} as never, orgId: 'org1' }, canWrite: true },
      },
    );
    await result.consumeStream();
    expect(executed.deletes).toBe(0);
    // The call is surfaced as awaiting approval rather than silently dropped.
    const parts = (await result.content) as { type: string }[];
    expect(parts.some((p) => p.type === 'tool-approval-request')).toBe(true);
  });
});
