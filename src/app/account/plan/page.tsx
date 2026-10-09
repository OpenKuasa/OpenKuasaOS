import { CircleCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { requireAccess } from '@/lib/auth/viewer';

type Plan = {
  name: string;
  price: string;
  current?: boolean;
  cta: string;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'RM 99',
    cta: 'Downgrade',
    features: [
      'Up to 3 seats',
      '2 platforms',
      '1,000 AI credits / month',
      'Email support',
      'Basic reports',
    ],
  },
  {
    name: 'Growth',
    price: 'RM 299',
    current: true,
    cta: 'Current plan',
    features: [
      'Up to 10 seats',
      '5 platforms',
      '10,000 AI credits / month',
      'Chat support',
      'Advanced reports',
    ],
  },
  {
    name: 'Scale',
    price: 'RM 599',
    cta: 'Upgrade',
    features: [
      'Unlimited seats',
      'All platforms',
      '50,000 AI credits / month',
      'Priority support',
      'Custom integrations',
    ],
  },
];

export default async function PlanPage() {
  await requireAccess('manage-billing');

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Change plan</h1>
        <p className="text-sm text-muted-foreground">
          Pick the plan that fits your business.
        </p>
      </div>

      <div className="mb-6 inline-flex rounded-full border p-1">
        <button
          type="button"
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Monthly
        </button>
        <button
          type="button"
          className="rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground"
        >
          Yearly −20%
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.name} className={cn(p.current && 'border-primary')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{p.name}</span>
                {p.current && <Badge>Current</Badge>}
              </CardTitle>
              <p className="text-2xl font-bold">
                {p.price}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  / mo
                </span>
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CircleCheck className="size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" disabled={p.current}>
                {p.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
