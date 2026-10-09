import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { chatAccessFor, isLiveChatAllowed } from '@/lib/ai/access';

const member = { id: 'u1', is_anonymous: false } as User;
const anon = { id: 'u2', is_anonymous: true } as User;

describe('chat access gating', () => {
  it('treats a missing user as anonymous', () => {
    expect(chatAccessFor(null)).toBe('anon');
    expect(chatAccessFor(undefined)).toBe('anon');
    expect(isLiveChatAllowed(null)).toBe(false);
  });

  it('treats an anonymous (demo) user as demo, not live', () => {
    expect(chatAccessFor(anon)).toBe('demo');
    expect(isLiveChatAllowed(anon)).toBe(false);
  });

  it('allows a signed-in, non-anonymous member', () => {
    expect(chatAccessFor(member)).toBe('live');
    expect(isLiveChatAllowed(member)).toBe(true);
  });
});
