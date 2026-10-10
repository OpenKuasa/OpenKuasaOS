import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  viewer: { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false } as {
    userId: string; orgId: string; role: string; isDemo: boolean;
  },
  created: [] as unknown[],
}));

vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => ctl.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/reach/capabilities', async (orig) => {
  const actual = await orig<typeof import('@/lib/reach/capabilities')>();
  return {
    ...actual,
    createCampaign: async (_ctx: unknown, input: unknown) => {
      ctl.created.push(input);
      return { ok: true, data: { id: 'c1' } };
    },
  };
});

const { createCampaignAction } = await import('@/app/(app)/reach/actions');

beforeEach(() => {
  ctl.viewer = { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false };
  ctl.created = [];
});

describe('createCampaignAction', () => {
  it('forbids a demo guest', async () => {
    ctl.viewer = { ...ctl.viewer, isDemo: true };
    const res = await createCampaignAction({ name: 'x', channel: 'facebook' });
    expect(res).toMatchObject({ ok: false });
    expect(ctl.created).toHaveLength(0);
  });
  it('forbids a viewer', async () => {
    ctl.viewer = { ...ctl.viewer, role: 'viewer' };
    const res = await createCampaignAction({ name: 'x', channel: 'facebook' });
    expect(res).toMatchObject({ ok: false });
    expect(ctl.created).toHaveLength(0);
  });
  it('rejects invalid input before calling the capability', async () => {
    const res = await createCampaignAction({ name: '', channel: 'nope' });
    expect(res).toMatchObject({ ok: false });
    expect(ctl.created).toHaveLength(0);
  });
  it('calls the capability for a member with valid input', async () => {
    const res = await createCampaignAction({ name: 'Promo', channel: 'facebook' });
    expect(res).toMatchObject({ ok: true });
    expect(ctl.created).toHaveLength(1);
  });
});
