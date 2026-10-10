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
});
