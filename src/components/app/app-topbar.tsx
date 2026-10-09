'use client';

import Link from 'next/link';
import { Search, Bell, CircleHelp, Coins, PanelLeftOpen, Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/app/user-menu';
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

const NOTIFICATIONS = [
  { title: 'New lead from Meta Ads', time: '2m ago' },
  { title: 'Invoice INV-1041 is overdue', time: '1h ago' },
  { title: 'Aisyah requested annual leave', time: '3h ago' },
  { title: 'Payroll run for October completed', time: '1d ago' },
];

export function AppTopbar({
  onExpand,
  onOpenNav,
}: {
  onExpand?: () => void;
  onOpenNav?: () => void;
}) {
  const { ref: creditsRef, triggerProps: creditsTrigger } = useIconHover();
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

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search contacts, deals, people…"
          className="pl-9"
          aria-label="Search"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/account/subscriptions"
          {...creditsTrigger}
          className="hidden items-center gap-1.5 rounded-full border bg-muted/60 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent sm:flex"
        >
          <AnimatedIcon ref={creditsRef} name={(Coins as unknown as { displayName?: string }).displayName} size={16} className="text-primary" />
          <span>27,240</span>
          <span className="text-muted-foreground">credits</span>
        </Link>

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
              className="relative"
            >
              <AnimatedIcon ref={bellRef} name={(Bell as unknown as { displayName?: string }).displayName} size={20} />
              <span className="absolute right-2 top-2 size-2 animate-ping rounded-full bg-primary/70 motion-reduce:hidden" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="font-semibold">Notifications</span>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            </div>
            <DropdownMenuSeparator className="my-0" />
            <div className="py-1">
              {NOTIFICATIONS.map((n) => (
                <button
                  key={n.title}
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {n.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {n.time}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <DropdownMenuSeparator className="my-0" />
            <Link
              href="#"
              className="block px-3 py-2.5 text-center text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>

        <UserMenu name="Saudara" />
      </div>
    </header>
  );
}
