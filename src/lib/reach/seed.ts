/**
 * Fictional Rimba Ventures Sdn Bhd seed data for the Jebat AI tools.
 *
 * This is the single demo org's data. It is **self-consistent** (the campaign
 * table, the lead funnel, the channel mix and the weekly trend all line up) so
 * Jebat's answers never contradict themselves. It is generated deterministically
 * from a fixed reference `now` so unit tests are stable.
 *
 * Independence: fictional names, `.my` / `@openkuasa.com` only. The data slice
 * will move these exact shapes into Postgres and reconcile them with the
 * dashboard's display arrays; until then the dashboard keeps its own numbers and
 * only the AI tools read this.
 */

import type {
  Appointment,
  Automation,
  Broadcast,
  Campaign,
  Channel,
  Form,
  Lead,
  LeadStage,
  ReachData,
} from './types';

/** Small, fast, seeded PRNG (mulberry32) — deterministic shuffles for a stable seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Repeat each [label, count] pair `count` times into a flat pool. */
function pool<T>(entries: [T, number][]): T[] {
  return entries.flatMap(([label, count]) => Array.from({ length: count }, () => label));
}

function daysAgo(now: Date, days: number): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function hoursFromNow(now: Date, hours: number): string {
  const d = new Date(now);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
}

const FIRST_NAMES = [
  'Aisyah', 'Faiz', 'Nurul', 'Hafiz', 'Siti', 'Danial', 'Farah', 'Amir',
  'Liyana', 'Zikri', 'Balqis', 'Hakim', 'Intan', 'Rizal', 'Maya', 'Syafiq',
];
const LAST_NAMES = [
  'Rahim', 'Hakim', 'Huda', 'Ismail', 'Osman', 'Tan', 'Lim', 'Kaur',
  'Abdullah', 'Yusof', 'Chong', 'Devi', 'Karim', 'Noor', 'Salleh', 'Wong',
];
const SOURCES = [
  'WhatsApp click ad',
  'Facebook lead form',
  'Instagram DM',
  'TikTok bio link',
  'Website form',
  'Customer referral',
];

/** The 5 campaigns, mirroring the Jebat Overview campaign table exactly. */
export function seedCampaigns(now: Date): Campaign[] {
  const rows: Array<Omit<Campaign, 'id' | 'spend_cents' | 'created_at'> & { ageDays: number }> = [
    { name: 'Ramadan–Raya Promo', channel: 'facebook', status: 'active', leads_count: 96, cpl_cents: 1250, ageDays: 40 },
    { name: 'Lead Magnet — eBook', channel: 'whatsapp', status: 'active', leads_count: 61, cpl_cents: 688, ageDays: 33 },
    { name: 'Retargeting — Cart', channel: 'instagram', status: 'active', leads_count: 54, cpl_cents: 1185, ageDays: 26 },
    { name: 'New Product Launch', channel: 'tiktok', status: 'paused', leads_count: 70, cpl_cents: 2640, ageDays: 19 },
    { name: 'Brand Awareness', channel: 'facebook', status: 'paused', leads_count: 18, cpl_cents: 5000, ageDays: 12 },
  ];
  return rows.map((r, i) => ({
    id: `camp_${i + 1}`,
    name: r.name,
    channel: r.channel,
    status: r.status,
    leads_count: r.leads_count,
    // spend is consistent with the reported leads × cost-per-lead.
    spend_cents: r.leads_count * r.cpl_cents,
    cpl_cents: r.cpl_cents,
    created_at: daysAgo(now, r.ageDays),
  }));
}

// Funnel headline (furthest stage reached): 342 → 264 → 158 → 96 → 48.
const STAGE_COUNTS: [LeadStage, number][] = [
  ['won', 48],
  ['booked', 48],
  ['qualified', 62],
  ['contacted', 106],
  ['lead', 78],
];
// Channel mix across all leads: sums to 342.
const CHANNEL_COUNTS: [Channel, number][] = [
  ['whatsapp', 142],
  ['facebook', 96],
  ['instagram', 68],
  ['tiktok', 36],
];
// Leads per week, oldest → newest; rising trend, sums to 342.
const WEEKLY = [30, 34, 36, 42, 46, 50, 50, 54];

export const TOTAL_SEED_LEADS = WEEKLY.reduce((a, b) => a + b, 0); // 342

/**
 * 342 CRM leads with decorrelated channel/stage (seeded shuffle keeps exact
 * totals) spread across 8 rising weeks, so leads-by-channel, the funnel, totals,
 * conversion and the weekly trend all derive live from these rows.
 */
export function seedLeads(now: Date): Lead[] {
  const rand = mulberry32(0x6b75_6173); // "kuas"
  const channels = shuffle(pool(CHANNEL_COUNTS), rand);
  const stages = shuffle(pool(STAGE_COUNTS), rand);

  const leads: Lead[] = [];
  let idx = 0;
  WEEKLY.forEach((count, week) => {
    // week 0 is the oldest (~8 weeks ago); the last week is the current one.
    const weeksAgo = WEEKLY.length - 1 - week;
    for (let p = 0; p < count; p += 1) {
      const dayOffset = weeksAgo * 7 + (p % 7);
      const channel = channels[idx];
      const stage = stages[idx];
      leads.push({
        id: `lead_${idx + 1}`,
        name: `${FIRST_NAMES[idx % FIRST_NAMES.length]} ${LAST_NAMES[(idx * 7) % LAST_NAMES.length]}`,
        channel,
        stage,
        source: SOURCES[idx % SOURCES.length],
        created_at: daysAgo(now, dayOffset),
      });
      idx += 1;
    }
  });
  return leads;
}

/** Three upcoming appointments, relative to `now`. */
export function seedAppointments(now: Date): Appointment[] {
  return [
    { id: 'appt_1', contact_name: 'Aisyah Rahim', kind: 'Discovery call', via: 'WhatsApp', scheduled_at: hoursFromNow(now, 5) },
    { id: 'appt_2', contact_name: 'Faiz Hakim', kind: 'Product demo', via: 'Zoom', scheduled_at: hoursFromNow(now, 26) },
    { id: 'appt_3', contact_name: 'Nurul Huda', kind: 'Follow-up', via: 'Call', scheduled_at: hoursFromNow(now, 72) },
  ].map((a) => ({ ...a, created_at: daysAgo(now, 2) }));
}

/** Four lead-capture forms; submissions loosely track the channel lead mix. */
export function seedForms(now: Date): Form[] {
  const rows: Array<Omit<Form, 'id' | 'created_at'> & { ageDays: number }> = [
    { name: 'Tempahan Pakej Raya', channel: 'facebook', submissions_count: 84, status: 'active', ageDays: 38 },
    { name: 'Muat Turun eBook Percuma', channel: 'whatsapp', submissions_count: 117, status: 'active', ageDays: 31 },
    { name: 'Tempah Sesi Konsultasi', channel: 'instagram', submissions_count: 39, status: 'active', ageDays: 22 },
    { name: 'Daftar Waitlist Produk Baharu', channel: 'tiktok', submissions_count: 52, status: 'paused', ageDays: 15 },
  ];
  return rows.map(({ ageDays, ...r }, i) => ({
    id: `form_${i + 1}`,
    ...r,
    created_at: daysAgo(now, ageDays),
  }));
}

/** Five past broadcasts (opened <= sent, clicked <= opened), newest sent last in the list. */
export function seedBroadcasts(now: Date): Broadcast[] {
  const rows: Array<Omit<Broadcast, 'id' | 'created_at' | 'sent_at'> & { sentDaysAgo: number }> = [
    { name: 'Salam Ramadan — Tawaran Awal', channel: 'whatsapp', sent_count: 320, opened_count: 288, clicked_count: 96, sentDaysAgo: 38 },
    { name: 'Newsletter Mingguan #12', channel: 'email', sent_count: 540, opened_count: 205, clicked_count: 41, sentDaysAgo: 27 },
    { name: 'Promo Hari Raya 3 Hari', channel: 'whatsapp', sent_count: 410, opened_count: 369, clicked_count: 132, sentDaysAgo: 18 },
    { name: 'Jemputan Webinar Pemasaran', channel: 'email', sent_count: 480, opened_count: 196, clicked_count: 58, sentDaysAgo: 9 },
    { name: 'Peringatan Troli Tertinggal', channel: 'whatsapp', sent_count: 150, opened_count: 131, clicked_count: 47, sentDaysAgo: 3 },
  ];
  return rows.map(({ sentDaysAgo, ...r }, i) => ({
    id: `bcast_${i + 1}`,
    ...r,
    sent_at: daysAgo(now, sentDaysAgo),
    created_at: daysAgo(now, sentDaysAgo + 1),
  }));
}

/** Four automation workflows. */
export function seedAutomations(now: Date): Automation[] {
  const rows: Array<Omit<Automation, 'id' | 'created_at'> & { ageDays: number }> = [
    { name: 'Sapaan Lead Baharu', trigger: 'Lead baharu masuk dari borang', status: 'active', runs_count: 342, ageDays: 40 },
    { name: 'Follow Up 24 Jam', trigger: 'Lead tiada balasan selepas 24 jam', status: 'active', runs_count: 198, ageDays: 33 },
    { name: 'Peringatan Temujanji', trigger: '24 jam sebelum temujanji', status: 'active', runs_count: 74, ageDays: 21 },
    { name: 'Menang Semula Pelanggan Lama', trigger: 'Pelanggan tidak aktif 60 hari', status: 'draft', runs_count: 0, ageDays: 6 },
  ];
  return rows.map(({ ageDays, ...r }, i) => ({
    id: `auto_${i + 1}`,
    ...r,
    created_at: daysAgo(now, ageDays),
  }));
}

/**
 * Build a seed-backed {@link ReachData} provider anchored to `now`. Called per
 * request (not memoized) so appointment "upcoming" windows stay correct on a
 * long-lived server.
 */
export function createSeedReachData(now: Date = new Date()): ReachData {
  const campaigns = seedCampaigns(now);
  const leads = seedLeads(now);
  const appointments = seedAppointments(now);
  const forms = seedForms(now);
  const broadcasts = seedBroadcasts(now);
  const automations = seedAutomations(now);
  return {
    listCampaigns: async () => campaigns,
    listLeads: async () => leads,
    listAppointments: async () => appointments,
    listForms: async () => forms,
    listBroadcasts: async () => broadcasts,
    listAutomations: async () => automations,
  };
}
