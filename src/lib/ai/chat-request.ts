/**
 * Shared front half of the chat endpoints: who is asking, may they reach a
 * model and on whose key, and is the request body sane. Each route then runs
 * its own agent with the result.
 */

import {
  convertToModelMessages,
  safeValidateUIMessages,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { resolveChatAccess } from '@/lib/ai/gate';
import { screenFromPath, type Screen } from '@/lib/chat/screen';
import { isThreadId } from '@/lib/chat/threads';

// Keep input bounded: long histories multiply token cost. The larger byte cap
// accommodates inline attachments (images / PDFs as data URLs); the client caps
// the count/size, this backstops abuse.
const MAX_MESSAGES = 12;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

// `id` is the chat's id as the client knows it. Only chats that are saved
// send a UUID; anything else is ignored rather than refused. `pathname` is
// the screen the question was asked from, read the same forgiving way.
const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  id: z.unknown().optional(),
  pathname: z.unknown().optional(),
});

export function chatJson(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export type PreparedChat =
  | { ok: false; response: Response }
  | {
      ok: true;
      supabase: SupabaseClient;
      messages: ModelMessage[];
      /** The workspace's own key, or undefined for a platform-paid free question. */
      apiKey: string | undefined;
      /** Free questions left this week after this one; null on a workspace key. */
      freeRemaining: number | null;
      userId: string;
      /** The chat's id when the client sent a UUID, for saving the thread. */
      threadId: string | null;
      /** The newest message as sent: the question this turn answers. */
      lastMessage: UIMessage;
      /** The product screen the question was asked from, when it is a known one. */
      screen: Screen | null;
    };

/**
 * Gate order: signed in → body within size and well-formed → not a demo guest
 * → workspace key, else a free question. The body is checked before the
 * allowance so a malformed request never spends a free question.
 */
export async function prepareChat(request: Request): Promise<PreparedChat> {
  const fail = (status: number, body: Record<string, unknown>): PreparedChat => ({
    ok: false,
    response: chatJson(status, body),
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Turn strangers away before reading a potentially large body.
  if (!user) {
    return fail(401, { error: 'Please sign in to chat.', code: 'sign_in' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return fail(413, { error: 'That message is too long to handle.' });
  }

  let messages: ModelMessage[];
  let threadId: string | null = null;
  let lastMessage: UIMessage;
  let screen: Screen | null = null;
  try {
    const parsed = bodySchema.parse(JSON.parse(raw));
    const recent = parsed.messages.slice(-MAX_MESSAGES);
    const validated = await safeValidateUIMessages({ messages: recent });
    if (!validated.success) return fail(400, { error: 'Invalid request.' });
    messages = await convertToModelMessages(validated.data);
    threadId = isThreadId(parsed.id) ? parsed.id : null;
    screen = screenFromPath(parsed.pathname);
    lastMessage = validated.data[validated.data.length - 1];
  } catch {
    return fail(400, { error: 'Invalid request.' });
  }

  const access = await resolveChatAccess(supabase, user);
  if (access.kind === 'locked') {
    // `code` lets the client react (e.g. show the add-your-key prompt)
    // without parsing prose.
    return fail(access.status, { error: access.error, code: access.code });
  }

  return {
    ok: true,
    supabase,
    messages,
    apiKey: access.kind === 'byok' ? access.apiKey : undefined,
    freeRemaining: access.kind === 'free' ? access.remaining : null,
    userId: user.id,
    threadId,
    lastMessage,
    screen,
  };
}
