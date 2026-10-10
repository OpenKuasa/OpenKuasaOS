// src/lib/hire/careers-form.ts
/**
 * The Careers Page branding form's own checks. Nothing is imported here, so
 * the client form can use it without pulling the list builders (and what they
 * import) into the browser. The two messages are the ones `updateCareersPage`
 * refuses with: tests/hire-careers-form.test.ts fails if they drift apart.
 */

export const HEADLINE_MAX = 80;
export const TAGLINE_MAX = 160;
export const HEADLINE_TOO_LONG = 'Keep the headline under 80 characters.';
export const TAGLINE_TOO_LONG = 'Keep the tagline under 160 characters.';

export type BrandingValues = { headline: string; tagline: string };
export type BrandingField = keyof BrandingValues;
export type BrandingErrors = Partial<Record<BrandingField, string>>;

/** Every field that is wrong. Measured as it will be saved: without the spaces around it. */
export function brandingErrors(values: BrandingValues): BrandingErrors {
  const errors: BrandingErrors = {};
  if (values.headline.trim().length > HEADLINE_MAX) errors.headline = HEADLINE_TOO_LONG;
  if (values.tagline.trim().length > TAGLINE_MAX) errors.tagline = TAGLINE_TOO_LONG;
  return errors;
}

/** The field a refusal from the server is about, or null when it is about neither. */
export function brandingFieldForError(message: string): BrandingField | null {
  if (message === HEADLINE_TOO_LONG) return 'headline';
  if (message === TAGLINE_TOO_LONG) return 'tagline';
  return null;
}
