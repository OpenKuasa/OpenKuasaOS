import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityCategory = 'auth' | 'team' | 'data' | 'security' | 'billing';

export type AppEvent = {
  /** Past-tense sentence shown in the activity log, e.g. "Changed password". */
  action: string;
  category: ActivityCategory;
  /** What the action was done to, e.g. an email or a record name. */
  target?: string;
  /** Also raise an in-app notification for the actor or the org's admins. */
  notify?: {
    to: 'self' | 'admins';
    /** A notification-preference event id, or 'security' (always delivered). */
    event: string;
    title: string;
    body?: string;
    /** App-relative link, e.g. "/account/security". */
    href?: string;
  };
};

/**
 * Records an activity-log row for the signed-in user's current workspace and
 * optionally fans out an in-app notification. Never throws: an audit write
 * must not fail the action it describes. Viewers and demo guests are ignored
 * by the database function.
 */
export async function recordEvent(
  supabase: SupabaseClient,
  event: AppEvent,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_event', {
      p_action: event.action,
      p_category: event.category,
      p_target: event.target ?? null,
      p_notify: event.notify?.to ?? null,
      p_event: event.notify?.event ?? 'team_activity',
      p_title: event.notify?.title ?? null,
      p_body: event.notify?.body ?? null,
      p_href: event.notify?.href ?? null,
    });
    if (error) console.error('recordEvent failed:', error.message);
  } catch (error) {
    console.error('recordEvent failed:', error);
  }
}
