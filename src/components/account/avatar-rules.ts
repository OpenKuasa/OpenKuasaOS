/**
 * Profile photo rules shared by the upload card and the server action. They
 * mirror the `avatars` storage bucket: 2MB limit, JPG/PNG/WebP only, and each
 * user may only write under a folder named after their own user id.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AvatarMime = keyof typeof EXTENSIONS;

export const AVATAR_MIME_TYPES = Object.keys(EXTENSIONS) as AvatarMime[];
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(',');

function isAvatarMime(type: string): type is AvatarMime {
  return Object.hasOwn(EXTENSIONS, type);
}

/** Returns a message for the user when the file cannot be used, else null. */
export function avatarFileError(file: {
  type: string;
  size: number;
}): string | null {
  if (!isAvatarMime(file.type)) {
    return 'Please choose a JPG, PNG or WebP image.';
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > AVATAR_MAX_BYTES) return 'Photos can be up to 2MB.';
  return null;
}

/**
 * Storage path for a new upload. The timestamp makes every upload a new
 * public URL, so browsers never show a cached copy of the old photo. The
 * extension comes from the MIME type, never from the file's own name.
 */
export function avatarObjectPath(
  userId: string,
  mime: AvatarMime,
  now: number = Date.now(),
): string {
  return `${userId}/${now}.${EXTENSIONS[mime]}`;
}

/** True when `path` is a photo this app uploaded into the user's own folder. */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  if (!userId || !path.startsWith(`${userId}/`)) return false;
  return /^\d{1,16}\.(jpg|png|webp)$/.test(path.slice(userId.length + 1));
}
