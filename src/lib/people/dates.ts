/**
 * Dates for Lekiu, as plain `YYYY-MM-DD` strings. The HR tables store dates,
 * not moments, and "today" for a Malaysian business is today in Malaysia, so
 * every comparison starts from {@link todayInMalaysia} and stays in strings.
 */

const TZ = 'Asia/Kuala_Lumpur';
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Today's date in Kuala Lumpur. */
export function todayInMalaysia(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function addDays(date: string, days: number): string {
  return iso(ms(date) + days * DAY);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((ms(to) - ms(from)) / DAY);
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The first of the month `months` away from the month `date` is in. */
export function addMonths(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  return iso(Date.UTC(year, month + months, 1));
}

/** The Monday of the week `date` is in. */
export function weekStart(date: string): string {
  const day = new Date(ms(date)).getUTCDay(); // 0 is Sunday
  return addDays(date, -((day + 6) % 7));
}

export function isWeekday(date: string): boolean {
  const day = new Date(ms(date)).getUTCDay();
  return day !== 0 && day !== 6;
}

/** `09 Oct`. Built by hand so it reads the same whatever locale data the server has. */
export function formatDay(date: string): string {
  return `${date.slice(8, 10)} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

export function monthLabel(date: string): string {
  return MONTHS[Number(date.slice(5, 7)) - 1];
}
