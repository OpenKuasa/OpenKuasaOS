import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type ReachTools, createReachTools } from '@/lib/ai/tools';
import { createSeedReachData } from '@/lib/reach/seed';
import {
  createCampaignInput,
  createCreativeInput,
  createFormInput,
  deleteCampaignInput,
  deleteCreativeInput,
  deleteFormInput,
  setCampaignStatusInput,
  setFormStatusInput,
  updateAdSettingsInput,
  updateCampaignInput,
  updateCreativeInput,
  updateFormInput,
} from '@/lib/reach/capabilities';
import { WRITE_TOOL_NAMES } from '@/lib/ai/agents/orchestrator';

const ctx = { client: {} as never, orgId: 'org1' };
// The factory returns read tools or read+write tools; with canWrite it is the latter.
const tools = createReachTools(createSeedReachData(), () => new Date(), {
  ctx,
  canWrite: true,
}) as Extract<ReachTools, { createCampaign: unknown }>;

describe('AI write tools reuse the capability schemas (parity)', () => {
  it('each write tool inputSchema IS the capability schema', () => {
    expect(tools.createCampaign.inputSchema).toBe(createCampaignInput);
    expect(tools.updateCampaign.inputSchema).toBe(updateCampaignInput);
    expect(tools.setCampaignStatus.inputSchema).toBe(setCampaignStatusInput);
    expect(tools.deleteCampaign.inputSchema).toBe(deleteCampaignInput);
    expect(tools.createCreative.inputSchema).toBe(createCreativeInput);
    expect(tools.updateCreative.inputSchema).toBe(updateCreativeInput);
    expect(tools.deleteCreative.inputSchema).toBe(deleteCreativeInput);
    expect(tools.updateAdSettings.inputSchema).toBe(updateAdSettingsInput);
    expect(tools.createForm.inputSchema).toBe(createFormInput);
    expect(tools.updateForm.inputSchema).toBe(updateFormInput);
    expect(tools.setFormStatus.inputSchema).toBe(setFormStatusInput);
    expect(tools.deleteForm.inputSchema).toBe(deleteFormInput);
  });

  it('every write tool is approval-gated', () => {
    const readonly = createReachTools(createSeedReachData());
    const writeTools = Object.keys(tools).filter((k) => !(k in readonly));
    for (const name of writeTools) expect(WRITE_TOOL_NAMES).toContain(name);
    expect([...writeTools].sort()).toEqual([...WRITE_TOOL_NAMES].sort());
  });

  it('the form schemas can be described to the model as JSON Schema', () => {
    for (const schema of [createFormInput, updateFormInput, setFormStatusInput, deleteFormInput]) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
    }
    const create = z.toJSONSchema(createFormInput, { io: 'input' }) as { required?: string[]; properties: Record<string, unknown> };
    // Only the name is needed; the link is derived when it is left out.
    expect(create.required).toEqual(['name']);
    expect(Object.keys(create.properties).sort()).toEqual(['category', 'channel', 'name', 'slug', 'status']);
  });

  it('omits write tools when the caller cannot write', () => {
    const readonly = createReachTools(createSeedReachData());
    expect('createCampaign' in readonly).toBe(false);
    const denied = createReachTools(createSeedReachData(), () => new Date(), { ctx, canWrite: false });
    expect('deleteCampaign' in denied).toBe(false);
    expect('createForm' in readonly).toBe(false);
    expect('deleteForm' in denied).toBe(false);
  });
});
