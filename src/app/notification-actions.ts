'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import {
  EMPTY_FEED,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationFeed,
} from '@/lib/account/notifications';

// These actions feed the bell's own client state, so none of them revalidate
// a path: re-rendering the whole shell for a read receipt would be wasteful.
// Each returns the refreshed feed, or null when the database call failed so
// the menu keeps what it was already showing.

const idSchema = z.uuid();

/** Latest notifications and the unread count for the signed-in user. */
export async function loadNotificationsAction(): Promise<NotificationFeed | null> {
  if (!hasSupabaseEnv()) return EMPTY_FEED;
  const viewer = await getViewer();

  try {
    return await listNotifications(await createClient(), viewer.userId);
  } catch (error) {
    console.error('loadNotifications failed:', error);
    return null;
  }
}

export async function markNotificationReadAction(
  id: string,
): Promise<NotificationFeed | null> {
  if (!hasSupabaseEnv()) return EMPTY_FEED;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return null;
  const viewer = await getViewer();

  try {
    const supabase = await createClient();
    await markNotificationRead(supabase, viewer.userId, parsed.data);
    return await listNotifications(supabase, viewer.userId);
  } catch (error) {
    console.error('markNotificationRead failed:', error);
    return null;
  }
}

export async function markAllNotificationsReadAction(): Promise<NotificationFeed | null> {
  if (!hasSupabaseEnv()) return EMPTY_FEED;
  const viewer = await getViewer();

  try {
    const supabase = await createClient();
    await markAllNotificationsRead(supabase, viewer.userId);
    return await listNotifications(supabase, viewer.userId);
  } catch (error) {
    console.error('markAllNotificationsRead failed:', error);
    return null;
  }
}
