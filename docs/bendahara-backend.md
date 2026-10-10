# Bendahara backend

How the finance screens read and write. Design:
`docs/superpowers/specs/2026-10-10-bendahara-crud-design.md`.

## Write path

Each write is one Zod schema and one function in `src/lib/finance/`, taking a
`FinanceWriteContext` (`{ client, orgId }`) and returning a `FinResult`. The
server actions in `src/app/(app)/finance/actions.ts` check the viewer may edit,
parse the input with that schema, call the function and revalidate the screens
that show the data. `org_id` never comes from the browser.

A screen file under `src/screens/finance/` is an async server component: it
loads the rows, builds the figures with a pure `…View` function, and passes the
client view its actions only when the viewer can edit. The header "Add" button
is shown only to people who can add. With no Supabase environment it shows
sample data and no actions.

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

## Tables

Every finance table carries `org_id`. A table that other tables point at
exposes a unique `(org_id, id)` and is referenced by that pair. All finance
tables have member-read, writer-write RLS with the restrictive `mfa_required`
policy.

| Table | Holds |
|---|---|
| `finance_contacts` | Customers and suppliers. `is_customer` and `is_supplier` can both be true. |
| `finance_products` | Products and services for document lines. `cost` keeps four decimals, `price` two. |
| `finance_accounts` | Bank and cash accounts. Every workspace starts with "Main Bank" and "Cash in hand". No screen yet. |
| `finance_categories` | Expense and income categories. Every workspace starts with nine. No screen yet. |
| `finance_sequences` | The next document number per type. |
| `supplier_bills`, `supplier_bill_lines` | Supplier bills and their lines. A draft has no `bill_no`. |
| `finance_transactions` | One row per movement of money: direction, account, date, amount, method, status. |
| `finance_allocations` | How a movement is split across the documents it pays. Only bills so far. |

## Document numbers

`select public.finance_next_number(target_org, doc)` with `doc` set to
`'invoice'` returns the next number (`INV-0001`) and moves the counter on. It locks the workspace's row for that
type, so simultaneous callers never get the same number. Types: `invoice`,
`quotation`, `credit_note`, `bill`, `receipt`, `voucher`. Call it from inside
the database function that posts a document, so a failed post does not use up a
number.

## Money

Money is entered once. A payment out is one `finance_transactions` row with
direction `out`, split across one supplier's bills by `finance_allocations`.
The view `finance_payments_out` has one row per bill a payment pays;
`supplier_bill_totals` counts only posted money out as paid.

A bill's `balance` is its total less paid money. What a new payment may take is
less than that when payments are scheduled: the allocation guard counts
scheduled payments too. The payment form works this out (`payableBills`) and
does not offer a bill that scheduled payments already cover.

Statuses of a transaction: `draft` (being written by a database function),
`scheduled` (not yet money out), `posted` (paid; numbered `PV-0001`), `void`.
`pending_approval` and `rejected` exist for the approval rule that arrives
with Payment Vouchers and Expenses; nothing sets them yet.

## Posted is locked

Triggers enforce it, so no caller can get round it:

- A draft bill can be edited and deleted. A posted bill can only be voided,
  and not while it has payments. Its lines are locked with it.
- A bill is always created as a draft. It can only be posted once its lines
  add up to more than zero, whichever way the status is changed.
- A scheduled payment can be deleted or marked paid; the data layer has no
  function to edit one yet. It cannot be voided: only a paid payment is voided.
  A paid one can only be
  voided, which frees the bills it paid. Its split is locked with it.
- A payment cannot exceed what is still owed on a bill, counting scheduled
  payments. The bill row is locked while this is checked, so two payments at
  the same moment are checked one after the other.
- Clearing a deleted user from a payment's `created_by` or `approved_by` is
  allowed on a posted payment.
- Each guard steps aside when the workspace itself is being deleted.

## Database functions

All run as the caller, so RLS decides who may write.

| Function | Does |
|---|---|
| `finance_save_bill(target_org, bill, lines)` | Creates a draft bill or replaces a draft's header and lines. Returns the id. |
| `finance_post_bill(target_org, target_bill)` | Posts a draft and returns its number. |
| `finance_record_payment_out(target_org, payment, allocations)` | Records a payment; `payment.status` is `posted` (the default) or `scheduled`. Returns the id. |
| `finance_mark_payment_paid(target_org, target_txn, paid_on)` | Scheduled to paid. Returns the number. |
| `finance_next_number(target_org, doc)` | The next document number. |

Voiding a bill or a payment, and deleting a draft bill or a scheduled payment,
are plain updates and deletes; the guards decide whether they are allowed.

## Error codes

The guards and functions raise these SQLSTATEs; `bills.ts`, `money.ts` and
`contacts.ts` turn them into sentences.

| Code | Meaning |
|---|---|
| `FIN01` | The bill is posted or void and cannot be changed or deleted. Also: a bill must be created as a draft, a draft cannot be voided (delete it), and only a draft can be posted; the lines of a posted bill are locked with it. |
| `FIN02` | The bill has payments (paid, scheduled or in progress), so it cannot be voided |
| `FIN03` | The allocations add up to more than the payment |
| `FIN04` | A payment can only go against a posted bill, and only money out pays a bill |
| `FIN05` | The amount is more than is still owed on the bill |
| `FIN06` | No bill was chosen or found, or the bills belong to different suppliers |
| `FIN07` | The contact has bills, so Supplier cannot be unticked |
| `FIN09` | The payment is posted or void and cannot be changed or deleted, its split cannot be changed, or it is not scheduled and so cannot be marked paid; a payment that was never paid cannot be voided (delete it) |
| `FIN10` | The bill has no lines, or its lines total nothing; it cannot be saved without a line or posted without an amount |
| `FIN11` | The bill or payment no longer exists |
| `42501` | Row-level security refused the write: "You do not have permission to make changes here." |
| `22003` | A number does not fit its column (quantity × unit price can overflow): "That amount is too large." |

## Known limits

- A scheduled payment cannot be edited: delete it and schedule it again.
- Supplier Bills and Payments Out load every bill and payment and filter in the
  browser. The product picker on a bill line is a plain list with no search.
- KPI figures and Overdue use the UTC date; the forms' default dates use the
  person's own calendar date.
- Payment dates are not restricted: "pay now" accepts a future date and
  "schedule for later" a past one.
- A payment's account must be active when it is chosen (only active accounts
  are offered), but the database does not refuse an archived account yet.
- Voiding a paid bill is offered and refused until its payments are voided.
- Posted and void bills and payments cannot be deleted, by design.
- Approval of money out is not enforced yet.
- Posting goes through database functions that run as the caller. An editor
  writing to the tables directly, rather than through the app, could still post
  a bill or a payment with a number of their own choosing, or change the amount
  or account of a scheduled payment after it has been split across bills.
  Numbers stay unique per workspace either way. Closing this needs posting
  functions that run with their own rights, planned with the approval rule.
- Contacts and products load the first 1,000 by name; search is in the browser.
  Only the contact list is capped this way: a contact's Payable is read by
  paging through every open bill, 1,000 at a time, so it is never cut short.
- Receivable is 0 until invoices exist.
- Stock and revenue per item are not tracked.
- A contact's Payable counts bills that are pending or overdue, and the
  Payable card is totalled from every open bill, not only the contacts loaded.
