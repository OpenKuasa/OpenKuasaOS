/**
 * Writes chat turns to the signed-in user's saved threads. Runs as the user,
 * so row level security decides what may be written. Saving is best effort:
 * a failure is logged and the conversation carries on unsaved.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { textParts, titleFromText, type StoredTextPart } from '@/lib/chat/threads';

type Role = 'user' | 'assistant';

async function insertMessage(
  supabase: SupabaseClient,
  threadId: string,
  role: Role,
  parts: StoredTextPart[],
): Promise<boolean> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ thread_id: threadId, role, parts });
  if (error) console.error('[chat] could not save a message:', error.message);
  return !error;
}

/**
 * Saves the question that starts this turn, creating the thread on its first
 * question. Resolves to whether the thread is usable for the answer.
 */
export async function saveQuestion(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  parts: unknown,
): Promise<boolean> {
  try {
    const question = textParts(parts);
    if (question.length === 0) return false;

    const { data: existing, error: readErr } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('id', threadId)
      .maybeSingle();
    if (readErr) throw readErr;

    if (existing) {
      // Asking again moves the thread back to the top of the list.
      const { error } = await supabase
        .from('chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', threadId);
      if (error) throw error;
    } else {
      const org = await getCurrentOrg(supabase);
      if (!org) return false;
      const { error } = await supabase.from('chat_threads').insert({
        id: threadId,
        org_id: org.orgId,
        user_id: userId,
        title: titleFromText(question.map((p) => p.text).join(' ')),
      });
      if (error) throw error;
    }

    return await insertMessage(supabase, threadId, 'user', question);
  } catch (error) {
    console.error(
      '[chat] could not save the question:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/** Saves the assistant's reply, including a partial one the user stopped. */
export async function saveAnswer(
  supabase: SupabaseClient,
  threadId: string,
  parts: unknown,
): Promise<void> {
  const answer = textParts(parts);
  if (answer.length === 0) return;
  await insertMessage(supabase, threadId, 'assistant', answer);
}
