import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  viewer: { orgId: 'org1', role: 'member', isDemo: false } as { orgId: string; role: string; isDemo: boolean },
  revalidated: [] as string[],
  types: [] as (string | undefined)[],
  calls: [] as { fn: string; ctx: { orgId: string }; input: unknown }[],
  fail: false,
}));

vi.mock('next/cache', () => ({ revalidatePath: (path: string, type?: string) => { ctl.revalidated.push(path); ctl.types.push(type); } }));
vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => ctl.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ marker: 'client' }) }));
vi.mock('@/lib/hire/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hire/capabilities')>();
  const stub = (fn: string) => async (ctx: { orgId: string }, input: unknown) => {
    ctl.calls.push({ fn, ctx, input });
    return ctl.fail ? { ok: false, error: 'refused' } : { ok: true, data: { id: 'j1', title: 'Barista' } };
  };
  return { ...actual, createJob: stub('createJob'), updateJob: stub('updateJob'), setJobStatus: stub('setJobStatus'), deleteJob: stub('deleteJob'), updateCareersPage: stub('updateCareersPage') };
});

const { createJobAction, updateJobAction, setJobStatusAction, deleteJobAction, updateCareersPageAction } = await import('@/app/(app)/hire/actions');
const ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  ctl.viewer = { orgId: 'org1', role: 'member', isDemo: false };
  ctl.revalidated = [];
  ctl.types = [];
  ctl.calls = [];
  ctl.fail = false;
});

describe('hire job actions', () => {
  it('runs the capability with the viewer\'s workspace and refreshes the hiring screens', async () => {
    const sent = { title: 'Barista', org_id: 'someone-else' };
    const result = await createJobAction(sent);
    expect(result.ok).toBe(true);
    expect(ctl.calls).toHaveLength(1);
    expect(ctl.calls[0]).toMatchObject({ fn: 'createJob', ctx: { orgId: 'org1', client: { marker: 'client' } } });
    expect(ctl.calls[0].input).toEqual(sent);
    expect(ctl.revalidated.sort()).toEqual([
      '/hire/applications',
      '/hire/assistant',
      '/hire/candidates',
      '/hire/careers-page',
      '/hire/dashboard',
      '/hire/interviews',
      '/hire/jobs',
    ]);
  });
  it('allows an owner and an admin who are not demo visitors', async () => {
    for (const role of ['owner', 'admin']) {
      ctl.viewer = { orgId: 'org1', role, isDemo: false };
      ctl.calls = [];
  ctl.fail = false;
      expect((await deleteJobAction({ id: ID })).ok).toBe(true);
      expect(ctl.calls).toHaveLength(1);
    }
  });
  it('refuses a viewer and a demo visitor without calling the capability', async () => {
    for (const viewer of [{ orgId: 'org1', role: 'viewer', isDemo: false }, { orgId: 'demo', role: 'viewer', isDemo: true }, { orgId: 'org1', role: 'owner', isDemo: true }]) {
      ctl.viewer = viewer;
      for (const run of [() => createJobAction({ title: 'x' }), () => updateJobAction({ id: ID }), () => setJobStatusAction({ id: ID, status: 'open' }), () => deleteJobAction({ id: ID })]) {
        expect(await run()).toEqual({ ok: false, error: 'You do not have permission to make changes here.' });
      }
    }
    expect(ctl.calls).toHaveLength(0);
    expect(ctl.revalidated).toHaveLength(0);
  });
  it('routes each action to its capability', async () => {
    await updateJobAction({ id: ID, title: 'Head Barista' });
    await setJobStatusAction({ id: ID, status: 'open' });
    await deleteJobAction({ id: ID });
    expect(ctl.calls.map((c) => c.fn)).toEqual(['updateJob', 'setJobStatus', 'deleteJob']);
  });
});

describe('updateCareersPageAction', () => {
  it('refuses a viewer, a demo visitor and a demo owner without calling the capability', async () => {
    for (const viewer of [{ orgId: 'org1', role: 'viewer', isDemo: false }, { orgId: 'demo', role: 'viewer', isDemo: true }, { orgId: 'org1', role: 'owner', isDemo: true }]) {
      ctl.viewer = viewer;
      expect(await updateCareersPageAction({ careers_enabled: true })).toEqual({ ok: false, error: 'You do not have permission to make changes here.' });
    }
    expect(ctl.calls).toHaveLength(0);
    expect(ctl.revalidated).toHaveLength(0);
  });
  it('runs for an owner with the session context and refreshes the settings screen, the assistant and the public board with its job pages', async () => {
    ctl.viewer = { orgId: 'org1', role: 'owner', isDemo: false };
    const sent = { careers_enabled: true, org_id: 'someone-else' };
    expect((await updateCareersPageAction(sent)).ok).toBe(true);
    expect(ctl.calls).toHaveLength(1);
    expect(ctl.calls[0]).toMatchObject({ fn: 'updateCareersPage', ctx: { orgId: 'org1', client: { marker: 'client' } } });
    expect(ctl.calls[0].input).toEqual(sent);
    expect(ctl.revalidated).toEqual(['/hire/careers-page', '/hire/assistant', '/careers/org1']);
    expect(ctl.types[2]).toBe('layout');
  });
  it('refreshes nothing when the change was refused', async () => {
    ctl.viewer = { orgId: 'org1', role: 'owner', isDemo: false };
    ctl.fail = true;
    expect(await updateCareersPageAction({ careers_enabled: true })).toEqual({ ok: false, error: 'refused' });
    expect(ctl.revalidated).toHaveLength(0);
  });
});
