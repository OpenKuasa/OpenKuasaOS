/**
 * POST /api/people/chat — the Ask-Lekiu streaming endpoint.
 *
 * Same gate as Ask-Jebat (see `prepareChat`): signed in, not a demo guest, a
 * workspace key or a free weekly question. Lekiu then runs with the HR
 * lookups, which read a request-scoped provider built from the one workspace
 * resolved here (`createSupabasePeopleData`; the sample data when no project is
 * configured) through the caller's own session, so the database decides which rows they see: all
 * of them for an owner or admin, only their own for anyone else. It holds no
 * change tools yet.
 */

import { chatJson, prepareChat } from '@/lib/ai/chat-request';
import { runLekiu } from '@/lib/ai/agents/orchestrator';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { createSupabasePeopleData, getPeopleData } from '@/lib/people/supabase';
import type { PeopleData, PeopleViewer } from '@/lib/people/types';
import { getPeopleViewer } from '@/lib/people/viewer';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server (Railway).
export const maxDuration = 60;

export async function POST(request: Request) {
  const chat = await prepareChat(request);
  if (!chat.ok) return chat.response;

  let org: Awaited<ReturnType<typeof getCurrentOrg>> = null;
  let data: PeopleData;
  let viewer: PeopleViewer;
  try {
    org = hasSupabaseEnv() ? await getCurrentOrg(chat.supabase) : null;
    // With a project configured, HR data belongs to a workspace: nothing to answer from without one.
    if (hasSupabaseEnv() && !org) {
      return chatJson(409, {
        error: 'Lekiu needs a workspace to look at. Create or join one first.',
        code: 'no_workspace',
      });
    }
    // One workspace lookup serves both: the provider and the viewer cannot disagree.
    // Without a project (no org) the provider is the sample data.
    [data, viewer] = await Promise.all([
      org ? Promise.resolve(createSupabasePeopleData(chat.supabase, org.orgId)) : getPeopleData(chat.supabase),
      getPeopleViewer(chat.supabase, org),
    ]);
  } catch (error) {
    console.error('[ask-lekiu] could not load the workspace:', error instanceof Error ? error.message : error);
    return chatJson(503, {
      error: 'Lekiu could not load your HR data. Please try again in a moment.',
      code: 'data_unavailable',
    });
  }
  const result = runLekiu(chat.messages, { data, viewer }, request.signal, chat.apiKey);

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[ask-lekiu] stream error:', error instanceof Error ? error.message : error);
      return 'Lekiu ran into a problem. Please try again in a moment.';
    },
  });
}
