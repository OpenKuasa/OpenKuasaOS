import { describe, expect, it } from 'vitest';
import { LIVE_SCREENS, isSampleScreen } from '@/config/live-screens';
import { findItem, getProduct } from '@/config/nav';

describe('live screens', () => {
  it('lists only screens that are in the navigation', () => {
    for (const key of LIVE_SCREENS) {
      const [productKey, slug] = key.split('/');
      const product = getProduct(productKey);
      expect(product && findItem(product, slug), key).toBeTruthy();
    }
  });

  it('marks a screen that is not connected as sample', () => {
    expect(isSampleScreen('/people/payroll')).toBe(true);
    expect(isSampleScreen('/crm/broadcast')).toBe(true);
  });

  it('leaves connected screens and Tuah alone', () => {
    expect(isSampleScreen('/crm/deals')).toBe(false);
    expect(isSampleScreen('/reach/ad-studio')).toBe(false);
    expect(isSampleScreen('/command')).toBe(false);
  });

  it('ignores paths that are not a screen', () => {
    expect(isSampleScreen('/reach')).toBe(false);
    expect(isSampleScreen('/nope/nothing')).toBe(false);
  });
});
