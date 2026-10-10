import { describe, expect, it } from 'vitest';
import { LIVE_SCREENS, isSampleScreen } from '@/config/live-screens';

describe('Lekiu live screens', () => {
  it('marks the Overview as live, so it carries no work-in-progress banner', () => {
    expect(LIVE_SCREENS.has('people/assistant')).toBe(true);
    expect(isSampleScreen('/people/assistant')).toBe(false);
  });

  it('leaves every other Lekiu screen as a sample until its own slice', () => {
    for (const slug of ['employees', 'dashboard', 'leave', 'payroll', 'approve-leave', 'settings']) {
      expect(isSampleScreen(`/people/${slug}`), slug).toBe(true);
    }
    // The Calendar under /people is the CRM's shared sample screen.
    expect(isSampleScreen('/people/calendar')).toBe(true);
  });
});
