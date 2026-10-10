'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { listThreads } from '@/lib/chat/store';
import {
  textParts,
  type ChatThread,
  type StoredMessage,
} from '@/lib/chat/threads';

/**
 * Chat history for the signed-in user. Every query runs as that user, so row
 * level security keeps each person to their own threads; the filters below
 * only narrow the list to the workspace they are in.
 */

const idSchema = z.string().uuid();
const titleSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1).max(120));

/** The user's threads in their current workspace, newest first. `null` on failure. */
export async function listChatThreadsAction(): Promise<ChatThread[] | null> {
  const supabase = await createClient();
  const org = await getCurrentOrg(supabase);
  if (!org) return [];
  return listThreads(supabase, org.orgId);
}

export type LoadedThread =
  | { ok: true; thread: ChatThread; messages: StoredMessage[] }
  | { ok: false; reason: 'missing' | 'error' };

/** One thread with its messages, oldest first. */
export async function loadChatThreadAction(id: string): Promise<LoadedThread> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, reason: 'missing' };

  const supabase = await createClient();
  // A link to a thread from another workspace reads as missing, so a chat
  // never continues somewhere the list does not show it.
  const org = await getCurrentOrg(supabase);
  if (!org) return { ok: false, reason: 'missing' };

  const [thread, messages] = await Promise.all([
    supabase
      .from('chat_threads')
      .select('id, title, updated_at')
      .eq('id', parsed.data)
      .eq('org_id', org.orgId)
      .maybeSingle(),
    supabase
      .from('chat_messages')
      .select('id, role, parts')
      .eq('thread_id', parsed.data)
      .order('created_at', { ascending: true }),
  ]);
  if (thread.error || messages.error) {
    console.error(
      '[chat] could not load a thread:',
      (thread.error ?? messages.error)?.message,
    );
    return { ok: false, reason: 'error' };
  }
  if (!thread.data) return { ok: false, reason: 'missing' };

  return {
    ok: true,
    thread: {
      id: thread.data.id as string,
      title: thread.data.title as string,
      updatedAt: thread.data.updated_at as string,
    },
    messages: (messages.data ?? [])
      .map((row) => ({
        id: row.id as string,
        role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
        parts: textParts(row.parts),
      }))
      .filter((message) => message.parts.length > 0),
  };
}

/** Renames a thread. Resolves to the saved title, or `null` if nothing changed. */
export async function renameChatThreadAction(
  id: string,
  title: string,
): Promise<string | null> {
  const parsedId = idSchema.safeParse(id);
  const parsedTitle = titleSchema.safeParse(title);
  if (!parsedId.success || !parsedTitle.success) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_threads')
    .update({ title: parsedTitle.data })
    .eq('id', parsedId.data)
    .select('title')
    .maybeSingle();
  if (error) {
    console.error('[chat] could not rename a thread:', error.message);
    return null;
  }
  return (data?.title as string | undefined) ?? null;
}

/** Deletes a thread and its messages. Resolves to whether it is gone. */
export async function deleteChatThreadAction(id: string): Promise<boolean> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return false;

  const supabase = await createClient();
  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', parsed.data);
  if (error) {
    console.error('[chat] could not delete a thread:', error.message);
    return false;
  }
  return true;
}
