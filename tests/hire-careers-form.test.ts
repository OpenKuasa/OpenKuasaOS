// tests/hire-careers-form.test.ts
import { describe, expect, it } from 'vitest';
import { updateCareersPageInput } from '@/lib/hire/capabilities';
import { brandingErrors } from '@/lib/hire/lists';

/** What the capability says when it refuses `input`. */
function refusal(input: { careers_headline?: string; careers_tagline?: string }): string | undefined {
  const parsed = updateCareersPageInput.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe('careers page branding form', () => {
  it('accepts a headline of 80 characters and refuses 81', () => {
    expect(brandingErrors({ headline: 'a'.repeat(80), tagline: '' })).toEqual({});
    expect(brandingErrors({ headline: 'a'.repeat(81), tagline: '' })).toEqual({
      headline: 'Keep the headline under 80 characters.',
    });
  });

  it('accepts a tagline of 160 characters and refuses 161', () => {
    expect(brandingErrors({ headline: '', tagline: 'a'.repeat(160) })).toEqual({});
    expect(brandingErrors({ headline: '', tagline: 'a'.repeat(161) })).toEqual({
      tagline: 'Keep the tagline under 160 characters.',
    });
  });

  it('reports both fields when both are too long, and neither when both are blank', () => {
    expect(Object.keys(brandingErrors({ headline: 'a'.repeat(81), tagline: 'a'.repeat(161) }))).toEqual(['headline', 'tagline']);
    expect(brandingErrors({ headline: '', tagline: '' })).toEqual({});
  });

  it('measures what will be saved: spaces around the text do not count', () => {
    expect(brandingErrors({ headline: `  ${'a'.repeat(80)}  `, tagline: ` ${'a'.repeat(160)} ` })).toEqual({});
    expect(refusal({ careers_headline: `  ${'a'.repeat(80)}  ` })).toBeUndefined();
  });

  it('uses the same words the capability refuses with', () => {
    const headline = refusal({ careers_headline: 'a'.repeat(81) });
    const tagline = refusal({ careers_tagline: 'a'.repeat(161) });
    expect(headline).toBeDefined();
    expect(tagline).toBeDefined();
    expect(brandingErrors({ headline: 'a'.repeat(81), tagline: '' }).headline).toBe(headline);
    expect(brandingErrors({ headline: '', tagline: 'a'.repeat(161) }).tagline).toBe(tagline);
  });
});
