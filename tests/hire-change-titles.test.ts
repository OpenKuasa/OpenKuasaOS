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
  it('lists what an edit changes', () => {
    expect(approvalDetail('updateJob', { id: ID, title: 'x', salary_min_cents: 1, salary_max_cents: 2, closes_on: null }))
      .toBe('Changes: title, salary, closing date');
    expect(approvalDetail('updateJob', { id: ID })).toBeNull();
  });
});
