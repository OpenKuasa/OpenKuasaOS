import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PRODUCTS } from '@/config/nav';
import { getTeam } from '@/lib/account/data';
import { can, roleLabel } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';

const SHORTCUTS = [
  { label: 'My profile', href: '/account/profile' },
  { label: 'Security', href: '/account/security' },
  { label: 'Company details', href: '/account/company' },
  { label: 'Team', href: '/account/team' },
];

export default async function AccountHomePage() {
  const [viewer, team] = await Promise.all([getViewer(), getTeam()]);
  const admins = team.filter((m) => can(m.role, 'manage-members')).length;

  const stats = [
    { value: team.length, label: 'Team members' },
    { value: admins, label: 'Owners & admins' },
    { value: PRODUCTS.length, label: 'Products' },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      {/* profile header */}
      <div className="flex flex-col items-center text-center">
        <Avatar className="size-20 border-4 border-background shadow-sm">
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
            {viewer.initials}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{viewer.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[viewer.email, viewer.orgName, roleLabel(viewer.role)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {/* shortcuts */}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SHORTCUTS.map((s) => (
          <Button
            key={s.href}
            asChild
            variant="outline"
            size="sm"
            className="rounded-full"
          >
            <Link href={s.href}>{s.label}</Link>
          </Button>
        ))}
      </div>

      {/* stats */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <p className="text-3xl font-bold tracking-tight">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* your team */}
      <div className="mt-5 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">Your team</h2>
          <Link
            href="/account/team"
            className="text-sm font-medium text-primary hover:underline"
          >
            {team.length === 1 ? '1 member' : `${team.length} members`}
          </Link>
        </div>

        {team.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {viewer.isDemo
              ? 'The demo workspace has no member accounts, only guests like you.'
              : 'Members of this workspace will appear here.'}
          </p>
        ) : (
          <div className="mt-3 divide-y">
            {team.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-muted text-xs font-semibold">
                      {m.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {roleLabel(m.role)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
