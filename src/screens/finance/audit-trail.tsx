'use client';

import { useState } from 'react';
import { Activity, PieChart, ScrollText, Search } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { filterRows, NoMatchesRow } from '@/components/screen/table-filter';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import { AreaTrend, DonutStat, Sparkline, type Series, type Slice } from '@/components/charts';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/* ---- mock data (Rimba Ventures Sdn Bhd) --------------------------- */

const ACTIVITY_TREND = [
  { label: 'Thu', events: 12 },
  { label: 'Fri', events: 18 },
  { label: 'Sat', events: 9 },
  { label: 'Sun', events: 6 },
  { label: 'Mon', events: 26 },
  { label: 'Tue', events: 23 },
  { label: 'Wed', events: 24 },
  { label: 'Today', events: 24 },
];
const ACTIVITY_SERIES: Series[] = [
  { key: 'events', label: 'Events', color: 'var(--chart-1)' },
];

/** Events this week by category — sums to 142. */
const BY_CATEGORY: Slice[] = [
  { key: 'sales', label: 'Sales', value: 48, color: 'var(--chart-1)' },
  { key: 'purchases', label: 'Purchases', value: 36, color: 'var(--chart-2)' },
  { key: 'expenses', label: 'Expenses', value: 32, color: 'var(--chart-5)' },
  { key: 'products', label: 'Products', value: 14, color: 'var(--chart-3)' },
  { key: 'compliance', label: 'Compliance', value: 12, color: 'var(--chart-4)' },
];

type AuditAction = 'Created' | 'Updated' | 'Deleted';
type AuditCategory = 'Sales' | 'Purchases' | 'Expenses' | 'Products' | 'Compliance';

type AuditEntry = {
  id: string;
  timestamp: string;
  user: string;
  action: AuditAction;
  category: AuditCategory;
  entity: string;
  details: string;
};

const ENTRIES: AuditEntry[] = [
  { id: '1', timestamp: '07 Oct 14:20', user: 'Saudara', action: 'Created', category: 'Sales', entity: 'INV-1042', details: 'Invoice RM 1,240 for Aisyah Trading' },
  { id: '2', timestamp: '07 Oct 11:05', user: 'Aisyah', action: 'Updated', category: 'Expenses', entity: 'EXP-320', details: 'Amount RM 180 → RM 200' },
  { id: '3', timestamp: '06 Oct 16:40', user: 'Faiz', action: 'Deleted', category: 'Sales', entity: 'QT-214', details: 'Draft quotation removed' },
  { id: '4', timestamp: '06 Oct 10:12', user: 'Saudara', action: 'Created', category: 'Purchases', entity: 'BILL-088', details: 'Bill RM 2,300 from Lim Hardware' },
  { id: '5', timestamp: '05 Oct 17:30', user: 'Aisyah', action: 'Updated', category: 'Compliance', entity: 'INV-1038', details: 'Customer TIN corrected for LHDN resubmission' },
  { id: '6', timestamp: '05 Oct 09:48', user: 'Faiz', action: 'Created', category: 'Expenses', entity: 'EXP-321', details: 'Expense RM 95 — TNB electricity' },
  { id: '7', timestamp: '04 Oct 15:22', user: 'Saudara', action: 'Updated', category: 'Products', entity: 'PRD-010', details: 'Price RM 80 → RM 85' },
  { id: '8', timestamp: '03 Oct 13:07', user: 'Aisyah', action: 'Deleted', category: 'Expenses', entity: 'EXP-317', details: 'Duplicate expense entry removed' },
  { id: '9', timestamp: '03 Oct 09:15', user: 'Saudara', action: 'Created', category: 'Compliance', entity: 'INV-1041', details: 'e-Invoice submitted to LHDN MyInvois' },
  { id: '10', timestamp: '02 Oct 16:02', user: 'Nurul', action: 'Updated', category: 'Purchases', entity: 'BILL-086', details: 'Nusantara Logistics bill approved for payment' },
];

const ACTION_STYLES: Record<AuditAction, string> = {
  Created: 'bg-emerald-500/15 text-emerald-600',
  Updated: 'bg-amber-500/15 text-amber-600',
  Deleted: 'bg-red-500/15 text-red-600',
};

const CATEGORY_COLOR: Record<AuditCategory, string> = {
  Sales: 'var(--chart-1)',
  Purchases: 'var(--chart-2)',
  Expenses: 'var(--chart-5)',
  Products: 'var(--chart-3)',
  Compliance: 'var(--chart-4)',
};

/* ------------------------------------------------------------------ */

export default function AuditTrailScreen() {
  const [query, setQuery] = useState('');
  const [user, setUser] = useState('all');
  const [category, setCategory] = useState('all');
  const [action, setAction] = useState('all');
  const rows = filterRows(ENTRIES, query, (e) => `${e.entity} ${e.details} ${e.user}`, { user, category, action });

  return (
    <ScreenContainer>
      <PageHeader
        title="Audit Trail"
        subtitle="Every change to the books, logged for you, Saudara."
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Events today"
            value="24"
            delta="+4"
            onPrimary
            chart={
              <Sparkline
                data={[12, 18, 9, 6, 26, 23, 24, 24]}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="This week"
            value="142"
            delta="+9%"
            deltaTone="up"
            chart={
              <Sparkline
                data={[98, 108, 112, 120, 128, 134, 138, 142]}
                color="var(--chart-2)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Compliance events"
            value="12"
            delta="LHDN & SST"
            deltaTone="flat"
            chart={
              <Sparkline
                data={[6, 7, 8, 9, 10, 11, 11, 12]}
                color="var(--chart-4)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Deletions"
            value="6"
            delta="−2"
            deltaTone="up"
            chart={
              <Sparkline
                data={[9, 8, 8, 7, 7, 6, 6, 6]}
                color="var(--chart-3)"
                height={36}
              />
            }
          />
        </BentoCard>

        {/* Activity trend + category mix */}
        <BentoCard
          title="Activity over time"
          subtitle="Logged events · last 8 days"
          icon={Activity}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={ACTIVITY_TREND} series={ACTIVITY_SERIES} height={240} />
        </BentoCard>
        <BentoCard
          title="By category"
          subtitle="Events this week"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={BY_CATEGORY}
            height={240}
            centerValue="142"
            centerLabel="events"
          />
        </BentoCard>

        {/* Audit log table */}
        <BentoCard
          title="Activity log"
          subtitle="Who changed what, and when"
          icon={ScrollText}
          className="col-span-2 md:col-span-12"
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search activity…"
                placeholder="Search activity…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={user} onValueChange={setUser}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="Saudara">Saudara</SelectItem>
                <SelectItem value="Aisyah">Aisyah</SelectItem>
                <SelectItem value="Faiz">Faiz</SelectItem>
                <SelectItem value="Nurul">Nurul</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="Purchases">Purchases</SelectItem>
                <SelectItem value="Expenses">Expenses</SelectItem>
                <SelectItem value="Products">Products</SelectItem>
                <SelectItem value="Compliance">Compliance</SelectItem>
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="Created">Created</SelectItem>
                <SelectItem value="Updated">Updated</SelectItem>
                <SelectItem value="Deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={6} />}
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {e.timestamp}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {e.user}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          ACTION_STYLES[e.action],
                        )}
                      >
                        {e.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-foreground"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${CATEGORY_COLOR[e.category]} 16%, transparent)`,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLOR[e.category] }}
                        />
                        {e.category}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {e.entity}
                    </TableCell>
                    <TableCell className="min-w-64 text-muted-foreground">
                      {e.details}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
