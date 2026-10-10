/**
 * POST /api/chat — the Tuah assistant (Command page and the floating button).
 *
 * Same gate as Ask-Jebat (see `prepareChat`): a workspace key if one is set,
 * otherwise one of the user's free weekly questions on the platform key.
 *
 * A turn that gets past the gate is saved to the user's chat history; a
 * refused one leaves no trace.
 */

import { prepareChat } from '@/lib/ai/chat-request';
import { runTuah } from '@/lib/ai/agents/orchestrator';
import { saveAnswer, saveQuestion } from '@/lib/chat/store';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server.
export const maxDuration = 60;
const ANSWER_TIMEOUT_MS = 55_000;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  const { supabase, threadId, lastMessage } = chat;
  // Saved alongside the answer rather than before it, so history never
  // delays the first words.
  const questionSaved =
    threadId && lastMessage.role === 'user'
      ? saveQuestion(supabase, chat.userId, threadId, lastMessage.parts)
      : Promise.resolve(false);

  // The answer does not depend on anyone watching it arrive: closing the tab
  // or opening another chat must not cut it short, so the model is bounded by
  // time rather than by the request, and the stream is drained here.
  const result = runTuah(
    chat.messages,
    AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    chat.apiKey,
    chat.screen,
  );
  void result.consumeStream();

  if (threadId) {
    void (async () => {
      if (!(await questionSaved)) return;
      const text = await result.text;
      await saveAnswer(supabase, threadId, [{ type: 'text', text }]);
    })().catch((error) => {
      console.error(
        '[tuah] answer not saved:',
        error instanceof Error ? error.message : error,
      );
    });
  }

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[tuah] stream error:', error);
      return 'Tuah ran into a problem. Please try again in a moment.';
    },
  });
}
