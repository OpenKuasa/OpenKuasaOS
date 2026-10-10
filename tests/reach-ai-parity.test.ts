import { describe, expect, it } from 'vitest';
import { type ReachTools, createReachTools } from '@/lib/ai/tools';
import { createSeedReachData } from '@/lib/reach/seed';
import {
  createCampaignInput,
  createCreativeInput,
  deleteCampaignInput,
  deleteCreativeInput,
  setCampaignStatusInput,
  updateCampaignInput,
  updateCreativeInput,
} from '@/lib/reach/capabilities';

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
  });

  it('omits write tools when the caller cannot write', () => {
    const readonly = createReachTools(createSeedReachData());
    expect('createCampaign' in readonly).toBe(false);
    const denied = createReachTools(createSeedReachData(), () => new Date(), { ctx, canWrite: false });
    expect('deleteCampaign' in denied).toBe(false);
  });
});
