import type { Slice } from '@/components/charts';
import type { CrmDeal } from '@/lib/crm/deals';
import { stageDot, type CrmPipeline } from '@/lib/crm/pipelines';

/* ---- mock data (Rimba Ventures Sdn Bhd — sales pipeline) ---------- */
/* Shown when no database is configured, or the deals cannot be read.  */

const SAMPLE_PIPELINE_ID = 'sample';

function stage(name: string, position: number, probability: number) {
  return { id: name.toLowerCase(), name, position, probability, dot: stageDot(name) };
}

export const SAMPLE_PIPELINE: CrmPipeline = {
  id: SAMPLE_PIPELINE_ID,
  name: 'Default pipeline',
  isDefault: true,
  stages: [
    stage('Lead', 1, 10),
    stage('Qualified', 2, 30),
    stage('Proposal', 3, 50),
    stage('Negotiation', 4, 70),
    stage('Won', 5, 100),
  ],
};

function deal(
  id: string,
  stageId: string,
  company: string,
  title: string,
  value: number,
  owner: string,
  lastTouch: string,
  tag?: string,
): CrmDeal {
  return {
    id,
    title,
    company,
    contactName: '',
    value,
    owner,
    ...(tag ? { tag } : {}),
    status: stageId === 'won' ? 'won' : 'open',
    pipelineId: SAMPLE_PIPELINE_ID,
    stageId,
    lastTouch,
    expectedClose: null,
    createdAt: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
  };
}

export const SAMPLE_DEALS: CrmDeal[] = [
  deal('d1', 'lead', 'Seri Mutiara Enterprise', 'POS rollout — 4 outlets', 18000, 'Aisyah Rahim', '3h ago', 'Inbound'),
  deal('d2', 'lead', 'Teratak Kopi', 'Loyalty + WhatsApp CRM', 6400, 'Faiz Hakim', '1d ago'),
  deal('d3', 'qualified', 'Langkawi Fresh Sdn Bhd', 'Cold-chain order tracking', 24500, 'Nurul Huda', '5h ago', 'Referral'),
  deal('d4', 'qualified', 'Bumi Hijau Trading', 'Inventory sync + billing', 9800, 'Ahmad Zaki', '2d ago'),
  deal('d5', 'proposal', 'Nusantara Logistics', 'Fleet & dispatch dashboard', 42000, 'Aisyah Rahim', '1d ago', 'High value'),
  deal('d6', 'proposal', 'Cahaya Tekstil', 'E-invoice (LHDN) setup', 12200, 'Faiz Hakim', '4h ago'),
  deal('d7', 'negotiation', 'Delima Properties', 'Annual CRM retainer', 36000, 'Nurul Huda', '2d ago', 'Renewal'),
  deal('d8', 'negotiation', 'Zamrud Hardware', 'Multi-store POS + stock', 15600, 'Ahmad Zaki', '6h ago'),
  deal('d9', 'won', 'Warung Selera Group', 'Franchise CRM — 9 branches', 28000, 'Aisyah Rahim', '3d ago', 'Closed'),
  deal('d10', 'won', 'Kedai Runcit Maju', 'Billing & receipts module', 7900, 'Faiz Hakim', '1w ago'),
];

/** The sample figures count every sample deal, as the screen always has. */
export const SAMPLE_TOTAL_DEALS = SAMPLE_DEALS.length;
export const SAMPLE_PIPELINE_VALUE = SAMPLE_DEALS.reduce((sum, d) => sum + d.value, 0);

export const SAMPLE_TREND = [
  { label: 'Wk1', created: 9, won: 3 },
  { label: 'Wk2', created: 12, won: 4 },
  { label: 'Wk3', created: 10, won: 4 },
  { label: 'Wk4', created: 14, won: 6 },
  { label: 'Wk5', created: 11, won: 5 },
  { label: 'Wk6', created: 15, won: 7 },
  { label: 'Wk7', created: 13, won: 6 },
  { label: 'Wk8', created: 17, won: 8 },
];

export const SAMPLE_FUNNEL: Slice[] = [
  { key: 'lead', label: 'Lead', value: 48, color: 'var(--chart-1)' },
  { key: 'qualified', label: 'Qualified', value: 32, color: 'var(--chart-2)' },
  { key: 'proposal', label: 'Proposal', value: 21, color: 'var(--chart-5)' },
  { key: 'negotiation', label: 'Negotiation', value: 13, color: 'var(--chart-3)' },
  { key: 'won', label: 'Won', value: 9, color: 'var(--chart-4)' },
];
