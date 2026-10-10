import { describe, expect, it } from 'vitest';
import { deriveReportsModel } from '@/lib/reach/reports';
import type { Appointment, Lead } from '@/lib/reach/types';

const now = new Date('2026-10-10T00:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY).toISOString();

const lead = (over: Partial<Lead>): Lead => ({
  id: 'l',
  name: 'Test Lead',
  channel: 'whatsapp',
  stage: 'lead',
  source: 'test',
  created_at: daysAgo(1),
  promoted_contact_id: null,
  ...over,
});

const appt = (status: Appointment['status'], created_at = daysAgo(1)): Appointment => ({
  id: 'a',
  contact_name: 'Test Person',
  kind: 'Consult',
  scheduled_at: daysAgo(0),
  via: 'phone',
  status,
  created_at,
});

describe('deriveReportsModel', () => {
  it('includes a lead exactly on the cutoff and excludes older ones', () => {
    const m = deriveReportsModel(
      [lead({ created_at: daysAgo(7) }), lead({ created_at: daysAgo(7.01) })],
      [],
      [],
      '7d',
      now,
    );
    expect(m.totalLeads).toBe(1);
  });

  it('groups leads by channel', () => {
    const m = deriveReportsModel(
      [lead({}), lead({}), lead({ channel: 'tiktok' })],
      [],
      [],
      '30d',
      now,
    );
    expect(m.leadsByChannel).toEqual([
      { channel: 'whatsapp', leads: 2 },
      { channel: 'tiktok', leads: 1 },
    ]);
  });

  it('computes conv_pct counting qualified, booked and won', () => {
    const m = deriveReportsModel(
      [
        lead({ stage: 'qualified' }),
        lead({ stage: 'booked' }),
        lead({ stage: 'won' }),
        lead({ stage: 'lead' }),
        lead({ stage: 'lead' }),
        lead({ stage: 'lead' }),
        lead({ stage: 'lead' }),
      ],
      [],
      [],
      '30d',
      now,
    );
    expect(m.topChannels).toEqual([
      { channel: 'whatsapp', leads: 7, qualified: 3, conv_pct: 43 },
    ]);
  });

  it('computes show rate and returns null without completed or no-show', () => {
    const m = deriveReportsModel(
      [],
      [],
      [appt('completed'), appt('completed'), appt('no_show'), appt('scheduled')],
      '30d',
      now,
    );
    expect(m.appointmentStats.show_rate_pct).toBe(67);
    expect(m.appointmentStats.scheduled).toBe(1);
    const n = deriveReportsModel([], [], [appt('scheduled'), appt('cancelled')], '30d', now);
    expect(n.appointmentStats.show_rate_pct).toBeNull();
  });

  it('returns zeros for empty input without NaN', () => {
    const m = deriveReportsModel([], [], [], '90d', now);
    expect(m.totalLeads).toBe(0);
    expect(m.leadsByChannel).toEqual([]);
    expect(m.topChannels).toEqual([]);
    expect(m.appointmentStats).toEqual({
      scheduled: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
      show_rate_pct: null,
    });
    expect(JSON.stringify(m)).not.toContain('NaN');
    expect(m.leadsTrend.every((w) => w.leads === 0 && w.qualified === 0)).toBe(true);
  });

  it('buckets leadsTrend weekly, each lead in exactly one week, summing to totalLeads', () => {
    // 30d range: cutoff = now - 30d; weeks start at 30, 23, 16, 9, 2 days ago.
    const m = deriveReportsModel(
      [
        lead({ created_at: daysAgo(28), stage: 'qualified' }), // week 1
        lead({ created_at: daysAgo(21), stage: 'lead' }), // week 2
        lead({ created_at: daysAgo(23), stage: 'won' }), // exactly on week 1/2 boundary -> week 2
        lead({ created_at: daysAgo(1), stage: 'booked' }), // week 5
        lead({ created_at: daysAgo(1), stage: 'contacted' }), // week 5
        lead({ created_at: now.toISOString(), stage: 'lead' }), // exactly now -> last week
      ],
      [],
      [],
      '30d',
      now,
    );
    expect(m.leadsTrend).toHaveLength(5);
    expect(m.leadsTrend.map((w) => w.leads)).toEqual([1, 2, 0, 0, 3]);
    expect(m.leadsTrend.map((w) => w.qualified)).toEqual([1, 1, 0, 0, 1]);
    expect(m.leadsTrend.reduce((sum, w) => sum + w.leads, 0)).toBe(m.totalLeads);
  });
});
