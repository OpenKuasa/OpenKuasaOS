'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { recordEvent } from '@/lib/events';
import { isOwnAvatarPath } from '@/components/account/avatar-rules';
import type { SettingsState } from '@/app/account/actions';

const DEMO_ERROR = 'The demo workspace is read-only. Sign up to save changes.';
const PHOTO_ERROR = 'Could not save your photo. Please try again.';

// Absolute origin of the current request, for building email redirect targets.
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : 'https://openkuasa.com';
}

// Points the profile at `path` (or clears it) and deletes the photo it
// replaces. The old path is read here rather than taken from the client.
async function setAvatarPath(
  supabase: SupabaseClient,
  userId: string,
  path: string | null,
): Promise<boolean> {
  const { data: current } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('user_id', userId)
    .maybeSingle();
  const previous: string | null = current?.avatar_path ?? null;

  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_path: path })
    .eq('user_id', userId)
    .select('user_id');
  if (error || !data?.length) return false;

  // Best effort: a leftover file is harmless, a failed save is not.
  if (previous && previous !== path && isOwnAvatarPath(previous, userId)) {
    const { error: removeErr } = await supabase.storage
      .from('avatars')
      .remove([previous]);
    if (removeErr) console.error('avatar cleanup failed:', removeErr.message);
  }
  return true;
}

const avatarPathSchema = z.string().min(1).max(200);

/** Saves the path of a photo the browser has already uploaded to storage. */
export async function saveAvatarAction(path: string): Promise<SettingsState> {
  const viewer = await getViewer();
  if (viewer.isDemo) return { error: DEMO_ERROR };

  const parsed = avatarPathSchema.safeParse(path);
  if (!parsed.success || !isOwnAvatarPath(parsed.data, viewer.userId)) {
    return { error: PHOTO_ERROR };
  }

  const supabase = await createClient();
  // Only accept a path that really holds an uploaded file.
  const [folder, name] = parsed.data.split('/');
  const { data: found } = await supabase.storage
    .from('avatars')
    .list(folder, { search: name, limit: 1 });
  if (!found?.some((object) => object.name === name)) {
    return { error: PHOTO_ERROR };
  }

  if (!(await setAvatarPath(supabase, viewer.userId, parsed.data))) {
    return { error: PHOTO_ERROR };
  }

  await recordEvent(supabase, {
    action: 'Updated their profile photo',
    category: 'data',
  });

  // The photo appears in the nav of every signed-in layout.
  revalidatePath('/', 'layout');
  return { notice: 'Photo updated.' };
}

export async function removeAvatarAction(): Promise<SettingsState> {
  const viewer = await getViewer();
  if (viewer.isDemo) return { error: DEMO_ERROR };

  const supabase = await createClient();
  if (!(await setAvatarPath(supabase, viewer.userId, null))) {
    return { error: 'Could not remove your photo. Please try again.' };
  }

  await recordEvent(supabase, {
    action: 'Removed their profile photo',
    category: 'data',
  });

  revalidatePath('/', 'layout');
  return { notice: 'Photo removed.' };
}

const emailChangeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Please enter a valid email address.')
    .email('Please enter a valid email address.'),
});

/**
 * Starts an email change. Supabase emails a confirmation link to the new
 * address; the sign-in email only changes once that link is opened (handled
 * by /auth/confirm), and a database trigger then mirrors it to the profile.
 */
export async function requestEmailChangeAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const viewer = await getViewer();
  if (viewer.isDemo || !viewer.email) return { error: DEMO_ERROR };

  const parsed = emailChangeSchema.safeParse({
    email: String(formData.get('email') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const newEmail = parsed.data.email;
  if (newEmail === viewer.email.toLowerCase()) {
    return { error: 'That is already your sign-in email.' };
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${origin}/auth/confirm?next=/account/profile` },
  );
  if (error) {
    if (error.code === 'email_exists') {
      return { error: 'That email is already used by another account.' };
    }
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return {
        error: 'Too many emails sent. Please wait a few minutes and try again.',
      };
    }
    return { error: 'Could not start the email change. Please try again.' };
  }

  await recordEvent(supabase, {
    action: 'Requested an email change',
    category: 'security',
    target: newEmail,
    notify: {
      to: 'self',
      event: 'security',
      title: 'Email change requested',
      body: 'Confirm it from the link sent to ' + newEmail,
      href: '/account/profile',
    },
  });

  revalidatePath('/account/profile');
  return {
    notice: `Confirmation link sent to ${newEmail}. Your sign-in email stays ${viewer.email} until you open it.`,
  };
}
