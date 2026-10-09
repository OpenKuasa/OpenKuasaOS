'use client';

import Link from 'next/link';
import { Bell, CircleHelp, PanelLeftOpen, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/app/user-menu';
import { NavSearch } from '@/components/app/nav-search';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { GitHubIcon } from '@/components/brand/github-icon';
import { REPO_URL } from '@/config/marketing';
import { useIconHover } from '@animateicons/react';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const HELP_LINKS = [
  { label: 'Tutorials & Docs', href: '/account/docs' },
  { label: 'Contact Support', href: '/account/support' },
  { label: 'Product Changelog', href: '/account/changelog' },
  { label: 'Feature Request', href: '/account/feedback' },
];

export function AppTopbar({
  onExpand,
  onOpenNav,
}: {
  onExpand?: () => void;
  onOpenNav?: () => void;
}) {
  const { ref: helpRef, triggerProps: helpTrigger } = useIconHover();
  const { ref: bellRef, triggerProps: bellTrigger } = useIconHover();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      {onOpenNav ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          onClick={onOpenNav}
          className="md:hidden"
        >
          <Menu className="size-5" />
        </Button>
      ) : null}
      {onExpand ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Expand navigation"
          onClick={onExpand}
          className="hidden md:inline-flex"
        >
          <PanelLeftOpen className="size-5" />
        </Button>
      ) : null}

      <NavSearch />

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Help" {...helpTrigger}>
              <AnimatedIcon ref={helpRef} name={(CircleHelp as unknown as { displayName?: string }).displayName} size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel>Help & resources</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {HELP_LINKS.map((l) => (
              <DropdownMenuItem key={l.href} asChild>
                <Link href={l.href}>{l.label}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <GitHubIcon />
                View on GitHub
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              {...bellTrigger}
            >
              <AnimatedIcon ref={bellRef} name={(Bell as unknown as { displayName?: string }).displayName} size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0">
            <div className="px-3 py-2.5 font-semibold">Notifications</div>
            <DropdownMenuSeparator className="my-0" />
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
            <DropdownMenuSeparator className="my-0" />
            <Link
              href="/account/notifications"
              className="block px-3 py-2.5 text-center text-sm font-medium text-primary hover:underline"
            >
              Notification settings
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>

        <UserMenu />
      </div>
    </header>
  );
}
