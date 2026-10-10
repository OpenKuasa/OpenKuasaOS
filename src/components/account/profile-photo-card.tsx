'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import {
  removeAvatarAction,
  saveAvatarAction,
} from '@/app/account/profile/actions';
import type { SettingsState } from '@/app/account/actions';
import {
  AVATAR_ACCEPT,
  avatarFileError,
  avatarObjectPath,
  type AvatarMime,
} from './avatar-rules';
import { UserAvatar } from './user-avatar';

export function ProfilePhotoCard({
  userId,
  initials,
  avatarUrl,
  readOnly,
}: {
  userId: string;
  initials: string;
  avatarUrl: string | null;
  readOnly: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<SettingsState>(undefined);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);

  // The file goes straight from the browser to storage, so it never has to
  // fit through a server action; the action only records where it landed.
  const upload = async (file: File) => {
    const invalid = avatarFileError(file);
    if (invalid) {
      setState({ error: invalid });
      return;
    }

    setBusy('upload');
    setState(undefined);
    const storage = createClient().storage.from('avatars');
    const path = avatarObjectPath(userId, file.type as AvatarMime);
    let uploaded = false;
    let saved = false;
    try {
      const { error } = await storage.upload(path, file, {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) {
        setState({ error: 'Could not upload your photo. Please try again.' });
        return;
      }
      uploaded = true;

      const result = await saveAvatarAction(path);
      saved = !result?.error;
      setState(result);
    } catch {
      setState({ error: 'Could not upload your photo. Please try again.' });
    } finally {
      // Don't leave an unreferenced file behind when the save did not happen.
      if (uploaded && !saved) await storage.remove([path]).catch(() => {});
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    setState(undefined);
    try {
      setState(await removeAvatarAction());
    } catch {
      setState({ error: 'Could not remove your photo. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile photo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <UserAvatar
          initials={initials}
          avatarUrl={avatarUrl}
          className="size-16"
          fallbackClassName="text-lg font-bold"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a profile photo"
              disabled={readOnly || busy !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Clear the input so picking the same file again still fires.
                event.target.value = '';
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              {busy === 'upload'
                ? 'Uploading…'
                : avatarUrl
                  ? 'Change photo'
                  : 'Upload photo'}
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={readOnly || busy !== null}
                onClick={() => void remove()}
              >
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </Button>
            ) : null}
          </div>
          {state?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : state?.notice ? (
            <p role="status" className="text-sm text-muted-foreground">
              {state.notice}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? 'Photos can’t be changed in the demo workspace.'
                : avatarUrl
                  ? 'JPG, PNG or WebP, up to 2MB.'
                  : 'Your initials are shown until you add a photo. JPG, PNG or WebP, up to 2MB.'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
