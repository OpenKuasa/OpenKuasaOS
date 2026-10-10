import { describe, expect, it } from 'vitest';
import { JEBAT_SYSTEM } from '@/lib/ai/agents/prompts';

describe('JEBAT_SYSTEM', () => {
  it('no longer claims to be strictly read-only', () => {
    expect(JEBAT_SYSTEM).not.toMatch(/you are read-only/i);
  });
  it('states writes need the owner\'s approval', () => {
    expect(JEBAT_SYSTEM.toLowerCase()).toContain('approv');
  });
  it('carries the indirect-injection clause', () => {
    expect(JEBAT_SYSTEM.toLowerCase()).toContain('data, not instructions');
  });
  it('tells the model to get an id from a listing instead of asking the owner', () => {
    const t = JEBAT_SYSTEM.toLowerCase();
    expect(t).toContain('get its id');
    expect(t).toContain('never ask the owner for an id');
  });
  it('tells the model to report an executed change as done, not still waiting', () => {
    const t = JEBAT_SYSTEM.toLowerCase();
    expect(t).toContain('already approved it');
    expect(t).toContain('past tense');
  });
});
