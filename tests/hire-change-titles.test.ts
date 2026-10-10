import { describe, expect, it } from 'vitest';
import { approvalDetail, approvalTitle, collectNames } from '@/lib/chat/change-titles';

const ID = '33333333-3333-4333-8333-333333333333';
const names = collectNames([{ tool: 'listJobs', output: { total: 1, jobs: [{ id: ID, name: 'Sales Executive' }] } }]);
const find = (id: unknown, kind?: string) => names[`${kind}:${id}`] ?? null;

describe('approval titles for jobs', () => {
  it('names a job from an earlier listJobs', () => {
    expect(names[`job:${ID}`]).toBe('Sales Executive');
  });
  it('says what will happen', () => {
    expect(approvalTitle('createJob', { title: 'Barista' }, find as never)).toBe('Create job “Barista” as a draft?');
    expect(approvalTitle('updateJob', { id: ID }, find as never)).toBe('Save changes to job “Sales Executive”?');
    expect(approvalTitle('setJobStatus', { id: ID, status: 'open' }, find as never)).toBe('Open job “Sales Executive”?');
    expect(approvalTitle('setJobStatus', { id: ID, status: 'paused' }, find as never)).toBe('Pause job “Sales Executive”?');
    expect(approvalTitle('setJobStatus', { id: ID, status: 'closed' }, find as never)).toBe('Close job “Sales Executive”?');
    expect(approvalTitle('deleteJob', { id: ID }, find as never)).toBe('Delete job “Sales Executive”?');
    expect(approvalTitle('deleteJob', { id: 'unknown' }, find as never)).toBe('Delete this job?');
  });
  it('warns that a delete cannot be undone', () => {
    expect(approvalDetail('deleteJob')).toBe('This cannot be undone.');
  });
  it('has no changes line without a usable input, and leaves other tools alone', () => {
    expect(approvalDetail('updateJob')).toBeNull();
    expect(approvalDetail('updateJob', undefined)).toBeNull();
    expect(approvalDetail('updateJob', null)).toBeNull();
    expect(approvalDetail('updateJob', 'text')).toBeNull();
    expect(approvalDetail('deleteCampaign')).toBe('This cannot be undone.');
  });
  it('lists what an edit changes, with the salary and the closing date it would save', () => {
    expect(approvalDetail('updateJob', { id: ID, title: 'x', salary_min_cents: 300_000, salary_max_cents: 450_000, closes_on: '2026-10-31' }))
      .toBe('Changes: title, salary (RM 3,000 – RM 4,500 a month), closing date (31 Oct 2026)');
    expect(approvalDetail('updateJob', { id: ID, headcount: 2, show_salary: true })).toBe('Changes: salary visibility, headcount');
    expect(approvalDetail('updateJob', { id: ID })).toBeNull();
  });
  it('says when an edit clears the closing date or the salary', () => {
    expect(approvalDetail('updateJob', { id: ID, closes_on: null })).toBe('Changes: closing date (none)');
    expect(approvalDetail('updateJob', { id: ID, salary_min_cents: null, salary_max_cents: null })).toBe('Changes: salary (not stated)');
    // One bound alone: the other stays as stored, so the card does not claim the whole salary is gone.
    expect(approvalDetail('updateJob', { id: ID, salary_min_cents: null })).toBe('Changes: salary (no minimum)');
    expect(approvalDetail('updateJob', { id: ID, salary_max_cents: 450_050 })).toBe('Changes: salary (up to RM 4,500.50 a month)');
  });
  it('shows the salary and closing date of a new job', () => {
    expect(approvalDetail('createJob', {
      title: 'Barista', department: 'Operations', location: 'Shah Alam',
      salary_min_cents: 300_000, salary_max_cents: 450_000, closes_on: '2026-10-31',
    })).toBe('Operations · Shah Alam · RM 3,000 – RM 4,500 a month · closes 31 Oct 2026');
    expect(approvalDetail('createJob', { title: 'Barista', salary_min_cents: 300_000 })).toBe('from RM 3,000 a month');
    expect(approvalDetail('createJob', { title: 'Barista', salary_max_cents: 1_000_000_000, closes_on: '2026-01-05' }))
      .toBe('up to RM 10,000,000 a month · closes 5 Jan 2026');
  });
  it('has no second line for a new job with nothing extra, or without a usable input', () => {
    expect(approvalDetail('createJob', { title: 'Barista' })).toBeNull();
    expect(approvalDetail('createJob', { title: 'Barista', department: ' ', salary_min_cents: null, closes_on: null })).toBeNull();
    expect(approvalDetail('createJob')).toBeNull();
    expect(approvalDetail('createJob', null)).toBeNull();
    expect(approvalDetail('createJob', 'text')).toBeNull();
  });
});

describe('the careers page change', () => {
  it('is named by what it does', () => {
    expect(approvalTitle('updateCareersPage', { careers_enabled: true })).toBe('Turn on the public careers page?');
    expect(approvalTitle('updateCareersPage', { careers_enabled: false })).toBe('Turn off the public careers page?');
    expect(approvalTitle('updateCareersPage', { careers_headline: 'Join us' })).toBe('Save changes to the careers page?');
  });
  it('says what turning it on exposes, and shows the words being saved', () => {
    expect(approvalDetail('updateCareersPage', { careers_enabled: true }))
      .toBe('Your open jobs become visible to anyone with the link, and can appear in search engines.');
    expect(approvalDetail('updateCareersPage', { careers_enabled: true, careers_headline: 'Join us' }))
      .toBe('Your open jobs become visible to anyone with the link, and can appear in search engines. · Headline: “Join us”');
    expect(approvalDetail('updateCareersPage', { careers_headline: '', careers_tagline: 'Good coffee' }))
      .toBe('Headline: none · Tagline: “Good coffee”');
    expect(approvalDetail('updateCareersPage', { careers_enabled: false })).toBe('The page and every job page stop being public.');
    expect(approvalDetail('updateCareersPage', null)).toBeNull();
    expect(approvalDetail('updateCareersPage', 'text')).toBeNull();
  });
});
