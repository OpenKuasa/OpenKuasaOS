import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* Neutral calendar — renders in both the CRM and People modules, so events
 * stay module-agnostic (meetings, reviews, planning), never leads/deals or
 * leave/payroll. */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEADING_EMPTY = 4; // Oct 1, 2026 is a Thursday
const DAYS_IN_MONTH = 31;
const TODAY = 9; // Friday, 09 October 2026

const EVENTS: Record<number, { label: string; className: string }> = {
  7: { label: 'Team sync', className: 'bg-primary/10 text-primary' },
  9: { label: 'Townhall · 3pm', className: 'bg-slate-500/10 text-slate-600' },
  14: { label: 'Project review', className: 'bg-blue-500/10 text-blue-600' },
  16: { label: '1:1 check-ins', className: 'bg-primary/10 text-primary' },
  21: { label: 'Planning session', className: 'bg-amber-500/10 text-amber-600' },
  28: { label: 'Month-end review', className: 'bg-blue-500/10 text-blue-600' },
};

type AgendaItem = { title: string; when: string; dot: string };
const AGENDA: AgendaItem[] = [
  { title: 'Townhall', when: 'Today · 3:00pm', dot: 'bg-slate-500' },
  { title: 'Project review', when: 'Wed 14 Oct · 10:00am', dot: 'bg-blue-500' },
  { title: '1:1 check-ins', when: 'Fri 16 Oct · 2:00pm', dot: 'bg-primary' },
  { title: 'Planning session', when: 'Wed 21 Oct · 11:00am', dot: 'bg-amber-500' },
  { title: 'Month-end review', when: 'Wed 28 Oct · 4:00pm', dot: 'bg-blue-500' },
];

export default function CalendarScreen() {
  return (
    <ScreenContainer>
      <PageHeader
        title="Calendar"
        subtitle="Meetings, events and reminders."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Event
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI strip */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat label="Today" value="1" delta="event" onPrimary />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="This week" value="9" delta="+3" deltaTone="up" />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="This month" value="24" delta="+5" deltaTone="up" />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Upcoming" value="5" delta="next 14d" deltaTone="flat" />
        </BentoCard>

        {/* Month grid */}
        <BentoCard
          title="October 2026"
          icon={CalendarDays}
          action={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next month">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          }
          className="col-span-2 md:col-span-8"
        >
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-7">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="pb-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: LEADING_EMPTY }, (_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
                  const day = i + 1;
                  const event = EVENTS[day];
                  return (
                    <div
                      key={day}
                      className={cn(
                        'min-h-20 min-w-0 rounded-md border p-1.5',
                        day === TODAY && 'bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <div className="mb-1 text-xs text-muted-foreground">{day}</div>
                      {event ? (
                        <div
                          className={cn(
                            'truncate rounded px-1.5 py-0.5 text-[10px] font-medium',
                            event.className,
                          )}
                        >
                          {event.label}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </BentoCard>

        {/* Agenda */}
        <BentoCard
          title="Upcoming"
          subtitle="Next events"
          icon={CalendarClock}
          className="col-span-2 md:col-span-4"
        >
          <ul className="space-y-2">
            {AGENDA.map((a) => (
              <li
                key={a.title}
                className="flex items-center gap-3 rounded-lg border bg-background/50 px-3 py-2"
              >
                <span className={cn('size-2.5 shrink-0 rounded-full', a.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {a.when}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
