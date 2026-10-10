import { describe, expect, it } from 'vitest';
import { createSeedReachData } from '@/lib/reach/seed';

describe('seed provider — creatives', () => {
  it('returns a non-empty, well-formed creative list', async () => {
    const creatives = await createSeedReachData().listCreatives();
    expect(creatives.length).toBeGreaterThan(0);
    for (const c of creatives) {
      expect(['image', 'video', 'copy']).toContain(c.type);
      expect(['draft', 'active', 'archived']).toContain(c.status);
    }
  });
});

describe('seed provider — ad settings', () => {
  it('returns a settings row with currency and toggle maps', async () => {
    const s = await createSeedReachData().getAdSettings();
    expect(s).not.toBeNull();
    expect(s!.currency).toHaveLength(3);
    expect(typeof s!.automation).toBe('object');
    expect(typeof s!.notifications).toBe('object');
  });
});
