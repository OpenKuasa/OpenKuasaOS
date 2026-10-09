/**
 * POST /api/reach/chat — the Ask-Jebat streaming endpoint.
 *
 * `prepareChat` handles the gate (signed in, not a demo guest, workspace key or
 * a free weekly question) and validates the UI messages. Then the orchestrator
 * runs and streams a UI message response. Tools read a fresh seed provider per
 * request today; the data slice swaps in an RLS-scoped Supabase provider with
 * no change to the agent.
 */

import { prepareChat } from '@/lib/ai/chat-request';
import { runJebat } from '@/lib/ai/agents/orchestrator';
import { createSeedReachData } from '@/lib/reach/seed';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server (Railway), where the
// multi-layer turn runs without a function timeout.
export const maxDuration = 60;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  const result = runJebat(
    chat.messages,
    createSeedReachData(),
    request.signal,
    chat.apiKey,
  );

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[ask-jebat] stream error:', error);
      return 'Jebat ran into a problem. Please try again in a moment.';
    },
  });
}
