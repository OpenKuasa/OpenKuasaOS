import { describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => vi.fn());
const careers = vi.hoisted(() => vi.fn());
const form = vi.hoisted(() => vi.fn());
vi.mock('@/lib/hire/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hire/capabilities')>()),
  createJob: created,
  updateCareersPage: careers,
  updateApplicationForm: form,
}));

const { createHireTools } = await import('@/lib/ai/hire-tools');
const { createSeedHireData } = await import('@/lib/hire/seed');

describe('a change tool', () => {
  it('reaches the capability with the route context, and names the saved job', async () => {
    created.mockResolvedValue({ ok: true, data: { id: 'j1', title: 'Barista' } });
    const ctx = { client: { marker: true } as never, orgId: 'org1' };
    const tools = createHireTools(createSeedHireData(new Date()), new Date(), { ctx, canWrite: true });
    const tool = tools.createJob as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> };
    const result = await tool.execute({ title: 'Barista', org_id: 'evil' }, { toolCallId: 't', messages: [] });

    expect(created).toHaveBeenCalledTimes(1);
    // The very same context object the route built, never an id from the model.
    expect(created.mock.calls[0][0]).toBe(ctx);
    expect(result).toMatchObject({ ok: true, data: { name: 'Barista' } });
  });

  it('reaches updateCareersPage with the same context, and an org_id from the model is not the workspace', async () => {
    careers.mockResolvedValue({ ok: true, data: { careers_enabled: true } });
    const ctx = { client: { marker: true } as never, orgId: 'org1' };
    const tools = createHireTools(createSeedHireData(new Date()), new Date(), { ctx, canWrite: true });
    const tool = tools.updateCareersPage as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> };
    await tool.execute({ careers_enabled: true, org_id: 'evil' }, { toolCallId: 't', messages: [] });

    expect(careers).toHaveBeenCalledTimes(1);
    expect(careers.mock.calls[0][0]).toBe(ctx);
    expect(ctx.orgId).toBe('org1');
    expect(careers.mock.calls[0][0].orgId).toBe('org1');
  });
});

describe('the application form change tool', () => {
  it('reaches updateApplicationForm with the same context, and hands the input on for the capability to check', async () => {
    form.mockResolvedValue({ ok: true, data: { require_cv: true } });
    const ctx = { client: { marker: true } as never, orgId: 'org1' };
    const tools = createHireTools(createSeedHireData(new Date()), new Date(), { ctx, canWrite: true });
    const tool = tools.updateApplicationForm as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> };
    const result = await tool.execute({ require_cv: true }, { toolCallId: 't', messages: [] });

    expect(form).toHaveBeenCalledTimes(1);
    expect(form.mock.calls[0][0]).toBe(ctx);
    expect(form.mock.calls[0][1]).toEqual({ require_cv: true });
    expect(result).toEqual({ ok: true, data: { require_cv: true } });
  });
  it('is not offered to someone who may not write', () => {
    const tools = createHireTools(createSeedHireData(new Date()), new Date());
    expect(tools.updateApplicationForm).toBeUndefined();
  });
});
