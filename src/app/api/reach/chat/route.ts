/**
 * POST /api/reach/chat — the Ask-Jebat streaming endpoint.
 *
 * Gate order: signed in? → not a demo/anon viewer? → provider configured? →
 * body within size? → under the daily quota? Then validate the UI messages,
 * trim to the recent window, run the orchestrator and stream a UI message
 * response. Tools read a fresh seed provider per request today; the data slice
 * swaps in an RLS-scoped Supabase provider with no change to the agent.
 */

import { convertToModelMessages, safeValidateUIMessages } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isLiveChatAllowed } from '@/lib/ai/access';
import { hasProviderKey } from '@/lib/ai/provider';
import { consumeDailyQuota } from '@/lib/ai/rate-limit';
import { runJebat } from '@/lib/ai/agents/orchestrator';
import { createSeedReachData } from '@/lib/reach/seed';

export const dynamic = 'force-dynamic';
// Hint for serverless hosts; a no-op on a persistent server (Railway), where the
// multi-layer turn runs without a function timeout.
export const maxDuration = 60;

// Keep input bounded: long histories multiply token cost. The larger byte cap
// accommodates inline attachments (images / PDFs as data URLs); the client caps
// the count/size, this backstops abuse.
const MAX_MESSAGES = 12;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const bodySchema = z.object({ messages: z.array(z.unknown()).min(1) });

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json(401, { error: 'Please sign in to chat with Jebat.' });
  if (!isLiveChatAllowed(user)) {
    return json(403, { error: 'Sign up for a free account to chat with Jebat.' });
  }
  if (!hasProviderKey()) {
    return json(503, { error: 'Jebat is not configured yet. Set OPENROUTER_API_KEY.' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { error: 'That message is too long for Jebat to handle.' });
  }

  const quota = await consumeDailyQuota(supabase);
  if (!quota.allowed) {
    return json(429, { error: 'You have reached today’s chat limit. Please try again tomorrow.' });
  }

  let modelMessages;
  try {
    const parsed = bodySchema.parse(JSON.parse(raw));
    const recent = parsed.messages.slice(-MAX_MESSAGES);
    const validated = await safeValidateUIMessages({ messages: recent });
    if (!validated.success) return json(400, { error: 'Invalid request.' });
    modelMessages = await convertToModelMessages(validated.data);
  } catch {
    return json(400, { error: 'Invalid request.' });
  }

  const result = runJebat(modelMessages, createSeedReachData(), request.signal);

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error('[ask-jebat] stream error:', error);
      return 'Jebat ran into a problem. Please try again in a moment.';
    },
  });
}
