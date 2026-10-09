'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, LogOut, PanelLeftClose } from 'lucide-react';
import { type Product, firstItem } from '@/config/nav';
import { useIconHover } from '@animateicons/react';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { cn } from '@/lib/utils';

/** A nav row whose icon animates when the whole row is hovered. */
function NavItemLink({
  href,
  active,
  name,
  label,
}: {
  href: string;
  active: boolean;
  name?: string;
  label: string;
}) {
  const { ref, triggerProps } = useIconHover();
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      {...triggerProps}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      <AnimatedIcon ref={ref} name={name} size={16} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function SecondaryNav({
  product,
  onCollapse,
}: {
  product: Product;
  onCollapse: () => void;
}) {
  const pathname = usePathname();
  const activeSlug = pathname.split('/')[2] ?? firstItem(product)?.slug;

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r bg-background">
      <div className="px-4 py-4">
        <p className="text-sm font-bold leading-tight text-foreground">
          {product.name}
        </p>
        <p className="text-xs text-muted-foreground">{product.tagline}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {product.sections.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const href = `/${product.key}/${item.slug}`;
                const active = item.slug === activeSlug;
                const Icon = item.icon;
                return (
                  <li key={item.slug}>
                    <NavItemLink
                      href={href}
                      active={active}
                      name={(Icon as unknown as { displayName?: string }).displayName}
                      label={item.label}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between border-t px-3 py-2">
        <div className="flex gap-1">
          <Link
            href="/account"
            aria-label="Account"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="size-4" />
          </Link>
          <SignOutButton
            aria-label="Sign out"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4" />
          </SignOutButton>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse panel"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
    </div>
  );
}
