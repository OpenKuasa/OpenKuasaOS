import { describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => vi.fn());
vi.mock('@/lib/hire/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hire/capabilities')>()),
  createJob: created,
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
});
