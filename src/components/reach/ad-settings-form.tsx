'use client';

import { useState, useTransition } from 'react';
import { Bell, Wallet, Zap } from 'lucide-react';
import type { AdSettings } from '@/lib/reach/types';
import { updateAdSettingsAction } from '@/app/(app)/reach/actions';
import { BentoCard } from '@/components/bento/bento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type ToggleRow = {
  id: string;
  label: string;
  description?: string;
};

const AUTOMATION: ToggleRow[] = [
  {
    id: 'auto_pause_low_ctr',
    label: 'Pause ads below your CTR threshold',
    description: 'Stop underperforming ads automatically to save budget.',
  },
  {
    id: 'auto_boost_winners',
    label: 'Auto-optimise budget to top performers',
    description: 'Shift spend toward the campaigns with the lowest cost per lead.',
  },
  {
    id: 'daily_budget_guard',
    label: 'Stop spend at your daily budget cap',
  },
];

const NOTIFICATIONS: ToggleRow[] = [
  { id: 'spend_alerts', label: 'Alert me on budget overspend' },
  { id: 'weekly_summary', label: 'Email me a weekly performance summary' },
];

const CURRENCIES = [
  { value: 'MYR', label: 'Malaysian Ringgit (RM)' },
  { value: 'SGD', label: 'Singapore Dollar (S$)' },
  { value: 'USD', label: 'US Dollar ($)' },
];

function seedToggles(rows: ToggleRow[], saved: Record<string, boolean> | undefined) {
  return Object.fromEntries(rows.map((r) => [r.id, saved?.[r.id] === true]));
}

function capToInput(cents: number | null | undefined) {
  return cents == null ? '' : (cents / 100).toString();
}

function inputToCap(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function AdSettingsForm({
  settings,
  canEdit,
}: {
  settings: AdSettings | null;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [daily, setDaily] = useState(capToInput(settings?.daily_cap_cents));
  const [monthly, setMonthly] = useState(capToInput(settings?.monthly_cap_cents));
  const [currency, setCurrency] = useState(settings?.currency ?? 'MYR');
  const [automation, setAutomation] = useState(() =>
    seedToggles(AUTOMATION, settings?.automation),
  );
  const [notifications, setNotifications] = useState(() =>
    seedToggles(NOTIFICATIONS, settings?.notifications),
  );

  const disabled = !canEdit || pending;
  const currencies = CURRENCIES.some((c) => c.value === currency)
    ? CURRENCIES
    : [...CURRENCIES, { value: currency, label: currency }];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaved(false);
    start(async () => {
      try {
        const res = await updateAdSettingsAction({
          daily_cap_cents: inputToCap(daily),
          monthly_cap_cents: inputToCap(monthly),
          currency,
          automation,
          notifications,
        });
        setError(res.ok ? null : (res.error ?? 'Something went wrong.'));
        setSaved(res.ok);
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  }

  function renderToggles(
    rows: ToggleRow[],
    values: Record<string, boolean>,
    set: (next: Record<string, boolean>) => void,
  ) {
    return rows.map((row) => (
      <div key={row.id} className="flex items-start justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label htmlFor={`setting-${row.id}`} className="font-medium">
            {row.label}
          </Label>
          {row.description ? (
            <p className="text-sm text-muted-foreground">{row.description}</p>
          ) : null}
        </div>
        <Switch
          id={`setting-${row.id}`}
          checked={values[row.id] ?? false}
          disabled={disabled}
          onCheckedChange={(checked) => set({ ...values, [row.id]: checked })}
        />
      </div>
    ));
  }

  return (
    <form className="contents" onSubmit={onSubmit}>
      <BentoCard
        title="Budget & spend"
        subtitle="Caps apply across all active campaigns"
        icon={Wallet}
        className="col-span-2 md:col-span-6"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="daily-cap">Daily budget cap (RM)</Label>
              <Input
                id="daily-cap"
                type="number"
                min="0"
                step="0.01"
                placeholder="No cap"
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-cap">Monthly cap (RM)</Label>
              <Input
                id="monthly-cap"
                type="number"
                min="0"
                step="0.01"
                placeholder="No cap"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={disabled}>
              <SelectTrigger id="currency" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </BentoCard>

      <BentoCard
        title="Automation"
        subtitle="Let Jebat optimise while you sleep"
        icon={Zap}
        className="col-span-2 md:col-span-6"
      >
        {renderToggles(AUTOMATION, automation, setAutomation)}
      </BentoCard>

      <BentoCard
        title="Notifications"
        subtitle="Stay in the loop on spend & performance"
        icon={Bell}
        className="col-span-2 md:col-span-6"
      >
        {renderToggles(NOTIFICATIONS, notifications, setNotifications)}
      </BentoCard>

      {canEdit && (
        <div className="col-span-2 flex items-center justify-end gap-3 md:col-span-12">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && !error && !pending && (
            <p role="status" className="text-sm text-muted-foreground">
              Saved
            </p>
          )}
          <Button type="submit" disabled={pending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
