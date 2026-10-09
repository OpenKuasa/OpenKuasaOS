'use client';

import { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Filter,
  PieChart,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { filterRows, NoMatchesRow } from '@/components/screen/table-filter';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard, BentoStat } from '@/components/bento/bento';
import {
  BarGroup,
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

type ContactType = 'Customer' | 'Supplier';
type ContactStatus = 'Active' | 'Inactive';

type Contact = {
  id: string;
  name: string;
  type: ContactType;
  email: string;
  phone: string;
  ssm: string;
  balance: string;
  status: ContactStatus;
};

/** Recent contacts sample — the KPI row reflects the whole ledger book. */
const CONTACTS: Contact[] = [
  { id: '1', name: 'Aisyah Trading', type: 'Customer', email: 'accounts@aisyahtrading.my', phone: '+60 12-345 6789', ssm: '201901012345', balance: 'RM 1,240.00', status: 'Active' },
  { id: '2', name: 'Lim Hardware', type: 'Supplier', email: 'sales@limhardware.com.my', phone: '+60 3-7956 1234', ssm: '198701004567', balance: 'RM 2,300.00', status: 'Active' },
  { id: '3', name: 'Zaki Enterprise', type: 'Customer', email: 'zaki@zakient.my', phone: '+60 13-221 4455', ssm: '202001098765', balance: 'RM 3,500.00', status: 'Active' },
  { id: '4', name: 'Nusantara Logistics', type: 'Supplier', email: 'orders@nusantara.my', phone: '+60 3-5121 8800', ssm: '201501076543', balance: 'RM 540.00', status: 'Active' },
  { id: '5', name: 'Nurul Boutique', type: 'Customer', email: 'hello@nurulboutique.my', phone: '+60 11-2345 6781', ssm: '202201054321', balance: 'RM 860.00', status: 'Active' },
  { id: '6', name: 'Langkawi Fresh', type: 'Supplier', email: 'billing@langkawifresh.my', phone: '+60 4-966 5566', ssm: '201801033221', balance: 'RM 95.00', status: 'Active' },
  { id: '7', name: 'Seri Mutiara Enterprise', type: 'Customer', email: 'admin@serimutiara.my', phone: '+60 19-887 6543', ssm: '201701011223', balance: 'RM 0.00', status: 'Inactive' },
];

const STATUS_STYLES: Record<ContactStatus, string> = {
  Active: 'bg-emerald-500/15 text-emerald-600',
  Inactive: 'bg-muted text-muted-foreground',
};

/* KPI sparkline trends (whole book) ----------------------------------- */
const SPARK_CUSTOMERS = [70, 72, 75, 77, 79, 81, 82, 84];
const SPARK_SUPPLIERS = [31, 32, 33, 34, 35, 36, 36, 37];
const SPARK_RECEIVABLE = [38, 40, 42, 43, 45, 46, 47, 48];
const SPARK_PAYABLE = [18, 19, 20, 21, 22, 22, 23, 24];

/* Largest open balances across the book (RM) -------------------------- */
const TOP_BALANCES = [
  { label: 'Zaki Enterprise', balance: 3500 },
  { label: 'Lim Hardware', balance: 2300 },
  { label: 'Aisyah Trading', balance: 1240 },
  { label: 'Nurul Boutique', balance: 860 },
  { label: 'Nusantara Logistics', balance: 540 },
];
const BALANCE_SERIES: Series[] = [
  { key: 'balance', label: 'Open balance (RM)', color: 'var(--chart-1)' },
];

/* Open exposure split (RM) -------------------------------------------- */
const EXPOSURE: Slice[] = [
  { key: 'receivable', label: 'Receivable', value: 48200, color: 'var(--chart-1)' },
  { key: 'payable', label: 'Payable', value: 23600, color: 'var(--chart-4)' },
];

/* ------------------------------------------------------------------ */

export default function CustomersSuppliersScreen() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const rows = filterRows(CONTACTS, query, (c) => `${c.name} ${c.email} ${c.ssm}`, { type });

  return (
    <ScreenContainer>
      <PageHeader
        title="Customers & Suppliers"
        subtitle="Your contacts for billing & procurement, Saudara."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            Add Contact
          </Button>
        }
      />

      <BentoGrid>
        {/* KPI row */}
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat
            label="Customers"
            value="84"
            delta="+6"
            onPrimary
            chart={
              <Sparkline
                data={SPARK_CUSTOMERS}
                color="var(--primary-foreground)"
                height={36}
              />
            }
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Suppliers"
            value="37"
            delta="+2"
            deltaTone="flat"
            chart={<Sparkline data={SPARK_SUPPLIERS} color="var(--chart-2)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Receivable"
            value="RM 48.2k"
            delta="+RM 5.1k"
            deltaTone="up"
            chart={<Sparkline data={SPARK_RECEIVABLE} color="var(--chart-1)" height={36} />}
          />
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat
            label="Payable"
            value="RM 23.6k"
            delta="+RM 2.3k"
            deltaTone="down"
            chart={<Sparkline data={SPARK_PAYABLE} color="var(--chart-4)" height={36} />}
          />
        </BentoCard>

        {/* Top balances + exposure split */}
        <BentoCard
          title="Largest open balances"
          subtitle="Customers & suppliers · RM"
          icon={BarChart3}
          className="col-span-2 md:col-span-8"
        >
          <BarGroup
            data={TOP_BALANCES}
            series={BALANCE_SERIES}
            horizontal
            height={240}
          />
        </BentoCard>
        <BentoCard
          title="Open exposure"
          subtitle="Receivable vs payable"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          <DonutStat
            data={EXPOSURE}
            height={240}
            centerValue="RM 71.8k"
            centerLabel="open"
          />
        </BentoCard>

        {/* Contacts table */}
        <BentoCard
          title="All contacts"
          subtitle="Recent activity across your book"
          icon={Users}
          flush
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search contacts…"
                placeholder="Search contacts…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="size-4" />
              Filter
            </Button>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Customer">Customers</SelectItem>
                <SelectItem value="Supplier">Suppliers</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="ml-auto">
              Statements
              <ChevronDown className="size-4" />
            </Button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>SSM No.</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <NoMatchesRow colSpan={7} />}
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {c.name.charAt(0)}
                        </span>
                        <span className="whitespace-nowrap font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.type}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{c.ssm}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{c.phone}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {c.balance}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {c.type === 'Customer' ? 'owed' : 'payable'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <LiveDot active={c.status === 'Active'} />
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            STATUS_STYLES[c.status],
                          )}
                        >
                          {c.status}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Showing {rows.length} of 121 contacts
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
