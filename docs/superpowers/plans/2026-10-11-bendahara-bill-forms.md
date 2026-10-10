# Bendahara Bill and Payment Forms Implementation Plan (stage 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 2b of the Bendahara CRUD spec: the two live, read-only screens Supplier Bills and Payments Out get their forms and actions (new bill with line items, edit, post, pay, void, delete; record, schedule, mark paid, void and delete a payment; search, filters, "View all" and CSV export), on the data layer and database that stage 2a shipped.

**Architecture:** Each screen file under `src/screens/finance/` stays the default-exported async server component: it reads with the existing list functions and passes a `'use client'` view its rows and, only when the viewer may edit, the server actions and the lists the forms offer, exactly as `customers-suppliers.tsx` and `contacts-view.tsx` do. Everything that can be decided without a browser (KPI figures, filters, CSV text, bill arithmetic, what each form defaults to, what is wrong with it and what it sends) is a pure function in `src/lib/finance/` with unit tests; the components only draw it. No database migration.

**Tech Stack:** Next.js 16.3 App Router (server components, server actions), React 19, Tailwind v4, shadcn/Radix, Supabase Postgres with RLS, Zod 4, Vitest (node, no DOM), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-bendahara-crud-design.md`, sections "Screens → Common behaviour", "Purchases", "Code", "Errors", "Testing"; build-order item 2, second half. Backend notes: `docs/bendahara-backend.md`. First half: `docs/superpowers/plans/2026-10-11-bendahara-money.md`.

## Global Constraints

- `org_id` always comes from the server-side context, never from client input.
- One Zod schema per write; messages are sentences a person can act on; every schema's transforms stay idempotent (`tests/finance-schemas.test.ts` pins this: add any new schema to it).
- A posted document cannot be edited or deleted, only voided; a draft has no number. The UI offers only the actions the database will allow for a row's status, except Void on a paid bill, which is offered and explained.
- Forms are cards closed by default; confirmations happen in the page, never `window.confirm` or `alert`; viewers and the demo workspace get no buttons and no menus, and the server actions check again.
- With no Supabase environment the screen shows sample data and no actions.
- A client component never imports from a file that imports `@/lib/supabase/server` or `next/headers`. `bills.ts`, `money.ts`, `contacts.ts`, `products.ts`, `result.ts`, `format.ts`, `purchase-views.ts`, `bill-math.ts`, `csv.ts`, `bill-form.ts` and `payment-form.ts` must stay free of server-only imports.
- A `'use server'` file exports only async functions: no constants, no types, no re-exports.
- Money is shown with `rm()` from `format.ts`; amounts typed by a person are parsed with `Number` (through `typedNumber` in `format.ts`) and never sent as strings.
- Payment method labels come from `PAYMENT_METHOD_LABELS` in `money.ts`; do not define a second map.
- No purple, violet, indigo or fuchsia anywhere. No Kuasa names in `src/`. Icons from lucide-react only.
- `BentoCard`'s `icon` prop is typed `LucideIcon`, but it draws the icon through `AnimatedIcon`, which returns nothing for a name that is not in the `MAP` in `src/components/ui/animated-icon.tsx`. Pass `BentoCard` only these, which are in the map: `FileText`, `Wallet`, `Plus`, `Banknote`, `TrendingUp`, `ChartColumn`, `PieChart`. Icons inside `RowMenu`, `ConfirmRow` and buttons are plain lucide icons and are not limited.
- Radix `SelectItem` throws at runtime for `value=""`. An unchosen `Select` is `value=""` with a `SelectValue placeholder`; "no product" is the sentinel `'none'`, turned back into `''` before it leaves the component.
- pnpm only. 2-space indent, single quotes, semicolons, named exports. The exceptions are the files Next requires a default export from: screen files under `src/screens/finance/` and `src/app/(app)/finance/error.tsx`.
- Vitest runs in node with no DOM: components have no unit tests. Everything that can be a pure function (view builders, bill math, CSV, both forms' defaults, validation and payloads) IS a pure function in `src/lib/finance/` with tests; components stay thin.
- Every task leaves `pnpm exec tsc --noEmit`, `pnpm lint` and the unit tests green. `src/lib/finance/purchases.ts` and `tests/purchases-view.test.ts` stay until Task 7, after both screens have stopped importing them.
- Branch `feat-091-bendahara-bill-forms` (already cut from main; work on it, do not create another); PR title equals the branch name; do not push or merge until asked.
- Implementers never call a database tool and never change the database schema. `tests/bendahara-*.test.ts` may be run (the schema is already applied); they skip themselves when `.env.local` is absent.
- Implementers do not do browser checks and do not start a dev server; the controller checks production after the merge with the smoke account. Each UI task's verification is `pnpm exec tsc --noEmit`, `pnpm lint`, the unit tests and `pnpm build`.

## Not in this stage

Approval of payments. Editing a scheduled payment (delete it and schedule again). Printing or PDF. Managing accounts (Banking, stage 6). Attaching receipts (stage 7). AI tools for finance. Any migration. Refusing an archived account on a payment needs a database change and is left for the Banking stage; `listAccounts` already offers only active accounts, so the form cannot choose one.

## Decisions this plan makes (flag to the owner at handoff)

Each is a place where the plan goes beyond, or differs from, the design it was written to.

1. **A bill already covered by scheduled payments is not offered for payment.** `supplier_bill_totals.balance` subtracts only paid money, but the database refuses (`FIN05`) a payment that, added to scheduled ones, exceeds the bill. So the payment form works from *payable* = balance − scheduled (`payableBills` in `payment-form.ts`), defaults each ticked bill to that, hides bills at 0, and says "RM x of RM y already scheduled" beside a part-scheduled bill. The Pay choice on a bill row is left out when nothing is payable.
2. **The error page calls `retry`, not `reset`.** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` (Next 16.3.8) gives the error component `{ error, retry }` and says: "In most cases, you should use `retry()` instead" of `reset()`. `retry` re-fetches the segment, which is what a failed read needs; `reset` would re-render without re-reading.
3. **"Save and post" answers with the draft's id when only the post was refused.** The return type is `SaveAndPostResult` = `FinResult<{ id; bill_no }> & { draftId?: string }`. Without it, a second press of either button would save a second copy of the bill. The form adopts `draftId` and goes on editing that draft. Also, the form checks the total is above 0 before "Save and post", so the usual cause of a refused post (`FIN10`) is caught before anything is saved.
4. **`getBillAction` also refuses a bill that is no longer a draft** ("This bill is posted and can no longer be changed. Void it instead."), and refreshes the list when the bill is gone or posted. A failed read answers "That could not be loaded. Please try again." (`READ_FAILED`), not the write message.
5. **Two extra pure files: `bill-form.ts` and the helpers in `format.ts` (`typedNumber`).** The design names `payment-form.ts`; the bill form has as many rules, and the same constraint ("components stay thin") applies.
6. **Client-side checks run the real schema.** The forms call `saveBillInput.safeParse` / `recordPaymentOutInput.safeParse` on the payload they are about to send, so the sentences cannot drift from the server's. Only the checks a schema cannot make (an amount above what a bill can take; a total of nothing when posting) are written by hand.
7. **An amount typed with a comma is refused, not interpreted.** Number boxes are `type="number"` like the shipped forms; `typedNumber('1,200.50')` is `null` and the person sees "Enter an amount above 0." rather than a payment of RM 1.
8. **The Payments table's status select has five choices,** "Paid and scheduled" (the default), All, Paid, Scheduled, Void: the default the design asks for has to be one of the choices.
9. **Seven methods, five chart colours.** `--chart-1` to `--chart-5` cover five methods; Cash and Cheque use two fixed `oklch` colours at hues 130 and 55 (a green and a brown). A test keeps every method colour out of the violet range. The "Paid by method" donut is in RM, not RM thousands, so a RM 40 payment is not a zero slice.
10. **The sample views lose their sparklines and hand-written deltas.** With `purchases.ts` gone, the sample is raw rows run through the same builders as live data, as Customers & Suppliers and Products already do. The sample is pinned to 10 Oct 2026 so its month-to-date figures stay populated.
11. **Form dates default to the person's own calendar date** (`localIsoDate`), not UTC: before 08:00 in Malaysia the UTC date is still yesterday. KPI figures keep using the UTC date, as the database does for Overdue.
12. **Pressing Enter in a line item's box does not submit the bill.** Elsewhere in the form Enter saves the draft, as in the shipped forms.

## Review Focus

The inputs most likely to bite a person, each pinned by a test in the task that owns the code, or by a line of the controller's smoke test where only a browser can show it.

1. **A bill that a scheduled payment already covers, wholly or in part.** Expected: a wholly covered bill is not offered; a part-covered one defaults to the remainder and refuses a sen more, in the form, before the database is asked. (Task 4, `tests/finance-payment-form.test.ts`: "takes scheduled payments off what a bill can still take…", "refuses more than a bill can still take, to the sen".)
2. **A draft open in one tab while it is posted or deleted in another.** Expected: saving says the bill is posted (or gone), what was typed stays, and the list behind the form shows the bill as it now is; opening Edit on such a row says so instead of loading a form that cannot be saved. (Task 3, `tests/finance-actions.test.ts`: "refreshes the screens after a refusal too…", "says the bill is locked…", "says the bill is gone…"; smoke step 11.)
3. **A payment split across two bills, acted on from its second row.** Expected: void, delete and mark-as-paid act on the whole payment whichever row is used, the question names the other bills, and the KPI cards count it once. (Task 2, `tests/finance-purchase-views.test.ts`: "says so in a sentence, whichever row the menu was opened from", "counts a payment split across two bills once…"; smoke step 9.)
4. **An exported CSV opened in Excel when a supplier is called `=cmd|calc`, `Lim, Tan & Co` or `林記五金`.** Expected: no formula runs, the comma does not split the column, the Chinese name is readable, and a negative balance is still a number. (Task 1, `tests/finance-csv.test.ts`; Task 2, "writes the bills table, with a formula-looking supplier name made harmless"; smoke step 12.)
5. **An amount typed or pasted as `1,200.50`, and a supplier with twenty open bills.** Expected: the comma'd amount is refused with a sentence and never read as RM 1; twenty bills can be ticked at once and paid in one payment, the list scrolls inside the card, and fifty-one are refused with "One payment can cover at most 50 bills." (Task 1 `typedNumber`; Task 4, "refuses an amount typed with a comma…", "a supplier with many open bills"; smoke step 13 for the scrolling.)

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/finance/result.ts` | (modified) codes and sentences for "not allowed", "too large", "could not be loaded" |
| `src/lib/finance/bills.ts` | (modified) date range, product-id sentence, two refusals, `getBill` on a bad id, `SaveAndPostResult` |
| `src/lib/finance/money.ts` | (modified) two refusals |
| `src/lib/finance/format.ts` | (modified) `typedNumber` |
| `src/lib/finance/bill-math.ts` | Line amounts and bill totals rounded as the database rounds; `addDaysIso`; `localIsoDate` |
| `src/lib/finance/csv.ts` | `toCsv`, `csvFileName` |
| `src/lib/finance/purchase-views.ts` | KPI figures, chart data, filters, split-payment wording and CSV rows for both screens |
| `src/lib/finance/payment-form.ts` | The payment form's rules |
| `src/lib/finance/bill-form.ts` | The bill form's rules |
| `src/app/(app)/finance/actions.ts` | (modified) `run` refreshes after every attempt; ten new actions |
| `src/app/(app)/finance/error.tsx` | Error boundary for every finance screen |
| `src/components/finance/confirm-row.tsx` | (modified) `tone`, `icon`, Escape cancels |
| `src/components/finance/download-csv.ts` | Blob + temporary link |
| `src/components/finance/payment-form-card.tsx` | The payment form, shared by both screens |
| `src/components/finance/payments-view.tsx` | Payments Out client view |
| `src/components/finance/line-items-editor.tsx` | The lines of a bill, with live totals |
| `src/components/finance/bill-form-card.tsx` | The bill form |
| `src/components/finance/bills-view.tsx` | Supplier Bills client view |
| `src/screens/finance/payments-out.tsx`, `src/screens/finance/supplier-bills.tsx` | (replaced) server loaders |
| `src/lib/finance/purchases.ts`, `tests/purchases-view.test.ts` | Deleted in Task 7 |
| `src/config/live-screens.ts`, `docs/bendahara-backend.md` | (modified) no longer say the screens have no forms |
| `tests/finance-touchups.test.ts`, `tests/finance-bill-math.test.ts`, `tests/finance-csv.test.ts`, `tests/finance-purchase-views.test.ts`, `tests/finance-actions.test.ts`, `tests/finance-payment-form.test.ts`, `tests/finance-bill-form.test.ts` | New unit tests |
| `tests/finance-schemas.test.ts` | (modified) more schemas and inputs |

Names used across tasks, spelled once here:

- From `bills.ts`: `BillListRow`, `BillDetail`, `BillLine`, `BillDisplayStatus`, `BILL_MESSAGES`, `BILL_LINES_MAX`, `saveBillInput`, `billIdInput`, `isIsoDate`, `listBills`, `getBill`, `saveBill`, `postBill`, `voidBill`, `deleteBill`, and new `SaveAndPostResult`.
- From `money.ts`: `PaymentOutRow`, `FinanceAccount`, `PaymentMethod`, `PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, `PAYMENT_BILLS_MAX`, `MONEY_MESSAGES`, `recordPaymentOutInput`, `markPaymentPaidInput`, `paymentIdInput`, `listAccounts`, `listPaymentsOut`, `recordPaymentOut`, `markPaymentPaid`, `voidPayment`, `deleteScheduledPayment`.
- A payment row's `status` is `'posted'` when paid; the screen words it "Paid". A bill row's `display_status` is one of `draft`, `pending`, `overdue`, `paid`, `void`.

---

### Task 1: Data-layer touch-ups, bill arithmetic and CSV

**Files:**
- Modify: `src/lib/finance/result.ts`
- Modify: `src/lib/finance/bills.ts`
- Modify: `src/lib/finance/money.ts`
- Modify: `src/lib/finance/format.ts`
- Create: `src/lib/finance/bill-math.ts`
- Create: `src/lib/finance/csv.ts`
- Create: `tests/finance-touchups.test.ts`
- Create: `tests/finance-bill-math.test.ts`
- Create: `tests/finance-csv.test.ts`
- Modify: `tests/finance-schemas.test.ts`

**Interfaces:**
- Consumes: `saveBillInput`, `billIdInput`, `isIsoDate`, `getBill` and the four bill writes from `@/lib/finance/bills`; `recordPaymentOutInput` and the four payment writes from `@/lib/finance/money`; `FinanceWriteContext` from `@/lib/finance/result`.
- Produces:
  - `@/lib/finance/result`: `PG_FORBIDDEN = '42501'`, `PG_OUT_OF_RANGE = '22003'`, `NOT_ALLOWED = 'You do not have permission to make changes here.'`, `TOO_LARGE = 'That amount is too large.'`, `READ_FAILED = 'That could not be loaded. Please try again.'`
  - `@/lib/finance/bills`: `BILL_MESSAGES.product = 'Choose a product from the list, or leave it empty.'`; `isIsoDate` refuses years outside 1900–2200; `getBill(ctx, id)` returns `null` for an id that is not a uuid; both refusal maps answer `42501` and `22003`.
  - `@/lib/finance/format`: `typedNumber(value: string): number | null`
  - `@/lib/finance/bill-math`: `type LineNumbers = { quantity: number; unit_price: number; sst_rate: number }`, `type LineAmounts = { amount: number; sst: number }`, `type BillTotals = { subtotal: number; sst: number; total: number }`, `lineAmounts(line: LineNumbers): LineAmounts`, `billTotals(lines: LineNumbers[]): BillTotals`, `addDaysIso(iso: string, days: number): string`, `localIsoDate(now: Date): string`
  - `@/lib/finance/csv`: `CSV_BOM`, `type CsvValue = string | number | null`, `toCsv(headers: string[], rows: CsvValue[][]): string`, `csvFileName(prefix: string, today: string): string`

`voidPayment` is not changed. The database already refuses to void a payment that was never paid (`FIN09`), and the screen will offer Void only on paid rows and Delete only on scheduled ones.

- [ ] **Step 1: Write the failing tests for the touch-ups**

Create `tests/finance-touchups.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteBill, getBill, isIsoDate, postBill, saveBill, saveBillInput, voidBill } from '@/lib/finance/bills';
import { typedNumber } from '@/lib/finance/format';
import {
  deleteScheduledPayment,
  markPaymentPaid,
  recordPaymentOut,
  recordPaymentOutInput,
  voidPayment,
} from '@/lib/finance/money';
import type { FinanceWriteContext } from '@/lib/finance/result';

const ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER = '44444444-4444-4444-8444-444444444444';
const ACCOUNT = '66666666-6666-4666-8666-666666666666';

/** Answers every request with the same canned result and counts the requests. */
function fakeClient(answer: { data: unknown; error: unknown }) {
  let requests = 0;
  const builder = {
    select: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: async () => answer,
    then: (resolve: (value: typeof answer) => void) => resolve(answer),
  };
  const client = {
    rpc: async () => {
      requests += 1;
      return answer;
    },
    from: () => {
      requests += 1;
      return builder;
    },
  };
  return { ctx: { client: client as never, orgId: 'org-1' } satisfies FinanceWriteContext, requests: () => requests };
}

const line = { description: 'Gloves', quantity: 10, unit_price: 12.5 };
const bill = { supplier_id: SUPPLIER, bill_date: '2026-10-01', due_date: '2026-10-31', lines: [line] };
const payment = {
  account_id: ACCOUNT,
  txn_date: '2026-10-05',
  method: 'fpx' as const,
  allocations: [{ bill_id: ID, amount: 100 }],
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
});

describe('isIsoDate', () => {
  it('accepts real dates from 1900 to 2200', () => {
    expect(isIsoDate('1900-01-01')).toBe(true);
    expect(isIsoDate('2026-10-11')).toBe(true);
    expect(isIsoDate('2200-12-31')).toBe(true);
  });
  it('refuses a year a slipped key produces', () => {
    expect(isIsoDate('0202-10-11')).toBe(false);
    expect(isIsoDate('1899-12-31')).toBe(false);
    expect(isIsoDate('2201-01-01')).toBe(false);
    expect(isIsoDate('9999-12-31')).toBe(false);
  });
  it('still refuses dates that are not on the calendar', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('11/10/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
  it('is the rule for bill dates and payment dates alike', () => {
    expect(saveBillInput.safeParse({ ...bill, bill_date: '0202-10-01' }).error?.issues[0]?.message).toBe('Enter a valid date.');
    expect(recordPaymentOutInput.safeParse({ ...payment, txn_date: '2201-01-01' }).error?.issues[0]?.message).toBe(
      'Enter a valid date.',
    );
  });
});

describe('a product id on a bill line', () => {
  const first = (product_id: unknown) =>
    saveBillInput.safeParse({ ...bill, lines: [{ ...line, product_id }] }).error?.issues[0]?.message;

  it('says what to do when it is not an id', () => {
    expect(first('not-an-id')).toBe('Choose a product from the list, or leave it empty.');
    expect(first(42)).toBe('Choose a product from the list, or leave it empty.');
  });
  it('still takes an id, an empty string or nothing', () => {
    expect(first(ID)).toBeUndefined();
    expect(first('')).toBeUndefined();
    expect(first(null)).toBeUndefined();
    expect(first(undefined)).toBeUndefined();
  });
});

describe('getBill', () => {
  it('answers null for an id that is not an id, without asking the database', async () => {
    const { ctx, requests } = fakeClient({ data: null, error: { code: '22P02' } });
    expect(await getBill(ctx, 'not-an-id')).toBeNull();
    expect(await getBill(ctx, '')).toBeNull();
    expect(requests()).toBe(0);
  });
  it('answers null when the bill is not in this workspace', async () => {
    const { ctx, requests } = fakeClient({ data: null, error: null });
    expect(await getBill(ctx, ID)).toBeNull();
    expect(requests()).toBe(1);
  });
});

describe('refusals every finance write can meet', () => {
  const cases: [string, string][] = [
    ['42501', 'You do not have permission to make changes here.'],
    ['22003', 'That amount is too large.'],
  ];

  it('become sentences on bills', async () => {
    for (const [code, message] of cases) {
      const { ctx } = fakeClient({ data: null, error: { code } });
      expect(await saveBill(ctx, bill), code).toEqual({ ok: false, error: message });
      expect(await postBill(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
      expect(await voidBill(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
      expect(await deleteBill(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
    }
    expect(logged).not.toHaveBeenCalled();
  });

  it('become sentences on payments', async () => {
    for (const [code, message] of cases) {
      const { ctx } = fakeClient({ data: null, error: { code } });
      expect(await recordPaymentOut(ctx, payment), code).toEqual({ ok: false, error: message });
      expect(await markPaymentPaid(ctx, { id: ID, paid_on: '2026-10-09' }), code).toEqual({ ok: false, error: message });
      expect(await voidPayment(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
      expect(await deleteScheduledPayment(ctx, { id: ID }), code).toEqual({ ok: false, error: message });
    }
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('typedNumber', () => {
  it('reads plain numbers', () => {
    expect(typedNumber('1200.50')).toBe(1200.5);
    expect(typedNumber(' 12 ')).toBe(12);
    expect(typedNumber('0')).toBe(0);
    expect(typedNumber('.5')).toBe(0.5);
    expect(typedNumber('5.')).toBe(5);
    expect(typedNumber('-3')).toBe(-3);
  });
  it('refuses an amount typed with a comma instead of reading part of it', () => {
    expect(typedNumber('1,200.50')).toBeNull();
    expect(typedNumber('1,5')).toBeNull();
  });
  it('refuses an empty box and anything that is not a plain number', () => {
    expect(typedNumber('')).toBeNull();
    expect(typedNumber('   ')).toBeNull();
    expect(typedNumber('RM 12')).toBeNull();
    expect(typedNumber('1e3')).toBeNull();
    expect(typedNumber('0x10')).toBeNull();
    expect(typedNumber('Infinity')).toBeNull();
    expect(typedNumber('.')).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing tests for the bill arithmetic**

The database stores `amount` and `sst_amount` as generated columns that round an exact decimal product. JavaScript's floating point does not: `1.005 * 100` is `100.49999999999999`. The tests below pin the cases where the two differ.

Create `tests/finance-bill-math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDaysIso, billTotals, lineAmounts, localIsoDate } from '@/lib/finance/bill-math';

describe('lineAmounts', () => {
  it('multiplies quantity by unit price and takes the SST on top', () => {
    expect(lineAmounts({ quantity: 10, unit_price: 12.5, sst_rate: 6 })).toEqual({ amount: 125, sst: 7.5 });
    expect(lineAmounts({ quantity: 3, unit_price: 19.99, sst_rate: 0 })).toEqual({ amount: 59.97, sst: 0 });
  });

  it('rounds half up to the sen as the database does, where plain floating point would not', () => {
    // 1.005 * 100 is 100.49999999999999 in floating point; the database stores 100.50.
    expect(lineAmounts({ quantity: 100, unit_price: 1.005, sst_rate: 0 }).amount).toBe(100.5);
    // 0.615 * 3 = 1.845 -> 1.85; SST 8% of 1.845 = 0.1476 -> 0.15.
    expect(lineAmounts({ quantity: 3, unit_price: 0.615, sst_rate: 8 })).toEqual({ amount: 1.85, sst: 0.15 });
    // SST is taken on the unrounded product: 6% of 0.125 = 0.0075 -> 0.01, although 6% of 0.13 would round to 0.01 too.
    expect(lineAmounts({ quantity: 1, unit_price: 0.125, sst_rate: 6 })).toEqual({ amount: 0.13, sst: 0.01 });
  });

  it('keeps 3 decimals of quantity and 4 of unit price, as the schema does', () => {
    // 1.2346 -> 1.235 and 0.12345 -> 0.1235 (floating point puts 0.12345 * 10000 just above 1234.5).
    expect(lineAmounts({ quantity: 1.2346, unit_price: 100, sst_rate: 0 }).amount).toBe(123.5);
    expect(lineAmounts({ quantity: 1000, unit_price: 0.12345, sst_rate: 0 }).amount).toBe(123.5);
  });

  it('stays exact near the largest amount a bill line can hold', () => {
    // 99,999,999 x 9,999.9999 = 999,999,980,000.0001; 6% of that is 59,999,998,800.000006.
    expect(lineAmounts({ quantity: 99_999_999, unit_price: 9_999.9999, sst_rate: 6 })).toEqual({
      amount: 999_999_980_000,
      sst: 59_999_998_800,
    });
  });

  it('counts a box that is empty, negative or not a number as nothing', () => {
    expect(lineAmounts({ quantity: Number.NaN, unit_price: 5, sst_rate: 6 })).toEqual({ amount: 0, sst: 0 });
    expect(lineAmounts({ quantity: 2, unit_price: -5, sst_rate: 6 })).toEqual({ amount: 0, sst: 0 });
    expect(lineAmounts({ quantity: 2, unit_price: 5, sst_rate: Number.NaN })).toEqual({ amount: 10, sst: 0 });
  });
});

describe('billTotals', () => {
  it('adds each line after rounding it, so the total matches the sum of the lines shown', () => {
    // Three lines of 0.335 each round to 0.34: 1.02, not round(1.005) = 1.01.
    const line = { quantity: 1, unit_price: 0.335, sst_rate: 0 };
    expect(billTotals([line, line, line])).toEqual({ subtotal: 1.02, sst: 0, total: 1.02 });
  });

  it('gives subtotal, SST and total without floating point drift', () => {
    expect(
      billTotals([
        { quantity: 1, unit_price: 0.1, sst_rate: 6 },
        { quantity: 1, unit_price: 0.2, sst_rate: 6 },
        { quantity: 10, unit_price: 12.5, sst_rate: 8 },
      ]),
    ).toEqual({ subtotal: 125.3, sst: 10.02, total: 135.32 });
  });

  it('is zero for no lines', () => {
    expect(billTotals([])).toEqual({ subtotal: 0, sst: 0, total: 0 });
  });
});

describe('addDaysIso', () => {
  it('adds payment terms across a month end, a year end and a leap day', () => {
    expect(addDaysIso('2026-10-11', 30)).toBe('2026-11-10');
    expect(addDaysIso('2026-12-15', 30)).toBe('2027-01-14');
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysIso('2026-10-11', 0)).toBe('2026-10-11');
  });

  it('returns what it was given when that is not a date', () => {
    expect(addDaysIso('', 30)).toBe('');
    expect(addDaysIso('2026-02-30', 30)).toBe('2026-02-30');
    expect(addDaysIso('2026-10-11', Number.NaN)).toBe('2026-10-11');
  });
});

describe('localIsoDate', () => {
  it('reads the date off the local calendar, padded', () => {
    expect(localIsoDate(new Date(2026, 9, 11, 7, 30))).toBe('2026-10-11');
    expect(localIsoDate(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05');
  });
});
```

- [ ] **Step 3: Write the failing tests for CSV**

Create `tests/finance-csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvFileName, toCsv } from '@/lib/finance/csv';

/** The file without its byte-order mark, one string per line. */
const lines = (csv: string) => csv.slice(CSV_BOM.length).split('\r\n');

describe('toCsv', () => {
  it('starts with a byte-order mark and ends every line with CRLF', () => {
    const csv = toCsv(['No.', 'Supplier'], [['BILL-0001', 'Lim Hardware']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿No.,Supplier\r\nBILL-0001,Lim Hardware\r\n');
  });

  it('writes only the header line when there are no rows', () => {
    expect(toCsv(['No.', 'Supplier'], [])).toBe('﻿No.,Supplier\r\n');
  });

  it('quotes a field with a comma, a quote or a line break, and doubles the quotes', () => {
    const csv = toCsv(['a'], [['Lim, Tan & Co'], ['The "Best" Shop'], ['line one\nline two'], ['carriage\rreturn']]);
    expect(csv.slice(CSV_BOM.length)).toBe(
      'a\r\n"Lim, Tan & Co"\r\n"The ""Best"" Shop"\r\n"line one\nline two"\r\n"carriage\rreturn"\r\n',
    );
  });

  it('keeps Malay and Chinese names as they are', () => {
    expect(lines(toCsv(['Supplier'], [['Kedai Runcit Pak Mat'], ['林記五金']]))).toEqual([
      'Supplier',
      'Kedai Runcit Pak Mat',
      '林記五金',
      '',
    ]);
  });

  it('puts an apostrophe before text a spreadsheet would run as a formula', () => {
    const csv = toCsv(
      ['Supplier'],
      [['=HYPERLINK("http://x","Lim")'], ['+60123456789'], ['-Minus Trading'], ['@home'], ['\tTabbed'], ['\rReturned']],
    );
    expect(lines(csv).slice(1, 5)).toEqual([
      '"\'=HYPERLINK(""http://x"",""Lim"")"',
      "'+60123456789",
      "'-Minus Trading",
      "'@home",
    ]);
    expect(csv).toContain("'\tTabbed\r\n");
    expect(csv).toContain('"\'\rReturned"\r\n');
  });

  it('leaves a number alone, even a negative one, and writes null as an empty field', () => {
    expect(lines(toCsv(['Total', 'Balance', 'Ref'], [[1200.5, -120.5, null], [0, 0.1, '']]))).toEqual([
      'Total,Balance,Ref',
      '1200.5,-120.5,',
      '0,0.1,',
      '',
    ]);
  });

  it('treats a negative amount passed as text like any other text starting with a minus', () => {
    expect(lines(toCsv(['Balance'], [['-120.50']]))[1]).toBe("'-120.50");
  });

  it('guards the header row the same way', () => {
    expect(lines(toCsv(['=cmd', 'a,b'], []))[0]).toBe('\'=cmd,"a,b"');
  });
});

describe('csvFileName', () => {
  it('joins the prefix and the date', () => {
    expect(csvFileName('supplier-bills', '2026-10-11')).toBe('supplier-bills-2026-10-11.csv');
    expect(csvFileName('payments-out', '2026-01-05')).toBe('payments-out-2026-01-05.csv');
  });
});
```

- [ ] **Step 4: Add the id schemas and two fuller inputs to the idempotency test**

In `tests/finance-schemas.test.ts`, replace:

```ts
import { saveBillInput } from '@/lib/finance/bills';
import { createContactInput, updateContactInput } from '@/lib/finance/contacts';
import { markPaymentPaidInput, recordPaymentOutInput } from '@/lib/finance/money';
```

with:

```ts
import { billIdInput, saveBillInput } from '@/lib/finance/bills';
import { createContactInput, updateContactInput } from '@/lib/finance/contacts';
import { markPaymentPaidInput, paymentIdInput, recordPaymentOutInput } from '@/lib/finance/money';
```

and replace:

```ts
  ['markPaymentPaidInput', markPaymentPaidInput, { id: ID, paid_on: '2026-10-09' }],
];
```

with:

```ts
  ['markPaymentPaidInput', markPaymentPaidInput, { id: ID, paid_on: '2026-10-09' }],
  ['billIdInput', billIdInput, { id: ID }],
  ['paymentIdInput', paymentIdInput, { id: ID }],
  ['saveBillInput (a draft being changed, with a product)', saveBillInput, {
    id: ID, supplier_id: ID, bill_date: '2026-10-01', due_date: '2026-10-01', supplier_ref: ' INV 88 ', notes: ' urgent ',
    lines: [{ product_id: ID, description: 'Ink', quantity: 2, uom: ' box ', unit_price: 14.5, sst_rate: 6 }],
  }],
  ['recordPaymentOutInput (scheduled, two bills)', recordPaymentOutInput, {
    account_id: ID, txn_date: '2026-10-20', method: 'cheque', reference: ' CHQ 001 ', notes: '', scheduled: true,
    allocations: [{ bill_id: ID, amount: 10.005 }, { bill_id: '22222222-2222-4222-8222-222222222222', amount: 5 }],
  }],
];
```

- [ ] **Step 5: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-touchups.test.ts tests/finance-bill-math.test.ts tests/finance-csv.test.ts tests/finance-schemas.test.ts`
Expected: `tests/finance-bill-math.test.ts` and `tests/finance-csv.test.ts` FAIL to load (`Failed to resolve import "@/lib/finance/bill-math"` / `"@/lib/finance/csv"`). `tests/finance-touchups.test.ts` FAILS in every `describe`: the year tests (`expected true to be false`), the product id sentence (`expected 'Invalid UUID'…` or `'Invalid input'`), `getBill` (it throws the canned `22P02` error), the refusals (the general "could not be saved" message), and `typedNumber is not a function`. `tests/finance-schemas.test.ts` PASSES already with 13 tests: those schemas exist, and the test only guards them from now on.

- [ ] **Step 6: Add the shared codes and sentences to `src/lib/finance/result.ts`**

Replace:

```ts
export const PG_CHECK = '23514';

export const WRITE_FAILED = 'That change could not be saved. Please try again.';
```

with:

```ts
export const PG_CHECK = '23514';
/** Row-level security refused the write. */
export const PG_FORBIDDEN = '42501';
/** A number does not fit its column: quantity × unit price can overflow. */
export const PG_OUT_OF_RANGE = '22003';

export const WRITE_FAILED = 'That change could not be saved. Please try again.';
export const READ_FAILED = 'That could not be loaded. Please try again.';
export const NOT_ALLOWED = 'You do not have permission to make changes here.';
export const TOO_LARGE = 'That amount is too large.';
```

- [ ] **Step 7: Change `src/lib/finance/bills.ts`**

Six replacements. The first, the import from `./result`:

```ts
import {
  type FinResult,
  type FinanceWriteContext,
  PG_FOREIGN_KEY,
  PG_UNIQUE,
  pgCode,
  writeFailed,
} from './result';
```

becomes:

```ts
import {
  type FinResult,
  type FinanceWriteContext,
  NOT_ALLOWED,
  PG_FORBIDDEN,
  PG_FOREIGN_KEY,
  PG_OUT_OF_RANGE,
  PG_UNIQUE,
  TOO_LARGE,
  pgCode,
  writeFailed,
} from './result';
```

The second, the end of `BILL_MESSAGES`:

```ts
  missing: 'The supplier or a product on this bill no longer exists.',
} as const;
```

becomes:

```ts
  missing: 'The supplier or a product on this bill no longer exists.',
  product: 'Choose a product from the list, or leave it empty.',
} as const;
```

The third, `isIsoDate`:

```ts
/** YYYY-MM-DD that is a real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
```

becomes:

```ts
/** YYYY-MM-DD that is a real calendar date from 1900 to 2200; a slipped key gives year 0202. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2200) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
```

The fourth, `optionalId`. Zod reports a string that is not a uuid with the uuid check's own message and anything else with the union's, so the sentence goes on both:

```ts
const optionalId = z
  .union([z.string().uuid(), z.literal(''), z.null()])
  .transform((v) => (v === '' ? null : v));
```

becomes:

```ts
const optionalId = z
  .union([z.string().uuid(M.product), z.literal(''), z.null()], { error: M.product })
  .transform((v) => (v === '' ? null : v));
```

The fifth, the end of `REFUSALS`:

```ts
  [PG_UNIQUE]: M.numberTaken,
  [PG_FOREIGN_KEY]: M.missing,
};
```

becomes:

```ts
  [PG_UNIQUE]: M.numberTaken,
  [PG_FOREIGN_KEY]: M.missing,
  [PG_FORBIDDEN]: NOT_ALLOWED,
  [PG_OUT_OF_RANGE]: TOO_LARGE,
};
```

The sixth, the start of `getBill`:

```ts
/** One bill with its lines, for the form; null when it is not in this workspace. */
export async function getBill(ctx: FinanceWriteContext, id: string): Promise<BillDetail | null> {
  const { data: bill, error } = await ctx.client
```

becomes:

```ts
/** One bill with its lines, for the form; null when it is not in this workspace or the id is not an id. */
export async function getBill(ctx: FinanceWriteContext, id: string): Promise<BillDetail | null> {
  // The database would throw on casting it; there is simply no such bill.
  if (!billIdInput.safeParse({ id }).success) return null;
  const { data: bill, error } = await ctx.client
```

- [ ] **Step 8: Change `src/lib/finance/money.ts`**

The import from `./result`:

```ts
import {
  type FinResult,
  type FinanceWriteContext,
  PG_FOREIGN_KEY,
  pgCode,
  writeFailed,
} from './result';
```

becomes:

```ts
import {
  type FinResult,
  type FinanceWriteContext,
  NOT_ALLOWED,
  PG_FORBIDDEN,
  PG_FOREIGN_KEY,
  PG_OUT_OF_RANGE,
  TOO_LARGE,
  pgCode,
  writeFailed,
} from './result';
```

and the end of `REFUSALS`:

```ts
  FIN11: M.gone,
  [PG_FOREIGN_KEY]: M.missing,
};
```

becomes:

```ts
  FIN11: M.gone,
  [PG_FOREIGN_KEY]: M.missing,
  [PG_FORBIDDEN]: NOT_ALLOWED,
  [PG_OUT_OF_RANGE]: TOO_LARGE,
};
```

- [ ] **Step 9: Add `typedNumber` to `src/lib/finance/format.ts`**

Append to the end of the file:

```ts

/**
 * What a person typed into a number box, as a number. null when the box is
 * empty or holds anything but digits with an optional decimal point, so
 * "1,200.50" is refused instead of being read as some other number.
 */
export function typedNumber(value: string): number | null {
  const text = value.trim();
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 10: Write `src/lib/finance/bill-math.ts`**

The TypeScript target is ES2017, so `BigInt(…)` calls are used, not `1n` literals.

```ts
/**
 * Bill arithmetic for the form's live totals. Pure, and exact: the sums are
 * done in whole numbers, so the figure on the form is the figure the database
 * stores, to the sen.
 */
import { isIsoDate } from './bills';

export type LineNumbers = { quantity: number; unit_price: number; sst_rate: number };
export type LineAmounts = { amount: number; sst: number };
export type BillTotals = { subtotal: number; sst: number; total: number };

/** A whole number of 10^-places units; 0 for anything that is not a number above 0. */
function units(value: number, places: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return BigInt(0);
  return BigInt(Math.round(value * 10 ** places));
}

/** Divides and rounds half up, as Postgres rounds a numeric. Both numbers are 0 or more. */
function divideRounded(value: bigint, by: bigint): bigint {
  return (value + by / BigInt(2)) / by;
}

function lineSen(line: LineNumbers): { amount: bigint; sst: bigint } {
  // Quantity keeps 3 decimals and unit price 4, as saveBillInput rounds them.
  const product = units(line.quantity, 3) * units(line.unit_price, 4);
  return {
    amount: divideRounded(product, BigInt(100_000)),
    sst: divideRounded(product * units(line.sst_rate, 2), BigInt(1_000_000_000)),
  };
}

/**
 * One line's amount and SST. These mirror the generated columns
 * supplier_bill_lines.amount = round(quantity * unit_price, 2) and
 * supplier_bill_lines.sst_amount = round(quantity * unit_price * sst_rate / 100, 2).
 */
export function lineAmounts(line: LineNumbers): LineAmounts {
  const sen = lineSen(line);
  return { amount: Number(sen.amount) / 100, sst: Number(sen.sst) / 100 };
}

/** Subtotal, SST and total: the sum of each line's rounded amounts, as supplier_bill_totals adds them. */
export function billTotals(lines: LineNumbers[]): BillTotals {
  let subtotal = BigInt(0);
  let sst = BigInt(0);
  for (const line of lines) {
    const sen = lineSen(line);
    subtotal += sen.amount;
    sst += sen.sst;
  }
  return { subtotal: Number(subtotal) / 100, sst: Number(sst) / 100, total: Number(subtotal + sst) / 100 };
}

/** 2026-10-11 plus 30 days is 2026-11-10. A date that is not valid comes back unchanged. */
export function addDaysIso(iso: string, days: number): string {
  if (!isIsoDate(iso) || !Number.isFinite(days)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return d.toISOString().slice(0, 10);
}

/**
 * The date on the person's own calendar, as YYYY-MM-DD. Form defaults use it:
 * the UTC date is still yesterday until 08:00 in Malaysia.
 */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
```

- [ ] **Step 11: Write `src/lib/finance/csv.ts`**

```ts
/**
 * CSV for the Export buttons. Pure; the browser download itself is in
 * src/components/finance/download-csv.ts.
 */

/** Excel reads a file that starts with this as UTF-8, so Malay and Chinese names survive. */
export const CSV_BOM = '﻿';

export type CsvValue = string | number | null;

function cell(value: CsvValue): string {
  if (value === null) return '';
  // A number is written as it is: -120.5 is an amount, not a formula.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  // A spreadsheet runs text starting with one of these as a formula, and names are typed by people.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * RFC 4180: a field with a comma, a quote or a line break is quoted, quotes
 * are doubled, and every line ends CRLF.
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return CSV_BOM + [headers, ...rows].map((row) => `${row.map(cell).join(',')}\r\n`).join('');
}

/** supplier-bills and 2026-10-11 give supplier-bills-2026-10-11.csv */
export function csvFileName(prefix: string, today: string): string {
  return `${prefix}-${today}.csv`;
}
```

- [ ] **Step 12: Run the tests**

Run: `pnpm exec vitest run tests/finance-touchups.test.ts tests/finance-bill-math.test.ts tests/finance-csv.test.ts tests/finance-schemas.test.ts tests/finance-bills.test.ts tests/finance-money.test.ts tests/finance-format.test.ts`
Expected: PASS. 13 tests in `finance-touchups`, 11 in `finance-bill-math`, 9 in `finance-csv`, 13 in `finance-schemas`; the existing bill, money and format tests still pass unchanged.

- [ ] **Step 13: Type-check, lint and commit**

Run: `pnpm exec tsc --noEmit` then `pnpm lint`
Expected: no errors.

```bash
git add src/lib/finance/result.ts src/lib/finance/bills.ts src/lib/finance/money.ts src/lib/finance/format.ts src/lib/finance/bill-math.ts src/lib/finance/csv.ts tests/finance-touchups.test.ts tests/finance-bill-math.test.ts tests/finance-csv.test.ts tests/finance-schemas.test.ts
git commit -m "feat: bill arithmetic that rounds as the database does, CSV text, and sentences for two more refusals"
```

---

### Task 2: View builders the browser can import

**Files:**
- Create: `src/lib/finance/purchase-views.ts`
- Create: `tests/finance-purchase-views.test.ts`

`src/lib/finance/purchases.ts` and `tests/purchases-view.test.ts` are NOT touched in this task: the two screens still import from `purchases.ts` until Tasks 5 and 6. Both files are deleted in Task 7.

**Interfaces:**
- Consumes: `BillListRow`, `BillDisplayStatus` from `@/lib/finance/bills`; `PaymentOutRow`, `PaymentMethod`, `PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS` from `@/lib/finance/money`; `toCsv` from `@/lib/finance/csv` (Task 1); `rmShort` from `@/lib/finance/format`; the type `Slice = { key: string; label: string; value: number; color?: string }` from `@/components/charts` (a type-only import, so nothing of the chart library is loaded).
- Produces, all from `@/lib/finance/purchase-views`:
  - `type Stat = { label: string; value: string; delta?: string; deltaTone?: 'up' | 'down' | 'flat' }`
  - `type BillsViewData = { stats: Stat[]; bySupplier: { label: string; value: number }[]; byStatus: Slice[] }`
  - `type PaymentsViewData = { stats: Stat[]; trend: { label: string; electronic: number; cash: number }[]; byMethod: Slice[]; paidMtd: string }`
  - `LATEST_ROWS = 10`
  - `BILL_STATUS_LABELS: Record<BillDisplayStatus, string>`, `PAYMENT_STATUS_LABELS: Record<PaymentOutRow['status'], string>` (`posted` is worded "Paid")
  - `displayDate(iso: string): string` (`2026-10-08` → `08 Oct 2026`), `todayUtc(): string`
  - `billsView(bills: BillListRow[], paid: PaymentOutRow[], today: string): BillsViewData`
  - `paymentsView(rows: PaymentOutRow[], today: string): PaymentsViewData`
  - `type BillFilter = 'open' | BillDisplayStatus`, `filterBills(bills: BillListRow[], query: string, filter: BillFilter): BillListRow[]`
  - `type PaymentStatusFilter = 'current' | 'all' | 'posted' | 'scheduled' | 'void'`, `type PaymentMethodFilter = 'all' | PaymentMethod`, `filterPayments(rows: PaymentOutRow[], query: string, status: PaymentStatusFilter, method: PaymentMethodFilter): PaymentOutRow[]`
  - `siblingBills(rows: PaymentOutRow[], row: PaymentOutRow): string[]`, `alsoCovers(rows: PaymentOutRow[], row: PaymentOutRow): string`
  - `billsCsv(bills: BillListRow[]): string`, `paymentsCsv(rows: PaymentOutRow[]): string`

Definitions, so the figures are not re-argued in review:

- An *open* bill has `display_status` `pending` or `overdue`. "Total payable" is the sum of open balances; "Due this week" is pending bills due on or before today + 7 days; "Overdue" is overdue bills. Void bills are in none of the figures and not in the status donut.
- Only payments with `status === 'posted'` are paid money. Scheduled ones count only in "Scheduled". Void, draft, pending-approval and rejected ones count nowhere.
- A payment split across bills is several rows with one `transaction_id`. Its amounts all add up, but it is counted as one payment.
- Electronic methods are `bank_transfer`, `fpx`, `duitnow`, `card`, `ewallet`; `cash` and `cheque` are the other pair.
- The table rows are not built here. The client views filter the raw rows with `filterBills` / `filterPayments` and render them.

- [ ] **Step 1: Write the failing tests**

Create `tests/finance-purchase-views.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BillListRow } from '@/lib/finance/bills';
import type { PaymentOutRow } from '@/lib/finance/money';
import {
  alsoCovers,
  billsCsv,
  billsView,
  displayDate,
  filterBills,
  filterPayments,
  paymentsCsv,
  paymentsView,
  siblingBills,
} from '@/lib/finance/purchase-views';

const today = '2026-10-09';

let seq = 0;
const bill = (b: Partial<BillListRow>): BillListRow => {
  seq += 1;
  return {
    id: `bill-${seq}`,
    bill_no: `BILL-${String(seq).padStart(4, '0')}`,
    supplier_id: 'lim',
    supplier_name: 'Lim Hardware',
    bill_date: '2026-10-01',
    due_date: '2026-10-31',
    total: 100,
    paid: 0,
    balance: 100,
    display_status: 'pending',
    ...b,
  };
};

const payment = (p: Partial<PaymentOutRow>): PaymentOutRow => {
  seq += 1;
  return {
    allocation_id: `alloc-${seq}`,
    transaction_id: `txn-${seq}`,
    number: `PV-${String(seq).padStart(4, '0')}`,
    txn_date: '2026-10-05',
    method: 'fpx',
    amount: 100,
    transaction_amount: 100,
    status: 'posted',
    reference: null,
    account_id: 'bank',
    account_name: 'Main Bank',
    bill_id: 'bill-x',
    bill_no: 'BILL-0001',
    supplier_name: 'Lim Hardware',
    ...p,
  };
};

describe('billsView', () => {
  it('sums open balances, this week, overdue and what was paid this month', () => {
    const view = billsView(
      [
        bill({ balance: 2600, due_date: '2026-10-13' }),
        bill({ balance: 4300, supplier_id: 'maju', supplier_name: 'Maju Jaya', due_date: '2026-11-01' }),
        bill({ balance: 1800, display_status: 'overdue', due_date: '2026-10-04' }),
        bill({ balance: 0, paid: 100, display_status: 'paid' }),
        bill({ balance: 780, display_status: 'draft', bill_no: null }),
        bill({ balance: 999, display_status: 'void' }),
      ],
      [payment({ amount: 1450 }), payment({ amount: 500, txn_date: '2026-09-30' })],
      today,
    );
    expect(view.stats.map((s) => [s.label, s.value, s.delta])).toEqual([
      ['Total payable', 'RM 8,700', '3 open bills'],
      ['Due this week', 'RM 2,600', '1 bill'],
      ['Overdue', 'RM 1,800', '1 bill'],
      ['Paid (MTD)', 'RM 1,450', '1 payment'],
    ]);
    expect(view.stats[2].deltaTone).toBe('down');
    // Draft, paid and void bills owe nothing; Lim Hardware has two open bills.
    expect(view.bySupplier).toEqual([
      { label: 'Lim Hardware', value: 4400 },
      { label: 'Maju Jaya', value: 4300 },
    ]);
  });

  it('leaves void bills out of the status donut', () => {
    const view = billsView(
      [bill({}), bill({}), bill({ display_status: 'paid' }), bill({ display_status: 'overdue' }), bill({ display_status: 'draft' }), bill({ display_status: 'void' })],
      [],
      today,
    );
    expect(view.byStatus.map((s) => [s.label, s.value])).toEqual([
      ['Pending', 2],
      ['Paid', 1],
      ['Overdue', 1],
      ['Draft', 1],
    ]);
  });

  it('counts a payment split across two bills once, and adds both parts', () => {
    const view = billsView(
      [],
      [
        payment({ transaction_id: 'split', amount: 60 }),
        payment({ transaction_id: 'split', amount: 40 }),
        payment({ amount: 25 }),
      ],
      today,
    );
    expect([view.stats[3].value, view.stats[3].delta]).toEqual(['RM 125', '2 payments']);
  });

  it('does not count scheduled or voided payments as paid', () => {
    const view = billsView(
      [],
      [payment({ status: 'scheduled', number: null }), payment({ status: 'void' }), payment({ status: 'draft', number: null })],
      today,
    );
    expect([view.stats[3].value, view.stats[3].delta]).toEqual(['RM 0', '0 payments']);
  });

  it('keeps two suppliers with the same name apart, and shows the five largest', () => {
    const view = billsView(
      [
        bill({ supplier_id: 'a', supplier_name: 'Ali Trading', balance: 10 }),
        bill({ supplier_id: 'b', supplier_name: 'Ali Trading', balance: 20 }),
        bill({ supplier_id: 'c', supplier_name: 'C', balance: 30 }),
        bill({ supplier_id: 'd', supplier_name: 'D', balance: 40 }),
        bill({ supplier_id: 'e', supplier_name: 'E', balance: 50 }),
        bill({ supplier_id: 'f', supplier_name: 'F', balance: 60 }),
      ],
      [],
      today,
    );
    expect(view.bySupplier.map((s) => s.value)).toEqual([60, 50, 40, 30, 20]);
  });

  it('adds sen without floating point drift', () => {
    const view = billsView([bill({ balance: 0.1 }), bill({ balance: 0.2 })], [], today);
    expect(view.bySupplier).toEqual([{ label: 'Lim Hardware', value: 0.3 }]);
  });

  it('is all zeros for a workspace with nothing yet', () => {
    const view = billsView([], [], today);
    expect(view.stats.map((s) => s.value)).toEqual(['RM 0', 'RM 0', 'RM 0', 'RM 0']);
    expect(view.stats[2].deltaTone).toBe('flat');
    expect(view.bySupplier).toEqual([]);
    expect(view.byStatus.map((s) => s.value)).toEqual([0, 0, 0, 0]);
  });
});

describe('paymentsView', () => {
  it('counts only paid money; the trend covers the last 8 months', () => {
    const view = paymentsView(
      [
        payment({ amount: 3000, method: 'bank_transfer' }),
        payment({ amount: 1000, method: 'cash' }),
        payment({ amount: 4300, status: 'scheduled', number: null, txn_date: '2026-10-14' }),
        payment({ amount: 700, status: 'void' }),
        payment({ amount: 2500, txn_date: '2026-03-02' }),
        payment({ amount: 999, txn_date: '2026-02-27' }), // older than 8 months
      ],
      today,
    );
    expect(view.stats.map((s) => [s.label, s.value, s.delta])).toEqual([
      ['Paid (MTD)', 'RM 4,000', 'this month'],
      ['Payments', '2', 'this month'],
      ['Via bank / FPX', '75%', 'of paid MTD'],
      ['Scheduled', 'RM 4,300', '1 payment'],
    ]);
    expect(view.paidMtd).toBe('RM 4,000');
    expect(view.trend.map((t) => t.label)).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(view.trend[0]).toEqual({ label: 'Mar', electronic: 2.5, cash: 0 });
    expect(view.trend[7]).toEqual({ label: 'Oct', electronic: 3, cash: 1 });
  });

  it('counts DuitNow, card and e-wallet as electronic, cash and cheque as not', () => {
    const view = paymentsView(
      [
        payment({ amount: 1000, method: 'duitnow' }),
        payment({ amount: 1000, method: 'card' }),
        payment({ amount: 1000, method: 'ewallet' }),
        payment({ amount: 500, method: 'cash' }),
        payment({ amount: 500, method: 'cheque' }),
      ],
      today,
    );
    expect(view.stats[2].value).toBe('75%');
    expect(view.trend[7]).toEqual({ label: 'Oct', electronic: 3, cash: 1 });
  });

  it('shows only the methods used this month, with their own labels and amounts in RM', () => {
    const view = paymentsView(
      [
        payment({ amount: 120.5, method: 'duitnow' }),
        payment({ amount: 40, method: 'cheque' }),
        payment({ amount: 900, method: 'fpx', txn_date: '2026-09-30' }),
      ],
      today,
    );
    expect(view.byMethod.map((s) => [s.key, s.label, s.value])).toEqual([
      ['duitnow', 'DuitNow', 120.5],
      ['cheque', 'Cheque', 40],
    ]);
  });

  it('keeps all seven methods at zero when nothing was paid this month, so the legend still shows', () => {
    const view = paymentsView([payment({ status: 'scheduled', number: null })], today);
    expect(view.byMethod.map((s) => s.label)).toEqual(['Bank Transfer', 'FPX', 'DuitNow', 'Card', 'E-Wallet', 'Cash', 'Cheque']);
    expect(view.byMethod.every((s) => s.value === 0)).toBe(true);
    expect(view.stats[2].value).toBe('—');
  });

  it('counts a split payment once, paid or scheduled', () => {
    const view = paymentsView(
      [
        payment({ transaction_id: 'paid-split', amount: 60 }),
        payment({ transaction_id: 'paid-split', amount: 40 }),
        payment({ transaction_id: 'later', amount: 10, status: 'scheduled', number: null }),
        payment({ transaction_id: 'later', amount: 15, status: 'scheduled', number: null }),
      ],
      today,
    );
    expect(view.stats.map((s) => [s.value, s.delta])).toEqual([
      ['RM 100', 'this month'],
      ['1', 'this month'],
      ['100%', 'of paid MTD'],
      ['RM 25', '1 payment'],
    ]);
  });

  it('uses no purple, violet, indigo or fuchsia for a method', () => {
    const view = paymentsView([], today);
    for (const slice of view.byMethod) {
      expect(slice.color, slice.label).toMatch(/^(var\(--chart-[1-5]\)|oklch\(0\.\d+ 0\.\d+ (\d+)\))$/);
      const hue = /oklch\([\d.]+ [\d.]+ (\d+)\)/.exec(slice.color ?? '')?.[1];
      // Violet to fuchsia sits between hue 270 and 350.
      if (hue) expect(Number(hue) < 270 || Number(hue) > 350, slice.label).toBe(true);
    }
  });
});

describe('filterBills', () => {
  const rows = [
    bill({ id: 'p', bill_no: 'BILL-0007', supplier_name: 'Lim Hardware' }),
    bill({ id: 'o', bill_no: 'BILL-0008', supplier_name: 'Maju Jaya', display_status: 'overdue' }),
    bill({ id: 'd', bill_no: null, supplier_name: 'Lim Hardware', display_status: 'draft' }),
    bill({ id: 'x', bill_no: 'BILL-0009', supplier_name: 'Maju Jaya', display_status: 'paid' }),
    bill({ id: 'v', bill_no: 'BILL-0010', supplier_name: 'Lim Hardware', display_status: 'void' }),
  ];
  const ids = (list: BillListRow[]) => list.map((b) => b.id);

  it('shows everything except void bills until a status is chosen', () => {
    expect(ids(filterBills(rows, '', 'open'))).toEqual(['p', 'o', 'd', 'x']);
  });
  it('shows one status when chosen, void included', () => {
    expect(ids(filterBills(rows, '', 'draft'))).toEqual(['d']);
    expect(ids(filterBills(rows, '', 'void'))).toEqual(['v']);
  });
  it('searches the number and the supplier, ignoring case and spaces around', () => {
    expect(ids(filterBills(rows, '  maju ', 'open'))).toEqual(['o', 'x']);
    expect(ids(filterBills(rows, 'bill-0007', 'open'))).toEqual(['p']);
    expect(ids(filterBills(rows, 'lim', 'void'))).toEqual(['v']);
    expect(filterBills(rows, 'nobody', 'open')).toEqual([]);
  });
  it('does not match a draft on the word null', () => {
    expect(filterBills(rows, 'null', 'open')).toEqual([]);
  });
});

describe('filterPayments', () => {
  const rows = [
    payment({ allocation_id: 'paid', number: 'PV-0003', bill_no: 'BILL-0007', reference: 'MBB 8841' }),
    payment({ allocation_id: 'later', number: null, status: 'scheduled', method: 'cheque', supplier_name: 'Maju Jaya', bill_no: 'BILL-0008' }),
    payment({ allocation_id: 'gone', number: 'PV-0002', status: 'void', method: 'cash' }),
  ];
  const ids = (list: PaymentOutRow[]) => list.map((p) => p.allocation_id);

  it('shows paid and scheduled until a status is chosen', () => {
    expect(ids(filterPayments(rows, '', 'current', 'all'))).toEqual(['paid', 'later']);
    expect(ids(filterPayments(rows, '', 'all', 'all'))).toEqual(['paid', 'later', 'gone']);
    expect(ids(filterPayments(rows, '', 'void', 'all'))).toEqual(['gone']);
    expect(ids(filterPayments(rows, '', 'posted', 'all'))).toEqual(['paid']);
    expect(ids(filterPayments(rows, '', 'scheduled', 'all'))).toEqual(['later']);
  });
  it('narrows by method', () => {
    expect(ids(filterPayments(rows, '', 'all', 'cash'))).toEqual(['gone']);
    expect(ids(filterPayments(rows, '', 'current', 'cash'))).toEqual([]);
  });
  it('searches supplier, bill number, voucher number and reference', () => {
    expect(ids(filterPayments(rows, 'maju', 'all', 'all'))).toEqual(['later']);
    expect(ids(filterPayments(rows, 'bill-0007', 'all', 'all'))).toEqual(['paid']);
    expect(ids(filterPayments(rows, 'pv-0002', 'all', 'all'))).toEqual(['gone']);
    expect(ids(filterPayments(rows, 'mbb', 'all', 'all'))).toEqual(['paid']);
    expect(filterPayments(rows, 'null', 'all', 'all')).toEqual([]);
  });
});

describe('siblingBills', () => {
  const first = payment({ allocation_id: 'a1', transaction_id: 't1', bill_no: 'BILL-0007' });
  const second = payment({ allocation_id: 'a2', transaction_id: 't1', bill_no: 'BILL-0009' });
  const third = payment({ allocation_id: 'a3', transaction_id: 't1', bill_no: 'BILL-0008' });
  const alone = payment({ allocation_id: 'a4', transaction_id: 't2', bill_no: 'BILL-0010' });
  const rows = [first, second, third, alone];

  it('names the other bills of a split payment, from whichever row is asked', () => {
    expect(siblingBills(rows, first)).toEqual(['BILL-0008', 'BILL-0009']);
    expect(siblingBills(rows, second)).toEqual(['BILL-0007', 'BILL-0008']);
  });
  it('is empty for a payment against one bill', () => {
    expect(siblingBills(rows, alone)).toEqual([]);
    expect(alsoCovers(rows, alone)).toBe('');
  });
  it('says so in a sentence, whichever row the menu was opened from', () => {
    const two = [first, second];
    expect(alsoCovers(two, second)).toBe('This payment also covers BILL-0007.');
    expect(alsoCovers(two, first)).toBe('This payment also covers BILL-0009.');
    expect(alsoCovers(rows, second)).toBe('This payment also covers BILL-0007 and BILL-0008.');
    const fourth = payment({ allocation_id: 'a5', transaction_id: 't1', bill_no: 'BILL-0011' });
    expect(alsoCovers([...rows, fourth], fourth)).toBe('This payment also covers BILL-0007, BILL-0008 and BILL-0009.');
  });
});

describe('CSV export', () => {
  it('writes the bills table, with a formula-looking supplier name made harmless', () => {
    const csv = billsCsv([
      bill({ bill_no: 'BILL-0007', supplier_name: '=cmd|calc', total: 1250.5, balance: 250.5, bill_date: '2026-10-01', due_date: '2026-10-31' }),
      bill({ bill_no: null, supplier_name: 'Lim, Tan & Co', total: 80, balance: 80, display_status: 'draft' }),
    ]);
    expect(csv).toBe(
      '﻿No.,Date,Supplier,Due,Total,Balance,Status\r\n' +
        "BILL-0007,2026-10-01,'=cmd|calc,2026-10-31,1250.5,250.5,Pending\r\n" +
        ',2026-10-01,"Lim, Tan & Co",2026-10-31,80,80,Draft\r\n',
    );
  });

  it('writes the payments table with the method and status as the screen words them', () => {
    const csv = paymentsCsv([
      payment({ number: 'PV-0003', bill_no: 'BILL-0007', amount: 132.5, method: 'bank_transfer' }),
      payment({ number: null, status: 'scheduled', bill_no: 'BILL-0008', amount: 40, method: 'ewallet', supplier_name: '+60 Trading' }),
    ]);
    expect(csv).toBe(
      '﻿Date,No.,Supplier,Bill,Account,Method,Amount,Status\r\n' +
        '2026-10-05,PV-0003,Lim Hardware,BILL-0007,Main Bank,Bank Transfer,132.5,Paid\r\n' +
        "2026-10-05,,'+60 Trading,BILL-0008,Main Bank,E-Wallet,40,Scheduled\r\n",
    );
  });
});

describe('displayDate', () => {
  it('writes the month as a fixed three-letter name', () => {
    expect(displayDate('2026-10-08')).toBe('08 Oct 2026');
    expect(displayDate('2026-09-30')).toBe('30 Sep 2026');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-purchase-views.test.ts`
Expected: FAIL to load with `Failed to resolve import "@/lib/finance/purchase-views"`.

- [ ] **Step 3: Write `src/lib/finance/purchase-views.ts`**

```ts
/**
 * What the Supplier Bills and Payments Out screens show, worked out from the
 * rows the data layer reads. Pure, with no server imports, so the client views
 * and the tests both use it. `today` is always a YYYY-MM-DD date.
 */
import type { Slice } from '@/components/charts';
import type { BillDisplayStatus, BillListRow } from './bills';
import { toCsv } from './csv';
import { rmShort } from './format';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod, type PaymentOutRow } from './money';

export type Stat = {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'flat';
};

export type BillsViewData = {
  stats: Stat[];
  /** Open balance per supplier, the five largest. */
  bySupplier: { label: string; value: number }[];
  /** How many bills are in each status. Void bills are left out. */
  byStatus: Slice[];
};

export type PaymentsViewData = {
  stats: Stat[];
  /** The last eight months, oldest first, in RM thousands. */
  trend: { label: string; electronic: number; cash: number }[];
  /** Paid this month per method, in RM. */
  byMethod: Slice[];
  paidMtd: string;
};

/** Rows a table shows before "View all" is pressed. */
export const LATEST_ROWS = 10;

export const BILL_STATUS_LABELS: Record<BillDisplayStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  overdue: 'Overdue',
  paid: 'Paid',
  void: 'Void',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentOutRow['status'], string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  scheduled: 'Scheduled',
  posted: 'Paid',
  rejected: 'Rejected',
  void: 'Void',
};

/** Money that has left an account without a note or a cheque changing hands. */
const ELECTRONIC: ReadonlySet<PaymentMethod> = new Set(['bank_transfer', 'fpx', 'duitnow', 'card', 'ewallet']);

/** Seven methods, five chart colours: Cash and Cheque get a fixed green and a fixed brown. */
const METHOD_COLORS: Record<PaymentMethod, string> = {
  bank_transfer: 'var(--chart-1)',
  fpx: 'var(--chart-2)',
  duitnow: 'var(--chart-5)',
  card: 'var(--chart-3)',
  ewallet: 'var(--chart-4)',
  cash: 'oklch(0.7 0.13 130)',
  cheque: 'oklch(0.6 0.09 55)',
};

/* ---- formatting --------------------------------------------------- */

// Fixed names: Intl's short months vary by ICU version ('Sep' vs 'Sept').
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-10-08 → 08 Oct 2026 */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Today's date in UTC, the date the database uses to decide what is overdue. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return round2(rows.reduce((total, row) => total + pick(row), 0));
}

/** How many payments the rows belong to: a payment split across bills is one payment. */
function paymentCount(rows: PaymentOutRow[]): number {
  return new Set(rows.map((row) => row.transaction_id)).size;
}

/* ---- Supplier Bills ----------------------------------------------- */

export function billsView(bills: BillListRow[], paid: PaymentOutRow[], today: string): BillsViewData {
  const open = bills.filter((b) => b.display_status === 'pending' || b.display_status === 'overdue');
  const overdue = open.filter((b) => b.display_status === 'overdue');
  const weekEnd = addDays(today, 7);
  const dueThisWeek = open.filter((b) => b.display_status === 'pending' && b.due_date <= weekEnd);
  // Only money that has actually left counts: not scheduled, not voided.
  const paidMtd = paid.filter((p) => p.status === 'posted' && p.txn_date.slice(0, 7) === today.slice(0, 7));

  const owed = new Map<string, { label: string; value: number }>();
  for (const b of open) {
    const entry = owed.get(b.supplier_id) ?? { label: b.supplier_name, value: 0 };
    entry.value += b.balance;
    owed.set(b.supplier_id, entry);
  }
  const bySupplier = [...owed.values()]
    .map((entry) => ({ label: entry.label, value: round2(entry.value) }))
    .sort((x, y) => y.value - x.value || x.label.localeCompare(y.label))
    .slice(0, 5);

  const statusCount = (status: BillDisplayStatus) => bills.filter((b) => b.display_status === status).length;

  return {
    stats: [
      { label: 'Total payable', value: rmShort(sum(open, (b) => b.balance)), delta: count(open.length, 'open bill'), deltaTone: 'flat' },
      { label: 'Due this week', value: rmShort(sum(dueThisWeek, (b) => b.balance)), delta: count(dueThisWeek.length, 'bill'), deltaTone: 'flat' },
      { label: 'Overdue', value: rmShort(sum(overdue, (b) => b.balance)), delta: count(overdue.length, 'bill'), deltaTone: overdue.length ? 'down' : 'flat' },
      { label: 'Paid (MTD)', value: rmShort(sum(paidMtd, (p) => p.amount)), delta: count(paymentCount(paidMtd), 'payment'), deltaTone: 'flat' },
    ],
    bySupplier,
    byStatus: [
      { key: 'pending', label: 'Pending', value: statusCount('pending'), color: 'var(--chart-1)' },
      { key: 'paid', label: 'Paid', value: statusCount('paid'), color: 'var(--chart-2)' },
      { key: 'overdue', label: 'Overdue', value: statusCount('overdue'), color: 'var(--chart-4)' },
      { key: 'draft', label: 'Draft', value: statusCount('draft'), color: 'var(--chart-3)' },
    ],
  };
}

/** `open` is every bill that is not void: what the table shows until a status is chosen. */
export type BillFilter = 'open' | BillDisplayStatus;

/** Bills matching the status filter whose number or supplier contains the search text. */
export function filterBills(bills: BillListRow[], query: string, filter: BillFilter): BillListRow[] {
  const q = query.trim().toLowerCase();
  return bills.filter(
    (b) =>
      (filter === 'open' ? b.display_status !== 'void' : b.display_status === filter) &&
      `${b.bill_no ?? ''} ${b.supplier_name}`.toLowerCase().includes(q),
  );
}

/** The bills table as a CSV file. Amounts are numbers, so a spreadsheet can add them up. */
export function billsCsv(bills: BillListRow[]): string {
  return toCsv(
    ['No.', 'Date', 'Supplier', 'Due', 'Total', 'Balance', 'Status'],
    bills.map((b) => [b.bill_no, b.bill_date, b.supplier_name, b.due_date, b.total, b.balance, BILL_STATUS_LABELS[b.display_status]]),
  );
}

/* ---- Payments Out ------------------------------------------------- */

export function paymentsView(rows: PaymentOutRow[], today: string): PaymentsViewData {
  const month = today.slice(0, 7);
  const paid = rows.filter((p) => p.status === 'posted');
  const paidMtd = paid.filter((p) => p.txn_date.slice(0, 7) === month);
  const paidMtdTotal = sum(paidMtd, (p) => p.amount);
  const electronicMtd = sum(paidMtd.filter((p) => ELECTRONIC.has(p.method)), (p) => p.amount);
  const scheduled = rows.filter((p) => p.status === 'scheduled');

  // Last 8 months, oldest first, in RM thousands.
  const [y, m] = month.split('-').map(Number);
  const thousands = (list: PaymentOutRow[]) => Math.round(sum(list, (p) => p.amount) / 100) / 10;
  const trend = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Date.UTC(y, m - 8 + i, 1));
    const key = start.toISOString().slice(0, 7);
    const inMonth = paid.filter((p) => p.txn_date.slice(0, 7) === key);
    return {
      label: MONTHS[start.getUTCMonth()],
      electronic: thousands(inMonth.filter((p) => ELECTRONIC.has(p.method))),
      cash: thousands(inMonth.filter((p) => !ELECTRONIC.has(p.method))),
    };
  });

  const methods: Slice[] = PAYMENT_METHODS.map((method) => ({
    key: method,
    label: PAYMENT_METHOD_LABELS[method],
    value: sum(paidMtd.filter((p) => p.method === method), (p) => p.amount),
    color: METHOD_COLORS[method],
  }));
  const used = methods.filter((slice) => slice.value > 0);

  return {
    stats: [
      { label: 'Paid (MTD)', value: rmShort(paidMtdTotal), delta: 'this month', deltaTone: 'flat' },
      { label: 'Payments', value: String(paymentCount(paidMtd)), delta: 'this month', deltaTone: 'flat' },
      {
        label: 'Via bank / FPX',
        value: paidMtdTotal ? `${Math.round((electronicMtd / paidMtdTotal) * 100)}%` : '—',
        delta: 'of paid MTD',
        deltaTone: 'flat',
      },
      { label: 'Scheduled', value: rmShort(sum(scheduled, (p) => p.amount)), delta: count(paymentCount(scheduled), 'payment'), deltaTone: 'flat' },
    ],
    trend,
    // Seven empty slices would be noise; with nothing paid, all seven stay so the legend still shows.
    byMethod: used.length ? used : methods,
    paidMtd: rmShort(paidMtdTotal),
  };
}

/** `current` is paid and scheduled together: what the table shows until a status is chosen. */
export type PaymentStatusFilter = 'current' | 'all' | 'posted' | 'scheduled' | 'void';
export type PaymentMethodFilter = 'all' | PaymentMethod;

/** Rows matching both filters whose supplier, bill number, voucher number or reference contains the search text. */
export function filterPayments(
  rows: PaymentOutRow[],
  query: string,
  status: PaymentStatusFilter,
  method: PaymentMethodFilter,
): PaymentOutRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((p) => {
    const statusOk =
      status === 'all' || (status === 'current' ? p.status === 'posted' || p.status === 'scheduled' : p.status === status);
    return (
      statusOk &&
      (method === 'all' || p.method === method) &&
      `${p.supplier_name} ${p.bill_no ?? ''} ${p.number ?? ''} ${p.reference ?? ''}`.toLowerCase().includes(q)
    );
  });
}

/**
 * The other bills the same payment pays. A payment split across bills shows
 * one row per bill, and voiding, deleting or marking paid from any of them
 * acts on the whole payment, so the question names the others.
 */
export function siblingBills(rows: PaymentOutRow[], row: PaymentOutRow): string[] {
  return rows
    .filter((other) => other.transaction_id === row.transaction_id && other.allocation_id !== row.allocation_id)
    .map((other) => other.bill_no ?? 'a draft bill')
    .sort();
}

/** "This payment also covers BILL-0007 and BILL-0008." for a split payment; empty for a payment against one bill. */
export function alsoCovers(rows: PaymentOutRow[], row: PaymentOutRow): string {
  const others = siblingBills(rows, row);
  if (others.length === 0) return '';
  const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`;
  return `This payment also covers ${list}.`;
}

/** The payments table as a CSV file. Amounts are numbers, so a spreadsheet can add them up. */
export function paymentsCsv(rows: PaymentOutRow[]): string {
  return toCsv(
    ['Date', 'No.', 'Supplier', 'Bill', 'Account', 'Method', 'Amount', 'Status'],
    rows.map((p) => [
      p.txn_date,
      p.number,
      p.supplier_name,
      p.bill_no,
      p.account_name,
      PAYMENT_METHOD_LABELS[p.method],
      p.amount,
      PAYMENT_STATUS_LABELS[p.status],
    ]),
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run tests/finance-purchase-views.test.ts tests/purchases-view.test.ts`
Expected: PASS. 26 tests in `finance-purchase-views`; the old `purchases-view` tests still pass, because `purchases.ts` is untouched.

- [ ] **Step 5: Type-check, lint and commit**

Run: `pnpm exec tsc --noEmit` then `pnpm lint`
Expected: no errors.

```bash
git add src/lib/finance/purchase-views.ts tests/finance-purchase-views.test.ts
git commit -m "feat: bill and payment figures, filters and CSV rows as pure functions the browser can import"
```

---

### Task 3: Server actions for bills and payments

**Files:**
- Modify: `src/lib/finance/bills.ts` (one type added)
- Replace: `src/app/(app)/finance/actions.ts`
- Create: `tests/finance-actions.test.ts`

**Interfaces:**
- Consumes: from `@/lib/finance/bills`: `BILL_MESSAGES`, `BillDetail`, `billIdInput`, `saveBillInput`, `getBill(ctx, id): Promise<BillDetail | null>`, `saveBill`, `postBill`, `voidBill`, `deleteBill`. From `@/lib/finance/money`: `recordPaymentOutInput`, `markPaymentPaidInput`, `paymentIdInput`, `recordPaymentOut`, `markPaymentPaid`, `voidPayment`, `deleteScheduledPayment`. From `@/lib/finance/result` (Task 1): `NOT_ALLOWED`, `READ_FAILED`.
- Produces, in `@/lib/finance/bills`: `type SaveAndPostResult = FinResult<{ id: string; bill_no: string }> & { draftId?: string }`.
- Produces, in `@/app/(app)/finance/actions` (each `(input: unknown) => Promise<…>`):
  - `saveBillAction` → `FinResult<{ id: string }>`
  - `postBillAction` → `FinResult<{ id: string; bill_no: string }>`
  - `voidBillAction`, `deleteBillAction` → `FinResult<{ id: string }>`
  - `saveAndPostBillAction` → `SaveAndPostResult`
  - `getBillAction` → `FinResult<BillDetail>`
  - `recordPaymentOutAction` → `FinResult<{ id: string }>`
  - `markPaymentPaidAction` → `FinResult<{ id: string; number: string }>`
  - `voidPaymentAction`, `deleteScheduledPaymentAction` → `FinResult<{ id: string }>`
- Changes for the eight existing contact and product actions: none in what they return. `run` now refreshes their screens after a refused write as well as after a successful one.

What changes in `run`, and why: the spec says that when a record was changed or removed by someone else "the form says so and reloads". Until now the paths were revalidated only when the write succeeded, so after "That bill no longer exists." the bill was still in the list. Now they are revalidated after every attempt that reached the database. An input the schema refuses, and a viewer who may not write, still touch nothing and refresh nothing. A client view keeps its state across the refresh (the open form and what was typed in it), because only the server-rendered props change.

A `'use server'` file may export only async functions. `SaveAndPostResult` therefore lives in `bills.ts`, and `FORBIDDEN`, `refresh`, `firstMessage`, `run` and the path lists are not exported.

- [ ] **Step 1: Write the failing tests**

The data layer is replaced by recorders, so the tests see which function each action calls, with which workspace, and whether the screens were refreshed.

Create `tests/finance-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BILL = '33333333-3333-4333-8333-333333333333';
const SUPPLIER = '44444444-4444-4444-8444-444444444444';
const TXN = '55555555-5555-4555-8555-555555555555';
const ACCOUNT = '66666666-6666-4666-8666-666666666666';

type Answer = { ok: true; data: unknown } | { ok: false; error: string };

const ctl = vi.hoisted(() => ({
  viewer: { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false } as {
    userId: string; orgId: string; role: string; isDemo: boolean;
  },
  /** Every data-layer call, in order: the function, the workspace it was given, and its input. */
  calls: [] as { fn: string; orgId: string; input: unknown }[],
  revalidated: [] as string[],
  /** What each data-layer function answers; a function with no entry succeeds. */
  answers: {} as Record<string, unknown>,
  /** What getBill returns, or an Error for it to throw. */
  bill: null as unknown,
}));

vi.mock('@/lib/auth/viewer', () => ({ getViewer: async () => ctl.viewer }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    ctl.revalidated.push(path);
  },
}));

function recorder(fn: string, ok: unknown) {
  return async (ctx: { orgId: string }, input: unknown) => {
    ctl.calls.push({ fn, orgId: ctx.orgId, input });
    return ctl.answers[fn] ?? { ok: true, data: ok };
  };
}

vi.mock('@/lib/finance/bills', async (orig) => {
  const actual = await orig<typeof import('@/lib/finance/bills')>();
  return {
    ...actual,
    saveBill: recorder('saveBill', { id: '33333333-3333-4333-8333-333333333333' }),
    postBill: recorder('postBill', { id: '33333333-3333-4333-8333-333333333333', bill_no: 'BILL-0007' }),
    voidBill: recorder('voidBill', { id: '33333333-3333-4333-8333-333333333333' }),
    deleteBill: recorder('deleteBill', { id: '33333333-3333-4333-8333-333333333333' }),
    getBill: async (ctx: { orgId: string }, id: string) => {
      ctl.calls.push({ fn: 'getBill', orgId: ctx.orgId, input: id });
      if (ctl.bill instanceof Error) throw ctl.bill;
      return ctl.bill;
    },
  };
});

vi.mock('@/lib/finance/money', async (orig) => {
  const actual = await orig<typeof import('@/lib/finance/money')>();
  return {
    ...actual,
    recordPaymentOut: recorder('recordPaymentOut', { id: '55555555-5555-4555-8555-555555555555' }),
    markPaymentPaid: recorder('markPaymentPaid', { id: '55555555-5555-4555-8555-555555555555', number: 'PV-0003' }),
    voidPayment: recorder('voidPayment', { id: '55555555-5555-4555-8555-555555555555' }),
    deleteScheduledPayment: recorder('deleteScheduledPayment', { id: '55555555-5555-4555-8555-555555555555' }),
  };
});

const actions = await import('@/app/(app)/finance/actions');

const PATHS = ['/finance/supplier-bills', '/finance/payments-out', '/finance/customers-suppliers'];
const FORBIDDEN = { ok: false, error: 'You do not have permission to make changes here.' };

const bill = {
  supplier_id: SUPPLIER,
  bill_date: '2026-10-01',
  due_date: '2026-10-31',
  lines: [{ description: 'Gloves', quantity: 10, unit_price: 12.5 }],
};
const payment = {
  account_id: ACCOUNT,
  txn_date: '2026-10-05',
  method: 'fpx',
  allocations: [{ bill_id: BILL, amount: 100 }],
};

/** Every write action with an input its schema accepts, and the data-layer function it must call. */
const writes: [string, (input: unknown) => Promise<Answer>, unknown, string][] = [
  ['saveBillAction', actions.saveBillAction, bill, 'saveBill'],
  ['postBillAction', actions.postBillAction, { id: BILL }, 'postBill'],
  ['voidBillAction', actions.voidBillAction, { id: BILL }, 'voidBill'],
  ['deleteBillAction', actions.deleteBillAction, { id: BILL }, 'deleteBill'],
  ['recordPaymentOutAction', actions.recordPaymentOutAction, payment, 'recordPaymentOut'],
  ['markPaymentPaidAction', actions.markPaymentPaidAction, { id: TXN, paid_on: '2026-10-09' }, 'markPaymentPaid'],
  ['voidPaymentAction', actions.voidPaymentAction, { id: TXN }, 'voidPayment'],
  ['deleteScheduledPaymentAction', actions.deleteScheduledPaymentAction, { id: TXN }, 'deleteScheduledPayment'],
];

beforeEach(() => {
  ctl.viewer = { userId: 'u1', orgId: 'org1', role: 'member', isDemo: false };
  ctl.calls = [];
  ctl.revalidated = [];
  ctl.answers = {};
  ctl.bill = null;
});

describe('who may write', () => {
  it('refuses a viewer and the demo workspace on every action, before anything is read or written', async () => {
    for (const viewer of [
      { userId: 'u1', orgId: 'org1', role: 'viewer', isDemo: false },
      { userId: 'u1', orgId: 'org1', role: 'owner', isDemo: true },
    ]) {
      ctl.viewer = viewer;
      for (const [name, action, input] of writes) expect(await action(input), name).toEqual(FORBIDDEN);
      expect(await actions.saveAndPostBillAction(bill)).toEqual(FORBIDDEN);
      expect(await actions.getBillAction({ id: BILL })).toEqual(FORBIDDEN);
    }
    expect(ctl.calls).toEqual([]);
    expect(ctl.revalidated).toEqual([]);
  });
});

describe('each write action', () => {
  it('calls its own data-layer function in the viewer’s workspace and refreshes the three screens', async () => {
    for (const [name, action, input, fn] of writes) {
      ctl.calls = [];
      ctl.revalidated = [];
      expect((await action(input)).ok, name).toBe(true);
      expect(ctl.calls.map((c) => [c.fn, c.orgId]), name).toEqual([[fn, 'org1']]);
      expect(ctl.revalidated, name).toEqual(PATHS);
    }
  });

  it('never takes the workspace from the input', async () => {
    await actions.saveBillAction({ ...bill, org_id: 'someone-else' });
    await actions.recordPaymentOutAction({ ...payment, org_id: 'someone-else' });
    expect(ctl.calls.map((c) => c.orgId)).toEqual(['org1', 'org1']);
    expect(JSON.stringify(ctl.calls)).not.toContain('someone-else');
  });

  it('answers with the schema’s sentence, touching nothing, when the input is refused', async () => {
    expect(await actions.saveBillAction({ ...bill, lines: [] })).toEqual({ ok: false, error: 'Add at least one line.' });
    expect(await actions.postBillAction({ id: 'nope' })).toEqual({ ok: false, error: 'That bill no longer exists.' });
    expect(await actions.recordPaymentOutAction({ ...payment, allocations: [] })).toEqual({
      ok: false,
      error: 'Choose at least one bill to pay.',
    });
    expect(await actions.markPaymentPaidAction({ id: TXN, paid_on: 'today' })).toEqual({ ok: false, error: 'Enter a valid date.' });
    expect(await actions.voidPaymentAction(null)).toMatchObject({ ok: false });
    expect(ctl.calls).toEqual([]);
    expect(ctl.revalidated).toEqual([]);
  });

  it('refreshes the screens after a refusal too, so a record someone else changed shows as it now is', async () => {
    // The bill was posted in another tab while this one still had its draft open.
    ctl.answers.saveBill = { ok: false, error: 'This bill is posted and can no longer be changed. Void it instead.' };
    expect(await actions.saveBillAction({ ...bill, id: BILL })).toEqual(ctl.answers.saveBill);
    expect(ctl.revalidated).toEqual(PATHS);

    ctl.revalidated = [];
    ctl.answers.voidPayment = { ok: false, error: 'That payment no longer exists.' };
    expect(await actions.voidPaymentAction({ id: TXN })).toEqual(ctl.answers.voidPayment);
    expect(ctl.revalidated).toEqual(PATHS);
  });
});

describe('saveAndPostBillAction', () => {
  it('saves, then posts what it saved, and answers with the number', async () => {
    expect(await actions.saveAndPostBillAction(bill)).toEqual({ ok: true, data: { id: BILL, bill_no: 'BILL-0007' } });
    expect(ctl.calls.map((c) => c.fn)).toEqual(['saveBill', 'postBill']);
    expect(ctl.calls[1].input).toEqual({ id: BILL });
    expect(ctl.revalidated).toEqual(PATHS);
  });

  it('does not post when the save is refused', async () => {
    ctl.answers.saveBill = { ok: false, error: 'The supplier or a product on this bill no longer exists.' };
    expect(await actions.saveAndPostBillAction(bill)).toEqual(ctl.answers.saveBill);
    expect(ctl.calls.map((c) => c.fn)).toEqual(['saveBill']);
    expect(ctl.revalidated).toEqual(PATHS);
  });

  it('keeps the draft when the post is refused, and says which draft it is', async () => {
    ctl.answers.postBill = { ok: false, error: 'A bill needs at least one line with an amount.' };
    expect(await actions.saveAndPostBillAction(bill)).toEqual({
      ok: false,
      error: 'A bill needs at least one line with an amount.',
      draftId: BILL,
    });
    expect(ctl.calls.map((c) => c.fn)).toEqual(['saveBill', 'postBill']);
    expect(ctl.revalidated).toEqual(PATHS);
  });

  it('answers with the schema’s sentence and saves nothing when the form is refused', async () => {
    expect(await actions.saveAndPostBillAction({ ...bill, supplier_id: '' })).toEqual({ ok: false, error: 'Choose a supplier.' });
    expect(ctl.calls).toEqual([]);
    expect(ctl.revalidated).toEqual([]);
  });
});

describe('getBillAction', () => {
  const draft = { id: BILL, display_status: 'draft', lines: [] };

  it('returns a draft with its lines, without refreshing anything', async () => {
    ctl.bill = draft;
    expect(await actions.getBillAction({ id: BILL })).toEqual({ ok: true, data: draft });
    expect(ctl.calls).toEqual([{ fn: 'getBill', orgId: 'org1', input: BILL }]);
    expect(ctl.revalidated).toEqual([]);
  });

  it('says the bill is gone, and refreshes the list, when it was deleted meanwhile', async () => {
    expect(await actions.getBillAction({ id: BILL })).toEqual({ ok: false, error: 'That bill no longer exists.' });
    expect(ctl.revalidated).toEqual(PATHS);
  });

  it('says the bill is locked, and refreshes the list, when it was posted meanwhile', async () => {
    ctl.bill = { ...draft, display_status: 'pending' };
    expect(await actions.getBillAction({ id: BILL })).toEqual({
      ok: false,
      error: 'This bill is posted and can no longer be changed. Void it instead.',
    });
    expect(ctl.revalidated).toEqual(PATHS);
  });

  it('says the bill is gone for an id that is not an id, without reading', async () => {
    expect(await actions.getBillAction({ id: 'nope' })).toEqual({ ok: false, error: 'That bill no longer exists.' });
    expect(await actions.getBillAction(undefined)).toEqual({ ok: false, error: 'That bill no longer exists.' });
    expect(ctl.calls).toEqual([]);
  });

  it('answers with a sentence when the read fails, and logs the cause', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    ctl.bill = new Error('connection reset');
    expect(await actions.getBillAction({ id: BILL })).toEqual({ ok: false, error: 'That could not be loaded. Please try again.' });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-actions.test.ts`
Expected: FAIL. Every test that calls a new action fails with `action is not a function` or `actions.saveAndPostBillAction is not a function` / `actions.getBillAction is not a function`.

- [ ] **Step 3: Add `SaveAndPostResult` to `src/lib/finance/bills.ts`**

Replace:

```ts
export type BillDetail = BillListRow & { supplier_ref: string | null; notes: string | null; lines: BillLine[] };
```

with:

```ts
export type BillDetail = BillListRow & { supplier_ref: string | null; notes: string | null; lines: BillLine[] };

/**
 * The answer to "Save and post". When the draft was saved but posting it was
 * refused, `draftId` is that draft, so the form goes on editing it instead of
 * saving a second copy.
 */
export type SaveAndPostResult = FinResult<{ id: string; bill_no: string }> & { draftId?: string };
```

- [ ] **Step 4: Replace `src/app/(app)/finance/actions.ts`**

The whole file. The eight contact and product actions are as they were; `run` now calls `refresh` unconditionally after the write, and `FORBIDDEN` uses the shared sentence.

```ts
'use server';

import { revalidatePath } from 'next/cache';
import type { ZodType } from 'zod';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import {
  BILL_MESSAGES,
  type BillDetail,
  type SaveAndPostResult,
  billIdInput,
  deleteBill,
  getBill,
  postBill,
  saveBill,
  saveBillInput,
  voidBill,
} from '@/lib/finance/bills';
import {
  createContact,
  createContactInput,
  deleteContact,
  deleteContactInput,
  setContactActive,
  setContactActiveInput,
  updateContact,
  updateContactInput,
} from '@/lib/finance/contacts';
import {
  deleteScheduledPayment,
  markPaymentPaid,
  markPaymentPaidInput,
  paymentIdInput,
  recordPaymentOut,
  recordPaymentOutInput,
  voidPayment,
} from '@/lib/finance/money';
import {
  createProduct,
  createProductInput,
  deleteProduct,
  deleteProductInput,
  setProductActive,
  setProductActiveInput,
  updateProduct,
  updateProductInput,
} from '@/lib/finance/products';
import { type FinResult, type FinanceWriteContext, NOT_ALLOWED, READ_FAILED } from '@/lib/finance/result';
import { createClient } from '@/lib/supabase/server';

const FORBIDDEN: FinResult<never> = { ok: false, error: NOT_ALLOWED };

/** A write context, or null when the viewer may not change this workspace's data. */
async function writeCtx(): Promise<FinanceWriteContext | null> {
  const viewer = await getViewer();
  if (viewer.isDemo || !can(viewer.role, 'edit-data')) return null;
  return { client: await createClient(), orgId: viewer.orgId };
}

function refresh(paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

function firstMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'That input was not valid.';
}

/**
 * Guard → parse → write → refresh. A rejected input answers with the schema's
 * own message, which is written for the person filling the form in. The
 * screens are refreshed after every attempt that reached the database, refused
 * or not: when someone else changed or removed the record, the page behind the
 * message shows it as it now is.
 */
async function run<I, O>(
  paths: string[],
  schema: ZodType<I>,
  input: unknown,
  fn: (ctx: FinanceWriteContext, parsed: I) => Promise<FinResult<O>>,
): Promise<FinResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };
  const result = await fn(ctx, parsed.data);
  refresh(paths);
  return result;
}

// Supplier names and balances show on the bills and payments screens too.
const CONTACT_PATHS = ['/finance/customers-suppliers', '/finance/supplier-bills', '/finance/payments-out'];
const PRODUCT_PATHS = ['/finance/products'];
// A bill or a payment changes what is owed, which Customers & Suppliers shows as Payable.
const PURCHASE_PATHS = ['/finance/supplier-bills', '/finance/payments-out', '/finance/customers-suppliers'];

export async function createContactAction(input: unknown) {
  return run(CONTACT_PATHS, createContactInput, input, createContact);
}
export async function updateContactAction(input: unknown) {
  return run(CONTACT_PATHS, updateContactInput, input, updateContact);
}
export async function setContactActiveAction(input: unknown) {
  return run(CONTACT_PATHS, setContactActiveInput, input, setContactActive);
}
export async function deleteContactAction(input: unknown) {
  return run(CONTACT_PATHS, deleteContactInput, input, deleteContact);
}

export async function createProductAction(input: unknown) {
  return run(PRODUCT_PATHS, createProductInput, input, createProduct);
}
export async function updateProductAction(input: unknown) {
  return run(PRODUCT_PATHS, updateProductInput, input, updateProduct);
}
export async function setProductActiveAction(input: unknown) {
  return run(PRODUCT_PATHS, setProductActiveInput, input, setProductActive);
}
export async function deleteProductAction(input: unknown) {
  return run(PRODUCT_PATHS, deleteProductInput, input, deleteProduct);
}

/* ---- supplier bills ---------------------------------------------------- */

export async function saveBillAction(input: unknown) {
  return run(PURCHASE_PATHS, saveBillInput, input, saveBill);
}
export async function postBillAction(input: unknown) {
  return run(PURCHASE_PATHS, billIdInput, input, postBill);
}
export async function voidBillAction(input: unknown) {
  return run(PURCHASE_PATHS, billIdInput, input, voidBill);
}
export async function deleteBillAction(input: unknown) {
  return run(PURCHASE_PATHS, billIdInput, input, deleteBill);
}

/**
 * Saves the bill as a draft, then posts it. When the save works and the post
 * is refused, the draft stays: the answer carries the post's message and the
 * draft's id, so the form goes on editing that draft.
 */
export async function saveAndPostBillAction(input: unknown): Promise<SaveAndPostResult> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = saveBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstMessage(parsed.error) };
  const saved = await saveBill(ctx, parsed.data);
  if (!saved.ok) {
    refresh(PURCHASE_PATHS);
    return saved;
  }
  const posted = await postBill(ctx, { id: saved.data.id });
  refresh(PURCHASE_PATHS);
  return posted.ok ? posted : { ok: false, error: posted.error, draftId: saved.data.id };
}

/**
 * One draft bill with its lines, for the Edit form. A read, but only people
 * who may edit have a use for it. A bill that has gone, or been posted since
 * the list was loaded, answers with that sentence and refreshes the list.
 */
export async function getBillAction(input: unknown): Promise<FinResult<BillDetail>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = billIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: BILL_MESSAGES.gone };
  try {
    const bill = await getBill(ctx, parsed.data.id);
    if (bill?.display_status === 'draft') return { ok: true, data: bill };
    refresh(PURCHASE_PATHS);
    return { ok: false, error: bill ? BILL_MESSAGES.locked : BILL_MESSAGES.gone };
  } catch (error) {
    console.error('[finance] getBill failed:', error);
    return { ok: false, error: READ_FAILED };
  }
}

/* ---- payments out ------------------------------------------------------ */

export async function recordPaymentOutAction(input: unknown) {
  return run(PURCHASE_PATHS, recordPaymentOutInput, input, recordPaymentOut);
}
export async function markPaymentPaidAction(input: unknown) {
  return run(PURCHASE_PATHS, markPaymentPaidInput, input, markPaymentPaid);
}
export async function voidPaymentAction(input: unknown) {
  return run(PURCHASE_PATHS, paymentIdInput, input, voidPayment);
}
export async function deleteScheduledPaymentAction(input: unknown) {
  return run(PURCHASE_PATHS, paymentIdInput, input, deleteScheduledPayment);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/finance-actions.test.ts tests/finance-bills.test.ts tests/finance-money.test.ts tests/finance-contacts.test.ts tests/finance-products.test.ts`
Expected: PASS. 14 tests in `finance-actions`.

- [ ] **Step 6: Type-check, lint, build and commit**

Run, as separate commands: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`
Expected: no errors; the build completes. The build is what catches a `'use server'` file exporting something that is not an async function.

```bash
git add src/lib/finance/bills.ts "src/app/(app)/finance/actions.ts" tests/finance-actions.test.ts
git commit -m "feat: server actions for bills and payments; screens refresh after a refused write too"
```

---

### Task 4: Shared pieces and the two forms' rules

**Files:**
- Create: `src/lib/finance/payment-form.ts`
- Create: `src/lib/finance/bill-form.ts`
- Create: `tests/finance-payment-form.test.ts`
- Create: `tests/finance-bill-form.test.ts`
- Replace: `src/components/finance/confirm-row.tsx`
- Create: `src/components/finance/download-csv.ts`
- Create: `src/app/(app)/finance/error.tsx`

**Interfaces:**
- Consumes: `BillListRow`, `BillDetail`, `BILL_MESSAGES`, `isIsoDate`, `saveBillInput` from `@/lib/finance/bills`; `PaymentOutRow`, `FinanceAccount`, `PaymentMethod`, `MONEY_MESSAGES`, `recordPaymentOutInput` from `@/lib/finance/money`; `FinanceProduct` from `@/lib/finance/products`; `typedNumber` from `@/lib/finance/format`, and `addDaysIso`, `billTotals`, `LineNumbers` from `@/lib/finance/bill-math` (all Task 1).
- Produces, from `@/lib/finance/payment-form`:
  - `type PayableBill = { id: string; bill_no: string; supplier_id: string; supplier_name: string; due_date: string; overdue: boolean; balance: number; scheduled: number; payable: number }`
  - `type PaymentForm = { supplierId: string; amounts: Record<string, string>; accountId: string; date: string; method: PaymentMethod; reference: string; notes: string; scheduled: boolean }` (`amounts` maps each ticked bill's id to the amount as typed)
  - `payableBills(bills: BillListRow[], payments: PaymentOutRow[]): PayableBill[]`
  - `paymentSuppliers(payable: PayableBill[]): { id: string; name: string; bills: number }[]`
  - `billsOf(payable: PayableBill[], supplierId: string): PayableBill[]`
  - `amountText(amount: number): string`
  - `newPaymentForm(payable: PayableBill[], accounts: FinanceAccount[], today: string, preselect?: { supplierId: string; billId: string }): PaymentForm`
  - `chooseSupplier(form: PaymentForm, supplierId: string): PaymentForm`
  - `toggleBill(form: PaymentForm, bill: PayableBill, ticked: boolean): PaymentForm`
  - `toggleAll(form: PaymentForm, bills: PayableBill[], ticked: boolean): PaymentForm`
  - `paymentTotal(form: PaymentForm): number`
  - `paymentPayload(form: PaymentForm)`: the object for `recordPaymentOutAction`
  - `paymentFormError(form: PaymentForm, payable: PayableBill[]): string | null`
- Produces, from `@/lib/finance/bill-form`:
  - `type LineDraft = { key: string; product_id: string; description: string; quantity: string; uom: string; pack_size: string; unit_price: string; sst_rate: string }`
  - `type BillForm = { id?: string; supplier_id: string; supplier_ref: string; bill_date: string; due_date: string; dueEdited: boolean; notes: string; lines: LineDraft[] }`
  - `emptyLine(key: string): LineDraft`, `newBillForm(today: string, lineKey: string): BillForm`, `billFormFromDetail(bill: BillDetail): BillForm`
  - `defaultDueDate(billDate: string, termsDays: number | undefined): string`
  - `withSupplier(form: BillForm, supplier: { id: string; payment_terms_days: number }): BillForm`, `withBillDate(form: BillForm, billDate: string, termsDays: number | undefined): BillForm`, `withDueDate(form: BillForm, dueDate: string): BillForm`
  - `withProduct(line: LineDraft, product: FinanceProduct | null): LineDraft`
  - `lineNumbers(line: LineDraft): LineNumbers`
  - `billPayload(form: BillForm)`: the object for `saveBillAction` and `saveAndPostBillAction`
  - `billFormError(form: BillForm, posting?: boolean): string | null`
- Produces, from `@/components/finance/confirm-row`: `ConfirmRow` with two new optional props, `tone?: 'destructive' | 'default'` (default `'destructive'`) and `icon?: LucideIcon` (default the bin). Its `children` now sit in a `div`, so a question may hold a field. Escape cancels.
- Produces, from `@/components/finance/download-csv`: `downloadCsv(fileName: string, csv: string): void`.
- Produces: `src/app/(app)/finance/error.tsx`, default export, props `{ error: Error & { digest?: string }; retry: () => void }`.

Why payable is not the balance: `supplier_bill_totals.balance` is the bill's total less *paid* money. The database's allocation guard also counts payments that are scheduled, being written (`draft`) or awaiting approval, and refuses a new payment that would take the bill past its total (`FIN05`). So a bill of RM 500 with RM 200 scheduled can take RM 300 more, and one that is fully scheduled can take nothing. The form offers exactly that.

- [ ] **Step 1: Write the failing tests for the payment form's rules**

Create `tests/finance-payment-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BillListRow } from '@/lib/finance/bills';
import { type FinanceAccount, type PaymentOutRow, recordPaymentOutInput } from '@/lib/finance/money';
import {
  type PayableBill,
  type PaymentForm,
  amountText,
  billsOf,
  chooseSupplier,
  newPaymentForm,
  payableBills,
  paymentFormError,
  paymentPayload,
  paymentSuppliers,
  paymentTotal,
  toggleAll,
  toggleBill,
} from '@/lib/finance/payment-form';

const LIM = '11111111-1111-4111-8111-111111111111';
const MAJU = '22222222-2222-4222-8222-222222222222';
const BANK = '66666666-6666-4666-8666-666666666666';
const CASH = '77777777-7777-4777-8777-777777777777';
const today = '2026-10-11';

/** 1 → a valid uuid ending in 000000000001. */
const billId = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const bill = (n: number, b: Partial<BillListRow> = {}): BillListRow => ({
  id: billId(n),
  bill_no: `BILL-${String(n).padStart(4, '0')}`,
  supplier_id: LIM,
  supplier_name: 'Lim Hardware',
  bill_date: '2026-10-01',
  due_date: '2026-10-31',
  total: 100,
  paid: 0,
  balance: 100,
  display_status: 'pending',
  ...b,
});

const paid = (n: number, p: Partial<PaymentOutRow> = {}): PaymentOutRow => ({
  allocation_id: `alloc-${n}-${p.status ?? 'posted'}-${p.amount ?? 100}`,
  transaction_id: `txn-${n}`,
  number: null,
  txn_date: '2026-10-05',
  method: 'fpx',
  amount: 100,
  transaction_amount: 100,
  status: 'posted',
  reference: null,
  account_id: BANK,
  account_name: 'Main Bank',
  bill_id: billId(n),
  bill_no: `BILL-${String(n).padStart(4, '0')}`,
  supplier_name: 'Lim Hardware',
  ...p,
});

const accounts: FinanceAccount[] = [
  { id: CASH, name: 'Cash in hand', kind: 'cash', bank_name: null },
  { id: BANK, name: 'Main Bank', kind: 'bank', bank_name: 'Maybank' },
];

const form = (payable: PayableBill[], f: Partial<PaymentForm> = {}): PaymentForm => ({
  ...newPaymentForm(payable, accounts, today),
  supplierId: LIM,
  ...f,
});

describe('payableBills', () => {
  it('offers posted bills that still owe something, and no others', () => {
    const payable = payableBills(
      [
        bill(1),
        bill(2, { display_status: 'overdue', due_date: '2026-10-04' }),
        bill(3, { display_status: 'draft', bill_no: null }),
        bill(4, { display_status: 'paid', balance: 0, paid: 100 }),
        bill(5, { display_status: 'void' }),
        bill(6, { balance: 0 }),
      ],
      [],
    );
    expect(payable.map((b) => [b.bill_no, b.overdue, b.payable])).toEqual([
      ['BILL-0002', true, 100],
      ['BILL-0001', false, 100],
    ]);
  });

  it('takes scheduled payments off what a bill can still take, and drops a bill they cover', () => {
    const payable = payableBills(
      [bill(1, { balance: 500 }), bill(2, { balance: 300 }), bill(3, { balance: 80.1 })],
      [
        // BILL-0001: RM 200 scheduled in two parts, RM 50 already paid (the balance already reflects it).
        paid(1, { status: 'scheduled', amount: 150 }),
        paid(1, { status: 'scheduled', amount: 50 }),
        paid(1, { status: 'posted', amount: 50 }),
        // BILL-0002: fully scheduled. A payment for it would be refused, so it is not offered.
        paid(2, { status: 'scheduled', amount: 300 }),
        // BILL-0003: a voided payment holds nothing.
        paid(3, { status: 'void', amount: 80.1 }),
      ],
    );
    expect(payable.map((b) => [b.bill_no, b.balance, b.scheduled, b.payable])).toEqual([
      ['BILL-0001', 500, 200, 300],
      ['BILL-0003', 80.1, 0, 80.1],
    ]);
  });

  it('counts a payment still being written or awaiting approval as holding the bill, like the database does', () => {
    const payable = payableBills(
      [bill(1, { balance: 100 })],
      [paid(1, { status: 'draft', amount: 30 }), paid(1, { status: 'pending_approval', amount: 30.5 }), paid(1, { status: 'rejected', amount: 10 })],
    );
    expect(payable[0]).toMatchObject({ scheduled: 60.5, payable: 39.5 });
  });

  it('sorts by supplier, then the earliest due date', () => {
    const payable = payableBills(
      [
        bill(1, { supplier_id: MAJU, supplier_name: 'Maju Jaya', due_date: '2026-10-01' }),
        bill(2, { due_date: '2026-11-15' }),
        bill(3, { due_date: '2026-10-20' }),
      ],
      [],
    );
    expect(payable.map((b) => b.bill_no)).toEqual(['BILL-0003', 'BILL-0002', 'BILL-0001']);
  });
});

describe('paymentSuppliers and billsOf', () => {
  const payable = payableBills(
    [bill(1), bill(2), bill(3, { supplier_id: MAJU, supplier_name: 'Maju Jaya' }), bill(4, { supplier_id: 'paid-up', supplier_name: 'Paid Up', display_status: 'paid', balance: 0 })],
    [],
  );

  it('lists only suppliers with a bill to pay, by name, with how many', () => {
    expect(paymentSuppliers(payable)).toEqual([
      { id: LIM, name: 'Lim Hardware', bills: 2 },
      { id: MAJU, name: 'Maju Jaya', bills: 1 },
    ]);
  });
  it('gives one supplier’s bills', () => {
    expect(billsOf(payable, LIM).map((b) => b.bill_no)).toEqual(['BILL-0001', 'BILL-0002']);
    expect(billsOf(payable, 'nobody')).toEqual([]);
  });
});

describe('newPaymentForm', () => {
  const payable = payableBills([bill(1, { balance: 250.5 }), bill(2, { supplier_id: MAJU, supplier_name: 'Maju Jaya' })], []);

  it('starts on today, by bank transfer from the first bank account, paying now, with nothing ticked', () => {
    expect(newPaymentForm(payable, accounts, today)).toEqual({
      supplierId: '',
      amounts: {},
      accountId: BANK,
      date: today,
      method: 'bank_transfer',
      reference: '',
      notes: '',
      scheduled: false,
    });
  });
  it('chooses the supplier when there is only one to pay', () => {
    expect(newPaymentForm(billsOf(payable, MAJU), accounts, today).supplierId).toBe(MAJU);
  });
  it('falls back to a cash account, or none, when there is no bank account', () => {
    expect(newPaymentForm(payable, [accounts[0]], today).accountId).toBe(CASH);
    expect(newPaymentForm(payable, [], today).accountId).toBe('');
  });
  it('opened from a bill row, has that supplier chosen and that bill ticked for all it can take', () => {
    const opened = newPaymentForm(payable, accounts, today, { supplierId: LIM, billId: billId(1) });
    expect(opened.supplierId).toBe(LIM);
    expect(opened.amounts).toEqual({ [billId(1)]: '250.50' });
  });
  it('opened from a bill that can take nothing more, ticks nothing', () => {
    const opened = newPaymentForm(payable, accounts, today, { supplierId: LIM, billId: billId(99) });
    expect(opened.amounts).toEqual({});
  });
});

describe('ticking bills', () => {
  const payable = payableBills([bill(1, { balance: 250.5 }), bill(2, { balance: 80 })], [paid(2, { status: 'scheduled', amount: 30 })]);
  const [first, second] = payable;

  it('ticks a bill for all it can still take, and unticks it', () => {
    const ticked = toggleBill(form(payable), second, true);
    expect(ticked.amounts).toEqual({ [second.id]: '50.00' });
    expect(toggleBill(ticked, second, false).amounts).toEqual({});
  });
  it('ticks and clears every bill at once', () => {
    const all = toggleAll(form(payable), payable, true);
    expect(all.amounts).toEqual({ [first.id]: '250.50', [second.id]: '50.00' });
    expect(toggleAll(all, payable, false).amounts).toEqual({});
  });
  it('starts the ticks again when another supplier is chosen, and keeps them when the same one is', () => {
    const ticked = toggleBill(form(payable), first, true);
    expect(chooseSupplier(ticked, MAJU)).toMatchObject({ supplierId: MAJU, amounts: {} });
    expect(chooseSupplier(ticked, LIM)).toBe(ticked);
  });
  it('adds up the ticked amounts as they are typed, without floating point drift', () => {
    expect(paymentTotal(form(payable, { amounts: { a: '0.10', b: '0.20' } }))).toBe(0.3);
    expect(paymentTotal(form(payable, { amounts: { a: '100', b: '', c: 'abc', d: '-5', e: '1,000' } }))).toBe(100);
    expect(paymentTotal(form(payable))).toBe(0);
  });
  it('writes an amount with two decimals', () => {
    expect(amountText(1200.5)).toBe('1200.50');
    expect(amountText(80)).toBe('80.00');
  });
});

describe('paymentFormError', () => {
  const payable = payableBills([bill(1, { balance: 250.5 }), bill(2, { balance: 80 })], [paid(2, { status: 'scheduled', amount: 30 })]);
  const [first, second] = payable;
  const ready = toggleBill(form(payable), first, true);

  it('passes a form that can be sent', () => {
    expect(paymentFormError(ready, payable)).toBeNull();
    expect(paymentFormError({ ...ready, scheduled: true, reference: 'MBB 8841', notes: 'part one' }, payable)).toBeNull();
  });
  it('asks for a supplier, then at least one bill', () => {
    expect(paymentFormError(form(payable, { supplierId: '' }), payable)).toBe('Choose a supplier.');
    expect(paymentFormError(form(payable), payable)).toBe('Choose at least one bill to pay.');
  });
  it('asks for an amount above 0 on every ticked bill', () => {
    for (const text of ['', '0', '-5', 'abc', '0.004']) {
      expect(paymentFormError({ ...ready, amounts: { [first.id]: text } }, payable), text).toBe('Enter an amount above 0.');
    }
  });
  it('refuses an amount typed with a comma rather than reading it as a smaller number', () => {
    expect(paymentFormError({ ...ready, amounts: { [first.id]: '1,200.50' } }, payable)).toBe('Enter an amount above 0.');
    expect(paymentFormError({ ...ready, amounts: { [first.id]: '2,50' } }, payable)).toBe('Enter an amount above 0.');
  });
  it('refuses more than a bill can still take, to the sen', () => {
    expect(paymentFormError({ ...ready, amounts: { [first.id]: '250.51' } }, payable)).toBe('That is more than is still owed on a bill.');
    expect(paymentFormError({ ...ready, amounts: { [first.id]: '250.50' } }, payable)).toBeNull();
    // RM 80 is owed on the second bill but RM 30 of it is already scheduled.
    expect(paymentFormError({ ...ready, amounts: { [second.id]: '50.01' } }, payable)).toBe('That is more than is still owed on a bill.');
    expect(paymentFormError({ ...ready, amounts: { [second.id]: '50' } }, payable)).toBeNull();
  });
  it('refuses a bill that was paid or voided after the form was opened', () => {
    expect(paymentFormError(ready, billsOf(payable, 'nobody'))).toBe('That is more than is still owed on a bill.');
  });
  it('asks for an account, a real date, and short enough text, in the schema’s words', () => {
    expect(paymentFormError({ ...ready, accountId: '' }, payable)).toBe('Choose the account the money leaves.');
    expect(paymentFormError({ ...ready, date: '' }, payable)).toBe('Enter a valid date.');
    expect(paymentFormError({ ...ready, date: '0202-10-11' }, payable)).toBe('Enter a valid date.');
    expect(paymentFormError({ ...ready, reference: 'x'.repeat(201) }, payable)).toBe('That is too long. Keep it to 200 characters or fewer.');
  });
});

describe('a supplier with many open bills', () => {
  const twenty = payableBills(Array.from({ length: 20 }, (_, i) => bill(i + 1, { balance: 10.1 })), []);
  const sixty = payableBills(Array.from({ length: 60 }, (_, i) => bill(i + 1, { balance: 10.1 })), []);

  it('pays twenty bills in one payment, each in full', () => {
    const all = toggleAll(form(twenty), twenty, true);
    expect(paymentFormError(all, twenty)).toBeNull();
    expect(paymentTotal(all)).toBe(202);
    const payload = paymentPayload(all);
    expect(payload.allocations).toHaveLength(20);
    expect(payload.allocations.every((a) => a.amount === 10.1)).toBe(true);
    expect(recordPaymentOutInput.safeParse(payload).success).toBe(true);
  });
  it('says one payment covers at most fifty when more are ticked', () => {
    expect(paymentFormError(toggleAll(form(sixty), sixty, true), sixty)).toBe('One payment can cover at most 50 bills.');
  });
});

describe('paymentPayload', () => {
  const payable = payableBills([bill(1, { balance: 250.5 }), bill(2, { balance: 80 })], []);

  it('sends numbers, never the text that was typed, and the schema accepts it', () => {
    const filled: PaymentForm = {
      supplierId: LIM,
      amounts: { [payable[0].id]: '200.50', [payable[1].id]: ' 80 ' },
      accountId: BANK,
      date: '2026-10-20',
      method: 'cheque',
      reference: ' CHQ 001 ',
      notes: '',
      scheduled: true,
    };
    const payload = paymentPayload(filled);
    expect(payload).toEqual({
      account_id: BANK,
      txn_date: '2026-10-20',
      method: 'cheque',
      reference: ' CHQ 001 ',
      notes: '',
      scheduled: true,
      allocations: [
        { bill_id: payable[0].id, amount: 200.5 },
        { bill_id: payable[1].id, amount: 80 },
      ],
    });
    expect(recordPaymentOutInput.parse(payload)).toMatchObject({ reference: 'CHQ 001', notes: null, scheduled: true });
  });
  it('sends NaN for a box that is not a number, which the schema refuses with the amount sentence', () => {
    const payload = paymentPayload(form(payable, { amounts: { [payable[0].id]: '1,200' } }));
    expect(Number.isNaN(payload.allocations[0].amount)).toBe(true);
    expect(recordPaymentOutInput.safeParse(payload).error?.issues[0]?.message).toBe('Enter an amount above 0.');
  });
  it('never carries the supplier or a workspace: the server works those out', () => {
    expect(Object.keys(paymentPayload(form(payable))).sort()).toEqual(
      ['account_id', 'allocations', 'method', 'notes', 'reference', 'scheduled', 'txn_date'],
    );
  });
});
```

- [ ] **Step 2: Write the failing tests for the bill form's rules**

Create `tests/finance-bill-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  type BillForm,
  billFormError,
  billFormFromDetail,
  billPayload,
  defaultDueDate,
  emptyLine,
  lineNumbers,
  newBillForm,
  withBillDate,
  withDueDate,
  withProduct,
  withSupplier,
} from '@/lib/finance/bill-form';
import { billTotals } from '@/lib/finance/bill-math';
import { type BillDetail, saveBillInput } from '@/lib/finance/bills';
import type { FinanceProduct } from '@/lib/finance/products';

const BILL = '33333333-3333-4333-8333-333333333333';
const SUPPLIER = '44444444-4444-4444-8444-444444444444';
const PRODUCT = '99999999-9999-4999-8999-999999999999';
const today = '2026-10-11';

const gloves: FinanceProduct = {
  id: PRODUCT,
  sku: 'PRD-010',
  name: 'Nitrile Gloves (Box)',
  type: 'product',
  category: 'Consumables',
  uom: 'box',
  price: 24.9,
  cost: 12.5,
  sst_rate: 6,
  active: true,
};

/** A form that can be saved: a supplier and one line of 10 at RM 12.50. */
const filled = (f: Partial<BillForm> = {}): BillForm => ({
  ...newBillForm(today, 'k1'),
  supplier_id: SUPPLIER,
  due_date: '2026-11-10',
  lines: [{ ...emptyLine('k1'), description: 'Gloves', quantity: '10', unit_price: '12.50' }],
  ...f,
});

describe('newBillForm', () => {
  it('is dated today with one empty line of quantity 1 and no SST', () => {
    expect(newBillForm(today, 'k1')).toEqual({
      supplier_id: '',
      supplier_ref: '',
      bill_date: today,
      due_date: today,
      dueEdited: false,
      notes: '',
      lines: [{ key: 'k1', product_id: '', description: '', quantity: '1', uom: '', pack_size: '', unit_price: '', sst_rate: '0' }],
    });
  });
});

describe('the due date', () => {
  const supplier = { id: SUPPLIER, payment_terms_days: 30 };

  it('is the bill date plus the supplier’s terms', () => {
    expect(defaultDueDate('2026-10-11', 30)).toBe('2026-11-10');
    expect(defaultDueDate('2026-10-11', 0)).toBe('2026-10-11');
    expect(defaultDueDate('2026-10-11', undefined)).toBe('2026-10-11');
  });
  it('follows the supplier and the bill date', () => {
    const chosen = withSupplier(newBillForm(today, 'k1'), supplier);
    expect(chosen).toMatchObject({ supplier_id: SUPPLIER, due_date: '2026-11-10', dueEdited: false });
    expect(withBillDate(chosen, '2026-12-15', 30)).toMatchObject({ bill_date: '2026-12-15', due_date: '2027-01-14' });
    expect(withSupplier(chosen, { id: 'other', payment_terms_days: 7 }).due_date).toBe('2026-10-18');
  });
  it('stops following once the person sets it by hand', () => {
    const edited = withDueDate(withSupplier(newBillForm(today, 'k1'), supplier), '2026-10-25');
    expect(edited).toMatchObject({ due_date: '2026-10-25', dueEdited: true });
    expect(withBillDate(edited, '2026-10-12', 30).due_date).toBe('2026-10-25');
    expect(withSupplier(edited, { id: 'other', payment_terms_days: 7 })).toMatchObject({ supplier_id: 'other', due_date: '2026-10-25' });
  });
  it('stays where it was while the bill date is half typed or cleared', () => {
    const chosen = withSupplier(newBillForm(today, 'k1'), supplier);
    expect(withBillDate(chosen, '', 30)).toMatchObject({ bill_date: '', due_date: '2026-11-10' });
    expect(withBillDate(chosen, '0002-10-11', 30).due_date).toBe('2026-11-10');
  });
});

describe('withProduct', () => {
  const line = { ...emptyLine('k1'), description: 'typed by hand', quantity: '4', unit_price: '9', pack_size: '100 pcs' };

  it('fills description, unit, unit price from the product’s cost, and SST, keeping the quantity', () => {
    expect(withProduct(line, gloves)).toEqual({
      key: 'k1',
      product_id: PRODUCT,
      description: 'Nitrile Gloves (Box)',
      quantity: '4',
      uom: 'box',
      pack_size: '100 pcs',
      unit_price: '12.5',
      sst_rate: '6',
    });
  });
  it('only clears the link when "no product" is chosen', () => {
    const linked = withProduct(line, gloves);
    expect(withProduct(linked, null)).toEqual({ ...linked, product_id: '' });
  });
});

describe('lineNumbers', () => {
  it('reads the boxes as numbers, with an empty SST box as 0', () => {
    expect(lineNumbers({ ...emptyLine('k'), quantity: '2.5', unit_price: '10', sst_rate: '' })).toEqual({ quantity: 2.5, unit_price: 10, sst_rate: 0 });
  });
  it('gives NaN for a box that is not a number, which the total counts as nothing', () => {
    const numbers = lineNumbers({ ...emptyLine('k'), quantity: '1,000', unit_price: '', sst_rate: 'six' });
    expect([numbers.quantity, numbers.unit_price, numbers.sst_rate].every(Number.isNaN)).toBe(true);
    expect(billTotals([numbers])).toEqual({ subtotal: 0, sst: 0, total: 0 });
  });
});

describe('billFormError', () => {
  it('passes a form that can be saved', () => {
    expect(billFormError(filled())).toBeNull();
  });
  it('asks for a supplier first', () => {
    expect(billFormError(filled({ supplier_id: '' }))).toBe('Choose a supplier.');
  });
  it('asks for real dates, the due date not before the bill date', () => {
    expect(billFormError(filled({ bill_date: '' }))).toBe('Enter a valid date.');
    expect(billFormError(filled({ due_date: '20261-11-10' }))).toBe('Enter a valid date.');
    expect(billFormError(filled({ due_date: '2026-10-10' }))).toBe('The due date cannot be before the bill date.');
  });
  it('checks each line in the schema’s words', () => {
    const line = filled().lines[0];
    const withLine = (l: Partial<typeof line>) => filled({ lines: [{ ...line, ...l }] });
    expect(billFormError(withLine({ description: '  ' }))).toBe('Describe each line.');
    expect(billFormError(withLine({ quantity: '' }))).toBe('Enter a quantity above 0.');
    expect(billFormError(withLine({ quantity: '0' }))).toBe('Enter a quantity above 0.');
    expect(billFormError(withLine({ unit_price: '' }))).toBe('Enter a unit price of 0 or more.');
    expect(billFormError(withLine({ unit_price: '-1' }))).toBe('Enter a unit price of 0 or more.');
    expect(billFormError(withLine({ sst_rate: '101' }))).toBe('Enter an SST rate between 0 and 100.');
    expect(billFormError(withLine({ sst_rate: '' }))).toBeNull();
    expect(billFormError(withLine({ description: 'x'.repeat(201) }))).toBe('That is too long. Keep it to 200 characters or fewer.');
  });
  it('refuses a figure typed with a comma rather than reading it as a smaller number', () => {
    const line = filled().lines[0];
    expect(billFormError(filled({ lines: [{ ...line, unit_price: '1,250.00' }] }))).toBe('Enter a unit price of 0 or more.');
    expect(billFormError(filled({ lines: [{ ...line, quantity: '1,000' }] }))).toBe('Enter a quantity above 0.');
  });
  it('reports the second line when the first is fine', () => {
    const line = filled().lines[0];
    expect(billFormError(filled({ lines: [line, { ...emptyLine('k2'), unit_price: '5' }] }))).toBe('Describe each line.');
  });
  it('asks for at least one line, and at most 100', () => {
    const line = filled().lines[0];
    expect(billFormError(filled({ lines: [] }))).toBe('Add at least one line.');
    expect(billFormError(filled({ lines: Array.from({ length: 101 }, (_, i) => ({ ...line, key: `k${i}` })) }))).toBe(
      'A bill can have at most 100 lines.',
    );
  });
  it('lets a draft total nothing, but not a bill that is being posted', () => {
    const free = filled({ lines: [{ ...filled().lines[0], unit_price: '0' }] });
    expect(billFormError(free)).toBeNull();
    expect(billFormError(free, true)).toBe('A bill needs at least one line with an amount.');
    expect(billFormError(filled(), true)).toBeNull();
  });
});

describe('billPayload', () => {
  it('sends numbers, never the text that was typed, and no id for a new bill', () => {
    const payload = billPayload(
      filled({
        supplier_ref: ' INV 88 ',
        notes: '',
        lines: [{ key: 'k1', product_id: PRODUCT, description: ' Gloves ', quantity: '10', uom: 'box', pack_size: '', unit_price: '12.50', sst_rate: '6' }],
      }),
    );
    expect(payload).toEqual({
      supplier_id: SUPPLIER,
      supplier_ref: ' INV 88 ',
      bill_date: today,
      due_date: '2026-11-10',
      notes: '',
      lines: [{ product_id: PRODUCT, description: ' Gloves ', uom: 'box', pack_size: '', quantity: 10, unit_price: 12.5, sst_rate: 6 }],
    });
    expect('id' in payload).toBe(false);
    expect(saveBillInput.parse(payload)).toMatchObject({
      supplier_ref: 'INV 88',
      notes: null,
      lines: [{ product_id: PRODUCT, description: 'Gloves', uom: 'box', pack_size: null, quantity: 10, unit_price: 12.5, sst_rate: 6 }],
    });
  });
  it('sends the id when a draft is being changed', () => {
    expect(billPayload(filled({ id: BILL })).id).toBe(BILL);
  });
  it('never carries the line keys, the dueEdited flag or a workspace', () => {
    const payload = billPayload(filled({ id: BILL }));
    expect(Object.keys(payload).sort()).toEqual(['bill_date', 'due_date', 'id', 'lines', 'notes', 'supplier_id', 'supplier_ref']);
    expect(Object.keys(payload.lines[0]).sort()).toEqual(['description', 'pack_size', 'product_id', 'quantity', 'sst_rate', 'unit_price', 'uom']);
  });
});

describe('billFormFromDetail', () => {
  const detail: BillDetail = {
    id: BILL,
    bill_no: null,
    supplier_id: SUPPLIER,
    supplier_name: 'Lim Hardware',
    bill_date: '2026-10-01',
    due_date: '2026-10-15',
    total: 132.5,
    paid: 0,
    balance: 132.5,
    display_status: 'draft',
    supplier_ref: null,
    notes: 'urgent',
    lines: [
      { id: 'line-1', product_id: PRODUCT, description: 'Nitrile Gloves (Box)', quantity: 10, uom: 'box', pack_size: '100 pcs', unit_price: 12.5, sst_rate: 6, amount: 125, sst_amount: 7.5 },
      { id: 'line-2', product_id: null, description: 'Delivery', quantity: 1, uom: null, pack_size: null, unit_price: 0, sst_rate: 0, amount: 0, sst_amount: 0 },
    ],
  };

  it('shows a saved draft as it was saved, and keeps its due date', () => {
    const form = billFormFromDetail(detail);
    expect(form).toMatchObject({ id: BILL, supplier_id: SUPPLIER, supplier_ref: '', due_date: '2026-10-15', dueEdited: true, notes: 'urgent' });
    expect(form.lines).toEqual([
      { key: 'line-1', product_id: PRODUCT, description: 'Nitrile Gloves (Box)', quantity: '10', uom: 'box', pack_size: '100 pcs', unit_price: '12.5', sst_rate: '6' },
      { key: 'line-2', product_id: '', description: 'Delivery', quantity: '1', uom: '', pack_size: '', unit_price: '0', sst_rate: '0' },
    ]);
  });
  it('saves back what it loaded: nothing is lost by opening and saving a draft', () => {
    const form = billFormFromDetail(detail);
    expect(billFormError(form)).toBeNull();
    const parsed = saveBillInput.parse(billPayload(form));
    expect(parsed.id).toBe(BILL);
    expect(parsed.lines).toEqual([
      { product_id: PRODUCT, description: 'Nitrile Gloves (Box)', quantity: 10, uom: 'box', pack_size: '100 pcs', unit_price: 12.5, sst_rate: 6 },
      { product_id: null, description: 'Delivery', quantity: 1, uom: null, pack_size: null, unit_price: 0, sst_rate: 0 },
    ]);
    expect(billTotals(form.lines.map(lineNumbers))).toEqual({ subtotal: 125, sst: 7.5, total: 132.5 });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `pnpm exec vitest run tests/finance-payment-form.test.ts tests/finance-bill-form.test.ts`
Expected: both FAIL to load with `Failed to resolve import "@/lib/finance/payment-form"` and `"@/lib/finance/bill-form"`.

- [ ] **Step 4: Write `src/lib/finance/payment-form.ts`**

```ts
/**
 * The payment form's rules, kept out of the component so they can be tested:
 * which bills can still take a payment, what each defaults to, what is wrong
 * with the form, and what is sent to recordPaymentOutAction. Pure.
 */
import { BILL_MESSAGES, type BillListRow } from './bills';
import { typedNumber } from './format';
import {
  type FinanceAccount,
  MONEY_MESSAGES,
  type PaymentMethod,
  type PaymentOutRow,
  recordPaymentOutInput,
} from './money';

export type PayableBill = {
  id: string;
  bill_no: string;
  supplier_id: string;
  supplier_name: string;
  due_date: string;
  overdue: boolean;
  /** Still owed after every paid payment. */
  balance: number;
  /** Promised by payments that are scheduled but not yet paid. */
  scheduled: number;
  /** What a new payment may take: the balance less what is already scheduled. */
  payable: number;
};

export type PaymentForm = {
  supplierId: string;
  /** The ticked bills, each with the amount as typed. */
  amounts: Record<string, string>;
  accountId: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  /** False to pay now; true to schedule for later. */
  scheduled: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const sen = (n: number) => Math.round(n * 100);

/** A payment in one of these states has not paid the bill yet, but the database already counts it against the bill. */
const HOLDING: ReadonlySet<PaymentOutRow['status']> = new Set(['draft', 'pending_approval', 'scheduled']);

/**
 * The bills a payment can be recorded against: posted, not fully paid, and not
 * already covered by scheduled payments. The database refuses a payment for
 * more than balance − scheduled, so that is what the form offers.
 */
export function payableBills(bills: BillListRow[], payments: PaymentOutRow[]): PayableBill[] {
  const held = new Map<string, number>();
  for (const p of payments) {
    if (HOLDING.has(p.status)) held.set(p.bill_id, (held.get(p.bill_id) ?? 0) + p.amount);
  }
  return bills
    .filter((b) => (b.display_status === 'pending' || b.display_status === 'overdue') && b.balance > 0)
    .map((b) => {
      const scheduled = round2(held.get(b.id) ?? 0);
      return {
        id: b.id,
        bill_no: b.bill_no ?? '—',
        supplier_id: b.supplier_id,
        supplier_name: b.supplier_name,
        due_date: b.due_date,
        overdue: b.display_status === 'overdue',
        balance: b.balance,
        scheduled,
        payable: round2(b.balance - scheduled),
      };
    })
    .filter((b) => b.payable > 0)
    .sort(
      (x, y) =>
        x.supplier_name.localeCompare(y.supplier_name) ||
        x.due_date.localeCompare(y.due_date) ||
        x.bill_no.localeCompare(y.bill_no),
    );
}

/** The suppliers that have at least one bill to pay, by name. */
export function paymentSuppliers(payable: PayableBill[]): { id: string; name: string; bills: number }[] {
  const suppliers = new Map<string, { id: string; name: string; bills: number }>();
  for (const b of payable) {
    const entry = suppliers.get(b.supplier_id) ?? { id: b.supplier_id, name: b.supplier_name, bills: 0 };
    entry.bills += 1;
    suppliers.set(b.supplier_id, entry);
  }
  return [...suppliers.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/** One supplier's payable bills, the earliest due first. */
export function billsOf(payable: PayableBill[], supplierId: string): PayableBill[] {
  return payable.filter((b) => b.supplier_id === supplierId);
}

/** 1200.5 → "1200.50", the way an amount box shows it. */
export function amountText(amount: number): string {
  return amount.toFixed(2);
}

/**
 * A fresh form. The account defaults to the first bank account. With
 * `preselect` (the Pay choice on a bill row) the supplier is chosen and that
 * bill ticked for all it can still take.
 */
export function newPaymentForm(
  payable: PayableBill[],
  accounts: FinanceAccount[],
  today: string,
  preselect?: { supplierId: string; billId: string },
): PaymentForm {
  const suppliers = paymentSuppliers(payable);
  const bill = preselect ? payable.find((b) => b.id === preselect.billId && b.supplier_id === preselect.supplierId) : undefined;
  return {
    supplierId: preselect?.supplierId ?? (suppliers.length === 1 ? suppliers[0].id : ''),
    amounts: bill ? { [bill.id]: amountText(bill.payable) } : {},
    accountId: (accounts.find((a) => a.kind === 'bank') ?? accounts[0])?.id ?? '',
    date: today,
    method: 'bank_transfer',
    reference: '',
    notes: '',
    scheduled: false,
  };
}

/** Choosing another supplier starts the ticks again: one payment pays one supplier. */
export function chooseSupplier(form: PaymentForm, supplierId: string): PaymentForm {
  return supplierId === form.supplierId ? form : { ...form, supplierId, amounts: {} };
}

/** Ticks a bill for all it can still take, or unticks it. */
export function toggleBill(form: PaymentForm, bill: PayableBill, ticked: boolean): PaymentForm {
  const amounts = { ...form.amounts };
  if (ticked) amounts[bill.id] = amountText(bill.payable);
  else delete amounts[bill.id];
  return { ...form, amounts };
}

/** Ticks every bill of the chosen supplier, or clears them all. */
export function toggleAll(form: PaymentForm, bills: PayableBill[], ticked: boolean): PaymentForm {
  return { ...form, amounts: ticked ? Object.fromEntries(bills.map((b) => [b.id, amountText(b.payable)])) : {} };
}

/** The running total: every ticked amount that is a number above 0. */
export function paymentTotal(form: PaymentForm): number {
  let total = 0;
  for (const text of Object.values(form.amounts)) {
    const amount = typedNumber(text);
    if (amount !== null && amount > 0) total += sen(amount);
  }
  return total / 100;
}

/** What is sent to recordPaymentOutAction. Amounts are numbers; a box that is not a number goes as NaN and is refused. */
export function paymentPayload(form: PaymentForm) {
  return {
    account_id: form.accountId,
    txn_date: form.date,
    method: form.method,
    reference: form.reference,
    notes: form.notes,
    scheduled: form.scheduled,
    allocations: Object.entries(form.amounts).map(([bill_id, text]) => ({
      bill_id,
      amount: typedNumber(text) ?? Number.NaN,
    })),
  };
}

/**
 * The first thing wrong with the form, in the sentence the schema or the
 * database would use, or null when it can be sent.
 */
export function paymentFormError(form: PaymentForm, payable: PayableBill[]): string | null {
  if (!form.supplierId) return BILL_MESSAGES.supplier;
  const ticked = Object.entries(form.amounts);
  if (ticked.length === 0) return MONEY_MESSAGES.bills;
  for (const [billId, text] of ticked) {
    const amount = typedNumber(text);
    if (amount === null || sen(amount) <= 0) return MONEY_MESSAGES.amount;
    const bill = payable.find((b) => b.id === billId && b.supplier_id === form.supplierId);
    // A bill that is no longer payable was paid or voided since the form opened.
    if (!bill || sen(amount) > sen(bill.payable)) return MONEY_MESSAGES.tooMuch;
  }
  const parsed = recordPaymentOutInput.safeParse(paymentPayload(form));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? MONEY_MESSAGES.amount);
}
```

- [ ] **Step 5: Write `src/lib/finance/bill-form.ts`**

`pack_size` is not shown in the editor, but a draft saved with one (the seeded bills have them) must not lose it when it is opened and saved, so every line carries it.

```ts
/**
 * The bill form's rules, kept out of the components so they can be tested:
 * what a new form holds, what choosing a supplier, a date or a product
 * changes, what is wrong with the form, and what is sent to saveBillAction.
 * Pure. Every box is held as the text the person typed.
 */
import { addDaysIso, billTotals, type LineNumbers } from './bill-math';
import { type BillDetail, BILL_MESSAGES, isIsoDate, saveBillInput } from './bills';
import { typedNumber } from './format';
import type { FinanceProduct } from './products';

export type LineDraft = {
  /** Stable for React while the form is open; never sent. */
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  uom: string;
  /** Not shown in the editor; carried so editing a draft does not drop it. */
  pack_size: string;
  unit_price: string;
  sst_rate: string;
};

export type BillForm = {
  /** Present when a saved draft is being changed. */
  id?: string;
  supplier_id: string;
  supplier_ref: string;
  bill_date: string;
  due_date: string;
  /** Once the person sets the due date by hand, it is no longer recalculated. */
  dueEdited: boolean;
  notes: string;
  lines: LineDraft[];
};

export function emptyLine(key: string): LineDraft {
  return { key, product_id: '', description: '', quantity: '1', uom: '', pack_size: '', unit_price: '', sst_rate: '0' };
}

/** A new bill dated today with one empty line. The due date follows once a supplier is chosen. */
export function newBillForm(today: string, lineKey: string): BillForm {
  return {
    supplier_id: '',
    supplier_ref: '',
    bill_date: today,
    due_date: today,
    dueEdited: false,
    notes: '',
    lines: [emptyLine(lineKey)],
  };
}

/** A saved draft, as the form shows it. Its due date was chosen already, so it is kept. */
export function billFormFromDetail(bill: BillDetail): BillForm {
  return {
    id: bill.id,
    supplier_id: bill.supplier_id,
    supplier_ref: bill.supplier_ref ?? '',
    bill_date: bill.bill_date,
    due_date: bill.due_date,
    dueEdited: true,
    notes: bill.notes ?? '',
    lines: bill.lines.map((l) => ({
      key: l.id,
      product_id: l.product_id ?? '',
      description: l.description,
      quantity: String(l.quantity),
      uom: l.uom ?? '',
      pack_size: l.pack_size ?? '',
      unit_price: String(l.unit_price),
      sst_rate: String(l.sst_rate),
    })),
  };
}

/** Bill date plus the supplier's payment terms; with no supplier yet, the bill date itself. */
export function defaultDueDate(billDate: string, termsDays: number | undefined): string {
  return addDaysIso(billDate, termsDays ?? 0);
}

/** Choosing a supplier moves the due date to their terms, unless it was set by hand. */
export function withSupplier(form: BillForm, supplier: { id: string; payment_terms_days: number }): BillForm {
  return {
    ...form,
    supplier_id: supplier.id,
    due_date: form.dueEdited ? form.due_date : defaultDueDate(form.bill_date, supplier.payment_terms_days),
  };
}

/**
 * Changing the bill date moves the due date with it, unless it was set by
 * hand. While the bill date is half typed the due date stays where it was.
 */
export function withBillDate(form: BillForm, billDate: string, termsDays: number | undefined): BillForm {
  const follow = !form.dueEdited && isIsoDate(billDate);
  return { ...form, bill_date: billDate, due_date: follow ? defaultDueDate(billDate, termsDays) : form.due_date };
}

export function withDueDate(form: BillForm, dueDate: string): BillForm {
  return { ...form, due_date: dueDate, dueEdited: true };
}

/**
 * Choosing a product fills the line from it: its name, unit, cost (what the
 * workspace pays for it) and SST rate. The person can then change any of
 * them. Choosing "no product" only clears the link.
 */
export function withProduct(line: LineDraft, product: FinanceProduct | null): LineDraft {
  if (!product) return { ...line, product_id: '' };
  return {
    ...line,
    product_id: product.id,
    description: product.name,
    uom: product.uom,
    unit_price: String(product.cost),
    sst_rate: String(product.sst_rate),
  };
}

/** An empty SST box means no SST. */
function sstRate(text: string): number {
  return text.trim() === '' ? 0 : (typedNumber(text) ?? Number.NaN);
}

/** The line's figures for the live total; a box that is not a number is NaN, which counts as nothing. */
export function lineNumbers(line: LineDraft): LineNumbers {
  return {
    quantity: typedNumber(line.quantity) ?? Number.NaN,
    unit_price: typedNumber(line.unit_price) ?? Number.NaN,
    sst_rate: sstRate(line.sst_rate),
  };
}

/** What is sent to saveBillAction. Figures are numbers; a box that is not a number goes as NaN and is refused. */
export function billPayload(form: BillForm) {
  return {
    ...(form.id ? { id: form.id } : {}),
    supplier_id: form.supplier_id,
    supplier_ref: form.supplier_ref,
    bill_date: form.bill_date,
    due_date: form.due_date,
    notes: form.notes,
    lines: form.lines.map((line) => ({
      product_id: line.product_id,
      description: line.description,
      uom: line.uom,
      pack_size: line.pack_size,
      ...lineNumbers(line),
    })),
  };
}

/**
 * The first thing wrong with the form, in the schema's own sentence, or null
 * when it can be sent. A draft may total nothing; a bill being posted may not,
 * and saying so here saves a draft the database would then refuse to post.
 */
export function billFormError(form: BillForm, posting = false): string | null {
  const parsed = saveBillInput.safeParse(billPayload(form));
  if (!parsed.success) return parsed.error.issues[0]?.message ?? BILL_MESSAGES.lines;
  if (posting && billTotals(form.lines.map(lineNumbers)).total <= 0) return BILL_MESSAGES.empty;
  return null;
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run tests/finance-payment-form.test.ts tests/finance-bill-form.test.ts`
Expected: PASS. 28 tests in `finance-payment-form`, 22 in `finance-bill-form`.

- [ ] **Step 7: Give `ConfirmRow` a tone, an icon and Escape**

Replace the whole of `src/components/finance/confirm-row.tsx`. Its two existing users (`contacts-view.tsx`, `products-view.tsx`) pass neither new prop and keep the red row with the bin. What changes for them: Escape now cancels, and the question sits in a `div` instead of a `p`. `data-finance-focus` and `autoFocus` stay on Cancel.

```tsx
'use client';

import type { ReactNode } from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

/** Replaces a table row while asking whether to really go ahead. Never a browser dialog. */
export function ConfirmRow({
  colSpan,
  label,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onCancel,
  tone = 'destructive',
  icon: Icon = Trash2,
}: {
  colSpan: number;
  /** Names the question for screen readers, e.g. "Delete Lim Hardware". */
  label: string;
  /** The question itself. It may hold a field, such as the date a payment was made. */
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** `destructive` (the default) for deleting and voiding; `default` for a step that loses nothing. */
  tone?: 'destructive' | 'default';
  /** The icon on the confirm button; a bin unless given. */
  icon?: LucideIcon;
}) {
  const destructive = tone === 'destructive';
  return (
    <TableRow className={destructive ? 'bg-destructive/5 hover:bg-destructive/5' : 'bg-muted/40 hover:bg-muted/40'}>
      <TableCell colSpan={colSpan}>
        <div
          role="group"
          aria-label={label}
          // Stays in view when the table has been scrolled sideways on a phone.
          className="sticky left-2 flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-3 py-1 whitespace-normal md:max-w-none"
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || pending) return;
            event.stopPropagation();
            onCancel();
          }}
        >
          <div className="min-w-48 flex-1 text-sm">{children}</div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="button" variant={destructive ? 'destructive' : 'default'} size="sm" onClick={onConfirm} disabled={pending}>
            <Icon className="size-4" />
            {pending ? pendingLabel : confirmLabel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending} autoFocus data-finance-focus>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 8: Write the download helper**

Create `src/components/finance/download-csv.ts`:

```ts
'use client';

/**
 * Hands the browser a CSV file to save. The text comes from toCsv in
 * src/lib/finance/csv.ts, which has already made it safe to open in a
 * spreadsheet. Call it from a click handler only: it needs the document.
 */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 9: Write the finance error page**

First read the convention for this Next version: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`. It confirms three things this file depends on: an `error.tsx` must be a Client Component with a default export; it receives `{ error, retry }` (and `reset`); and "In most cases, you should use `retry()`", which re-fetches and re-renders the segment, where `reset()` re-renders without re-fetching. A screen that failed to read needs the re-fetch, so the button calls `retry`.

The file sits beside `actions.ts`. It wraps every page under `/finance/…` and leaves the app's sidebar and header in place. `scripts/gen-screen-routes.mjs` only writes and removes generated `page.tsx` files, so it does not touch this one.

Create `src/app/(app)/finance/error.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Button } from '@/components/ui/button';

/**
 * Shown in place of any finance screen whose data could not be read, instead
 * of the framework's bare error page. `retry` re-fetches and re-renders the
 * screen; nothing the person had saved is affected.
 */
export default function FinanceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The digest matches this to the server's own log line.
    console.error('[finance] a screen could not be loaded:', error);
  }, [error]);

  return (
    <ScreenContainer>
      <section
        role="alert"
        className="mx-auto mt-10 max-w-md rounded-xl border bg-card p-6 text-center text-card-foreground shadow-sm"
      >
        <h1 className="text-lg font-semibold tracking-tight">This page could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing was changed. Check your connection, then try again.
        </p>
        <Button type="button" size="sm" className="mt-4" onClick={() => retry()}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
      </section>
    </ScreenContainer>
  );
}
```

- [ ] **Step 10: Type-check, lint, build and commit**

Run, as separate commands: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm exec vitest run tests/screen-routes.test.ts`, `pnpm build`
Expected: no errors; the route test passes (the error file is not a route); the build completes.

```bash
git add src/lib/finance/payment-form.ts src/lib/finance/bill-form.ts tests/finance-payment-form.test.ts tests/finance-bill-form.test.ts src/components/finance/confirm-row.tsx src/components/finance/download-csv.ts "src/app/(app)/finance/error.tsx"
git commit -m "feat: the bill and payment forms' rules as tested functions; a calmer confirm row, CSV download and a finance error page"
```

---

### Task 5: Payments Out goes interactive

**Files:**
- Create: `src/components/finance/payment-form-card.tsx`
- Create: `src/components/finance/payments-view.tsx`
- Replace: `src/screens/finance/payments-out.tsx`

**Interfaces:**
- Consumes:
  - Actions (Task 3): `recordPaymentOutAction`, `markPaymentPaidAction`, `voidPaymentAction`, `deleteScheduledPaymentAction`.
  - `@/lib/finance/purchase-views` (Task 2): `paymentsView`, `todayUtc`, `filterPayments`, `paymentsCsv`, `alsoCovers`, `displayDate`, `LATEST_ROWS`, `PAYMENT_STATUS_LABELS`, types `PaymentsViewData`, `PaymentStatusFilter`, `PaymentMethodFilter`.
  - `@/lib/finance/payment-form` (Task 4): `payableBills`, `paymentSuppliers`, `billsOf`, `newPaymentForm`, `chooseSupplier`, `toggleBill`, `toggleAll`, `paymentTotal`, `paymentPayload`, `paymentFormError`, type `PayableBill`.
  - `@/lib/finance/bill-math` (Task 1): `localIsoDate`. `@/lib/finance/csv` (Task 1): `csvFileName`. `@/lib/finance/format`: `rm`.
  - `@/lib/finance/money`: `listPaymentsOut`, `listAccounts`, `markPaymentPaidInput`, `PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, types `PaymentOutRow`, `FinanceAccount`, `PaymentMethod`. `@/lib/finance/bills`: `listBills`, type `BillListRow`.
  - `ConfirmRow` with `tone` and `icon`, and `downloadCsv` (Task 4). `RowMenu`, `RowMenuItem` from `@/components/finance/row-menu`; `useFinanceAction` from `@/components/finance/use-finance-action`.
- Produces:
  - `@/components/finance/payment-form-card`: `type RecordPayment = (input: unknown) => Promise<FinResult<{ id: string }>>`; `PaymentFormCard({ payable, accounts, today, preselect, record, onClose }: { payable: PayableBill[]; accounts: FinanceAccount[]; today: string; preselect?: { supplierId: string; billId: string }; record: RecordPayment; onClose: () => void })`. Task 6 renders it too.
  - `@/components/finance/payments-view`: `type PaymentActions = { record: RecordPayment; markPaid: (input: unknown) => Promise<FinResult<{ id: string; number: string }>>; voidPayment: (input: unknown) => Promise<FinResult<{ id: string }>>; remove: (input: unknown) => Promise<FinResult<{ id: string }>> }`; `type PaymentsWriter = { actions: PaymentActions; bills: BillListRow[]; accounts: FinanceAccount[] }`; `PaymentsView({ rows, view, writer }: { rows: PaymentOutRow[]; view: PaymentsViewData; writer?: PaymentsWriter })`.

How the screen behaves:

- The loader reads the payment rows for everybody, and the bills and accounts only for a person who may edit. `writer` is passed only to them; without it there is no header button, no "⋯" column and no form.
- One thing is open at a time, held in one piece of state: the payment form, or a question in one row (mark as paid, void, delete).
- A scheduled row offers "Mark as paid" and "Delete"; a paid row offers "Void"; a void row has no menu.
- A payment split across bills is several rows. Every action is sent the payment's `transaction_id`, so it acts on the whole payment from whichever row was used, and the question names the other bills (`alsoCovers`).
- Each menu choice sets `opens: true`, so focus lands on the question's Cancel button (`data-finance-focus`) and not back on the row's button.
- Export is shown to everybody, viewers included: it downloads what they can already see.
- If a question's row disappears in a refresh (someone else deleted the payment), the refusal is shown beside the filters instead, so it is still seen.

- [ ] **Step 1: Write the payment form card**

No test comes first for the three files of this task: Vitest has no DOM here, and every rule the components apply is already tested in Tasks 2 and 4. Verification is the type-check, the linter and the build.

Create `src/components/finance/payment-form-card.tsx`:

```tsx
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
  const [form, setForm] = useState(() => newPaymentForm(payable, accounts, today, preselect));
  const save = useFinanceAction();

  const suppliers = paymentSuppliers(payable);
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
```

Things in that file that are easy to get wrong:

- The supplier `Select` is controlled with `value={form.supplierId}`, which is `''` until one is chosen; Radix then shows the `SelectValue` placeholder. No `SelectItem` has an empty value.
- `autoFocus` and `data-finance-focus` are on the supplier trigger: the first puts focus there when the header button opens the card, the second when a row menu does (Task 6's Pay).
- The amount boxes are `type="number"`. A browser gives `''` for text it cannot read as a number, and `typedNumber` gives `null` for anything else odd, so the person sees "Enter an amount above 0." rather than a wrong payment.
- The `legend` is the first child of its `fieldset`; that is what names the group for a screen reader.
- The bills list has `max-h-80 overflow-y-auto`: twenty bills scroll inside the card. Each bill's row wraps (`flex-wrap`) so at 390 px the amount box drops under the bill's details instead of pushing the card wider.

- [ ] **Step 2: Write the Payments Out client view**

Create `src/components/finance/payments-view.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Ban, CircleCheck, Download, PieChart, Plus, Search, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { AreaTrend, DonutStat, type Series } from '@/components/charts';
import { ConfirmRow } from '@/components/finance/confirm-row';
import { downloadCsv } from '@/components/finance/download-csv';
import { PaymentFormCard, type RecordPayment } from '@/components/finance/payment-form-card';
import { RowMenu, type RowMenuItem } from '@/components/finance/row-menu';
import { useFinanceAction } from '@/components/finance/use-finance-action';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { NoMatchesRow } from '@/components/screen/table-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiveDot } from '@/components/ui/live-dot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { localIsoDate } from '@/lib/finance/bill-math';
import type { BillListRow } from '@/lib/finance/bills';
import { csvFileName } from '@/lib/finance/csv';
import { rm } from '@/lib/finance/format';
import {
  type FinanceAccount,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentOutRow,
  markPaymentPaidInput,
} from '@/lib/finance/money';
import { payableBills } from '@/lib/finance/payment-form';
import {
  LATEST_ROWS,
  PAYMENT_STATUS_LABELS,
  type PaymentMethodFilter,
  type PaymentStatusFilter,
  type PaymentsViewData,
  alsoCovers,
  displayDate,
  filterPayments,
  paymentsCsv,
} from '@/lib/finance/purchase-views';
import type { FinResult } from '@/lib/finance/result';
import { cn } from '@/lib/utils';

export type PaymentActions = {
  record: RecordPayment;
  markPaid: (input: unknown) => Promise<FinResult<{ id: string; number: string }>>;
  voidPayment: (input: unknown) => Promise<FinResult<{ id: string }>>;
  remove: (input: unknown) => Promise<FinResult<{ id: string }>>;
};

/** What only a person who may edit is given: the actions, and what the payment form offers. */
export type PaymentsWriter = {
  actions: PaymentActions;
  /** Every bill, to find the ones that can still be paid. */
  bills: BillListRow[];
  accounts: FinanceAccount[];
};

const PAID_SERIES: Series[] = [
  { key: 'electronic', label: 'Electronic (RM k)', color: 'var(--chart-1)' },
  { key: 'cash', label: 'Cash / cheque (RM k)', color: 'var(--chart-2)' },
];

const STATUS_STYLES: Record<PaymentOutRow['status'], string> = {
  posted: 'bg-emerald-500/15 text-emerald-600',
  scheduled: 'bg-amber-500/15 text-amber-600',
  pending_approval: 'bg-amber-500/15 text-amber-600',
  draft: 'bg-muted text-muted-foreground',
  rejected: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-muted-foreground line-through',
};

/** One thing open at a time: the payment form, or a question in one row. */
type Open =
  | { kind: 'form'; today: string }
  | { kind: 'markPaid'; row: PaymentOutRow; paidOn: string }
  | { kind: 'void'; row: PaymentOutRow }
  | { kind: 'delete'; row: PaymentOutRow }
  | null;

export function PaymentsView({
  rows,
  view,
  writer,
}: {
  /** One row per bill a payment pays, newest first; void ones included. */
  rows: PaymentOutRow[];
  view: PaymentsViewData;
  writer?: PaymentsWriter;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<PaymentStatusFilter>('current');
  const [method, setMethod] = useState<PaymentMethodFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const confirm = useFinanceAction();

  const matching = filterPayments(rows, query, status, method);
  const shown = showAll ? matching : matching.slice(0, LATEST_ROWS);
  const columns = writer ? 9 : 8;
  const asking = open && open.kind !== 'form' ? open : null;
  // A row that is gone after a refresh takes its question with it; the message still has to be seen.
  const askingInView = asking ? shown.some((r) => r.allocation_id === asking.row.allocation_id) : false;

  const ask = (next: Exclude<Open, null>) => {
    confirm.clear();
    setOpen(next);
  };

  const menu = (row: PaymentOutRow): RowMenuItem[] => {
    if (row.status === 'scheduled') {
      return [
        {
          label: 'Mark as paid',
          icon: CircleCheck,
          opens: true,
          onSelect: () => ask({ kind: 'markPaid', row, paidOn: localIsoDate(new Date()) }),
        },
        { label: 'Delete', icon: Trash2, destructive: true, opens: true, onSelect: () => ask({ kind: 'delete', row }) },
      ];
    }
    if (row.status === 'posted') {
      return [{ label: 'Void', icon: Ban, destructive: true, opens: true, onSelect: () => ask({ kind: 'void', row }) }];
    }
    return [];
  };

  const question = (row: PaymentOutRow) => {
    if (!writer || !asking || asking.row.allocation_id !== row.allocation_id) return null;
    const { actions } = writer;
    const id = row.transaction_id;
    const whole = rm(row.transaction_amount);
    const also = alsoCovers(rows, row);
    const close = () => setOpen(null);

    if (asking.kind === 'markPaid') {
      const paidOn = asking.paidOn;
      return (
        <ConfirmRow
          key={row.allocation_id}
          colSpan={columns}
          tone="default"
          icon={CircleCheck}
          label={`Mark the payment to ${row.supplier_name} as paid`}
          confirmLabel="Mark as paid"
          pendingLabel="Saving…"
          pending={confirm.pending}
          error={confirm.error}
          onConfirm={() => {
            const parsed = markPaymentPaidInput.safeParse({ id, paid_on: paidOn });
            if (!parsed.success) {
              confirm.fail(parsed.error.issues[0]?.message ?? 'Enter a valid date.');
              return;
            }
            confirm.run(() => actions.markPaid(parsed.data), close);
          }}
          onCancel={close}
        >
          <label className="flex flex-wrap items-center gap-2">
            <span>
              The payment of <span className="font-medium">{whole}</span> to{' '}
              <span className="font-medium">{row.supplier_name}</span> was made on
            </span>
            <Input
              type="date"
              className="w-40"
              value={paidOn}
              onChange={(e) => setOpen({ kind: 'markPaid', row, paidOn: e.target.value })}
            />
          </label>
          {also ? <p className="mt-1 text-muted-foreground">{also}</p> : null}
        </ConfirmRow>
      );
    }
    if (asking.kind === 'void') {
      return (
        <ConfirmRow
          key={row.allocation_id}
          colSpan={columns}
          icon={Ban}
          label={`Void payment ${row.number ?? ''} to ${row.supplier_name}`}
          confirmLabel="Void payment"
          pendingLabel="Voiding…"
          pending={confirm.pending}
          error={confirm.error}
          onConfirm={() => confirm.run(() => actions.voidPayment({ id }), close)}
          onCancel={close}
        >
          Void payment <span className="font-medium">{row.number}</span> of <span className="font-medium">{whole}</span> to{' '}
          <span className="font-medium">{row.supplier_name}</span>? The bills it paid will owe that amount again. This
          cannot be undone. {also}
        </ConfirmRow>
      );
    }
    return (
      <ConfirmRow
        key={row.allocation_id}
        colSpan={columns}
        label={`Delete the scheduled payment to ${row.supplier_name}`}
        confirmLabel="Delete payment"
        pendingLabel="Deleting…"
        pending={confirm.pending}
        error={confirm.error}
        onConfirm={() => confirm.run(() => actions.remove({ id }), close)}
        onCancel={close}
      >
        Delete the scheduled payment of <span className="font-medium">{whole}</span> to{' '}
        <span className="font-medium">{row.supplier_name}</span>? Nothing has been paid yet, so the bills stay as they
        are. {also}
      </ConfirmRow>
    );
  };

  return (
    <ScreenContainer>
      <PageHeader
        title="Payments Out"
        subtitle="Payments made to suppliers, Saudara."
        actions={
          writer ? (
            <Button
              size="sm"
              aria-expanded={open?.kind === 'form'}
              onClick={() => setOpen({ kind: 'form', today: localIsoDate(new Date()) })}
            >
              <Plus className="size-4" />
              Record Payment
            </Button>
          ) : undefined
        }
      />

      <BentoGrid>
        {writer && open?.kind === 'form' ? (
          <PaymentFormCard
            payable={payableBills(writer.bills, rows)}
            accounts={writer.accounts}
            today={open.today}
            record={writer.actions.record}
            onClose={() => setOpen(null)}
          />
        ) : null}

        {view.stats.map((s, i) => (
          <BentoCard key={s.label} tone={i === 0 ? 'primary' : 'default'} className="col-span-1 md:col-span-3">
            <BentoStat label={s.label} value={s.value} delta={s.delta} deltaTone={s.deltaTone} onPrimary={i === 0} />
          </BentoCard>
        ))}

        <BentoCard
          title="Payments over time"
          subtitle="Electronic vs cash · last 8 months"
          icon={TrendingUp}
          className="col-span-2 md:col-span-8"
        >
          <AreaTrend data={view.trend} series={PAID_SERIES} height={240} showLegend />
        </BentoCard>
        <BentoCard title="Paid by method" subtitle="Month to date · RM" icon={PieChart} className="col-span-2 md:col-span-4">
          <DonutStat data={view.byMethod} height={240} centerValue={view.paidMtd} centerLabel="paid" />
        </BentoCard>

        <BentoCard
          title="Payments"
          subtitle="One row for each bill a payment pays"
          icon={Wallet}
          flush
          action={
            matching.length > LATEST_ROWS ? (
              <Button variant="outline" size="sm" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show latest' : 'View all'}
              </Button>
            ) : undefined
          }
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search payments by supplier, bill, voucher number or reference"
                placeholder="Search payments…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as PaymentStatusFilter)}>
              <SelectTrigger className="w-44" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Paid and scheduled</SelectItem>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="posted">Paid</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethodFilter)}>
              <SelectTrigger className="w-40" aria-label="Method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={matching.length === 0}
              onClick={() => downloadCsv(csvFileName('payments-out', localIsoDate(new Date())), paymentsCsv(matching))}
            >
              <Download className="size-4" />
              Export
            </Button>
            {confirm.error && !askingInView ? (
              <p role="alert" className="text-sm text-destructive">
                {confirm.error}
              </p>
            ) : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>No.</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {writer ? (
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 &&
                  (rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        No payments yet.{writer ? ' Record one against a posted bill.' : ''}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <NoMatchesRow colSpan={columns} />
                  ))}
                {shown.map((p) => {
                  const asked = question(p);
                  if (asked) return asked;
                  const items = writer ? menu(p) : [];
                  return (
                    <TableRow key={p.allocation_id} className={cn(p.status === 'void' && 'opacity-60')}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{displayDate(p.txn_date)}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{p.number ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium">{p.supplier_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.bill_no ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{p.account_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="whitespace-nowrap">
                          {PAYMENT_METHOD_LABELS[p.method]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{rm(p.amount)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <LiveDot active={p.status === 'posted'} />
                          <span
                            className={cn(
                              'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
                              STATUS_STYLES[p.status],
                            )}
                          >
                            {PAYMENT_STATUS_LABELS[p.status]}
                          </span>
                        </span>
                      </TableCell>
                      {writer ? (
                        <TableCell>
                          {items.length ? (
                            <RowMenu label={`${p.number ?? 'the scheduled payment'} to ${p.supplier_name}`} items={items} />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Showing {shown.length} of {matching.length} payments
            {matching.length !== rows.length ? ` (${rows.length} in all)` : ''}
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
```

- [ ] **Step 3: Replace the screen with a loader**

Replace the whole of `src/screens/finance/payments-out.tsx`. It no longer imports from `@/lib/finance/purchases`.

The sample is now raw rows run through `paymentsView`, the same builder live data uses, so the sample's sparklines and hand-written deltas go (as they did on Customers & Suppliers and Products). It is pinned to 10 Oct 2026 so "Paid (MTD)" does not read RM 0 once October has passed, and it carries a pair of rows for each earlier month so the trend chart keeps a shape.

```tsx
import {
  deleteScheduledPaymentAction,
  markPaymentPaidAction,
  recordPaymentOutAction,
  voidPaymentAction,
} from '@/app/(app)/finance/actions';
import { type PaymentActions, PaymentsView } from '@/components/finance/payments-view';
import { can } from '@/lib/auth/permissions';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import { listBills } from '@/lib/finance/bills';
import { type PaymentMethod, type PaymentOutRow, listAccounts, listPaymentsOut } from '@/lib/finance/money';
import { paymentsView, todayUtc } from '@/lib/finance/purchase-views';
import { createClient } from '@/lib/supabase/server';

/* ---- sample data (Rimba Ventures Sdn Bhd), shown when there is no database ---- */

/** The sample is a fixed month, so its figures do not drain away as the calendar moves on. */
const SAMPLE_TODAY = '2026-10-10';

const sample = (
  n: number,
  txn_date: string,
  supplier_name: string,
  bill_no: string,
  method: PaymentMethod,
  amount: number,
  status: 'posted' | 'scheduled' = 'posted',
): PaymentOutRow => ({
  allocation_id: `sample-${n}`,
  transaction_id: `sample-${n}`,
  number: status === 'posted' ? `PV-${String(n).padStart(4, '0')}` : null,
  txn_date,
  method,
  amount,
  transaction_amount: amount,
  status,
  reference: null,
  account_id: method === 'cash' ? 'cash' : 'bank',
  account_name: method === 'cash' ? 'Cash in hand' : 'Main Bank',
  bill_id: `sample-bill-${n}`,
  bill_no,
  supplier_name,
});

/** Earlier months, so the trend has a shape: [month, paid electronically, paid in cash]. */
const SAMPLE_HISTORY: [string, number, number][] = [
  ['2026-03', 7200, 2100],
  ['2026-04', 8000, 1800],
  ['2026-05', 8600, 2400],
  ['2026-06', 9100, 2000],
  ['2026-07', 9800, 1600],
  ['2026-08', 10200, 2100],
  ['2026-09', 6200, 1900],
];

const SAMPLE_PAYMENTS: PaymentOutRow[] = [
  sample(121, '2026-10-12', 'Syarikat Maju Jaya', 'BILL-0228', 'bank_transfer', 4300, 'scheduled'),
  sample(120, '2026-10-10', 'Suria Utilities Sdn Bhd', 'BILL-0229', 'bank_transfer', 1800, 'scheduled'),
  sample(119, '2026-10-07', 'Nusantara Logistics', 'BILL-0225', 'fpx', 1180),
  sample(118, '2026-10-06', 'Printhub Enterprise', 'BILL-0230', 'bank_transfer', 1450),
  sample(117, '2026-10-04', 'Unifi Business (TM)', 'BILL-0227', 'duitnow', 299),
  sample(116, '2026-10-02', 'Kedai Kertas Ah Seng', 'BILL-0224', 'cash', 1650),
  sample(115, '2026-09-28', 'Lim Hardware Sdn Bhd', 'BILL-0221', 'cheque', 4200),
  ...SAMPLE_HISTORY.flatMap(([month, electronic, cash], i) => [
    sample(100 - i * 2, `${month}-15`, 'Lim Hardware Sdn Bhd', `BILL-${String(200 - i * 2).padStart(4, '0')}`, 'bank_transfer', electronic),
    sample(99 - i * 2, `${month}-20`, 'Kedai Kertas Ah Seng', `BILL-${String(199 - i * 2).padStart(4, '0')}`, 'cash', cash),
  ]),
].sort((x, y) => y.txn_date.localeCompare(x.txn_date));

const ACTIONS: PaymentActions = {
  record: recordPaymentOutAction,
  markPaid: markPaymentPaidAction,
  voidPayment: voidPaymentAction,
  remove: deleteScheduledPaymentAction,
};

export default async function PaymentsOutScreen() {
  if (!hasSupabaseEnv()) {
    return <PaymentsView rows={SAMPLE_PAYMENTS} view={paymentsView(SAMPLE_PAYMENTS, SAMPLE_TODAY)} />;
  }
  const viewer = await getViewer();
  const ctx = { client: await createClient(), orgId: viewer.orgId };
  const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');
  // The payment form offers open bills and accounts; a viewer has no form, so neither is read for them.
  const [rows, bills, accounts] = await Promise.all([
    listPaymentsOut(ctx),
    canEdit ? listBills(ctx) : [],
    canEdit ? listAccounts(ctx) : [],
  ]);
  return (
    <PaymentsView
      rows={rows}
      view={paymentsView(rows, todayUtc())}
      writer={canEdit ? { actions: ACTIONS, bills, accounts } : undefined}
    />
  );
}
```

- [ ] **Step 4: Type-check, lint, test and build**

Run, as separate commands: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
Expected: no type or lint errors; every unit test passes (`tests/purchases-view.test.ts` included: `purchases.ts` still exists and Supplier Bills still uses it); the build completes.

If the linter reports `react-hooks/set-state-in-effect` or a rule about refs, the file was changed from what is written here: this view has no effect and no ref.

- [ ] **Step 5: Check for banned colours and names**

Run: `git diff main -- src | grep -n -i -E "^\+.*(purple|violet|fuchsia|indigo|kuasa\.ai)"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/payment-form-card.tsx src/components/finance/payments-view.tsx src/screens/finance/payments-out.tsx
git commit -m "feat: record, schedule, mark paid, void and delete payments out; search, filters, view all and CSV export"
```

---

### Task 6: Supplier Bills goes interactive

**Files:**
- Create: `src/components/finance/line-items-editor.tsx`
- Create: `src/components/finance/bill-form-card.tsx`
- Create: `src/components/finance/bills-view.tsx`
- Replace: `src/screens/finance/supplier-bills.tsx`

**Interfaces:**
- Consumes:
  - Actions (Task 3): `saveBillAction`, `saveAndPostBillAction`, `postBillAction`, `voidBillAction`, `deleteBillAction`, `getBillAction`, `recordPaymentOutAction`.
  - `@/lib/finance/purchase-views` (Task 2): `billsView`, `todayUtc`, `filterBills`, `billsCsv`, `displayDate`, `LATEST_ROWS`, `BILL_STATUS_LABELS`, types `BillsViewData`, `BillFilter`.
  - `@/lib/finance/bill-form` (Task 4): `emptyLine`, `newBillForm`, `billFormFromDetail`, `withSupplier`, `withBillDate`, `withDueDate`, `withProduct`, `lineNumbers`, `billPayload`, `billFormError`, type `LineDraft`.
  - `@/lib/finance/bill-math` (Task 1): `billTotals`, `lineAmounts`, `localIsoDate`. `@/lib/finance/csv` (Task 1): `csvFileName`. `@/lib/finance/payment-form` (Task 4): `payableBills`.
  - `@/lib/finance/bills`: `listBills`, `BILL_LINES_MAX`, types `BillListRow`, `BillDetail`, `BillDisplayStatus`, `SaveAndPostResult` (Task 3). `@/lib/finance/money`: `listPaymentsOut`, `listAccounts`, types `PaymentOutRow`, `FinanceAccount`. `@/lib/finance/contacts`: `listContacts`, type `FinanceContact` (it has `payment_terms_days`, `is_supplier`, `active`). `@/lib/finance/products`: `listProducts`, type `FinanceProduct` (it has `name`, `uom`, `cost`, `sst_rate`, `active`).
  - `PaymentFormCard`, `RecordPayment` from `@/components/finance/payment-form-card` (Task 5); `ConfirmRow` and `downloadCsv` (Task 4); `RowMenu`, `RowMenuItem`; `useFinanceAction`.
- Produces:
  - `@/components/finance/line-items-editor`: `LineItemsEditor({ lines, products, onChange }: { lines: LineDraft[]; products: FinanceProduct[]; onChange: (lines: LineDraft[]) => void })`
  - `@/components/finance/bill-form-card`: `type BillFormActions = { save: (input: unknown) => Promise<FinResult<{ id: string }>>; saveAndPost: (input: unknown) => Promise<SaveAndPostResult> }`; `BillFormCard({ editing, suppliers, products, today, actions, onClose }: { editing?: BillDetail; suppliers: FinanceContact[]; products: FinanceProduct[]; today: string; actions: BillFormActions; onClose: () => void })`
  - `@/components/finance/bills-view`: `type BillActions = BillFormActions & { post; voidBill; remove; get; recordPayment }`; `type BillsWriter = { actions: BillActions; suppliers: FinanceContact[]; products: FinanceProduct[]; accounts: FinanceAccount[]; payments: PaymentOutRow[] }`; `BillsView({ rows, view, writer }: { rows: BillListRow[]; view: BillsViewData; writer?: BillsWriter })`

How the screen behaves:

- One thing is open at a time, held in one piece of state: the new-bill form, the edit form (or its "Loading…" card), the payment form for one bill, or a void or delete question in one row.
- Row menu by status. Draft: Edit, Post, Delete. Pending or Overdue: Pay (only when the bill can still take a payment, see Task 4), Void. Paid: Void, which the database refuses while the bill's payments stand; the choice is offered and the refusal, shown in the row, says why. Void: no menu.
- Edit reads the draft's lines through `getBillAction`. The read is started by the menu choice itself, not by an effect: a small card with "Loading…" and a focused Cancel button appears at once (so focus has somewhere to land), and is replaced by the form when the lines arrive. If the bill has gone or been posted meanwhile, the card shows that sentence and the list behind it has already been refreshed.
- "Save draft" is the form's submit button. "Save and post" is a second button. If the save works and the post is refused, the action's answer carries `draftId`; the form adopts it as its `id`, so pressing either button again changes that draft instead of saving another bill.
- A draft's supplier or a line's product may have been archived since it was saved. The supplier is then added to the picker from the draft itself; the product shows as "Archived item". Neither is silently dropped.
- The lines editor has no table and no sideways scroll. Below the `md` breakpoint each line is a bordered card with its boxes two to a row; from `md` up a line is one 12-column row, and only the first line shows its labels (the others keep them for screen readers).

- [ ] **Step 1: Write the line-items editor**

No test comes first for the four files of this task: Vitest has no DOM here, and the rules are tested in Tasks 1, 2 and 4.

Create `src/components/finance/line-items-editor.tsx`:

```tsx
'use client';

import { useId, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type LineDraft, emptyLine, lineNumbers, withProduct } from '@/lib/finance/bill-form';
import { billTotals, lineAmounts } from '@/lib/finance/bill-math';
import { BILL_LINES_MAX } from '@/lib/finance/bills';
import { rm } from '@/lib/finance/format';
import type { FinanceProduct } from '@/lib/finance/products';
import { cn } from '@/lib/utils';

/** Radix Select has no empty value; this stands for "no product" and never leaves the component. */
const NO_PRODUCT = 'none';

/**
 * The lines of a bill, with live totals. On a phone each line is a card with
 * its fields stacked two to a row; from the md breakpoint a line is one row.
 * Nothing scrolls sideways. The arithmetic is in src/lib/finance/bill-math.ts.
 */
export function LineItemsEditor({
  lines,
  products,
  onChange,
}: {
  lines: LineDraft[];
  /** Active products and services, for the optional picker. */
  products: FinanceProduct[];
  onChange: (lines: LineDraft[]) => void;
}) {
  const id = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  /** The line just added, so its first box can take focus once it is on the page. */
  const justAdded = useRef<string | null>(null);
  const totals = billTotals(lines.map(lineNumbers));

  const change = (key: string, next: (line: LineDraft) => LineDraft) =>
    onChange(lines.map((line) => (line.key === key ? next(line) : line)));

  const add = () => {
    const key = `new-${Date.now()}-${lines.length}`;
    justAdded.current = key;
    onChange([...lines, emptyLine(key)]);
  };

  const remove = (key: string) => {
    onChange(lines.filter((line) => line.key !== key));
    // The button that was pressed is gone; keep the keyboard somewhere useful.
    addButton.current?.focus();
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-3 md:space-y-2">
        {lines.map((line, index) => {
          const n = index + 1;
          const field = (name: string) => `${id}-${line.key}-${name}`;
          // From md up only the first line shows its labels, like a table's header row.
          const label = cn('text-xs text-muted-foreground', index > 0 && 'md:sr-only');
          // A product archived since the draft was saved is still this line's product.
          const known = line.product_id === '' || products.some((p) => p.id === line.product_id);
          return (
            <li
              key={line.key}
              aria-label={`Line ${n}`}
              className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-12 md:items-end md:border-0 md:p-0"
            >
              <div className="col-span-2 space-y-1 md:col-span-2">
                <Label htmlFor={field('product')} className={label}>
                  Product
                </Label>
                <Select
                  value={line.product_id || NO_PRODUCT}
                  onValueChange={(v) =>
                    change(line.key, (l) => withProduct(l, v === NO_PRODUCT ? null : (products.find((p) => p.id === v) ?? null)))
                  }
                >
                  <SelectTrigger id={field('product')} className="w-full" aria-label={`Product for line ${n}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRODUCT}>No product</SelectItem>
                    {known ? null : <SelectItem value={line.product_id}>Archived item</SelectItem>}
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1 md:col-span-3">
                <Label htmlFor={field('description')} className={label}>
                  Description
                </Label>
                <Input
                  id={field('description')}
                  ref={(input) => {
                    if (!input || justAdded.current !== line.key) return;
                    justAdded.current = null;
                    input.focus();
                  }}
                  value={line.description}
                  maxLength={200}
                  autoComplete="off"
                  aria-label={`Description for line ${n}`}
                  onChange={(e) => change(line.key, (l) => ({ ...l, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor={field('quantity')} className={label}>
                  Qty
                </Label>
                <Input
                  id={field('quantity')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  className="tabular-nums"
                  value={line.quantity}
                  aria-label={`Quantity for line ${n}`}
                  onChange={(e) => change(line.key, (l) => ({ ...l, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor={field('uom')} className={label}>
                  Unit
                </Label>
                <Input
                  id={field('uom')}
                  value={line.uom}
                  maxLength={200}
                  placeholder="unit"
                  autoComplete="off"
                  aria-label={`Unit for line ${n}`}
                  onChange={(e) => change(line.key, (l) => ({ ...l, uom: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor={field('price')} className={label}>
                  Unit price (RM)
                </Label>
                <Input
                  id={field('price')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  placeholder="0.00"
                  className="tabular-nums"
                  value={line.unit_price}
                  aria-label={`Unit price for line ${n}`}
                  onChange={(e) => change(line.key, (l) => ({ ...l, unit_price: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor={field('sst')} className={label}>
                  SST %
                </Label>
                <Input
                  id={field('sst')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  className="tabular-nums"
                  value={line.sst_rate}
                  aria-label={`SST percent for line ${n}`}
                  onChange={(e) => change(line.key, (l) => ({ ...l, sst_rate: e.target.value }))}
                />
              </div>
              <div className="col-span-2 flex items-end justify-between gap-2 md:col-span-2">
                <div className="min-w-0 space-y-1">
                  <span className={cn('block', label)}>Amount</span>
                  <output
                    htmlFor={`${field('quantity')} ${field('price')}`}
                    aria-label={`Amount for line ${n}`}
                    className="flex h-8 items-center truncate text-sm font-medium tabular-nums"
                  >
                    {rm(lineAmounts(lineNumbers(line)).amount)}
                  </output>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${n}`}
                  disabled={lines.length === 1}
                  onClick={() => remove(line.key)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button ref={addButton} type="button" variant="outline" size="sm" disabled={lines.length >= BILL_LINES_MAX} onClick={add}>
          <Plus className="size-4" />
          Add line
        </Button>
        <dl className="grid w-full grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm sm:w-64" aria-live="polite">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">{rm(totals.subtotal)}</dd>
          <dt className="text-muted-foreground">SST</dt>
          <dd className="text-right tabular-nums">{rm(totals.sst)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold tabular-nums">{rm(totals.total)}</dd>
        </dl>
      </div>
    </div>
  );
}
```

Keyboard notes for that file: "Add line" puts focus in the new line's Description box (the `ref` callback on that `Input` runs when the box is first on the page); removing a line moves focus to "Add line", because the button that was pressed no longer exists; the remove button is disabled while one line remains. `Button` and `Input` take `ref` as an ordinary prop in React 19.

- [ ] **Step 2: Write the bill form card**

Create `src/components/finance/bill-form-card.tsx`:

```tsx
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
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={save.pending}>
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
```

- [ ] **Step 3: Write the Supplier Bills client view**

Create `src/components/finance/bills-view.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Ban, Banknote, ChartColumn, Download, FileCheck, FileText, Pencil, PieChart, Plus, Search, Trash2 } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { BarGroup, DonutStat, type Series } from '@/components/charts';
import { BillFormCard, type BillFormActions } from '@/components/finance/bill-form-card';
import { ConfirmRow } from '@/components/finance/confirm-row';
import { downloadCsv } from '@/components/finance/download-csv';
import { PaymentFormCard, type RecordPayment } from '@/components/finance/payment-form-card';
import { RowMenu, type RowMenuItem } from '@/components/finance/row-menu';
import { useFinanceAction } from '@/components/finance/use-finance-action';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { NoMatchesRow } from '@/components/screen/table-filter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiveDot } from '@/components/ui/live-dot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { localIsoDate } from '@/lib/finance/bill-math';
import type { BillDetail, BillDisplayStatus, BillListRow } from '@/lib/finance/bills';
import type { FinanceContact } from '@/lib/finance/contacts';
import { csvFileName } from '@/lib/finance/csv';
import { rm } from '@/lib/finance/format';
import type { FinanceAccount, PaymentOutRow } from '@/lib/finance/money';
import { payableBills } from '@/lib/finance/payment-form';
import type { FinanceProduct } from '@/lib/finance/products';
import {
  BILL_STATUS_LABELS,
  type BillFilter,
  type BillsViewData,
  LATEST_ROWS,
  billsCsv,
  displayDate,
  filterBills,
} from '@/lib/finance/purchase-views';
import type { FinResult } from '@/lib/finance/result';
import { cn } from '@/lib/utils';

export type BillActions = BillFormActions & {
  post: (input: unknown) => Promise<FinResult<{ id: string; bill_no: string }>>;
  voidBill: (input: unknown) => Promise<FinResult<{ id: string }>>;
  remove: (input: unknown) => Promise<FinResult<{ id: string }>>;
  /** Reads one draft with its lines, for the Edit form. */
  get: (input: unknown) => Promise<FinResult<BillDetail>>;
  recordPayment: RecordPayment;
};

/** What only a person who may edit is given: the actions, and what the two forms offer. */
export type BillsWriter = {
  actions: BillActions;
  /** Active suppliers, by name. */
  suppliers: FinanceContact[];
  /** Active products and services. */
  products: FinanceProduct[];
  accounts: FinanceAccount[];
  /** Every payment row, to know what scheduled payments already hold of each bill. */
  payments: PaymentOutRow[];
};

const SUPPLIER_SERIES: Series[] = [{ key: 'value', label: 'Outstanding (RM)', color: 'var(--chart-1)' }];

const STATUS_STYLES: Record<BillDisplayStatus, string> = {
  paid: 'bg-emerald-500/15 text-emerald-600',
  pending: 'bg-amber-500/15 text-amber-600',
  overdue: 'bg-red-500/15 text-red-600',
  draft: 'bg-muted text-muted-foreground',
  void: 'bg-muted text-muted-foreground line-through',
};

/** One thing open at a time: a form card, or a question in one row. */
type Open =
  | { kind: 'new'; today: string }
  /** `detail` is null while the draft's lines are being read. */
  | { kind: 'edit'; bill: BillListRow; detail: BillDetail | null; today: string }
  | { kind: 'pay'; bill: BillListRow; today: string }
  | { kind: 'void'; bill: BillListRow }
  | { kind: 'delete'; bill: BillListRow }
  | null;

const billName = (bill: BillListRow) => `${bill.bill_no ?? 'the draft bill'} from ${bill.supplier_name}`;

export function BillsView({
  rows,
  view,
  writer,
}: {
  /** Every bill, newest first; drafts and void ones included. */
  rows: BillListRow[];
  view: BillsViewData;
  writer?: BillsWriter;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BillFilter>('open');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const rowAction = useFinanceAction();
  const confirm = useFinanceAction();
  const loader = useFinanceAction();

  const matching = filterBills(rows, query, filter);
  const shown = showAll ? matching : matching.slice(0, LATEST_ROWS);
  const columns = writer ? 8 : 7;
  const billCount = view.byStatus.reduce((n, s) => n + s.value, 0);
  const payable = writer ? payableBills(rows, writer.payments) : [];
  const asking = open && (open.kind === 'void' || open.kind === 'delete') ? open : null;
  // A row that is gone after a refresh takes its question with it; the message still has to be seen.
  const askingInView = asking ? shown.some((b) => b.id === asking.bill.id) : false;
  const now = () => localIsoDate(new Date());
  const close = () => setOpen(null);

  const menu = (bill: BillListRow, actions: BillActions): RowMenuItem[] => {
    const voidItem: RowMenuItem = {
      label: 'Void',
      icon: Ban,
      destructive: true,
      opens: true,
      onSelect: () => {
        confirm.clear();
        setOpen({ kind: 'void', bill });
      },
    };
    if (bill.display_status === 'draft') {
      return [
        {
          label: 'Edit',
          icon: Pencil,
          opens: true,
          onSelect: () => {
            loader.clear();
            setOpen({ kind: 'edit', bill, detail: null, today: now() });
            loader.run(
              () => actions.get({ id: bill.id }),
              // Still waiting on this bill? Something else may have been opened meanwhile.
              (detail) => setOpen((cur) => (cur?.kind === 'edit' && cur.bill.id === bill.id ? { ...cur, detail } : cur)),
            );
          },
        },
        {
          label: 'Post',
          icon: FileCheck,
          onSelect: () => {
            close();
            rowAction.run(() => actions.post({ id: bill.id }));
          },
        },
        {
          label: 'Delete',
          icon: Trash2,
          destructive: true,
          opens: true,
          onSelect: () => {
            confirm.clear();
            setOpen({ kind: 'delete', bill });
          },
        },
      ];
    }
    if (bill.display_status === 'pending' || bill.display_status === 'overdue') {
      // A bill whose balance is already covered by scheduled payments can take no more.
      const canPay = payable.some((b) => b.id === bill.id);
      return [
        ...(canPay
          ? [{ label: 'Pay', icon: Banknote, opens: true, onSelect: () => setOpen({ kind: 'pay', bill, today: now() }) }]
          : []),
        voidItem,
      ];
    }
    // Voiding a paid bill is refused while its payments stand; the choice stays, and the refusal says why.
    if (bill.display_status === 'paid') return [voidItem];
    return [];
  };

  const question = (bill: BillListRow) => {
    if (!writer || !asking || asking.bill.id !== bill.id) return null;
    const { actions } = writer;
    if (asking.kind === 'void') {
      return (
        <ConfirmRow
          key={bill.id}
          colSpan={columns}
          icon={Ban}
          label={`Void ${billName(bill)}`}
          confirmLabel="Void bill"
          pendingLabel="Voiding…"
          pending={confirm.pending}
          error={confirm.error}
          onConfirm={() => confirm.run(() => actions.voidBill({ id: bill.id }), close)}
          onCancel={close}
        >
          Void <span className="font-medium">{bill.bill_no}</span> from{' '}
          <span className="font-medium">{bill.supplier_name}</span> ({rm(bill.total)})? It stays in the list as Void and
          nothing more is owed on it. This cannot be undone. A bill that has payments cannot be voided until they are
          voided or deleted.
        </ConfirmRow>
      );
    }
    return (
      <ConfirmRow
        key={bill.id}
        colSpan={columns}
        label={`Delete ${billName(bill)}`}
        confirmLabel="Delete draft"
        pendingLabel="Deleting…"
        pending={confirm.pending}
        error={confirm.error}
        onConfirm={() => confirm.run(() => actions.remove({ id: bill.id }), close)}
        onCancel={close}
      >
        Delete the draft bill from <span className="font-medium">{bill.supplier_name}</span> ({rm(bill.total)})? This
        cannot be undone.
      </ConfirmRow>
    );
  };

  const card = () => {
    if (!writer || !open) return null;
    const { actions } = writer;
    if (open.kind === 'new') {
      return (
        <BillFormCard
          key="new"
          suppliers={writer.suppliers}
          products={writer.products}
          today={open.today}
          actions={actions}
          onClose={close}
        />
      );
    }
    if (open.kind === 'edit') {
      return open.detail ? (
        <BillFormCard
          // A different draft gets a fresh form.
          key={open.detail.id}
          editing={open.detail}
          suppliers={writer.suppliers}
          products={writer.products}
          today={open.today}
          actions={actions}
          onClose={close}
        />
      ) : (
        <BentoCard title="Edit bill" subtitle={`The draft from ${open.bill.supplier_name}`} icon={FileText} className="col-span-2 md:col-span-12">
          <div className="flex flex-wrap items-center gap-3">
            {loader.error ? (
              <p role="alert" className="text-sm text-destructive">
                {loader.error}
              </p>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Loading…
              </p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={close} autoFocus data-finance-focus>
              {loader.error ? 'Close' : 'Cancel'}
            </Button>
          </div>
        </BentoCard>
      );
    }
    if (open.kind === 'pay') {
      return (
        <PaymentFormCard
          key={open.bill.id}
          payable={payable}
          accounts={writer.accounts}
          today={open.today}
          preselect={{ supplierId: open.bill.supplier_id, billId: open.bill.id }}
          record={actions.recordPayment}
          onClose={close}
        />
      );
    }
    return null;
  };

  const tableError = rowAction.error ?? (askingInView ? null : confirm.error);

  return (
    <ScreenContainer>
      <PageHeader
        title="Supplier Bills"
        subtitle="Bills payable to your suppliers, Saudara."
        actions={
          writer ? (
            <Button size="sm" aria-expanded={open?.kind === 'new'} onClick={() => setOpen({ kind: 'new', today: now() })}>
              <Plus className="size-4" />
              New Bill
            </Button>
          ) : undefined
        }
      />

      <BentoGrid>
        {card()}

        {view.stats.map((s, i) => (
          <BentoCard key={s.label} tone={i === 0 ? 'primary' : 'default'} className="col-span-1 md:col-span-3">
            <BentoStat label={s.label} value={s.value} delta={s.delta} deltaTone={s.deltaTone} onPrimary={i === 0} />
          </BentoCard>
        ))}

        <BentoCard
          title="Payable by supplier"
          subtitle="Outstanding balance · RM"
          icon={ChartColumn}
          className="col-span-2 md:col-span-8"
        >
          {view.bySupplier.length ? (
            <BarGroup data={view.bySupplier} series={SUPPLIER_SERIES} horizontal height={220} />
          ) : (
            <p className="grid h-55 place-items-center text-sm text-muted-foreground">No open balances.</p>
          )}
        </BentoCard>
        <BentoCard title="Bills by status" subtitle="Current book" icon={PieChart} className="col-span-2 md:col-span-4">
          <DonutStat data={view.byStatus} height={220} centerValue={String(billCount)} centerLabel="bills" />
        </BentoCard>

        <BentoCard
          title="Bills"
          subtitle="What your suppliers have billed you"
          icon={FileText}
          flush
          action={
            matching.length > LATEST_ROWS ? (
              <Button variant="outline" size="sm" aria-pressed={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show latest' : 'View all'}
              </Button>
            ) : undefined
          }
          className="col-span-2 md:col-span-12"
        >
          <div className="flex flex-wrap items-center gap-2 px-4">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search bills by number or supplier"
                placeholder="Search bills or suppliers…"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as BillFilter)}>
              <SelectTrigger className="w-40" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">All open</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={matching.length === 0}
              onClick={() => downloadCsv(csvFileName('supplier-bills', now()), billsCsv(matching))}
            >
              <Download className="size-4" />
              Export
            </Button>
            {rowAction.pending ? (
              <p role="status" className="text-sm text-muted-foreground">
                Posting…
              </p>
            ) : null}
            {tableError ? (
              <p role="alert" className="text-sm text-destructive">
                {tableError}
              </p>
            ) : null}
          </div>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>No.</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  {writer ? (
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 &&
                  (rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">
                        No supplier bills yet.{writer ? ' Add the first one with New Bill.' : ''}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <NoMatchesRow colSpan={columns} />
                  ))}
                {shown.map((b) => {
                  const asked = question(b);
                  if (asked) return asked;
                  const items = writer ? menu(b, writer.actions) : [];
                  return (
                    <TableRow key={b.id} className={cn(b.display_status === 'void' && 'opacity-60')}>
                      <TableCell className="whitespace-nowrap font-medium">{b.bill_no ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{displayDate(b.bill_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{b.supplier_name}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{displayDate(b.due_date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{rm(b.total)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{rm(b.balance)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <LiveDot active={b.display_status === 'paid'} />
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                              STATUS_STYLES[b.display_status],
                            )}
                          >
                            {BILL_STATUS_LABELS[b.display_status]}
                          </span>
                        </span>
                      </TableCell>
                      {writer ? <TableCell>{items.length ? <RowMenu label={billName(b)} items={items} /> : null}</TableCell> : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            Showing {shown.length} of {matching.length} bills
            {matching.length !== rows.length ? ` (${rows.length} in all)` : ''}
          </div>
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
```

- [ ] **Step 4: Replace the screen with a loader**

Replace the whole of `src/screens/finance/supplier-bills.tsx`. It no longer imports from `@/lib/finance/purchases`. As on Payments Out, the sample is raw rows run through `billsView` and pinned to 10 Oct 2026.

```tsx
import {
  deleteBillAction,
  getBillAction,
  postBillAction,
  recordPaymentOutAction,
  saveAndPostBillAction,
  saveBillAction,
  voidBillAction,
} from '@/app/(app)/finance/actions';
import { type BillActions, BillsView } from '@/components/finance/bills-view';
import { can } from '@/lib/auth/permissions';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import { type BillDisplayStatus, type BillListRow, listBills } from '@/lib/finance/bills';
import { listContacts } from '@/lib/finance/contacts';
import { type PaymentOutRow, listAccounts, listPaymentsOut } from '@/lib/finance/money';
import { listProducts } from '@/lib/finance/products';
import { billsView, todayUtc } from '@/lib/finance/purchase-views';
import { createClient } from '@/lib/supabase/server';

/* ---- sample data (Rimba Ventures Sdn Bhd), shown when there is no database ---- */

/** The sample is a fixed month, so its figures do not drain away as the calendar moves on. */
const SAMPLE_TODAY = '2026-10-10';

const sample = (
  n: number,
  bill_date: string,
  supplier_name: string,
  due_date: string,
  total: number,
  display_status: BillDisplayStatus,
): BillListRow => ({
  id: `sample-${n}`,
  bill_no: display_status === 'draft' ? null : `BILL-${String(n).padStart(4, '0')}`,
  supplier_id: supplier_name,
  supplier_name,
  bill_date,
  due_date,
  total,
  paid: display_status === 'paid' ? total : 0,
  balance: display_status === 'paid' ? 0 : total,
  display_status,
});

const SAMPLE_BILLS: BillListRow[] = [
  sample(232, '2026-10-08', 'Nusantara Logistics', '2026-10-13', 2600, 'pending'),
  sample(233, '2026-10-07', 'Kedai Kertas Ah Seng', '2026-11-06', 780, 'draft'),
  sample(231, '2026-10-05', 'Lim Hardware Sdn Bhd', '2026-11-04', 3200, 'pending'),
  sample(230, '2026-09-30', 'Printhub Enterprise', '2026-10-30', 1450, 'paid'),
  sample(229, '2026-09-22', 'Suria Utilities Sdn Bhd', '2026-10-06', 1800, 'overdue'),
  sample(228, '2026-09-18', 'Syarikat Maju Jaya', '2026-10-18', 4300, 'pending'),
  sample(227, '2026-09-10', 'Unifi Business (TM)', '2026-10-10', 299, 'paid'),
];

const samplePayment = (n: number, txn_date: string, bill: BillListRow): PaymentOutRow => ({
  allocation_id: `sample-payment-${n}`,
  transaction_id: `sample-payment-${n}`,
  number: `PV-${String(n).padStart(4, '0')}`,
  txn_date,
  method: 'bank_transfer',
  amount: bill.total,
  transaction_amount: bill.total,
  status: 'posted',
  reference: null,
  account_id: 'bank',
  account_name: 'Main Bank',
  bill_id: bill.id,
  bill_no: bill.bill_no,
  supplier_name: bill.supplier_name,
});

const SAMPLE_PAYMENTS: PaymentOutRow[] = [
  samplePayment(118, '2026-10-06', SAMPLE_BILLS[3]),
  samplePayment(117, '2026-10-04', SAMPLE_BILLS[6]),
];

const ACTIONS: BillActions = {
  save: saveBillAction,
  saveAndPost: saveAndPostBillAction,
  post: postBillAction,
  voidBill: voidBillAction,
  remove: deleteBillAction,
  get: getBillAction,
  recordPayment: recordPaymentOutAction,
};

export default async function SupplierBillsScreen() {
  if (!hasSupabaseEnv()) {
    return <BillsView rows={SAMPLE_BILLS} view={billsView(SAMPLE_BILLS, SAMPLE_PAYMENTS, SAMPLE_TODAY)} />;
  }
  const viewer = await getViewer();
  const ctx = { client: await createClient(), orgId: viewer.orgId };
  const canEdit = !viewer.isDemo && can(viewer.role, 'edit-data');
  // The forms offer suppliers, products and accounts; a viewer has no form, so none of them is read for them.
  const [rows, payments, contacts, products, accounts] = await Promise.all([
    listBills(ctx),
    listPaymentsOut(ctx),
    canEdit ? listContacts(ctx) : [],
    canEdit ? listProducts(ctx) : [],
    canEdit ? listAccounts(ctx) : [],
  ]);
  return (
    <BillsView
      rows={rows}
      view={billsView(rows, payments, todayUtc())}
      writer={
        canEdit
          ? {
              actions: ACTIONS,
              suppliers: contacts.filter((c) => c.is_supplier && c.active),
              products: products.filter((p) => p.active),
              accounts,
              payments,
            }
          : undefined
      }
    />
  );
}
```

- [ ] **Step 5: Type-check, lint, test and build**

Run, as separate commands: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
Expected: no type or lint errors; every unit test passes; the build completes.

- [ ] **Step 6: Check nothing imports the old module, and for banned colours and names**

Run: `grep -rn "finance/purchases'" src`
Expected: no output. (`purchase-views` does not match: the pattern ends at the quote.)

Run: `git diff main -- src | grep -n -i -E "^\+.*(purple|violet|fuchsia|indigo|kuasa\.ai)"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/line-items-editor.tsx src/components/finance/bill-form-card.tsx src/components/finance/bills-view.tsx src/screens/finance/supplier-bills.tsx
git commit -m "feat: supplier bills with line items: new, edit, post, pay, void and delete; search, filters, view all and CSV export"
```

---

### Task 7: Remove the old module, document, and verify the branch

**Files:**
- Delete: `src/lib/finance/purchases.ts`
- Delete: `tests/purchases-view.test.ts`
- Modify: `src/config/live-screens.ts` (a comment)
- Modify: `docs/bendahara-backend.md`

**Interfaces:**
- Consumes: nothing imports `@/lib/finance/purchases` after Task 6.
- Produces: nothing new.

- [ ] **Step 1: Delete the old view module and its test**

Everything `tests/purchases-view.test.ts` checked is checked on the new builders by `tests/finance-purchase-views.test.ts` (Task 2), except `toPaymentRow`, which no longer exists: the screens now read `PaymentOutRow` straight from `listPaymentsOut`.

```bash
git rm src/lib/finance/purchases.ts tests/purchases-view.test.ts
```

Run: `grep -rn "finance/purchases'" src tests`
Expected: no output.

- [ ] **Step 2: Correct the comment in `src/config/live-screens.ts`**

Replace:

```ts
  // Bendahara. Supplier Bills and Payments Out read the workspace's own data
  // but have no form to add to them yet.
  'finance/customers-suppliers',
```

with:

```ts
  // Bendahara
  'finance/customers-suppliers',
```

- [ ] **Step 3: Update the backend note**

In `docs/bendahara-backend.md`, four edits.

1. In "Write path", after the paragraph that ends "With no Supabase environment it shows sample data and no actions.", add this paragraph and table:

```markdown
The rules of a screen or a form that need no browser are pure functions beside
the data layer, with unit tests; the client components only draw them.

| File | Holds |
|---|---|
| `purchase-views.ts` | KPI figures, chart data, table filters and CSV rows for Supplier Bills and Payments Out |
| `bill-math.ts` | Line amounts and bill totals, rounded exactly as the generated columns `amount` and `sst_amount` round them |
| `bill-form.ts` | The bill form: defaults, the due date following the supplier's terms, validation, what is sent |
| `payment-form.ts` | The payment form: which bills can take a payment and how much, defaults, validation, what is sent |
| `csv.ts` | CSV text for Export: RFC 4180, a UTF-8 byte-order mark, and a guard against spreadsheet formulas |

The forms validate by running the write's own Zod schema on what they are about
to send, so the browser and the server say the same sentences.

A server action refreshes the screens after every attempt that reached the
database, refused or not, so a record someone else changed or removed shows as
it now is. `saveAndPostBillAction` saves a draft and posts it; when only the
post is refused it answers with the draft's id (`draftId`) and the form goes on
editing that draft. `getBillAction` reads one draft with its lines for the Edit
form. `src/app/(app)/finance/error.tsx` is shown when a finance screen's data
cannot be read.
```

2. In "Money", after the paragraph that ends "`supplier_bill_totals` counts only posted money out as paid.", add:

```markdown
A bill's `balance` is its total less paid money. What a new payment may take is
less than that when payments are scheduled: the allocation guard counts
scheduled payments too. The payment form works this out (`payableBills`) and
does not offer a bill that scheduled payments already cover.
```

3. In "Error codes", after the row for `FIN11`, add two rows:

```markdown
| `42501` | Row-level security refused the write: "You do not have permission to make changes here." |
| `22003` | A number does not fit its column (quantity × unit price can overflow): "That amount is too large." |
```

4. In "Known limits", replace these three bullets:

```markdown
- Supplier Bills and Payments Out still have no forms; the data layer for them
  is in `bills.ts` and `money.ts`.
- The Payments Out screen charts four payment methods; DuitNow, card and
  e-wallet are counted with bank transfers until its form is built.
- Approval of money out is not enforced yet.
```

with:

```markdown
- A scheduled payment cannot be edited: delete it and schedule it again.
- Supplier Bills and Payments Out load every bill and payment and filter in the
  browser. The product picker on a bill line is a plain list with no search.
- KPI figures and Overdue use the UTC date; the forms' default dates use the
  person's own calendar date.
- A payment's account must be active when it is chosen (only active accounts
  are offered), but the database does not refuse an archived account yet.
- Voiding a paid bill is offered and refused until its payments are voided.
- Posted and void bills and payments cannot be deleted, by design.
- Approval of money out is not enforced yet.
```

- [ ] **Step 4: Run everything**

Run, as separate commands: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`
Expected: no type or lint errors; every test passes (the `tests/bendahara-*.test.ts` database tests run if `.env.local` is present and skip themselves if not; this branch changes nothing they read); the build completes.

- [ ] **Step 5: Check the boundaries the build does not check**

Run: `grep -n "^export" "src/app/(app)/finance/actions.ts" | grep -v "export async function"`
Expected: no output. A `'use server'` file exports only async functions.

Run: `grep -l -E "supabase/server|next/headers" src/lib/finance/*.ts`
Expected: no output. No file in `src/lib/finance/` imports the server-side client any more.

Run: `git diff main -- src | grep -n -i -E "^\+.*(purple|violet|fuchsia|indigo|kuasa\.ai)"`
Expected: no output.

Run: `grep -rn -E "window\.confirm|alert\(" src/components/finance src/screens/finance/supplier-bills.tsx src/screens/finance/payments-out.tsx`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/config/live-screens.ts docs/bendahara-backend.md
git commit -m "chore: drop the old purchases view module; document the bill and payment forms"
```

- [ ] **Step 7: Hand back**

Do not push. Report what was built, the result of the four commands in Step 4, and anything that had to differ from this plan. The controller pushes and opens the PR (title `feat-091-bendahara-bill-forms`) when the owner says so.

---

## Controller: production smoke test after the merge

Not a task for an implementer. Run on `https://openkuasa.com` after the merge has deployed, signed in with the smoke account (`~/.config/openkuasa/smoke-account.json`). After each navigation wait and take a screenshot before clicking: a background tab stays on the loading skeleton.

Everything below is created in the smoke workspace. Posted and void bills and payments cannot be deleted, by design, so the records this test posts stay there. Prefix their names with "Smoke 2b" so they are recognisable, and reuse the same supplier and product on later runs rather than adding new ones.

1. **Open.** `/finance/supplier-bills` and `/finance/payments-out` load with no work-in-progress banner. Both show "New Bill" / "Record Payment", a "⋯" on each row that has actions, and an Export button.
2. **Supplier and product.** On Customers & Suppliers add a supplier named `=Smoke 2b, Supplier 林` (ticked Supplier, payment terms 14). On Products add "Smoke 2b Gloves": unit `box`, cost 12.50, SST 6.
3. **Draft bill with two lines.** New Bill. Choose the supplier: the due date becomes the bill date + 14 days. Line 1: choose the product; description, unit, unit price 12.5 and SST 6 fill in; set Qty 10. Press "Add line": focus is in the new line's Description. Line 2: "Delivery", Qty 1, unit price 20. The totals read Subtotal RM 145.00, SST RM 7.50, Total RM 152.50. Press Enter inside a quantity box: nothing is saved. "Save draft": the card closes; the bill is in the table as Draft with "—" for its number and Total RM 152.50.
4. **Edit it.** "⋯" → Edit: "Loading…", then the form with both lines. Change line 1's Qty to 20: Total RM 285.00. "Save draft". The row shows RM 285.00.
5. **Post it.** "⋯" → Post: the row gets a `BILL-` number and becomes Pending, Balance RM 285.00. "Total payable" has gone up by RM 285.
6. **Pay part now.** "⋯" → Pay: the payment card opens at the top with the supplier chosen and this bill ticked for 285.00. Change the amount to 100, keep "Pay now", "Record payment". The bill's Balance is RM 185.00. On Payments Out there is a Paid row with a `PV-` number for RM 100.00.
7. **Schedule the rest.** On Payments Out, "Record Payment": choose the supplier; the bill shows "RM 185.00 to pay". Tick it, choose "Schedule for later", a date three days on, "Schedule payment". The new row is Scheduled with "—" for its number. Back on Supplier Bills the bill still shows Balance RM 185.00 and its "⋯" no longer offers Pay. "Record Payment" again: this bill is not offered (and the supplier is not listed at all, unless it has other open bills).
8. **Mark it paid.** On the scheduled row "⋯" → Mark as paid: the question is not red, asks for the date (today), and focus is on Cancel; Escape closes it. Open it again and confirm. The row is Paid with a `PV-` number; the bill is Paid with Balance RM 0.00.
9. **A split payment, voided from its second row.** Add two more bills for the same supplier with "Save and post" (one line each, RM 50.00 and RM 30.00). On Payments Out note the "Payments" figure. "Record Payment", choose the supplier, "Tick all", "Record payment": two rows appear with the same `PV-` number, and "Payments" has gone up by one, not two. On the second of the two rows "⋯" → Void: the question says "This payment also covers BILL-…". Confirm. Both rows leave the default list; choosing Void in the status filter shows both, struck through; both bills are Pending again.
10. **Void a bill.** On the bill paid in step 8, "⋯" → Void → confirm: refused in the row with "This bill has payments. Void or delete them before voiding it." Cancel. On Payments Out void its two payments (RM 100.00 and RM 185.00). Back on the bill, Void → confirm: it becomes Void and leaves the default list; the "Void" filter shows it. Void one of the step 9 bills too (it has no standing payments): it works first time.
11. **Two tabs.** Save a new draft. In tab A open it with Edit and change a quantity. In tab B post the same bill. In tab A press "Save draft": the form shows "This bill is posted and can no longer be changed. Void it instead.", what was typed is still there, and the row behind the form now reads Pending. Cancel. Then, with a second draft, open tab A's list, delete the draft in tab B, and choose Edit in tab A: the card says "That bill no longer exists." and the row has gone.
12. **Export.** On each screen press Export with the default filter, then with the status filter on Void. Open the files (`supplier-bills-YYYY-MM-DD.csv`, `payments-out-YYYY-MM-DD.csv`) in Excel or Numbers: the supplier reads `'=Smoke 2b, Supplier 林` in one cell, no formula has run, 林 is readable, and Total, Balance and Amount are numbers that can be summed.
13. **390 px and dark mode.** At 390 px wide, in light and in dark: both screens, the new-bill form with three lines, and the payment form. The forms do not scroll sideways; each bill line is a card with its boxes two to a row; the payment form's amount box sits under its bill. With the window made short, the payment form's bills list scrolls inside the card and the buttons stay reachable. No purple anywhere.
14. **A comma.** In the payment form type `1,200.50` as an amount (paste it if the browser will not let it be typed): the box is empty or the form answers "Enter an amount above 0."; nothing is recorded.
15. **Not a writer.** In the demo workspace (or signed in as a viewer): both screens show the figures, charts, table, search, filters and Export, with no header button and no "⋯".

Leave behind: the smoke supplier and product, and the posted and void bills and payments. Delete any draft bills and scheduled payments the test left.

---

## Self-review notes

**Spec coverage for this stage.**

- Common behaviour: layout kept with figures from the workspace's data (Tasks 2, 5, 6); forms as cards closed by default (5, 6); a "⋯" menu per row with the actions that apply (5, 6); delete and void confirmed in the page (4, 5, 6); search and filters in the browser, "View all" (2, 5, 6); Export of the filtered rows as CSV (1, 2, 5, 6); viewers get no buttons and no menus and the actions check again (3, 5, 6, with a test in 3); sample data with no actions when there is no Supabase environment (5, 6).
- Purchases: Supplier Bills "New with line items, edit draft, post, pay, void, delete draft" and the five states (6); Payments Out "Record payment against one or more open bills, schedule for a later date, mark paid, delete" and both states, plus Void, which stage 2a decided a paid payment gets instead of delete (5).
- Code: one schema and one function per write, called by actions that guard, parse, call and revalidate (3); view builders as pure functions (2); loader screens that pass actions only to writers (5, 6); line-items editor, document form card and an allocation editor inside the payment form card (5, 6).
- Errors: messages beside the form with typed values kept (5, 6); refusals as sentences, two more of them (1); "a record changed or removed by someone else: the form says so and reloads" (3, and the two-tab step of the smoke test).
- Testing: unit tests for every view builder and schema, and for both forms' rules (1, 2, 3, 4); the smoke test above.

**Deliberately left out.** Approval of payments; editing a scheduled payment; printing or PDF; accounts management; attaching receipts; AI tools; any migration; refusing an archived account in the database. A money-input component and separate contact, product and account pickers (the spec's "Code" section lists them) are not split out: each is one `Select` or `Input` here, and the Sales stage is the first place a second user would appear. Period selectors: neither mock-up has one.

**Checked by compiling, not only by reading.** Every file in this plan was written into a scratch copy of the repository, outside the working tree, and the following were run there: `tsc --noEmit` (clean), `eslint` (clean), every new unit test (pass, with the counts quoted in the tasks), the whole existing unit suite (pass), and a webpack production build (completes; the default Turbopack build could not run from a copy with a linked `node_modules`, so `pnpm build` itself is first run by Task 3's implementer). The four components were also rendered once on the server with sample props to see that they do not throw. No browser was used: layout at 390 px, focus movement, the Radix selects opening, and the download are first seen in the smoke test.

**Unsure about, stated plainly.**

1. Whether a refresh triggered by a *refused* action keeps an open form's typed values in every case. React keeps client state across a server refresh when the component stays at the same place in the tree, which holds here; the two-tab smoke step is what proves it.
2. `autoFocus` on a Radix `SelectTrigger` (the supplier picker in both forms). It is a `button`, and React focuses a button with `autoFocus` when it mounts; if it does not take focus when opened from the header button, move `autoFocus` and `data-finance-focus` to the first `Input`.
3. The product picker lists up to 1,000 products with no search. Fine for a small catalogue; a workspace with hundreds will want a searchable picker.
4. The two fixed colours for Cash and Cheque do not follow the user's chosen theme the way `--chart-1…5` do.
5. "Pay" is hidden, not disabled, on a bill that scheduled payments fully cover. A person may wonder where it went; the scheduled payment is on Payments Out. A hint in the row would need a per-bill scheduled figure in the table, which the design's columns do not have.
6. With the default filter, a bill or payment that has just been voided leaves the list at once. That is what the filter says, but it can look like a deletion; the footer's "(N in all)" is the only cue.
7. The Edit form's failure sentence when the read itself fails is new wording ("That could not be loaded. Please try again.").
