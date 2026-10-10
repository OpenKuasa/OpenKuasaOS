// src/app/api/hire/chat/route.ts
/**
 * POST /api/hire/chat — the Ask-Lekir streaming endpoint.
 *
 * Same gate as Ask-Jebat (see `prepareChat`): signed in, not a demo guest, a
 * workspace key or a free weekly question. Lekir then runs with the hiring
 * lookups, which read a request-scoped provider from `getHireData` (RLS-scoped
 * Supabase in prod, sample data in dev, nothing for someone in no workspace).
 * It holds no change tools yet.
 */

import { prepareChat } from '@/lib/ai/chat-request';
import { runLekir } from '@/lib/ai/agents/orchestrator';
import { getHireData } from '@/lib/hire/supabase';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server (Railway).
export const maxDuration = 60;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  const data = await getHireData(chat.supabase);
  const result = runLekir(chat.messages, { data }, request.signal, chat.apiKey);

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[ask-lekir] stream error:', error);
      return 'Lekir ran into a problem. Please try again in a moment.';
    },
  });
}
