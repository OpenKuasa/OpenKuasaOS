'use client';

import { useRef, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Columns3,
  Filter,
  PieChart,
  Plus,
  Tag,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  BarGroup,
  DonutStat,
  RadialGauge,
  Sparkline,
  type Series,
  type Slice,
} from '@/components/charts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CrmContact } from '@/lib/crm/contacts';
import type { CrmFollowUp } from '@/lib/crm/follow-ups';
import type { CrmContactActions } from '@/lib/crm/form-state';
import {
  ContactFollowUps,
  ContactFormCard,
  ContactRowMenu,
  DeleteContactRow,
} from '@/screens/crm/contact-parts';

/* ---- mock data (Rimba Ventures Sdn Bhd) --------------------------- */

type Contact = CrmContact;

/** Total contacts in the book; the table below shows a recent sample. */
const TOTAL_CONTACTS = 1284;

const CONTACTS: Contact[] = [
  {
    id: '1',
    email: 'aisyah.rahim@rimbaventures.com',
    company: 'Rimba Ventures Sdn Bhd',
    first: 'Aisyah',
    last: 'Rahim',
    phone: '+60123456789',
    country: 'MY',
    status: 'Qualified',
    score: 92,
    pic: 'Faiz',
    lastInteraction: '2h ago',
  },
  {
    id: '2',
    email: 'faiz.hakim@gmail.com',
    company: 'Personal',
    first: 'Faiz',
    last: 'Hakim',
    phone: '+60123456782',
    country: 'MY',
    status: 'Contacted',
    score: 78,
    pic: 'Aisyah',
    lastInteraction: 'Yesterday',
  },
  {
    id: '3',
    email: 'nurul.huda@mesramart.my',
    company: 'Mesra Mart Enterprise',
    first: 'Nurul',
    last: 'Huda',
    phone: '+60123456783',
    country: 'MY',
    status: 'New Leads',
    score: 64,
    pic: 'Aisyah',
    lastInteraction: '3 days ago',
  },
  {
    id: '4',
    email: 'ahmad.zaki@tanibumi.my',
    company: 'Tani Bumi Sdn Bhd',
    first: 'Ahmad',
    last: 'Zaki',
    phone: '+60123456781',
    country: 'MY',
    status: 'Qualified',
    score: 85,
    pic: 'Faiz',
    lastInteraction: '5h ago',
  },
  {
    id: '5',
    email: 'sarah.tan@worksphere.my',
    company: 'WorkSphere',
    first: 'Sarah',
    last: 'Tan',
    phone: '+60123456784',
    country: 'MY',
    status: 'Contacted',
    score: 45,
    pic: 'Nurul',
    lastInteraction: '1 week ago',
  },
  {
    id: '6',
    email: 'wan.azlan@gmail.com',
    company: 'Personal',
    first: 'Wan',
    last: 'Azlan',
    phone: '+60123456785',
    country: 'MY',
    status: 'New Leads',
    score: 33,
    pic: 'Nurul',
    lastInteraction: 'Yesterday',
  },
  {
    id: '7',
    email: 'weijie.lim@kedairuncit.my',
    company: 'Kedai Runcit Online',
    first: 'Lim',
    last: 'Wei Jie',
    phone: '+60123456786',
    country: 'MY',
    status: 'Customer',
    score: 58,
    pic: 'Zaki',
    lastInteraction: '2 weeks ago',
  },
  {
    id: '8',
    email: 'siti.khadijah@outlook.com',
    company: 'Personal',
    first: 'Siti',
    last: 'Khadijah',
    phone: '+60123456787',
    country: 'MY',
    status: null,
    score: 18,
    pic: null,
    lastInteraction: null,
  },
];

/* KPI sparkline trends ------------------------------------------------ */
const SPARK_TOTAL = [1060, 1104, 1138, 1172, 1201, 1238, 1262, 1284];
const SPARK_NEW = [52, 61, 58, 73, 69, 81, 78, 86];
const SPARK_QUALIFIED = [318, 332, 347, 358, 371, 384, 393, 402];
const SPARK_SCORE = [61, 63, 62, 65, 66, 67, 67, 68];

/* Contacts added over time (last 8 weeks) ----------------------------- */
const ADDED_TREND = [
  { label: 'Wk1', added: 52, qualified: 22 },
  { label: 'Wk2', added: 61, qualified: 28 },
  { label: 'Wk3', added: 58, qualified: 26 },
  { label: 'Wk4', added: 73, qualified: 33 },
  { label: 'Wk5', added: 69, qualified: 31 },
  { label: 'Wk6', added: 81, qualified: 36 },
  { label: 'Wk7', added: 78, qualified: 34 },
  { label: 'Wk8', added: 86, qualified: 38 },
];
const ADDED_SERIES: Series[] = [
  { key: 'added', label: 'Added', color: 'var(--chart-1)' },
  { key: 'qualified', label: 'Qualified', color: 'var(--chart-2)' },
];

/* Lead score distribution — matches the LeadScore badge thresholds ---- */
const SCORE_MIX: Slice[] = [
  { key: 'hot', label: 'Hot (75+)', value: 386, color: 'var(--chart-1)' },
  { key: 'warm', label: 'Warm (40–74)', value: 592, color: 'var(--chart-3)' },
  { key: 'cold', label: 'Cold (<40)', value: 306, color: 'var(--chart-4)' },
];

/* Pipeline by status -------------------------------------------------- */
const STATUS_MIX = [
  { label: 'New', count: 431 },
  { label: 'Contacted', count: 358 },
  { label: 'Qualified', count: 402 },
  { label: 'Customer', count: 93 },
];
const STATUS_SERIES: Series[] = [
  { key: 'count', label: 'Contacts', color: 'var(--chart-2)' },
];

/* ------------------------------------------------------------------ */

function LeadScore({ value }: { value: number }) {
  const tone =
    value >= 75
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : value >= 40
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400';
  return (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold',
        tone,
      )}
      title={`Lead score ${value}`}
    >
      {value}
    </span>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status)
    return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      {status}
    </span>
  );
}

type ContactsScreenProps = {
  /** Live contacts. Omitted on Jebat and when no database is configured. */
  contacts?: Contact[];
  totalContacts?: number;
  /** Open follow-ups by contact id. */
  followUps?: Record<string, CrmFollowUp[]>;
  /** Present only when the signed-in person may change contacts. */
  actions?: CrmContactActions;
};

export default function ContactsScreen({
  contacts,
  totalContacts,
  followUps,
  actions,
}: ContactsScreenProps = {}) {
  // With live contacts, only what is backed by real data is shown: the total
  // and the table. The trend, score and pipeline cards are sample figures and
  // stay hidden until they have a live source.
  const live = contacts !== undefined;
  const rows = contacts ?? CONTACTS;
  const total = totalContacts ?? TOTAL_CONTACTS;
  const [selected, setSelected] = useState<string[]>([]);
  // One thing is open at a time: the edit card, a delete question, or a
  // follow-up form.
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const columns = actions ? 10 : 9;

  const focusForm = () => {
    // After the card has re-rendered for the contact that was picked.
    requestAnimationFrame(() => {
      firstFieldRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstFieldRef.current?.focus({ preventScroll: true });
    });
  };
  const startAdd = () => {
    setEditing(null);
    setDeletingId(null);
    focusForm();
  };
  const startEdit = (contact: Contact) => {
    setEditing(contact);
    setDeletingId(null);
    setFollowUpFor(null);
    focusForm();
  };
  const allChecked = selected.length === rows.length && rows.length > 0;

  const toggleAll = () =>
    setSelected(allChecked ? [] : rows.map((c) => c.id));
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  return (
    <ScreenContainer>
      <PageHeader
        className="mb-3"
        title="Contacts"
        subtitle="All your leads and customers in one place, Saudara."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Columns3 className="size-4" />
              Columns
            </Button>
            <Button size="sm" onClick={actions ? startAdd : undefined}>
              <Plus className="size-4" />
              Add Contact
            </Button>
          </>
        }
      />

      <BentoGrid>
        {actions ? (
          <ContactFormCard
            // A fresh form for each contact, and for adding.
            key={editing?.id ?? 'new'}
            action={actions.save}
            editing={editing}
            onDone={() => setEditing(null)}
            firstFieldRef={firstFieldRef}
          />
        ) : null}

        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Total contacts"
            value={total.toLocaleString()}
            delta={live ? undefined : '+4.2%'}
            onPrimary
            chart={
              live ? undefined : (
                <Sparkline
                  data={SPARK_TOTAL}
                  color="var(--primary-foreground)"
                  height={36}
                />
              )
            }
          />
        </BentoCard>
        {!live && (
          <>
            <BentoCard className="col-span-1 md:col-span-3">
              <BentoStat
                label="New this week"
                value="86"
                delta="+18"
                deltaTone="up"
                chart={<Sparkline data={SPARK_NEW} color="var(--chart-2)" height={36} />}
              />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-3">
              <BentoStat
                label="Qualified"
                value="402"
                delta="+6%"
                deltaTone="up"
                chart={<Sparkline data={SPARK_QUALIFIED} color="var(--chart-1)" height={36} />}
              />
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-3">
              <BentoStat
                label="Avg lead score"
                value="68"
                delta="+2"
                deltaTone="up"
                chart={<Sparkline data={SPARK_SCORE} color="var(--chart-3)" height={36} />}
              />
            </BentoCard>

            {/* Trend + score distribution */}
            <BentoCard
              title="Contacts added over time"
              subtitle="Last 8 weeks"
              icon={TrendingUp}
              className="col-span-2 md:col-span-8"
            >
              <AreaTrend data={ADDED_TREND} series={ADDED_SERIES} height={240} showLegend />
            </BentoCard>
            <BentoCard
              title="Lead score distribution"
              subtitle="Hot · Warm · Cold"
              icon={PieChart}
              className="col-span-2 md:col-span-4"
            >
              <DonutStat
                data={SCORE_MIX}
                height={240}
                centerValue={total.toLocaleString()}
                centerLabel="contacts"
              />
            </BentoCard>
          </>
        )}

        {/* Contacts table */}
        <BentoCard
          title="All contacts"
          subtitle="Most recent first"
          icon={Users}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <Button variant="outline" size="sm">
              <Filter className="size-4" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              All Contacts
              <ChevronDown className="size-4" />
            </Button>
            <Button variant="outline" size="sm">
              <Tag className="size-4" />
              Tags
            </Button>
            <Button variant="outline" size="sm">
              <CalendarClock className="size-4" />
              Follow-up
            </Button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>First name</TableHead>
                  <TableHead>Last name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PIC</TableHead>
                  <TableHead>Last interaction</TableHead>
                  {actions ? (
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) =>
                  actions && deletingId === c.id ? (
                    <DeleteContactRow
                      key={c.id}
                      contact={c}
                      action={actions.remove}
                      colSpan={columns}
                      onClose={() => setDeletingId(null)}
                    />
                  ) : (
                  <TableRow
                    key={c.id}
                    data-state={
                      selected.includes(c.id) || editing?.id === c.id ? 'selected' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={() => toggle(c.id)}
                        aria-label={`Select ${c.email}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <LeadScore value={c.score} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.email}</p>
                          {live ? (
                            <ContactFollowUps
                              contactId={c.id}
                              items={followUps?.[c.id] ?? []}
                              add={actions?.addFollowUp}
                              complete={actions?.completeFollowUp}
                              adding={followUpFor === c.id}
                              onAdd={() => setFollowUpFor(c.id)}
                              onClose={() => setFollowUpFor(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="text-xs font-medium uppercase tracking-wide text-primary hover:underline"
                            >
                              + Add follow-up
                            </button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.first}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.last}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {c.phone}
                    </TableCell>
                    <TableCell>{c.country}</TableCell>
                    <TableCell>
                      <StatusPill status={c.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.pic ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {c.lastInteraction ?? '—'}
                    </TableCell>
                    {actions ? (
                      <TableCell>
                        <ContactRowMenu
                          label={c.email || c.first}
                          onEdit={() => startEdit(c)}
                          onDelete={() => {
                            setDeletingId(c.id);
                            setEditing((e) => (e?.id === c.id ? null : e));
                          }}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                  ),
                )}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns} className="py-10 text-center text-muted-foreground">
                      No contacts yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {rows.length} of {total.toLocaleString()} contacts
            </span>
            {selected.length > 0 ? (
              <span>{selected.length} selected</span>
            ) : null}
          </div>
        </BentoCard>

        {/* Pipeline breakdown + qualification rate */}
        {!live && (
          <>
            <BentoCard
              title="Pipeline by status"
              subtitle="Across all contacts"
              icon={BarChart3}
              className="col-span-2 md:col-span-8"
            >
              <BarGroup
                data={STATUS_MIX}
                series={STATUS_SERIES}
                horizontal
                height={200}
              />
            </BentoCard>
            <BentoCard
              title="Qualification rate"
              subtitle="Qualified ÷ total"
              icon={Target}
              className="col-span-2 md:col-span-4"
            >
              <RadialGauge
                value={31}
                label="qualified"
                valueLabel="31%"
                color="var(--chart-1)"
                height={200}
              />
            </BentoCard>
          </>
        )}
      </BentoGrid>
    </ScreenContainer>
  );
}
