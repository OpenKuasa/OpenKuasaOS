'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { filterRows } from '@/components/screen/table-filter';
import { LiveDot } from '@/components/ui/live-dot';
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
import type { Bill, BillStatus } from '@/lib/finance/purchases';
import { cn } from '@/lib/utils';

const COLUMNS = ['No.', 'Date', 'Supplier', 'Due', 'Total', 'Balance', 'Status'];
const TABLE_ROWS = 10;

const STATUS_STYLES: Record<BillStatus, string> = {
  Paid: 'bg-emerald-500/15 text-emerald-600',
  Pending: 'bg-amber-500/15 text-amber-600',
  Overdue: 'bg-red-500/15 text-red-600',
  Draft: 'bg-muted text-muted-foreground',
};

function StatusPill({ status }: { status: BillStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

/** Filters run in the browser over every bill the screen loaded. */
export function SupplierBillsTable({ bills, billCount }: { bills: Bill[]; billCount: number }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const filtering = query.trim() !== '' || status !== 'all';
  const matches = filterRows(bills, query, (b) => `${b.id} ${b.supplier}`, { status });
  const shown = matches.slice(0, TABLE_ROWS);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search bills or suppliers"
            placeholder="Search bills or suppliers…"
            className="w-full pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Overdue">Overdue</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {COLUMNS.map((c) => (
                <TableHead key={c} className="whitespace-nowrap">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {filtering ? 'No bills match your search.' : 'No supplier bills yet.'}
                </TableCell>
              </TableRow>
            )}
            {shown.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.id}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {b.date}
                </TableCell>
                <TableCell className="whitespace-nowrap">{b.supplier}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {b.due}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {b.total}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {b.balance}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <LiveDot active={b.status === 'Paid'} />
                    <StatusPill status={b.status} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
        <span>
          {filtering
            ? `Showing ${shown.length} of ${matches.length} matching bills`
            : `Showing ${shown.length} of ${billCount} bills`}
        </span>
      </div>
    </>
  );
}
