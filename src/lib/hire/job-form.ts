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
  /** Ringgit as typed: commas and sen are allowed ("3,500", "4500.50"). */
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

/** Headcount as typed to a number: digits only, so "1e2" and "0x10" are not numbers. Null for anything else. */
function toHeadcount(text: string): number | null {
  const clean = text.trim();
  return /^\d+$/.test(clean) ? Number(clean) : null;
}

/** The capability's upper limit on a monthly salary: RM 10,000,000, in sen. */
const MAX_SALARY_CENTS = 10_000_000_00;

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
    headcount: toHeadcount(form.headcount) ?? 0,
  };
}

export type JobFormErrors = Partial<Record<keyof JobFormValues, string>>;

// The capability module is server code, so its sentences are repeated here
// rather than imported; tests keep each one equal to the capability's.
const LIVE_NEEDS_DESCRIPTION = 'An open or paused job needs a description.';
/** Why a job with applications cannot be deleted: the sentence `deleteJob` refuses with. */
export const HAS_APPLICATIONS = 'This job has applications. Close it instead.';

const SERVER_ERROR_FIELD: Record<string, keyof JobFormValues> = {
  'Maximum salary can\'t be lower than the minimum.': 'salaryMax',
  'The closing date can\'t be in the past.': 'closesOn',
  [LIVE_NEEDS_DESCRIPTION]: 'description',
  'Add a description before opening this job.': 'description',
  'Give the job a title.': 'title',
  'Keep the title under 120 characters.': 'title',
  'Headcount must be at least 1.': 'headcount',
};

/** The form field a refusal from the server is about, or null when it is about none of them. */
export function fieldForServerError(message: string): keyof JobFormValues | null {
  return Object.hasOwn(SERVER_ERROR_FIELD, message) ? SERVER_ERROR_FIELD[message] : null;
}

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
  if (form.department.trim().length > 80) errors.department = 'Keep the department under 80 characters.';
  if (form.location.trim().length > 120) errors.location = 'Keep the location under 120 characters.';
  const description = form.description.trim();
  if (description.length > 10_000) errors.description = 'Keep the description under 10,000 characters.';
  else if (description === '' && (stored?.status === 'open' || stored?.status === 'paused')) {
    errors.description = LIVE_NEEDS_DESCRIPTION;
  }
  const min = toCents(form.salaryMin);
  const max = toCents(form.salaryMax);
  const amount = 'Enter an amount in ringgit, for example 3500.';
  const tooMuch = 'Enter a monthly salary up to RM 10,000,000.';
  if (Number.isNaN(min)) errors.salaryMin = amount;
  else if (min !== null && min > MAX_SALARY_CENTS) errors.salaryMin = tooMuch;
  if (Number.isNaN(max)) errors.salaryMax = amount;
  else if (max !== null && max > MAX_SALARY_CENTS) errors.salaryMax = tooMuch;
  if (min !== null && max !== null && !errors.salaryMin && !errors.salaryMax && max < min) {
    errors.salaryMax = 'Maximum salary can\'t be lower than the minimum.';
  }
  const headcount = toHeadcount(form.headcount);
  if (form.headcount.trim() === '' || headcount === 0) errors.headcount = 'Headcount must be at least 1.';
  else if (headcount === null || headcount > 999) errors.headcount = 'Headcount must be a whole number from 1 to 999.';
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
