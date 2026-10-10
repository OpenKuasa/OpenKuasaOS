import { beforeEach, describe, expect, it, vi } from 'vitest';

const ID = '11111111-1111-4111-8111-111111111111';

const ctl = vi.hoisted(() => ({
  viewer: { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false } as {
    userId: string; orgId: string; role: string; isDemo: boolean;
  },
  calls: [] as { fn: string; ctx: { orgId: string }; input: unknown }[],
  result: { ok: true, data: { id: 'f1' } } as { ok: boolean; data?: unknown; error?: string },
  revalidated: [] as string[],
}));

vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => ctl.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { ctl.revalidated.push(path); } }));
vi.mock('@/lib/reach/capabilities', async (orig) => {
  const actual = await orig<typeof import('@/lib/reach/capabilities')>();
  const record = (fn: string) => async (ctx: { orgId: string }, input: unknown) => {
    ctl.calls.push({ fn, ctx, input });
    return ctl.result;
  };
  return {
    ...actual,
    createForm: record('createForm'),
    updateForm: record('updateForm'),
    setFormStatus: record('setFormStatus'),
    deleteForm: record('deleteForm'),
  };
});

const { createFormAction, updateFormAction, setFormStatusAction, deleteFormAction } = await import(
  '@/app/(app)/reach/actions'
);

beforeEach(() => {
  ctl.viewer = { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false };
  ctl.calls = [];
  ctl.result = { ok: true, data: { id: 'f1' } };
  ctl.revalidated = [];
});

describe('lead form actions', () => {
  it('forbid a demo guest and a viewer, for every action', async () => {
    const attempts = [
      () => createFormAction({ name: 'Raya Promo' }),
      () => updateFormAction({ id: ID, name: 'x' }),
      () => setFormStatusAction({ id: ID, status: 'active' }),
      () => deleteFormAction({ id: ID }),
    ];
    for (const who of [{ isDemo: true }, { role: 'viewer' }]) {
      ctl.viewer = { ...ctl.viewer, role: 'member', isDemo: false, ...who };
      for (const attempt of attempts) {
        expect(await attempt()).toEqual({ ok: false, error: 'You do not have permission to make changes here.' });
      }
    }
    expect(ctl.calls).toHaveLength(0);
    expect(ctl.revalidated).toHaveLength(0);
  });

  it('answer a rejected input with a message the person can act on', async () => {
    expect(await createFormAction({ name: '' })).toEqual({ ok: false, error: 'Enter a name for the form.' });
    expect(await createFormAction({ name: 'Raya', slug: 'Not A Link' })).toEqual({
      ok: false,
      error: 'Use only lower-case letters, numbers and hyphens in the short name, such as raya-promo.',
    });
    expect(await deleteFormAction({ id: 'form_1' })).toEqual({ ok: false, error: 'That form no longer exists.' });
    expect(await createFormAction(null)).toMatchObject({ ok: false });
    expect(ctl.calls).toHaveLength(0);
  });

  it('run the capability in the caller workspace and refresh both routes', async () => {
    const res = await createFormAction({ name: 'Raya Promo', slug: '/raya-promo', org_id: 'someone-else' });
    expect(res).toMatchObject({ ok: true });
    expect(ctl.calls).toHaveLength(1);
    expect(ctl.calls[0]).toMatchObject({ fn: 'createForm', ctx: { orgId: 'org1' } });
    expect(ctl.calls[0].input).toEqual({
      name: 'Raya Promo', slug: '/raya-promo', category: null, channel: null, status: 'draft',
    });
    expect(ctl.revalidated).toEqual(['/reach/lead-forms', '/crm/lead-forms']);
  });

  it('route each action to its own capability', async () => {
    await updateFormAction({ id: ID, name: 'x' });
    await setFormStatusAction({ id: ID, status: 'paused' });
    await deleteFormAction({ id: ID });
    expect(ctl.calls.map((c) => c.fn)).toEqual(['updateForm', 'setFormStatus', 'deleteForm']);
    expect(ctl.calls[1].input).toEqual({ id: ID, status: 'paused' });
  });

  it('pass a capability failure through and refresh nothing', async () => {
    ctl.result = { ok: false, error: 'Another form already uses that short name.' };
    expect(await createFormAction({ name: 'Raya Promo' })).toEqual({
      ok: false,
      error: 'Another form already uses that short name.',
    });
    expect(ctl.revalidated).toHaveLength(0);
  });

  it('let an owner and an admin write too', async () => {
    for (const role of ['owner', 'admin']) {
      ctl.viewer = { ...ctl.viewer, role };
      expect(await setFormStatusAction({ id: ID, status: 'active' })).toMatchObject({ ok: true });
    }
    expect(ctl.calls).toHaveLength(2);
  });
});
