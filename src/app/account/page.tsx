import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getViewer } from '@/lib/auth/viewer';

const STATS = [
  { value: 4, label: 'Team members' },
  { value: 4, label: 'Active' },
  { value: 0, label: 'Disabled' },
  { value: 6, label: 'Your platforms' },
];

const CHIPS = ['Add member', 'Team', 'My subscriptions', 'Security'];

const TEAM = [
  { name: 'Aisyah Rahim', email: 'aisyah@openkuasa.com', status: 'Active' },
  { name: 'Faiz Hakim', email: 'faiz@openkuasa.com', status: 'Active' },
  { name: 'Ahmad Zaki', email: 'ahmad@openkuasa.com', status: 'Active' },
  { name: 'Nurul Huda', email: 'nurul@openkuasa.com', status: 'Active' },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

export default async function AccountHomePage() {
  const viewer = await getViewer();
  const role = viewer.role[0].toUpperCase() + viewer.role.slice(1);

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
          {[viewer.email, viewer.orgName, role].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* search */}
      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search your team"
          aria-label="Search your team"
          className="h-12 rounded-full bg-muted/50 pl-11"
        />
      </div>

      {/* quick actions */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {CHIPS.map((c) => (
          <Button key={c} variant="outline" size="sm" className="rounded-full">
            {c}
          </Button>
        ))}
      </div>

      {/* stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map((s) => (
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Your team</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {TEAM.length} members
            </span>
            <Button size="sm">
              <Plus className="size-4" />
              Add member
            </Button>
          </div>
        </div>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Accounts you added. They sign in with SSO and only see the platforms
          you assign.
        </p>

        <div className="mt-5 divide-y">
          {TEAM.map((m) => (
            <div
              key={m.email}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-muted text-xs font-semibold">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.email}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                  {m.status}
                </span>
                <Link
                  href="/account/team"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
