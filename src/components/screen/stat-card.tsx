import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'blue' | 'amber' | 'green' | 'slate';

const TONES: Record<StatTone, string> = {
  primary: 'bg-primary/10 text-primary',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

/** Compact KPI tile: label, value, optional note, and a tinted icon chip. */
export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'primary',
}: {
  label: string;
  value: string | number;
  note?: string;
  icon: LucideIcon;
  tone?: StatTone;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {note ? (
          <p className="truncate text-xs text-muted-foreground">{note}</p>
        ) : null}
      </div>
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          TONES[tone],
        )}
      >
        <Icon className="size-5" />
      </div>
    </div>
  );
}
