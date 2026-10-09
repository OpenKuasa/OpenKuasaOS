import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { requireAccess } from '@/lib/auth/viewer';

type Status = 'Paid' | 'Failed' | 'Pending';

type Txn = {
  date: string;
  description: string;
  invoice: string;
  amount: string;
  method: string;
  status: Status;
};

const STATS = [
  { value: 'RM 3,588', label: 'Spent (YTD)' },
  { value: 'RM 299', label: 'This month' },
  { value: '28 Oct', label: 'Next charge' },
];

const TXNS: Txn[] = [
  { date: '28 Sep 2026', description: 'Growth plan — Sep 2026', invoice: 'INV-2026-0912', amount: 'RM 299.00', method: 'Card •••• 4242', status: 'Paid' },
  { date: '24 Sep 2026', description: 'WhatsApp API add-on', invoice: 'INV-2026-0908', amount: 'RM 49.00', method: 'Card •••• 4242', status: 'Paid' },
  { date: '15 Sep 2026', description: 'Credit top-up', invoice: 'INV-2026-0897', amount: 'RM 100.00', method: 'FPX', status: 'Paid' },
  { date: '02 Sep 2026', description: 'e-Invoice LHDN add-on', invoice: 'INV-2026-0881', amount: 'RM 39.00', method: 'Card •••• 4242', status: 'Failed' },
  { date: '28 Aug 2026', description: 'Growth plan — Aug 2026', invoice: 'INV-2026-0843', amount: 'RM 299.00', method: 'Card •••• 4242', status: 'Paid' },
  { date: '20 Aug 2026', description: 'Extra Credits add-on', invoice: 'INV-2026-0829', amount: 'RM 29.00', method: 'FPX', status: 'Paid' },
  { date: '28 Jul 2026', description: 'Growth plan — Jul 2026', invoice: 'INV-2026-0790', amount: 'RM 299.00', method: 'Card •••• 4242', status: 'Paid' },
  { date: '10 Jul 2026', description: 'Credit top-up', invoice: 'INV-2026-0774', amount: 'RM 100.00', method: 'FPX', status: 'Paid' },
];

const STATUS_STYLES: Record<Status, string> = {
  Paid: 'bg-emerald-500/15 text-emerald-600',
  Pending: 'bg-amber-500/15 text-amber-600',
  Failed: 'bg-red-500/15 text-red-600',
};

export default async function TransactionsPage() {
  await requireAccess('manage-billing');

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Transaction records
          </h1>
          <p className="text-sm text-muted-foreground">Your billing history.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Download />
            Download all
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TXNS.map((t) => (
                <TableRow key={t.invoice}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {t.date}
                  </TableCell>
                  <TableCell className="font-medium">{t.description}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.invoice}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {t.amount}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.method}</Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        STATUS_STYLES[t.status],
                      )}
                    >
                      {t.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <Download />
                      Invoice
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
