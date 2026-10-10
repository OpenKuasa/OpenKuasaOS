import { describe, expect, it } from 'vitest';
import { LIVE_SCREENS, isSampleScreen } from '@/config/live-screens';

describe('Lekiu live screens', () => {
  it('marks the Overview and Employees as live, so they carry no work-in-progress banner', () => {
    for (const slug of ['assistant', 'employees']) {
      expect(LIVE_SCREENS.has(`people/${slug}`), slug).toBe(true);
      expect(isSampleScreen(`/people/${slug}`), slug).toBe(false);
    }
  });

  it('leaves every other Lekiu screen as a sample until its own slice', () => {
    for (const slug of ['dashboard', 'leave', 'payroll', 'approve-leave', 'settings', 'records']) {
      expect(isSampleScreen(`/people/${slug}`), slug).toBe(true);
    }
    // The Calendar under /people is the CRM's shared sample screen.
    expect(isSampleScreen('/people/calendar')).toBe(true);
  });
});
