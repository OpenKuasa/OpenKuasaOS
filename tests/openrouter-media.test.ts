import { describe, expect, test } from 'vitest';
import * as media from '@/lib/agents/openrouter-media';

// Shape-only: never calls the network. The real calls are validated at the manual smoke;
// agent/runner unit tests mock this whole module.
describe('openrouter media seam (shape only)', () => {
  test('exports the five media functions', () => {
    expect(typeof media.webSearch).toBe('function');
    expect(typeof media.writeDigest).toBe('function');
    expect(typeof media.generateImage).toBe('function');
    expect(typeof media.startVideo).toBe('function');
    expect(typeof media.checkVideo).toBe('function');
  });

  test('each function takes the apiKey first (declared arity)', () => {
    expect(media.webSearch.length).toBe(2);
    expect(media.writeDigest.length).toBe(2);
    expect(media.generateImage.length).toBe(2);
    expect(media.startVideo.length).toBe(2);
    expect(media.checkVideo.length).toBe(2);
  });
});
