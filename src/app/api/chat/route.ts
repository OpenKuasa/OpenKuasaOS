/**
 * POST /api/chat — the Tuah assistant (Command page and the floating button).
 *
 * Same gate as Ask-Jebat (see `prepareChat`): a workspace key if one is set,
 * otherwise one of the user's free weekly questions on the platform key.
 *
 * Tuah reads and changes marketing data through the same tools as Ask-Jebat:
 * lookups run on their own, changes wait for the user's approval.
 *
 * A turn that gets past the gate is saved to the user's chat history; a
 * refused one leaves no trace.
 */

import { prepareChat } from '@/lib/ai/chat-request';
import { runTuah } from '@/lib/ai/agents/orchestrator';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { saveAnswer, saveQuestion } from '@/lib/chat/store';
import { getReachData } from '@/lib/reach/supabase';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server.
export const maxDuration = 60;
const ANSWER_TIMEOUT_MS = 55_000;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  const { supabase, threadId, lastMessage } = chat;
  // Saved alongside the answer rather than before it, so history never
  // delays the first words. A turn that resumes after an approval has no new
  // question: its thread already exists, and only the answer is added.
  const questionSaved = !threadId
    ? Promise.resolve(false)
    : lastMessage.role === 'user'
      ? saveQuestion(supabase, chat.userId, threadId, lastMessage.parts)
      : Promise.resolve(true);

  const org = hasSupabaseEnv() ? await getCurrentOrg(supabase) : null;
  const data = await getReachData(supabase);
  // Only a non-viewer member gets change tools (and each still needs approval).
  const write =
    org && org.role !== 'viewer'
      ? { ctx: { client: supabase, orgId: org.orgId }, canWrite: true }
      : undefined;

  // The answer does not depend on anyone watching it arrive: closing the tab
  // or opening another chat must not cut it short, so the model is bounded by
  // time rather than by the request, and the stream is drained here.
  const result = runTuah(
    chat.messages,
    { data, write },
    AbortSignal.timeout(ANSWER_TIMEOUT_MS),
    chat.apiKey,
    chat.screen,
  );
  void result.consumeStream();

  if (threadId) {
    void (async () => {
      if (!(await questionSaved)) return;
      // Everything Tuah said this turn, including the line before a lookup.
      const steps = await result.steps;
      const text = steps
        .map((step) => step.text.trim())
        .filter(Boolean)
        .join('\n\n');
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
