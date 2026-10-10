-- Bendahara money, part 2 of 2. Apply only after the code that reads
-- finance_payments_out is deployed: the previous code read payments_out.
-- Its rows were copied into finance_transactions and finance_allocations by
-- part 1.
drop table public.payments_out;
