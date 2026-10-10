/**
 * Who pays for a chat turn.
 *
 * A workspace that has added its own OpenRouter key chats on that key with no
 * platform quota. Without one, each signed-up user gets a few free questions a
 * week on the platform key, after which chat asks for a key. Demo guests never
 * reach a model.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { isLiveChatAllowed } from '@/lib/ai/access';
import { decryptApiKey, hasKeySecret } from '@/lib/ai/key-crypto';
import { hasProviderKey } from '@/lib/ai/provider';

export const FREE_QUESTIONS_PER_WEEK = 3;

export type ChatAccess =
  /** Run on the workspace's own key. */
  | { kind: 'byok'; apiKey: string }
  /** Run on the platform key; `remaining` free questions are left after this one. */
  | { kind: 'free'; remaining: number }
  | { kind: 'locked'; status: number; code: ChatLockCode; error: string };

export type ChatLockCode =
  | 'sign_in'
  | 'demo'
  | 'key_required'
  | 'key_unavailable';

const locked = (
  status: number,
  code: ChatLockCode,
  error: string,
): ChatAccess => ({ kind: 'locked', status, code, error });

/**
 * Decides how this request may reach a model, consuming one free question when
 * it runs on the platform key. Call once per chat turn, before the model.
 */
export async function resolveChatAccess(
  supabase: SupabaseClient,
  user: User | null | undefined,
): Promise<ChatAccess> {
  if (!user) return locked(401, 'sign_in', 'Please sign in to chat.');
  if (!isLiveChatAllowed(user)) {
    return locked(403, 'demo', 'Sign up for a free account to chat.');
  }

  const { data: sealed, error } = await supabase.rpc('org_ai_key_ciphertext');
  if (error) {
    console.error('[chat] could not read the workspace key:', error.message);
    return locked(503, 'key_unavailable', 'Chat is unavailable right now. Please try again.');
  }

  if (typeof sealed === 'string' && sealed) {
    // Fail closed: a workspace that set its own key must never fall back to
    // the platform key because this server cannot open it.
    const apiKey = hasKeySecret() ? decryptApiKey(sealed) : null;
    if (!apiKey) {
      return locked(
        503,
        'key_unavailable',
        'Your workspace key could not be used on this server. Ask an owner to save it again.',
      );
    }
    return { kind: 'byok', apiKey };
  }

  const needsKey = locked(
    402,
    'key_required',
    'Add your OpenRouter key to keep chatting.',
  );
  if (!hasProviderKey()) return needsKey;

  const { data: remaining, error: quotaErr } = await supabase.rpc(
    'consume_free_question',
    { weekly_limit: FREE_QUESTIONS_PER_WEEK },
  );
  if (quotaErr) {
    console.error('[chat] free allowance unavailable:', quotaErr.message);
    return locked(503, 'key_unavailable', 'Chat is unavailable right now. Please try again.');
  }
  if (typeof remaining !== 'number' || remaining < 0) return needsKey;
  return { kind: 'free', remaining };
}

/** What the chat UI shows before a question is asked. Does not consume anything. */
export type ChatStatus = {
  hasKey: boolean;
  keyHint: string | null;
  freeLimit: number;
  freeRemaining: number;
};

export async function getChatStatus(supabase: SupabaseClient): Promise<ChatStatus> {
  const [{ data: key }, { data: used }] = await Promise.all([
    supabase.rpc('org_ai_key_status'),
    supabase.rpc('free_questions_used'),
  ]);
  const row = Array.isArray(key) ? key[0] : key;
  const hint = (row as { key_hint?: string } | null | undefined)?.key_hint ?? null;
  const usedCount = typeof used === 'number' ? used : 0;

  return {
    hasKey: hint !== null,
    keyHint: hint,
    freeLimit: FREE_QUESTIONS_PER_WEEK,
    // Without a platform key there is nothing to run free questions on.
    freeRemaining: hasProviderKey()
      ? Math.max(0, FREE_QUESTIONS_PER_WEEK - usedCount)
      : 0,
  };
}
