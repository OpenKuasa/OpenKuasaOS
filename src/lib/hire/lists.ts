// src/lib/hire/lists.ts
/**
 * What each Lekir list screen shows, worked out from the four tables. Tables
 * show the newest ROWS_SHOWN rows; every count is over all rows.
 */

import {
  STAGE_LABEL,
  applicationLabel,
  boardCounts,
  funnelCounts,
  groupByStage,
  type ApplicationLabel,
} from './applications-view';
import { ago } from './dashboard';
import { applicantsByJob, applicationsPerWeek } from './overview';
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  type EmploymentType,
  type HireData,
  type InterviewKind,
  type InterviewStatus,
  type JobStatus,
  type PoolStatus,
} from './types';

export const ROWS_SHOWN = 50;
const TZ = 'Asia/Kuala_Lumpur';
const DAY = 86_400_000;

const JOB_STATUS_LABEL = { open: 'Open', paused: 'Paused', closed: 'Closed', draft: 'Draft' } as const;
const JOB_STATUS_ORDER: JobStatus[] = ['open', 'paused', 'closed', 'draft'];
const TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship',
};
const KIND_LABEL: Record<InterviewKind, 'Video' | 'Onsite' | 'Phone'> = {
  video: 'Video', onsite: 'Onsite', phone: 'Phone',
};
const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, 'Scheduled' | 'Completed' | 'Cancelled' | 'No-show'> = {
  scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
};
const POOL_LABEL: Record<Exclude<PoolStatus, 'none'>, 'Available' | 'Passive' | 'Re-engaged'> = {
  available: 'Available', passive: 'Passive', re_engaged: 'Re-engaged',
};

// A fixed list: a locale's own short month names vary ("Sep" or "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The date in Kuala Lumpur, as its parts. */
function klDate(iso: string): { day: string; month: string; year: string } {
  const [year, month, day] = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }).split('-');
  return { day, month: MONTHS[Number(month) - 1], year };
}
/** "08 Oct 2026", in Kuala Lumpur. */
const fullDate = (iso: string) => {
  const d = klDate(iso);
  return `${d.day} ${d.month} ${d.year}`;
};
/** "08 Oct". */
const shortDate = (iso: string) => {
  const d = klDate(iso);
  return `${d.day} ${d.month}`;
};
/** "14:00". */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

export type JobsModel = {
  isEmpty: boolean;
  rows: { id: string; title: string; dept: string; applicants: number; status: 'Open' | 'Paused' | 'Closed' | 'Draft'; posted: string }[];
  statusMix: { key: JobStatus; label: string; value: number }[];
  byJob: { label: string; applicants: number }[];
  totalApplicants: number;
  openJobs: number;
};

export async function buildJobsModel(data: HireData, now: Date): Promise<JobsModel> {
  const [jobs, apps] = await Promise.all([data.listJobs(), data.listApplications()]);
  const counted = applicantsByJob(jobs, apps);
  return {
    isEmpty: jobs.length === 0,
    rows: counted.map(({ job, applicants }) => ({
      id: job.id,
      title: job.title,
      dept: job.department ?? '—',
      applicants,
      status: JOB_STATUS_LABEL[job.status],
      posted: job.opened_at ? `${ago(job.opened_at, now)} ago` : '—',
    })),
    statusMix: JOB_STATUS_ORDER.map((key) => ({
      key,
      label: JOB_STATUS_LABEL[key],
      value: jobs.filter((j) => j.status === key).length,
    })),
    byJob: counted
      .filter((row) => row.job.status === 'open')
      .slice(0, 6)
      .map((row) => ({ label: row.job.title, applicants: row.applicants })),
    totalApplicants: apps.length,
    openJobs: jobs.filter((j) => j.status === 'open').length,
  };
}

export type CareersModel = {
  isEmpty: boolean;
  rows: { title: string; location: string; type: string; applicants: number; status: 'Published' | 'Closed' | 'Draft' }[];
  openRoles: number;
};

export async function buildCareersModel(data: HireData): Promise<CareersModel> {
  const [jobs, apps] = await Promise.all([data.listJobs(), data.listApplications()]);
  const rows = applicantsByJob(jobs, apps).map(({ job, applicants }) => ({
    title: job.title,
    location: job.location ?? '—',
    type: TYPE_LABEL[job.employment_type],
    applicants,
    status: job.status === 'open' ? ('Published' as const) : job.status === 'closed' ? ('Closed' as const) : ('Draft' as const),
  }));
  return { isEmpty: jobs.length === 0, rows, openRoles: rows.filter((r) => r.status === 'Published').length };
}

export type BoardModel = {
  isEmpty: boolean;
  stages: {
    key: ApplicationStage;
    name: string;
    /** Live applications in this stage, over all applications (the list below is cut at ROWS_SHOWN). */
    count: number;
    candidates: { id: string; name: string; role: string; source: string; rating: number; lastTouch: string; active: boolean }[];
  }[];
  total: number;
  hired: number;
  inPipeline: number;
  interviewing: number;
  offers: number;
  trend: { label: string; applied: number; shortlisted: number }[];
  funnel: { key: ApplicationStage; label: string; value: number }[];
};

export async function buildBoardModel(data: HireData, now: Date): Promise<BoardModel> {
  const apps = await data.listApplications();
  const groups = groupByStage(apps);
  const board = boardCounts(apps);
  const funnel = funnelCounts(apps);
  const total = Object.values(board).reduce((a, b) => a + b, 0);
  return {
    isEmpty: apps.length === 0,
    stages: APPLICATION_STAGES.map((key) => ({
      key,
      name: STAGE_LABEL[key],
      count: board[key],
      candidates: groups[key].slice(0, ROWS_SHOWN).map((a) => ({
        id: a.id,
        name: a.candidate_name,
        role: a.job_title,
        source: a.source ?? 'Unknown',
        rating: a.rating ?? 0,
        lastTouch: `${ago(a.hired_at ?? a.offered_at ?? a.applied_at, now)} ago`,
        active: now.getTime() - Date.parse(a.applied_at) < 7 * DAY,
      })),
    })),
    total,
    hired: board.hired,
    inPipeline: total - board.hired,
    interviewing: board.interview,
    offers: board.offer,
    trend: applicationsPerWeek(apps, now),
    funnel: APPLICATION_STAGES.map((key) => ({ key, label: STAGE_LABEL[key], value: funnel[key] })),
  };
}

const LABELS: ApplicationLabel[] = ['New', 'In review', 'Shortlisted', 'Rejected'];

export type ApplicationsModel = {
  isEmpty: boolean;
  total: number;
  rows: { id: string; name: string; job: string; source: string; status: ApplicationLabel; applied: string }[];
  statusMix: { key: ApplicationLabel; value: number }[];
  byJob: { label: string; applications: number }[];
};

export async function buildApplicationsModel(data: HireData): Promise<ApplicationsModel> {
  const [jobs, apps] = await Promise.all([data.listJobs(), data.listApplications()]);
  const labelled = apps.map((a) => ({ a, status: applicationLabel(a.stage, a.outcome) }));
  return {
    isEmpty: apps.length === 0,
    total: apps.length,
    rows: labelled.slice(0, ROWS_SHOWN).map(({ a, status }) => ({
      id: a.id,
      name: a.candidate_name,
      job: a.job_title,
      source: a.source ?? 'Unknown',
      status,
      applied: fullDate(a.applied_at),
    })),
    statusMix: LABELS.map((key) => ({ key, value: labelled.filter((row) => row.status === key).length })),
    byJob: applicantsByJob(jobs, apps)
      .filter((row) => row.applicants > 0)
      .slice(0, 6)
      .map((row) => ({ label: row.job.title, applications: row.applicants })),
  };
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export type InterviewsModel = {
  isEmpty: boolean;
  rows: {
    id: string; name: string; role: string; date: string; time: string; interviewer: string;
    type: 'Video' | 'Onsite' | 'Phone'; status: 'Scheduled' | 'Completed' | 'Cancelled' | 'No-show';
  }[];
  scheduled: number;
  completed: number;
  noShow: number;
  /** Scheduled interviews in the next 7 days: the same number the Overview and the chat give. */
  next7Days: number;
  /** Those interviews by weekday, Monday to Friday only (for the chart; weekend ones are not in it). */
  weekLoad: { label: string; count: number }[];
};

export async function buildInterviewsModel(data: HireData, now: Date): Promise<InterviewsModel> {
  const interviews = await data.listInterviews();
  const count = (status: InterviewStatus) => interviews.filter((i) => i.status === status).length;
  const ahead = interviews.filter((i) => {
    const at = Date.parse(i.scheduled_at);
    return i.status === 'scheduled' && at >= now.getTime() && at < now.getTime() + 7 * DAY;
  });
  const weekday = (iso: string) => new Date(iso).toLocaleDateString('en-MY', { weekday: 'short', timeZone: TZ });
  // Scheduled first (soonest first), then the past ones, latest first.
  const ordered = [
    ...interviews.filter((i) => i.status === 'scheduled'),
    ...interviews.filter((i) => i.status !== 'scheduled').reverse(),
  ];
  return {
    isEmpty: interviews.length === 0,
    rows: ordered.slice(0, ROWS_SHOWN).map((i) => ({
      id: i.id,
      name: i.candidate_name,
      role: i.job_title,
      date: shortDate(i.scheduled_at),
      time: clock(i.scheduled_at),
      interviewer: i.interviewer_name ?? '—',
      type: KIND_LABEL[i.kind],
      status: INTERVIEW_STATUS_LABEL[i.status],
    })),
    scheduled: count('scheduled'),
    completed: count('completed'),
    noShow: count('no_show'),
    next7Days: ahead.length,
    weekLoad: WEEKDAYS.map((label) => ({ label, count: ahead.filter((i) => weekday(i.scheduled_at) === label).length })),
  };
}

export type PoolModel = {
  isEmpty: boolean;
  size: number;
  rows: {
    id: string; name: string; title: string; skills: string[]; location: string; source: string;
    rating: number | null; status: 'Available' | 'Shortlisted' | 'Passive' | 'Re-engaged';
  }[];
  /** The whole pool by status: always the four keys, in this order. */
  statusCounts: { key: 'Available' | 'Shortlisted' | 'Passive' | 'Re-engaged'; value: number }[];
  /** The whole pool by headline, largest first. */
  byTitle: { label: string; value: number }[];
  /** The whole pool by source, largest first. */
  bySource: { label: string; value: number }[];
};

/** Groups `items` by `pick`, largest group first (ties keep first-seen order). */
function tally<T>(items: T[], pick: (item: T) => string): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(pick(item), (counts.get(pick(item)) ?? 0) + 1);
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export async function buildPoolModel(data: HireData): Promise<PoolModel> {
  const [candidates, apps] = await Promise.all([data.listCandidates(), data.listApplications()]);
  const pool = candidates.filter((c) => c.pool_status !== 'none');
  // "Shortlisted": has a live application at interview or beyond. Best rating across their applications.
  const shortlisted = new Set<string>();
  const rating = new Map<string, number>();
  for (const a of apps) {
    if (a.outcome === 'active' && ['interview', 'offer', 'hired'].includes(a.stage)) shortlisted.add(a.candidate_id);
    if (a.rating !== null) rating.set(a.candidate_id, Math.max(rating.get(a.candidate_id) ?? 0, a.rating));
  }
  const statusOf = (c: (typeof pool)[number]) =>
    shortlisted.has(c.id) ? ('Shortlisted' as const) : POOL_LABEL[c.pool_status as Exclude<PoolStatus, 'none'>];
  const STATUS_KEYS = ['Available', 'Shortlisted', 'Passive', 'Re-engaged'] as const;
  return {
    isEmpty: pool.length === 0,
    size: pool.length,
    rows: pool.slice(0, ROWS_SHOWN).map((c) => ({
      id: c.id,
      name: c.name,
      title: c.headline ?? '—',
      skills: c.skills,
      location: c.location ?? '—',
      source: c.source ?? 'Unknown',
      rating: rating.get(c.id) ?? null,
      status: statusOf(c),
    })),
    statusCounts: STATUS_KEYS.map((key) => ({ key, value: pool.filter((c) => statusOf(c) === key).length })),
    byTitle: tally(pool, (c) => c.headline ?? '—'),
    bySource: tally(pool, (c) => c.source ?? 'Unknown'),
  };
}
