import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  avatarFileError,
  avatarObjectPath,
  isOwnAvatarPath,
} from '@/components/account/avatar-rules';

const USER = '0b6f0c1e-1111-4222-8333-444455556666';
const OTHER = '9a9a9a9a-1111-4222-8333-444455556666';

describe('avatarFileError', () => {
  it('accepts JPG, PNG and WebP up to 2MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(avatarFileError({ type, size: AVATAR_MAX_BYTES })).toBeNull();
    }
  });

  it('rejects other file types', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', '']) {
      expect(avatarFileError({ type, size: 10 })).toMatch(/JPG, PNG or WebP/);
    }
  });

  it('rejects files over 2MB and empty files', () => {
    expect(
      avatarFileError({ type: 'image/png', size: AVATAR_MAX_BYTES + 1 }),
    ).toMatch(/2MB/);
    expect(avatarFileError({ type: 'image/png', size: 0 })).toMatch(/empty/);
  });
});

describe('avatarObjectPath', () => {
  it('puts the file in the user folder with an extension from the type', () => {
    expect(avatarObjectPath(USER, 'image/jpeg', 1700000000000)).toBe(
      `${USER}/1700000000000.jpg`,
    );
    expect(avatarObjectPath(USER, 'image/webp', 5)).toBe(`${USER}/5.webp`);
  });

  it('produces paths the server accepts', () => {
    expect(isOwnAvatarPath(avatarObjectPath(USER, 'image/png'), USER)).toBe(
      true,
    );
  });
});

describe('isOwnAvatarPath', () => {
  it('rejects paths in another user folder', () => {
    expect(isOwnAvatarPath(`${OTHER}/1700000000000.png`, USER)).toBe(false);
  });

  it('rejects traversal, nesting and unexpected names', () => {
    for (const path of [
      `${USER}/../${OTHER}/1.png`,
      `${USER}/nested/1.png`,
      `${USER}/photo.png`,
      `${USER}/1.gif`,
      `${USER}/`,
      `${USER}`,
      `/${USER}/1.png`,
      '',
    ]) {
      expect(isOwnAvatarPath(path, USER)).toBe(false);
    }
  });

  it('rejects everything when there is no user id', () => {
    expect(isOwnAvatarPath('/1.png', '')).toBe(false);
  });
});
