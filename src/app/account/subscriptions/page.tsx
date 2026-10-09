import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

type Row = {
  platform: string;
  plan: string;
  seats: string;
  price: string;
  status: 'Active' | 'Inactive';
  next: string;
};

const ROWS: Row[] = [
  { platform: 'Reach', plan: 'Growth', seats: '3', price: 'RM 99', status: 'Active', next: '28 Oct' },
  { platform: 'CRM', plan: 'Growth', seats: '3', price: 'RM 99', status: 'Active', next: '28 Oct' },
  { platform: 'People', plan: 'Starter', seats: '5', price: 'RM 59', status: 'Active', next: '28 Oct' },
  { platform: 'Recruit', plan: '—', seats: '0', price: 'RM 0', status: 'Inactive', next: '—' },
  { platform: 'Finance', plan: 'Growth', seats: '2', price: 'RM 79', status: 'Active', next: '28 Oct' },
  { platform: 'Command', plan: 'Included', seats: '—', price: 'RM 0', status: 'Active', next: '—' },
];

export default async function SubscriptionsPage() {
  await requireAccess('manage-billing');

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">My Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Your active plans and billing.
        </p>
      </div>

      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold">Growth plan</p>
            <p className="text-sm text-muted-foreground">
              RM 299 / month · renews 28 Oct 2026
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              Change plan
            </Button>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-lg font-bold">Per-platform</h2>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next billing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((r) => (
                <TableRow key={r.platform}>
                  <TableCell className="font-semibold">{r.platform}</TableCell>
                  <TableCell>{r.plan}</TableCell>
                  <TableCell>{r.seats}</TableCell>
                  <TableCell>{r.price}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        r.status === 'Active'
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.next}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
