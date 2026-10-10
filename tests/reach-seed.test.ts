import { describe, expect, it } from 'vitest';
import {
  createSeedReachData,
  seedAppointments,
  seedAutomations,
  seedBroadcasts,
  seedCampaigns,
  seedForms,
  seedLeads,
  TOTAL_SEED_LEADS,
} from '@/lib/reach/seed';

const NOW = new Date('2026-10-09T00:00:00.000Z');

describe('Rimba seed data', () => {
  it('has the 5 dashboard campaigns with Lead Magnet as the cheapest CPL', () => {
    const campaigns = seedCampaigns(NOW);
    expect(campaigns).toHaveLength(5);
    const cheapest = [...campaigns].sort((a, b) => a.cpl_cents - b.cpl_cents)[0];
    expect(cheapest.name).toBe('Lead Magnet — eBook');
    expect(cheapest.cpl_cents).toBe(688);
    // spend is consistent with leads × cost-per-lead.
    for (const c of campaigns) {
      expect(c.spend_cents).toBe(c.leads_count * c.cpl_cents);
    }
  });

  it('generates a self-consistent lead set: 342 leads to the headline funnel', () => {
    const leads = seedLeads(NOW);
    expect(leads).toHaveLength(342);
    expect(TOTAL_SEED_LEADS).toBe(342);

    const reached = (stage: string) => {
      const order = ['lead', 'contacted', 'qualified', 'booked', 'won'];
      const rank = order.indexOf(stage);
      return leads.filter((l) => order.indexOf(l.stage) >= rank).length;
    };
    expect(reached('lead')).toBe(342);
    expect(reached('contacted')).toBe(264);
    expect(reached('qualified')).toBe(158);
    expect(reached('booked')).toBe(96);
    expect(reached('won')).toBe(48);
  });

  it('matches the dashboard channel mix', () => {
    const leads = seedLeads(NOW);
    const count = (ch: string) => leads.filter((l) => l.channel === ch).length;
    expect(count('whatsapp')).toBe(142);
    expect(count('facebook')).toBe(96);
    expect(count('instagram')).toBe(68);
    expect(count('tiktok')).toBe(36);
  });

  it('is deterministic (same now → identical leads)', () => {
    expect(seedLeads(NOW)).toEqual(seedLeads(NOW));
  });

  it('seeds three future appointments', () => {
    const appts = seedAppointments(NOW);
    expect(appts).toHaveLength(3);
    for (const a of appts) {
      expect(new Date(a.scheduled_at).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it('exposes a ReachData provider over the seed', async () => {
    const data = createSeedReachData(NOW);
    expect(await data.listCampaigns()).toHaveLength(5);
    expect(await data.listLeads()).toHaveLength(342);
    expect(await data.listAppointments()).toHaveLength(3);
    expect(await data.listForms()).toHaveLength(6);
    expect(await data.listBroadcasts()).toHaveLength(5);
    expect(await data.listAutomations()).toHaveLength(4);
  });

  it('seeds consistent forms, broadcasts and automations', () => {
    const forms = seedForms();
    expect(forms).toHaveLength(6);
    // The Lead Forms sample screen: 2,378 views and 428 contacts, four live and two drafts.
    expect(forms.reduce((a, f) => a + f.views_count, 0)).toBe(2378);
    expect(forms.reduce((a, f) => a + f.submissions_count, 0)).toBe(428);
    expect(forms.filter((f) => f.status === 'active')).toHaveLength(4);
    expect(forms.filter((f) => f.status === 'draft')).toHaveLength(2);
    expect(new Set(forms.map((f) => f.slug)).size).toBe(6);
    for (const f of forms) expect(f.slug).toMatch(/^[a-z0-9-]{2,60}$/);
    for (const b of seedBroadcasts(NOW)) {
      expect(b.opened_count).toBeLessThanOrEqual(b.sent_count);
      expect(b.clicked_count).toBeLessThanOrEqual(b.opened_count);
      expect(new Date(b.sent_at).getTime()).toBeLessThan(NOW.getTime());
    }
    const autos = seedAutomations(NOW);
    expect(autos).toHaveLength(4);
    expect(autos.filter((a) => a.status === 'draft').every((a) => a.runs_count === 0)).toBe(true);
    expect(seedForms()).toEqual(seedForms());
  });
});
