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

  const result = runTuah(chat.messages, request.signal, chat.apiKey);

  return result.toUIMessageStreamResponse({
    onEnd: async ({ responseMessage }) => {
      if (!threadId || !(await questionSaved)) return;
      await saveAnswer(supabase, threadId, responseMessage.parts);
    },
    onError: (error) => {
      console.error('[tuah] stream error:', error);
      return 'Tuah ran into a problem. Please try again in a moment.';
    },
  });
}
