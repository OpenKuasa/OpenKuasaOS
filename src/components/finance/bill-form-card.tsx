'use client';

import { type FormEvent, useId, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { BentoCard } from '@/components/bento/bento';
import { LineItemsEditor } from '@/components/finance/line-items-editor';
import { useFinanceAction } from '@/components/finance/use-finance-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  billFormError,
  billFormFromDetail,
  billPayload,
  newBillForm,
  savedNotPosted,
  withBillDate,
  withDueDate,
  withSupplier,
} from '@/lib/finance/bill-form';
import type { BillDetail, SaveAndPostResult } from '@/lib/finance/bills';
import type { FinanceContact } from '@/lib/finance/contacts';
import type { FinanceProduct } from '@/lib/finance/products';
import type { FinResult } from '@/lib/finance/result';

export type BillFormActions = {
  save: (input: unknown) => Promise<FinResult<{ id: string }>>;
  saveAndPost: (input: unknown) => Promise<SaveAndPostResult>;
};

type SupplierOption = Pick<FinanceContact, 'id' | 'name' | 'payment_terms_days'>;

/**
 * A new bill, or a draft being changed (`editing`). Saved as a draft, or saved
 * and posted in one go. The rules are in src/lib/finance/bill-form.ts.
 */
export function BillFormCard({
  editing,
  suppliers,
  products,
  today,
  actions,
  onClose,
}: {
  /** The draft being changed, with its lines; absent for a new bill. */
  editing?: BillDetail;
  /** Active suppliers, by name. */
  suppliers: FinanceContact[];
  /** Active products and services. */
  products: FinanceProduct[];
  /** The default bill date, YYYY-MM-DD. */
  today: string;
  actions: BillFormActions;
  onClose: () => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => (editing ? billFormFromDetail(editing) : newBillForm(today, 'new-0')));
  const [posting, setPosting] = useState(false);
  const save = useFinanceAction();

  // A supplier archived since the draft was saved is still this bill's supplier.
  const options: SupplierOption[] =
    editing && !suppliers.some((s) => s.id === editing.supplier_id)
      ? [{ id: editing.supplier_id, name: editing.supplier_name, payment_terms_days: 0 }, ...suppliers]
      : suppliers;
  const terms = options.find((s) => s.id === form.supplier_id)?.payment_terms_days;

  const send = (post: boolean) => {
    const problem = billFormError(form, post);
    if (problem) {
      save.fail(problem);
      return;
    }
    const payload = billPayload(form);
    setPosting(post);
    if (!post) {
      save.run(() => actions.save(payload), onClose);
      return;
    }
    save.run(async () => {
      const result = await actions.saveAndPost(payload);
      // Saved but not posted: go on editing that draft, so a second try does not save a second bill.
      if (!result.ok && result.draftId) {
        const draftId = result.draftId;
        setForm((f) => ({ ...f, id: draftId }));
        return { ...result, error: savedNotPosted(result.error) };
      }
      return result;
    }, onClose);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    // Handled here rather than as a form action, so a refused form keeps what was typed.
    event.preventDefault();
    send(false);
  };

  const title = form.id ? 'Edit bill' : 'New bill';
  const subtitle = form.id ? 'A draft: it gets its number when it is posted' : 'Saved as a draft until it is posted';

  if (options.length === 0) {
    return (
      <BentoCard title={title} subtitle={subtitle} icon={Plus} className="col-span-2 md:col-span-12">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Add a supplier under{' '}
            <Link href="/finance/customers-suppliers" className="font-medium text-primary underline-offset-4 hover:underline">
              Customers &amp; Suppliers
            </Link>{' '}
            first.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onClose} autoFocus data-finance-focus>
            Close
          </Button>
        </div>
      </BentoCard>
    );
  }

  return (
    <BentoCard title={title} subtitle={subtitle} icon={form.id ? FileText : Plus} className="col-span-2 md:col-span-12">
      <form onSubmit={submit} noValidate className="grid gap-3 md:grid-cols-12">
        <div className="space-y-1.5 md:col-span-4">
          <Label htmlFor={`${id}-supplier`}>Supplier</Label>
          <Select
            value={form.supplier_id}
            onValueChange={(v) => {
              const supplier = options.find((s) => s.id === v);
              if (supplier) setForm((f) => withSupplier(f, supplier));
            }}
          >
            <SelectTrigger id={`${id}-supplier`} className="w-full" autoFocus data-finance-focus>
              <SelectValue placeholder="Choose a supplier" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${id}-ref`}>Supplier&rsquo;s reference</Label>
          <Input
            id={`${id}-ref`}
            value={form.supplier_ref}
            maxLength={200}
            placeholder="Their invoice no."
            autoComplete="off"
            onChange={(e) => setForm((f) => ({ ...f, supplier_ref: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-date`}>Bill date</Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={form.bill_date}
            required
            onChange={(e) => setForm((f) => withBillDate(f, e.target.value, terms))}
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor={`${id}-due`}>Due date</Label>
          <Input
            id={`${id}-due`}
            type="date"
            value={form.due_date}
            min={form.bill_date || undefined}
            required
            onChange={(e) => setForm((f) => withDueDate(f, e.target.value))}
          />
        </div>

        <fieldset
          className="space-y-2 md:col-span-12"
          // Enter in a line's box moves on like any other key; it does not save the bill half typed.
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
          }}
        >
          <legend className="text-sm font-medium leading-none">Lines</legend>
          <LineItemsEditor lines={form.lines} products={products} onChange={(lines) => setForm((f) => ({ ...f, lines }))} />
        </fieldset>

        <div className="space-y-1.5 md:col-span-12">
          <Label htmlFor={`${id}-notes`}>Notes</Label>
          <Input
            id={`${id}-notes`}
            value={form.notes}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 md:col-span-12">
          <Button type="submit" size="sm" variant="outline" disabled={save.pending}>
            {save.pending && !posting ? 'Saving…' : 'Save draft'}
          </Button>
          <Button type="button" size="sm" disabled={save.pending} onClick={() => send(true)}>
            {save.pending && posting ? 'Posting…' : 'Save and post'}
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
