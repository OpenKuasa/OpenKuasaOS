/**
 * Who may trigger a live Ask-Jebat model call.
 *
 * The LLM is the only metered cost, so a demo / anonymous visitor never reaches
 * the model — the hero shows a canned answer client-side and the route returns
 * 403 as defense-in-depth. Only a signed-in, non-anonymous user gets a live run.
 */

import type { User } from '@supabase/supabase-js';

export type ChatAccess = 'live' | 'demo' | 'anon';

export function chatAccessFor(user: User | null | undefined): ChatAccess {
  if (!user) return 'anon';
  if (user.is_anonymous) return 'demo';
  return 'live';
}

export function isLiveChatAllowed(user: User | null | undefined): boolean {
  return chatAccessFor(user) === 'live';
}
