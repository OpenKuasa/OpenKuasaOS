'use client';

import { type FormEvent, useId, useState } from 'react';
import { Banknote } from 'lucide-react';
import { BentoCard } from '@/components/bento/bento';
import { useFinanceAction } from '@/components/finance/use-finance-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rm } from '@/lib/finance/format';
import { type FinanceAccount, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/finance/money';
import {
  type PayableBill,
  billsOf,
  chooseSupplier,
  keepPayable,
  newPaymentForm,
  paymentFormError,
  paymentPayload,
  paymentSuppliers,
  paymentTotal,
  toggleAll,
  toggleBill,
} from '@/lib/finance/payment-form';
import { displayDate } from '@/lib/finance/purchase-views';
import type { FinResult } from '@/lib/finance/result';

export type RecordPayment = (input: unknown) => Promise<FinResult<{ id: string }>>;

/**
 * Records a payment to one supplier, split across their open bills, paid now
 * or scheduled. Used on Payments Out, and on Supplier Bills from a bill's Pay
 * choice (`preselect`). The rules are in src/lib/finance/payment-form.ts.
 */
export function PaymentFormCard({
  payable,
  accounts,
  today,
  preselect,
  record,
  onClose,
}: {
  /** Every bill that can still take a payment, from `payableBills`. */
  payable: PayableBill[];
  accounts: FinanceAccount[];
  /** The default payment date, YYYY-MM-DD. */
  today: string;
  /** Opened from a bill row: that supplier chosen and that bill ticked. */
  preselect?: { supplierId: string; billId: string };
  record: RecordPayment;
  onClose: () => void;
}) {
  const id = useId();
  const [typed, setForm] = useState(() => newPaymentForm(payable, accounts, today, preselect));
  const save = useFinanceAction();

  const suppliers = paymentSuppliers(payable);
  // A ticked bill that was paid off since a refresh is dropped from everything below.
  const form = keepPayable(typed, payable);
  const bills = billsOf(payable, form.supplierId);
  const tickedCount = Object.keys(form.amounts).length;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // Handled here rather than as a form action, so a refused form keeps what was typed.
    event.preventDefault();
    const problem = paymentFormError(form, payable);
    if (problem) {
      save.fail(problem);
      return;
    }
    save.run(() => record(paymentPayload(form)), onClose);
  };

  if (suppliers.length === 0) {
    return (
      <BentoCard
        title="Record payment"
        subtitle="Pay a supplier's bills, now or later"
        icon={Banknote}
        className="col-span-2 md:col-span-12"
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            There is no bill to pay. A bill can be paid once it is posted, and until payments cover it in full.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onClose} autoFocus data-finance-focus>
            Close
          </Button>
        </div>
      </BentoCard>
    );
  }

  return (
    <BentoCard
      title="Record payment"
      subtitle="Pay a supplier's bills, now or later"
      icon={Banknote}
      className="col-span-2 md:col-span-12"
    >
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-12">
        <div className="space-y-1.5 md:col-span-5">
          <Label htmlFor={`${id}-supplier`}>Supplier</Label>
          <Select value={form.supplierId} onValueChange={(v) => setForm((f) => chooseSupplier(f, v))}>
            <SelectTrigger id={`${id}-supplier`} className="w-full" autoFocus data-finance-focus>
              <SelectValue placeholder="Choose a supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.bills} open)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-1.5 md:col-span-12">
          <legend className="text-sm font-medium leading-none">Bills to pay</legend>
          {bills.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Choose a supplier to see their open bills.
            </p>
          ) : (
            // Twenty open bills scroll inside the card rather than pushing the buttons off the page.
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {bills.map((b) => {
                const ticked = b.id in form.amounts;
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                    <label className="flex min-w-0 flex-1 basis-56 items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={ticked}
                        onChange={(e) => setForm((f) => toggleBill(f, b, e.target.checked))}
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{b.bill_no}</span>
                        <span className={b.overdue ? 'ml-2 text-red-600' : 'ml-2 text-muted-foreground'}>
                          {b.overdue ? 'Overdue since' : 'Due'} {displayDate(b.due_date)}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {rm(b.payable)} to pay
                          {b.scheduled > 0 ? ` · ${rm(b.scheduled)} of ${rm(b.balance)} already scheduled` : ''}
                        </span>
                      </span>
                    </label>
                    {ticked ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground" aria-hidden>
                          RM
                        </span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          aria-label={`Amount to pay on ${b.bill_no}`}
                          className="w-32 text-right tabular-nums"
                          onWheel={(e) => e.currentTarget.blur()}
                          // Enter in an amount box does not record the payment half typed.
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.preventDefault();
                          }}
                          value={form.amounts[b.id]}
                          onChange={(e) => setForm((f) => ({ ...f, amounts: { ...f.amounts, [b.id]: e.target.value } }))}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" aria-live="polite">
              Total <span className="font-semibold tabular-nums">{rm(paymentTotal(form))}</span>
              {tickedCount ? (
                <span className="text-muted-foreground">
                  {' '}
                  across {tickedCount} {tickedCount === 1 ? 'bill' : 'bills'}
                </span>
              ) : null}
            </p>
            {bills.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setForm((f) => toggleAll(f, bills, tickedCount < bills.length))}
              >
                {tickedCount < bills.length ? 'Tick all' : 'Clear all'}
              </Button>
            ) : null}
          </div>
        </fieldset>

        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-account`}>Paid from</Label>
          <Select value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))}>
            <SelectTrigger id={`${id}-account`} className="w-full">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.bank_name ? ` · ${a.bank_name}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-date`}>{form.scheduled ? 'Planned date' : 'Date paid'}</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={form.date}
            required
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-method`}>Method</Label>
          <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v as PaymentMethod }))}>
            <SelectTrigger id={`${id}-method`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-reference`}>Reference</Label>
          <Input
            id={`${id}-reference`}
            value={form.reference}
            maxLength={200}
            placeholder="Bank reference or cheque no."
            autoComplete="off"
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 md:col-span-7">
          <Label htmlFor={`${id}-notes`}>Notes</Label>
          <Input
            id={`${id}-notes`}
            value={form.notes}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <fieldset className="space-y-1.5 md:col-span-5">
          <legend className="text-sm font-medium leading-none">When</legend>
          <div className="flex h-8 flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-when`}
                className="size-4 accent-primary"
                checked={!form.scheduled}
                onChange={() => setForm((f) => ({ ...f, scheduled: false }))}
              />
              Pay now
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-when`}
                className="size-4 accent-primary"
                checked={form.scheduled}
                onChange={() => setForm((f) => ({ ...f, scheduled: true }))}
              />
              Schedule for later
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 md:col-span-12">
          <Button type="submit" size="sm" disabled={save.pending}>
            {save.pending ? 'Saving…' : form.scheduled ? 'Schedule payment' : 'Record payment'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={save.pending}>
            Cancel
          </Button>
          {save.error ? (
            <p role="alert" className="text-sm text-destructive">
              {save.error}
            </p>
          ) : null}
        </div>
      </form>
    </BentoCard>
  );
}
