import { describe, expect, it } from 'vitest';
import { leadsToCsv } from '@/lib/reach/csv';
import type { Lead } from '@/lib/reach/types';

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l1',
  name: 'Test Lead',
  channel: 'whatsapp',
  stage: 'lead',
  source: 'test',
  created_at: '2026-10-01T00:00:00.000Z',
  promoted_contact_id: null,
  ...over,
});

describe('leadsToCsv', () => {
  it('emits the header row', () => {
    expect(leadsToCsv([])).toBe('id,name,channel,stage,source,created_at');
  });

  it('wraps and escapes cells with commas, quotes and newlines', () => {
    const csv = leadsToCsv([lead({ name: 'Ann, "the\nboss"' })]);
    expect(csv.split('\r\n')[1]).toBe(
      'l1,"Ann, ""the\nboss""",whatsapp,lead,test,2026-10-01T00:00:00.000Z',
    );
  });

  it('renders an empty source as an empty field', () => {
    const csv = leadsToCsv([lead({ source: null as unknown as string })]);
    expect(csv.split('\r\n')[1]).toBe('l1,Test Lead,whatsapp,lead,,2026-10-01T00:00:00.000Z');
  });
});
