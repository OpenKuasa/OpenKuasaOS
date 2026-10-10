/**
 * POST /api/chat — the Tuah assistant (Command page and the floating button).
 *
 * Same gate as Ask-Jebat (see `prepareChat`): a workspace key if one is set,
 * otherwise one of the user's free weekly questions on the platform key.
 */

import { prepareChat } from '@/lib/ai/chat-request';
import { runTuah } from '@/lib/ai/agents/orchestrator';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server.
export const maxDuration = 60;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  const result = runTuah(chat.messages, request.signal, chat.apiKey);

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[tuah] stream error:', error);
      return 'Tuah ran into a problem. Please try again in a moment.';
    },
  });
}
