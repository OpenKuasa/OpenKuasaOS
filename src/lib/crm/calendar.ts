import type { SupabaseClient } from '@supabase/supabase-js';
import { klDay } from '@/lib/crm/deal-stats';
import { listCrmDeals, type CrmDeal } from '@/lib/crm/deals';

/** How many entries the "Upcoming" list shows. */
export const UPCOMING_LISTED = 6;
/** How far ahead of today the counts and the "Upcoming" list look, in days. */
const LOOK_AHEAD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH = /^(2\d{3})-(0[1-9]|1[0-2])$/;

export type CalendarKind = 'appointment' | 'follow-up' | 'deal';

/** One thing on the calendar. */
export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  /** `YYYY-MM-DD` in Kuala Lumpur. */
  day: string;
  /** '3:00 pm' for an appointment; null for entries that only have a date. */
  time: string | null;
  label: string;
};

export type CalendarAppointment = {
  id: string;
  contactName: string;
  kind: string;
  scheduledAt: string;
  status: string;
};

export type CalendarFollowUp = {
  id: string;
  title: string;
  /** `YYYY-MM-DD`, or null when it has no due date. */
  dueDay: string | null;
};

export type CalendarSources = {
  appointments: CalendarAppointment[];
  followUps: CalendarFollowUp[];
  deals: CrmDeal[];
};

/** A month of the workspace's appointments, open follow-ups and expected deal closes. */
export type CalendarModel = {
  /** `YYYY-MM`. */
  month: string;
  /** 'October 2026'. */
  title: string;
  prevMonth: string;
  nextMonth: string;
  /** Empty cells before the 1st, in a week that starts on Sunday. */
  leadingEmpty: number;
  days: { day: number; iso: string; isToday: boolean; items: CalendarItem[] }[];
  stats: {
    today: number;
    /** Today and the six days after it. */
    next7: number;
    /** Entries in the month shown. */
    inMonth: number;
    /** Today and the 29 days after it. */
    next30: number;
  };
  /** The next entries from today, soonest first. `when` reads 'Today · 3:00 pm' or 'Wed 14 Oct'. */
  upcoming: (CalendarItem & { when: string })[];
};

function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function shiftMonth(month: string, by: number) {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}

function lastDayOf(month: string) {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}

/** The time of day in Kuala Lumpur: '3:00 pm'. */
function klTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kuala_Lumpur',
  })
    .format(date)
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** 'Wed 14 Oct'. */
function weekdayAndDay(day: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${day}T00:00:00.000Z`))
    .replace(',', '');
}

/** The `?month=` value as `YYYY-MM`; anything else means this month in Kuala Lumpur. */
export function parseMonth(value: string | string[] | undefined, now: Date): string {
  const text = Array.isArray(value) ? value[0] : value;
  return text && MONTH.test(text) ? text : klDay(now).slice(0, 7);
}

/** The days to read: the month shown, plus today and what the counts look ahead to. */
export function calendarWindow(month: string, now: Date): { from: string; to: string } {
  const today = klDay(now);
  const first = `${month}-01`;
  const last = lastDayOf(month);
  const ahead = addDays(today, LOOK_AHEAD_DAYS - 1);
  // Dates are `YYYY-MM-DD`, which compares as text.
  return { from: first < today ? first : today, to: last > ahead ? last : ahead };
}

function toItems({ appointments, followUps, deals }: CalendarSources): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const appointment of appointments) {
    const at = new Date(appointment.scheduledAt);
    if (appointment.status === 'cancelled' || Number.isNaN(at.getTime())) continue;
    items.push({
      id: appointment.id,
      kind: 'appointment',
      day: klDay(at),
      time: klTime(at),
      label: `${appointment.contactName} · ${appointment.kind}`,
    });
  }
  for (const followUp of followUps) {
    if (!followUp.dueDay) continue;
    items.push({ id: followUp.id, kind: 'follow-up', day: followUp.dueDay, time: null, label: followUp.title });
  }
  for (const deal of deals) {
    if (deal.status !== 'open' || !deal.expectedClose) continue;
    items.push({ id: deal.id, kind: 'deal', day: deal.expectedClose, time: null, label: deal.title });
  }
  return items;
}

/** The calendar for one month, from the workspace's appointments, follow-ups and deals. */
export function buildCalendar(sources: CalendarSources, month: string, now: Date): CalendarModel {
  const today = klDay(now);
  const first = `${month}-01`;
  const last = lastDayOf(month);

  // Timed entries first, in time order; then the rest by name.
  const minutes = new Map(
    sources.appointments.map((a) => [a.id, new Date(a.scheduledAt).getTime()] as const),
  );
  const items = toItems(sources).sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      Number(a.time === null) - Number(b.time === null) ||
      (a.time !== null && b.time !== null ? (minutes.get(a.id) ?? 0) - (minutes.get(b.id) ?? 0) : 0) ||
      a.label.localeCompare(b.label),
  );

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);

  const dayCount = Number(last.slice(8));
  const days = Array.from({ length: dayCount }, (_, i) => {
    const iso = addDays(first, i);
    return { day: i + 1, iso, isToday: iso === today, items: byDay.get(iso) ?? [] };
  });

  const within = (days: number) => {
    const end = addDays(today, days - 1);
    return items.filter((item) => item.day >= today && item.day <= end);
  };
  const ahead = within(LOOK_AHEAD_DAYS);

  return {
    month,
    title: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${first}T00:00:00.000Z`),
    ),
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    leadingEmpty: new Date(`${first}T00:00:00.000Z`).getUTCDay(),
    days,
    stats: {
      today: within(1).length,
      next7: within(7).length,
      inMonth: items.filter((item) => item.day >= first && item.day <= last).length,
      next30: ahead.length,
    },
    upcoming: ahead.slice(0, UPCOMING_LISTED).map((item) => {
      const date = item.day === today ? 'Today' : weekdayAndDay(item.day);
      return { ...item, when: item.time ? `${date} · ${item.time}` : date };
    }),
  };
}

/** Reads a workspace's appointments, open follow-ups and deals for a month and builds its calendar. */
export async function loadCrmCalendar(
  client: SupabaseClient,
  orgId: string,
  month: string,
  now: Date,
): Promise<CalendarModel> {
  const { from, to } = calendarWindow(month, now);
  const after = addDays(to, 1);

  const [appointments, followUps, { deals }] = await Promise.all([
    client
      .from('appointments')
      .select('id,contact_name,kind,scheduled_at,status')
      .eq('org_id', orgId)
      // An appointment's day is the one it falls on in Kuala Lumpur.
      .gte('scheduled_at', `${from}T00:00:00+08:00`)
      .lt('scheduled_at', `${after}T00:00:00+08:00`)
      .order('scheduled_at', { ascending: true })
      .limit(1000),
    client
      .from('crm_activities')
      .select('id,title,due_at')
      .eq('org_id', orgId)
      .eq('type', 'task')
      .is('completed_at', null)
      // A follow-up's due date is stored as midnight UTC of the chosen day.
      .gte('due_at', `${from}T00:00:00.000Z`)
      .lt('due_at', `${after}T00:00:00.000Z`)
      .order('due_at', { ascending: true })
      .limit(1000),
    listCrmDeals(client, orgId, 500),
  ]);
  if (appointments.error) throw appointments.error;
  if (followUps.error) throw followUps.error;

  type AppointmentRow = { id: string; contact_name: string; kind: string; scheduled_at: string; status: string };
  type FollowUpRow = { id: string; title: string; due_at: string | null };

  return buildCalendar(
    {
      appointments: ((appointments.data ?? []) as AppointmentRow[]).map((row) => ({
        id: row.id,
        contactName: row.contact_name,
        kind: row.kind,
        scheduledAt: row.scheduled_at,
        status: row.status,
      })),
      followUps: ((followUps.data ?? []) as FollowUpRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        dueDay: row.due_at ? row.due_at.slice(0, 10) : null,
      })),
      deals,
    },
    month,
    now,
  );
}
