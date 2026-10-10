// src/lib/hire/job-form.ts
/**
 * The job form's text values, and the conversions between them and a job.
 * Pure, so the rules are tested without a browser. The capability checks the
 * same rules again on the server.
 */
import type { EmploymentType, Job, JobStatus, WorkArrangement } from './types';

export type JobFormValues = {
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  workArrangement: WorkArrangement | '';
  headcount: string;
  description: string;
  /** Whole ringgit, as typed. */
  salaryMin: string;
  salaryMax: string;
  showSalary: boolean;
  /** YYYY-MM-DD, or '' for none. */
  closesOn: string;
};

export const EMPTY_JOB_FORM: JobFormValues = {
  title: '', department: '', location: '', employmentType: 'full_time', workArrangement: '',
  headcount: '1', description: '', salaryMin: '', salaryMax: '', showSalary: false, closesOn: '',
};

const ringgit = (cents: number | null) => (cents === null ? '' : String(cents / 100));

export function fromJob(job: Job): JobFormValues {
  return {
    title: job.title,
    department: job.department ?? '',
    location: job.location ?? '',
    employmentType: job.employment_type,
    workArrangement: job.work_arrangement ?? '',
    headcount: String(job.headcount),
    description: job.description ?? '',
    salaryMin: ringgit(job.salary_min_cents),
    salaryMax: ringgit(job.salary_max_cents),
    showSalary: job.show_salary,
    closesOn: job.closes_on ?? '',
  };
}

/** Ringgit as typed ("3,500", "4500.50") to sen; null for blank; NaN for anything else. */
function toCents(text: string): number | null {
  const clean = text.replace(/[,\s]/g, '');
  if (clean === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Math.round(Number(clean) * 100) : Number.NaN;
}

const blank = (text: string) => (text.trim() === '' ? null : text.trim());

/** What the create and update capabilities take. */
export function toInput(form: JobFormValues) {
  return {
    title: form.title.trim(),
    department: blank(form.department),
    location: blank(form.location),
    employment_type: form.employmentType,
    work_arrangement: form.workArrangement === '' ? null : form.workArrangement,
    description: blank(form.description),
    salary_min_cents: toCents(form.salaryMin),
    salary_max_cents: toCents(form.salaryMax),
    show_salary: form.showSalary,
    closes_on: form.closesOn === '' ? null : form.closesOn,
    headcount: Number.parseInt(form.headcount, 10) || 0,
  };
}

export type JobFormErrors = Partial<Record<keyof JobFormValues, string>>;

/** The same sentence `updateJob` refuses with; a test keeps the two equal. */
const LIVE_NEEDS_DESCRIPTION = 'An open or paused job needs a description.';

/**
 * Every field that is wrong, with what to do about it. `today` is YYYY-MM-DD
 * in Kuala Lumpur. `stored` is the job being edited (leave it out for a new
 * job): its own closing date is accepted even after it has passed, and an open
 * or paused job cannot lose its description. Both match `updateJob`.
 */
export function formErrors(
  form: JobFormValues,
  today: string,
  stored?: Pick<Job, 'status' | 'closes_on'>,
): JobFormErrors {
  const errors: JobFormErrors = {};
  const title = form.title.trim();
  if (title === '') errors.title = 'Give the job a title.';
  else if (title.length > 120) errors.title = 'Keep the title under 120 characters.';
  const description = form.description.trim();
  if (description.length > 10_000) errors.description = 'Keep the description under 10,000 characters.';
  else if (description === '' && (stored?.status === 'open' || stored?.status === 'paused')) {
    errors.description = LIVE_NEEDS_DESCRIPTION;
  }
  const min = toCents(form.salaryMin);
  const max = toCents(form.salaryMax);
  const amount = 'Enter an amount in ringgit, for example 3500.';
  if (Number.isNaN(min)) errors.salaryMin = amount;
  if (Number.isNaN(max)) errors.salaryMax = amount;
  if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && max < min) {
    errors.salaryMax = 'Maximum salary can\'t be lower than the minimum.';
  }
  const headcount = Number(form.headcount);
  if (!Number.isInteger(headcount) || headcount < 1) errors.headcount = 'Headcount must be at least 1.';
  const dateChanged = form.closesOn !== (stored?.closes_on ?? '');
  if (form.closesOn !== '' && form.closesOn < today && dateChanged) {
    errors.closesOn = 'The closing date can\'t be in the past.';
  }
  return errors;
}

/** The status buttons a job's row offers, in order. */
export function allowedMoves(status: JobStatus): { to: 'open' | 'paused' | 'closed'; label: string }[] {
  switch (status) {
    case 'draft': return [{ to: 'open', label: 'Open' }];
    case 'open': return [{ to: 'paused', label: 'Pause' }, { to: 'closed', label: 'Close' }];
    case 'paused': return [{ to: 'open', label: 'Reopen' }, { to: 'closed', label: 'Close' }];
    case 'closed': return [{ to: 'open', label: 'Reopen' }];
  }
}
