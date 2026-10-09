import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_PERIODS,
  activityHref,
  type ActivityFilters as Filters,
} from '@/lib/account/activity';

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Category and period filters as plain links, so the page stays a server
 * component and every view has its own URL. Changing a filter drops the
 * pagination cursor.
 */
export function ActivityFilters({ filters }: { filters: Filters }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Category" className="flex flex-wrap gap-1.5">
        {ACTIVITY_CATEGORIES.map((c) => (
          <FilterLink
            key={c.value}
            href={activityHref({ category: c.value, period: filters.period })}
            active={filters.category === c.value}
          >
            {c.label}
          </FilterLink>
        ))}
      </nav>
      <nav aria-label="Period" className="flex flex-wrap gap-1.5">
        {ACTIVITY_PERIODS.map((p) => (
          <FilterLink
            key={p.value}
            href={activityHref({ category: filters.category, period: p.value })}
            active={filters.period === p.value}
          >
            {p.label}
          </FilterLink>
        ))}
      </nav>
    </div>
  );
}
