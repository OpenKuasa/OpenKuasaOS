-- Bendahara money, part 2 of 2. Apply only after the code that reads
-- finance_payments_out is deployed: the previous code read payments_out.
-- Its rows were copied into finance_transactions and finance_allocations by
-- part 1.
-- Dropping the table also removes triggers on the tables it points at, which
-- needs a brief lock on them. Give up instead of queueing behind a long
-- transaction and stalling every signed-in request.
set local lock_timeout = '5s';
drop table public.payments_out;
