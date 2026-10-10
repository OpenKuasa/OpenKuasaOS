// tests/hire-job-form.test.ts
import { describe, expect, it } from 'vitest';
import {
  CLOSES_IN_PAST,
  JOB_HAS_APPLICATIONS,
  JOB_LIVE_NEEDS_DESCRIPTION,
  JOB_NEEDS_DESCRIPTION,
  SALARY_RANGE,
} from '@/lib/hire/capabilities';
import {
  EMPTY_JOB_FORM,
  HAS_APPLICATIONS,
  allowedMoves,
  fieldForServerError,
  formErrors,
  fromJob,
  toInput,
} from '@/lib/hire/job-form';
import type { Job } from '@/lib/hire/types';

const TODAY = '2026-10-11';
const job: Job = {
  id: 'j1', title: 'Barista', department: 'Operations', location: 'Shah Alam', employment_type: 'part_time',
  status: 'open', description: 'Make coffee.', salary_min_cents: 220_000, salary_max_cents: 300_000,
  show_salary: true, closes_on: '2026-10-31', work_arrangement: 'onsite', headcount: 2,
  opened_at: null, closed_at: null, created_at: '2026-10-01T00:00:00Z',
};

describe('job form helpers', () => {
  it('turns a job into form text and back without loss', () => {
    const form = fromJob(job);
    expect(form).toMatchObject({ title: 'Barista', salaryMin: '2200', salaryMax: '3000', headcount: '2', closesOn: '2026-10-31' });
    expect(toInput(form)).toEqual({
      title: 'Barista', department: 'Operations', location: 'Shah Alam', employment_type: 'part_time',
      work_arrangement: 'onsite', description: 'Make coffee.', salary_min_cents: 220_000,
      salary_max_cents: 300_000, show_salary: true, closes_on: '2026-10-31', headcount: 2,
    });
  });
  it('sends blanks as null so a field can be cleared', () => {
    expect(toInput({ ...EMPTY_JOB_FORM, title: 'Barista' })).toMatchObject({
      department: null, location: null, description: null, salary_min_cents: null, salary_max_cents: null,
      closes_on: null, work_arrangement: null, headcount: 1,
    });
  });
  it('reads ringgit typed with commas or decimals', () => {
    expect(toInput({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: '3,500', salaryMax: '4500.50' })).toMatchObject({
      salary_min_cents: 350_000, salary_max_cents: 450_050,
    });
  });
  it('finds each field error and says how to fix it', () => {
    expect(formErrors({ ...EMPTY_JOB_FORM }, TODAY)).toEqual({ title: 'Give the job a title.' });
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x'.repeat(121) }, TODAY).title).toBe('Keep the title under 120 characters.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: 'abc' }, TODAY).salaryMin).toBe('Enter an amount in ringgit, for example 3500.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: '4000', salaryMax: '3000' }, TODAY).salaryMax).toBe('Maximum salary can\'t be lower than the minimum.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', headcount: '0' }, TODAY).headcount).toBe('Headcount must be at least 1.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', closesOn: '2026-10-10' }, TODAY).closesOn).toBe('The closing date can\'t be in the past.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', closesOn: TODAY }, TODAY)).toEqual({});
  });
  it('accepts a job\'s own closing date once it has passed, but not a new past date', () => {
    const stale: Job = { ...job, closes_on: '2026-10-01' };
    expect(formErrors(fromJob(stale), TODAY, stale)).toEqual({});
    expect(formErrors({ ...fromJob(stale), closesOn: '2026-10-05' }, TODAY, stale).closesOn).toBe('The closing date can\'t be in the past.');
    // With no stored job (a new one), the same date is refused.
    expect(formErrors(fromJob(stale), TODAY).closesOn).toBe('The closing date can\'t be in the past.');
  });
  it('asks for a description when the job being edited is open or paused', () => {
    const cleared = { ...fromJob(job), description: '  ' };
    expect(formErrors(cleared, TODAY, job).description).toBe(JOB_LIVE_NEEDS_DESCRIPTION);
    expect(formErrors(cleared, TODAY, { ...job, status: 'paused' }).description).toBe(JOB_LIVE_NEEDS_DESCRIPTION);
    expect(formErrors(cleared, TODAY, { ...job, status: 'draft' })).toEqual({});
    expect(formErrors(cleared, TODAY, { ...job, status: 'closed' })).toEqual({});
    expect(formErrors(cleared, TODAY)).toEqual({});
  });
  it('holds headcount to a whole number from 1 to 999', () => {
    const headcount = (text: string) => formErrors({ ...EMPTY_JOB_FORM, title: 'x', headcount: text }, TODAY).headcount;
    const range = 'Headcount must be a whole number from 1 to 999.';
    expect(headcount('')).toBe('Headcount must be at least 1.');
    expect(headcount('0')).toBe('Headcount must be at least 1.');
    for (const text of ['1e2', '0x10', '1.5', '-1', 'two', '1000']) expect(headcount(text), text).toBe(range);
    for (const text of ['1', ' 12 ', '999']) expect(headcount(text), text).toBeUndefined();
  });
  it('never sends a headcount the form would not accept', () => {
    const sent = (text: string) => toInput({ ...EMPTY_JOB_FORM, title: 'x', headcount: text }).headcount;
    expect(sent('12')).toBe(12);
    expect(sent(' 12 ')).toBe(12);
    for (const text of ['1e2', '0x10', '1.5', '']) expect(sent(text), text).toBe(0);
  });
  it('holds each salary to RM 10,000,000 a month', () => {
    const limit = 'Enter a monthly salary up to RM 10,000,000.';
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: '10,000,000.01' }, TODAY).salaryMin).toBe(limit);
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMax: '10000001' }, TODAY).salaryMax).toBe(limit);
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', salaryMin: '10,000,000', salaryMax: '10000000' }, TODAY)).toEqual({});
  });
  it('holds department to 80 characters and location to 120', () => {
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', department: 'd'.repeat(81) }, TODAY).department).toBe('Keep the department under 80 characters.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', location: 'l'.repeat(121) }, TODAY).location).toBe('Keep the location under 120 characters.');
    expect(formErrors({ ...EMPTY_JOB_FORM, title: 'x', department: 'd'.repeat(80), location: 'l'.repeat(120) }, TODAY)).toEqual({});
  });
  it('knows which field a refusal from the server belongs to', () => {
    expect(fieldForServerError('Maximum salary can\'t be lower than the minimum.')).toBe('salaryMax');
    expect(fieldForServerError('The closing date can\'t be in the past.')).toBe('closesOn');
    // The capability's own sentences: if either is reworded, its refusal must still land under its field.
    expect(fieldForServerError(SALARY_RANGE)).toBe('salaryMax');
    expect(fieldForServerError(CLOSES_IN_PAST)).toBe('closesOn');
    expect(fieldForServerError(JOB_LIVE_NEEDS_DESCRIPTION)).toBe('description');
    expect(fieldForServerError(JOB_NEEDS_DESCRIPTION)).toBe('description');
    expect(fieldForServerError('An open or paused job needs a description.')).toBe('description');
    expect(fieldForServerError('Add a description before opening this job.')).toBe('description');
    expect(fieldForServerError('Give the job a title.')).toBe('title');
    expect(fieldForServerError('Keep the title under 120 characters.')).toBe('title');
    expect(fieldForServerError('Headcount must be at least 1.')).toBe('headcount');
    expect(fieldForServerError('That change could not be saved. Please try again.')).toBeNull();
    expect(fieldForServerError('toString')).toBeNull();
  });
  it('gives the same reason as the server for a job that cannot be deleted', () => {
    expect(HAS_APPLICATIONS).toBe(JOB_HAS_APPLICATIONS);
  });
  it('lists the status moves each status allows, with the button wording', () => {
    expect(allowedMoves('draft')).toEqual([{ to: 'open', label: 'Open' }]);
    expect(allowedMoves('open')).toEqual([{ to: 'paused', label: 'Pause' }, { to: 'closed', label: 'Close' }]);
    expect(allowedMoves('paused')).toEqual([{ to: 'open', label: 'Reopen' }, { to: 'closed', label: 'Close' }]);
    expect(allowedMoves('closed')).toEqual([{ to: 'open', label: 'Reopen' }]);
  });
});
