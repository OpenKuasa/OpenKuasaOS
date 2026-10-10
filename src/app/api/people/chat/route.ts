/**
 * POST /api/people/chat — the Ask-Lekiu streaming endpoint.
 *
 * Same gate as Ask-Jebat (see `prepareChat`): signed in, not a demo guest, a
 * workspace key or a free weekly question. Lekiu then runs with the HR
 * lookups, which read a request-scoped provider from `getPeopleData` through
 * the caller's own session, so the database decides which rows they see: all
 * of them for an owner or admin, only their own for anyone else. It holds no
 * change tools yet.
 */

import { chatJson, prepareChat } from '@/lib/ai/chat-request';
import { runLekiu } from '@/lib/ai/agents/orchestrator';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { getPeopleData } from '@/lib/people/supabase';
import { getPeopleViewer } from '@/lib/people/viewer';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server (Railway).
export const maxDuration = 60;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  const org = hasSupabaseEnv() ? await getCurrentOrg(chat.supabase) : null;
  // With a project configured, HR data belongs to a workspace: nothing to answer from without one.
  if (hasSupabaseEnv() && !org) {
    return chatJson(409, {
      error: 'Lekiu needs a workspace to look at. Create or join one first.',
      code: 'no_workspace',
    });
  }

  const [data, viewer] = await Promise.all([
    getPeopleData(chat.supabase),
    getPeopleViewer(chat.supabase, org),
  ]);
  const result = runLekiu(chat.messages, { data, viewer }, request.signal, chat.apiKey);

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[ask-lekiu] stream error:', error);
      return 'Lekiu ran into a problem. Please try again in a moment.';
    },
  });
}
