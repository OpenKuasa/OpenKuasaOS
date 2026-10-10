import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  viewer: { orgId: 'org1', role: 'member', isDemo: false } as { orgId: string; role: string; isDemo: boolean },
  revalidated: [] as string[],
  calls: [] as { fn: string; ctx: { orgId: string }; input: unknown }[],
}));

vi.mock('next/cache', () => ({ revalidatePath: (path: string) => ctl.revalidated.push(path) }));
vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => ctl.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ marker: 'client' }) }));
vi.mock('@/lib/hire/capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hire/capabilities')>();
  const stub = (fn: string) => async (ctx: { orgId: string }, input: unknown) => {
    ctl.calls.push({ fn, ctx, input });
    return { ok: true, data: { id: 'j1', title: 'Barista' } };
  };
  return { ...actual, createJob: stub('createJob'), updateJob: stub('updateJob'), setJobStatus: stub('setJobStatus'), deleteJob: stub('deleteJob') };
});

const { createJobAction, updateJobAction, setJobStatusAction, deleteJobAction } = await import('@/app/(app)/hire/actions');
const ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  ctl.viewer = { orgId: 'org1', role: 'member', isDemo: false };
  ctl.revalidated = [];
  ctl.calls = [];
});

describe('hire job actions', () => {
  it('runs the capability with the viewer\'s workspace and refreshes the hiring screens', async () => {
    const result = await createJobAction({ title: 'Barista', org_id: 'someone-else' });
    expect(result.ok).toBe(true);
    expect(ctl.calls).toHaveLength(1);
    expect(ctl.calls[0]).toMatchObject({ fn: 'createJob', ctx: { orgId: 'org1' } });
    expect(ctl.revalidated.sort()).toEqual(['/hire/assistant', '/hire/careers-page', '/hire/dashboard', '/hire/jobs']);
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
