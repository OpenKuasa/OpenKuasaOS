/**
 * Which screen a question was asked from. The browser sends only its path;
 * the names come from the navigation config, so nothing the client typed
 * reaches the assistant's instructions.
 */

import { findItem, getProduct } from '@/config/nav';

export type Screen = {
  /** Route segment of the product, e.g. `crm`. */
  key: string;
  /** The product's name as the user sees it, e.g. `Kasturi`. */
  product: string;
  /** The item open inside the product, e.g. `Contacts`, when it is a known one. */
  item: string | null;
};

const PATH = /^\/[a-z0-9/-]*$/;
const PATH_MAX = 200;

/** The screen a path points at, or null for anything that is not a product screen. */
export function screenFromPath(pathname: unknown): Screen | null {
  if (typeof pathname !== 'string') return null;
  if (pathname.length > PATH_MAX || !PATH.test(pathname)) return null;

  const [key, slug] = pathname.split('/').filter(Boolean);
  const product = getProduct(key);
  // The assistant's own page is not somewhere to ask "about".
  if (!product || product.sections.length === 0) return null;

  return {
    key: product.key,
    product: product.name,
    item: findItem(product, slug)?.label ?? null,
  };
}

/** `Kasturi › Contacts`, or just the product on a screen with no name. */
export function screenLabel(screen: Screen): string {
  return screen.item ? `${screen.product} › ${screen.item}` : screen.product;
}
