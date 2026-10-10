'use client';

import { useState } from 'react';
import { Plus, Search, Receipt, TrendingUp, PieChart } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { filterRows, NoMatchesRow } from '@/components/screen/table-filter';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  AreaTrend,
  DonutStat,
  Sparkline,
  type Series,
  type Slice,
} from '@/components/charts';
import { LiveDot } from '@/components/ui/live-dot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

type Expense = {
  id: string;
  date: string;
  category: string;
  vendor: string;
  amount: string;
  method: string;
  status: 'Approved' | 'Pending';
};

const CATEGORIES = ['Rent', 'Utilities', 'Marketing', 'Travel', 'Supplies', 'Salaries'];

/** Whole-book counts; the table below shows a recent sample. */
const TOTAL_EXPENSES = 142;

const EXPENSES: Expense[] = [
  { id: '1', date: '03 Oct 2026', category: 'Rent', vendor: 'Menara Axis Management', amount: 'RM 4,500.00', method: 'Bank Transfer', status: 'Approved' },
  { id: '2', date: '02 Oct 2026', category: 'Utilities', vendor: 'Suria Utilities Sdn Bhd', amount: 'RM 1,280.00', method: 'FPX', status: 'Approved' },
  { id: '3', date: '01 Oct 2026', category: 'Marketing', vendor: 'Meta Ads Malaysia', amount: 'RM 2,200.00', method: 'Credit Card', status: 'Pending' },
  { id: '4', date: '30 Sep 2026', category: 'Travel', vendor: 'Grab Malaysia', amount: 'RM 186.00', method: 'E-Wallet', status: 'Approved' },
  { id: '5', date: '29 Sep 2026', category: 'Supplies', vendor: 'Printhub Solutions', amount: 'RM 640.00', method: 'Cash', status: 'Approved' },
  { id: '6', date: '28 Sep 2026', category: 'Salaries', vendor: 'Payroll - September', amount: 'RM 8,900.00', method: 'Bank Transfer', status: 'Approved' },
  { id: '7', date: '27 Sep 2026', category: 'Utilities', vendor: 'Unifi Business', amount: 'RM 94.00', method: 'Credit Card', status: 'Approved' },
];

/* KPI sparkline trends (monthly, RM k) -------------------------------- */
const SPARK_TOTAL = [14.2, 15.1, 16.8, 17.2, 15.9, 18.6, 19.4, 18.4];
const SPARK_MONTH = [3.8, 4.6, 5.2, 4.8];
const SPARK_TOP = [8.1, 8.4, 8.6, 8.9, 8.7, 9.0, 8.9, 8.9];
const SPARK_PENDING = [0.6, 1.1, 0.9, 1.4, 1.2, 1.8, 2.0, 2.2];

/* Expenses over time (last 8 months, RM k) ---------------------------- */
const SPEND_TREND = [
  { label: 'Mar', spend: 14.2, approved: 13.0 },
  { label: 'Apr', spend: 15.1, approved: 14.2 },
  { label: 'May', spend: 16.8, approved: 15.9 },
  { label: 'Jun', spend: 17.2, approved: 16.1 },
  { label: 'Jul', spend: 15.9, approved: 15.0 },
  { label: 'Aug', spend: 18.6, approved: 17.3 },
  { label: 'Sep', spend: 19.4, approved: 18.1 },
  { label: 'Oct', spend: 18.4, approved: 16.2 },
];
const SPEND_SERIES: Series[] = [
  { key: 'spend', label: 'Spend (RM k)', color: 'var(--chart-1)' },
  { key: 'approved', label: 'Approved (RM k)', color: 'var(--chart-2)' },
];

/** Spend by category YTD (RM k) — sums to 142.8. */
const BY_CATEGORY: Slice[] = [
  { key: 'salaries', label: 'Salaries', value: 42.8, color: 'var(--chart-1)' },
  { key: 'rent', label: 'Rent', value: 27.0, color: 'var(--chart-2)' },
  { key: 'marketing', label: 'Marketing', value: 24.5, color: 'var(--chart-5)' },
  { key: 'utilities', label: 'Utilities', value: 18.2, color: 'var(--chart-3)' },
  { key: 'other', label: 'Travel & supplies', value: 30.3, color: 'var(--chart-4)' },
];

/* ------------------------------------------------------------------ */

export default function ExpensesScreen() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const rows = filterRows(EXPENSES, query, (e) => `${e.vendor} ${e.category}`, { category });

  return (
    <ScreenContainer>
      <PageHeader
        title="Expenses"
        subtitle="Business expenses and spending, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New Expense
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Total expenses (YTD)"
            value="RM 142.8k"
            delta="+8%"
            onPrimary
            chart={
              <Sparkline data={SPARK_TOTAL} color="var(--primary-foreground)" height={36} />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="This month"
            value="RM 18.4k"
            delta="+12%"
            deltaTone="down"
            chart={<Sparkline data={SPARK_MONTH} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Top category"
            value="Salaries"
            delta="30% of spend"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_TOP} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Pending approval"
            value="RM 2,200"
            delta="1 expense"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_PENDING} color="var(--chart-4)" height={36} />}
          />
        </BentoCard>

        {/* Trend + category mix */}
        <BentoCard
          title="Expenses over time"
          subtitle="Spend vs approved · last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={SPEND_TREND} series={SPEND_SERIES} height={240} showLegend />
        </BentoCard>
        <BentoCard
          title="Spend by category"
          subtitle="Year to date"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={BY_CATEGORY}
            height={240}
            centerValue="RM 142.8k"
            centerLabel="spend"
          />
        </BentoCard>

        {/* Expenses table */}
        <BentoCard
          title="Recent expenses"
          subtitle="Latest activity across your book"
          icon={Receipt}
          flush
          action={
            <Button variant="outline" size="sm">
              View all
            </Button>
          }
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search expenses..."
                placeholder="Search expenses..."
                className="w-full pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={6} />}
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{e.date}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{e.category}</TableCell>
                    <TableCell className="whitespace-nowrap">{e.vendor}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{e.amount}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.method}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={e.status === 'Approved'} />
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            e.status === 'Approved'
                              ? 'bg-emerald-500/15 text-emerald-600'
                              : 'bg-amber-500/15 text-amber-600',
                          )}
                        >
                          {e.status}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>Showing {rows.length} of {TOTAL_EXPENSES} expenses</span>
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
