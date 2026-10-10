import { notFound } from 'next/navigation';
import { PlaceholderPage } from '@/components/app/placeholder-page';
import { getProduct, findItem } from '@/config/nav';

/**
 * The fallback for app URLs with no screen of their own: a nav item that is
 * not built yet shows a placeholder, anything else is a 404.
 *
 * Built screens are not looked up here. Each has its own route file beside
 * this folder (`../../crm/plugins/page.tsx`), written by `pnpm gen:routes`
 * from `src/screens/registry.ts`, so that a page ships only its own screen.
 * Importing the registry here would send every screen to every page again.
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ product: string; item: string }>;
}) {
  const { product: key, item: slug } = await params;
  const product = getProduct(key);
  if (!product) notFound();

  const item = findItem(product, slug);
  if (!item) notFound();

  return (
    <PlaceholderPage title={item.label} subtitle={product.name} icon={item.icon} />
  );
}
