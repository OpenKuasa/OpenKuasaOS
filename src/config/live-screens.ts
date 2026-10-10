import { findItem, getProduct } from './nav';

/**
 * Screens that read and write the workspace's own data, keyed by
 * `${productKey}/${itemSlug}`. Every other screen still shows sample data and
 * carries the work-in-progress banner.
 *
 * When a screen is connected to the database, add its key here.
 */
export const LIVE_SCREENS: ReadonlySet<string> = new Set([
  // Jebat
  'reach/assistant',
  'reach/ad-studio',
  'reach/creative-bank',
  'reach/leads',
  'reach/lead-forms',
  'reach/ad-settings',

  // Kasturi
  'crm/contacts',
  'crm/deals',
  'crm/lead-forms',
]);

/** Whether the app path is a screen that is not connected to live data yet. */
export function isSampleScreen(pathname: string): boolean {
  const [, key, slug] = pathname.split('/');
  const product = getProduct(key);
  // Tuah has no sections: it is the chat itself, not a sample screen.
  if (!product || !findItem(product, slug)) return false;
  return !LIVE_SCREENS.has(`${key}/${slug}`);
}
