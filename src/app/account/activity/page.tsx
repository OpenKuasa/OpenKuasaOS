import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { EmptyState } from '@/components/screen/empty-state';
import { ActivityFilters } from '@/components/account/activity-filters';
import { ActivityTable } from '@/components/account/activity-table';
import {
  activityHref,
  getActivity,
  parseActivityFilters,
} from '@/lib/account/activity';
import { getViewer } from '@/lib/auth/viewer';

const PAGER_LINK = 'text-sm font-medium text-primary hover:underline';

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseActivityFilters(await searchParams);
  const [viewer, activity] = await Promise.all([
    getViewer(),
    getActivity(filters.category, filters.period, filters.before),
  ]);
  const latestHref = activityHref({ ...filters, before: undefined });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">
          A record of actions across {viewer.orgName}.
        </p>
      </div>

      <ActivityFilters filters={filters} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {activity.entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={
              filters.before
                ? 'No older activity'
                : 'No activity in this period'
            }
            description={
              filters.before
                ? 'You have reached the start of the log for these filters.'
                : 'Sign-ins, team changes and data edits will show up here. Try a wider period or another category.'
            }
          />
        ) : (
          <ActivityTable entries={activity.entries} />
        )}
      </div>

      {filters.before || activity.nextBefore ? (
        <div className="mt-4 flex items-center justify-between gap-4">
          {filters.before ? (
            <Link href={latestHref} className={PAGER_LINK}>
              Back to latest
            </Link>
          ) : (
            <span />
          )}
          {activity.nextBefore ? (
            <Link
              href={activityHref({ ...filters, before: activity.nextBefore })}
              className={PAGER_LINK}
            >
              Load older
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
