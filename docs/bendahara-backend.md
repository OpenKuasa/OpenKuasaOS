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

`select public.finance_next_number(org, 'invoice')` returns the next number
(`INV-0001`) and moves the counter on. It locks the workspace's row for that
type, so simultaneous callers never get the same number. Types: `invoice`,
`quotation`, `credit_note`, `bill`, `receipt`, `voucher`. Call it from inside
the database function that posts a document, so a failed post does not use up a
number.

## Money

Money is entered once. A payment out is one `finance_transactions` row with
direction `out`, split across one supplier's bills by `finance_allocations`.
The view `finance_payments_out` has one row per bill a payment pays;
`supplier_bill_totals` counts only posted money out as paid.

Statuses of a transaction: `draft` (being written by a database function),
`scheduled` (not yet money out), `posted` (paid; numbered `PV-0001`), `void`.
`pending_approval` and `rejected` exist for the approval rule that arrives
with Payment Vouchers and Expenses; nothing sets them yet.

## Posted is locked

Triggers enforce it, so no caller can get round it:

- A draft bill can be edited and deleted. A posted bill can only be voided,
  and not while it has payments. Its lines are locked with it.
- A scheduled payment can be edited and deleted. A paid one can only be
  voided, which frees the bills it paid. Its split is locked with it.
- A payment cannot exceed what is still owed on a bill, counting scheduled
  payments. The bill row is locked while this is checked, so two payments at
  the same moment are checked one after the other.
- Each guard steps aside when the workspace itself is being deleted.

## Database functions

All run as the caller, so RLS decides who may write.

| Function | Does |
|---|---|
| `finance_save_bill(org, bill, lines)` | Creates a draft bill or replaces a draft's header and lines. Returns the id. |
| `finance_post_bill(org, bill_id)` | Posts a draft and returns its number. |
| `finance_record_payment_out(org, payment, allocations)` | Records a payment, `posted` or `scheduled`. Returns the id. |
| `finance_mark_payment_paid(org, txn_id, paid_on)` | Scheduled to paid. Returns the number. |
| `finance_next_number(org, type)` | The next document number. |

Voiding a bill or a payment, and deleting a draft bill or a scheduled payment,
are plain updates and deletes; the guards decide whether they are allowed.

## Error codes

The guards and functions raise these SQLSTATEs; `bills.ts`, `money.ts` and
`contacts.ts` turn them into sentences.

| Code | Meaning |
|---|---|
| `FIN01` | The bill is posted or void and cannot be changed or deleted |
| `FIN02` | The bill has payments, so it cannot be voided |
| `FIN03` | The allocations add up to more than the payment |
| `FIN04` | A payment can only go against a posted bill |
| `FIN05` | The amount is more than is still owed on the bill |
| `FIN06` | The bills on one payment belong to different suppliers, or none was found |
| `FIN07` | The contact has bills, so Supplier cannot be unticked |
| `FIN09` | The payment is posted or void and cannot be changed or deleted |
| `FIN10` | The bill has no lines, or its lines total nothing |
| `FIN11` | The bill or payment no longer exists |

## Known limits

- Supplier Bills and Payments Out still have no forms; the data layer for them
  is in `bills.ts` and `money.ts`.
- The Payments Out screen charts four payment methods; DuitNow, card and
  e-wallet are counted with bank transfers until its form is built.
- Approval of money out is not enforced yet.

- Contacts and products load the first 1,000 by name; search is in the browser.
  Only the contact list is capped this way: a contact's Payable is read by
  paging through every open bill, 1,000 at a time, so it is never cut short.
- Receivable is 0 until invoices exist.
- Stock and revenue per item are not tracked.
- A contact's Payable counts bills that are pending or overdue, and the
  Payable card is totalled from every open bill, not only the contacts loaded.
