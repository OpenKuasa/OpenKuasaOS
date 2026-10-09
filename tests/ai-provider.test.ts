import { describe, expect, it } from 'vitest';
import { hasProviderKey, pickModelId } from '@/lib/ai/provider';

describe('pickModelId', () => {
  it('uses the per-layer env var when set', () => {
    const env = {
      OPENKUASA_MODEL_ORCHESTRATOR: 'anthropic/claude-opus-4.5',
      OPENKUASA_MODEL_WORKER: 'openai/gpt-4o-mini',
    };
    expect(pickModelId('orchestrator', env)).toBe('anthropic/claude-opus-4.5');
    expect(pickModelId('worker', env)).toBe('openai/gpt-4o-mini');
  });

  it('falls back to a current default when the env var is unset or blank', () => {
    expect(pickModelId('orchestrator', {})).toBe('anthropic/claude-sonnet-4.5');
    expect(pickModelId('worker', { OPENKUASA_MODEL_WORKER: '   ' })).toBe('anthropic/claude-haiku-4.5');
  });
});

describe('hasProviderKey', () => {
  it('is true only when OPENROUTER_API_KEY is a non-blank string', () => {
    expect(hasProviderKey({ OPENROUTER_API_KEY: 'sk-or-123' })).toBe(true);
    expect(hasProviderKey({ OPENROUTER_API_KEY: '' })).toBe(false);
    expect(hasProviderKey({})).toBe(false);
  });
});
