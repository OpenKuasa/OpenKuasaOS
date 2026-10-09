'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  UserRound,
  Lock,
  Bell,
  Building2,
  Users,
  Briefcase,
  ScrollText,
  CreditCard,
  KeyRound,
  Puzzle,
  Wallet,
  FileText,
  LayoutGrid,
  Code2,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { useViewer } from '@/components/app/viewer-context';
import { canSee, type Capability } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
  needs?: Capability;
};

const HOME: Item = { label: 'Home', href: '/account', icon: Home };

const SECTIONS: { label: string; needs?: Capability; items: Item[] }[] = [
  {
    label: 'Account',
    items: [
      { label: 'My profile', href: '/account/profile', icon: UserRound },
      { label: 'Security', href: '/account/security', icon: Lock },
      { label: 'Notifications', href: '/account/notifications', icon: Bell },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { label: 'Company details', href: '/account/company', icon: Building2 },
      { label: 'Team', href: '/account/team', icon: Users },
      { label: 'Client accounts', href: '/account/clients', icon: Briefcase },
      { label: 'Activity log', href: '/account/activity', icon: ScrollText },
    ],
  },
  {
    label: 'Billing',
    needs: 'manage-billing',
    items: [
      { label: 'My subscriptions', href: '/account/subscriptions', icon: CreditCard },
      { label: 'Change plan', href: '/account/plan', icon: KeyRound },
      { label: 'Add-ons', href: '/account/add-ons', icon: Puzzle },
      { label: 'Payment methods', href: '/account/payment-methods', icon: Wallet },
      { label: 'Transaction records', href: '/account/transactions', icon: FileText },
    ],
  },
  {
    label: 'Apps',
    items: [
      { label: 'Connected apps', href: '/account/connected-apps', icon: LayoutGrid },
      { label: 'Developers', href: '/account/developers', icon: Code2, needs: 'manage-developers' },
    ],
  },
];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function AccountSidebar() {
  const pathname = usePathname();
  const viewer = useViewer();
  const sections = SECTIONS.filter((s) => canSee(viewer, s.needs))
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => canSee(viewer, i.needs)),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar px-3 py-4">
      <NavLink item={HOME} active={pathname === '/account'} />

      {sections.map((section) => (
        <div key={section.label} className="mt-5">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="mt-auto space-y-0.5 border-t pt-4">
        <Link
          href="/command"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Home className="size-[18px] shrink-0" />
          OpenKuasa OS home
        </Link>
        <SignOutButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <LogOut className="size-[18px] shrink-0" />
          Sign out
        </SignOutButton>
      </div>
    </aside>
  );
}
