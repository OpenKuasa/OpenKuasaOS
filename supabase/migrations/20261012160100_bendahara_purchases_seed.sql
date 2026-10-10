-- Demo data for Bendahara Purchases in the shared demo org. Mirrors the
-- screens' sample data. Dates are relative to today so the Pending and
-- Overdue examples stay meaningful. Skips when the demo org already has bills.

do $$
declare
  demo uuid;
  nusantara uuid; lim uuid; printhub uuid; suria uuid; maju uuid; unifi uuid; ahseng uuid;
  ink uuid; paper uuid; roll uuid;
  b uuid;
begin
  select id into demo from public.orgs where slug = 'rimba-ventures-demo';
  if demo is null or exists (select 1 from public.supplier_bills where org_id = demo) then
    return;
  end if;

  insert into public.finance_contacts (org_id, type, name, email, phone, ssm_no, payment_terms_days) values
    (demo, 'supplier', 'Nusantara Logistics', 'orders@nusantara.my', '+60 3-5121 8800', '201501076543', 7)
    returning id into nusantara;
  insert into public.finance_contacts (org_id, type, name, email, phone, ssm_no, payment_terms_days) values
    (demo, 'supplier', 'Lim Hardware Sdn Bhd', 'sales@limhardware.com.my', '+60 3-7956 1234', '198701004567', 30)
    returning id into lim;
  insert into public.finance_contacts (org_id, type, name, email, payment_terms_days) values
    (demo, 'supplier', 'Printhub Enterprise', 'hello@printhub.my', 30) returning id into printhub;
  insert into public.finance_contacts (org_id, type, name, email, payment_terms_days) values
    (demo, 'supplier', 'Suria Utilities Sdn Bhd', 'billing@suria.my', 14) returning id into suria;
  insert into public.finance_contacts (org_id, type, name, email, payment_terms_days) values
    (demo, 'supplier', 'Syarikat Maju Jaya', 'akaun@majujaya.my', 30) returning id into maju;
  insert into public.finance_contacts (org_id, type, name, email, payment_terms_days) values
    (demo, 'supplier', 'Unifi Business (TM)', 'business@unifi.my', 30) returning id into unifi;
  insert into public.finance_contacts (org_id, type, name, phone, payment_terms_days) values
    (demo, 'supplier', 'Kedai Kertas Ah Seng', '+60 12-778 2311', 30) returning id into ahseng;
  insert into public.finance_contacts (org_id, type, name, email, phone, ssm_no) values
    (demo, 'customer', 'Aisyah Trading', 'accounts@aisyahtrading.my', '+60 12-345 6789', '201901012345'),
    (demo, 'customer', 'Zaki Enterprise', 'zaki@zakient.my', '+60 13-221 4455', '202001098765');

  insert into public.finance_products (org_id, sku, name, type, category, uom, price, cost, sst_rate) values
    (demo, 'PRD-010', 'Printer Ink', 'product', 'Office supplies', 'cartridge', 85, 52, 6) returning id into ink;
  insert into public.finance_products (org_id, sku, name, type, category, uom, price, cost, sst_rate) values
    (demo, 'PRD-011', 'A4 Paper (Ream)', 'product', 'Office supplies', 'ream', 14.5, 9.8, 6) returning id into paper;
  insert into public.finance_products (org_id, sku, name, type, category, uom, price, cost) values
    (demo, 'PRD-012', 'Thermal Receipt Roll', 'product', 'Consumables', 'roll', 6, 2.35) returning id into roll;

  -- Pending, due in 4 days
  insert into public.supplier_bills (org_id, bill_no, supplier_ref, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0232', 'NL/INV/8841', nusantara, current_date - 3, current_date + 4, 'posted') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, description, quantity, uom, unit_price)
    values (demo, b, 'Delivery, Klang Valley (October)', 1, 'trip', 2600);

  -- Pending, partly paid
  insert into public.supplier_bills (org_id, bill_no, supplier_ref, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0231', 'LH-20931', lim, current_date - 6, current_date + 24, 'posted') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, product_id, description, quantity, uom, pack_size, unit_price, sst_rate) values
    (demo, b, ink, 'Printer Ink', 40, 'cartridge', 'box of 4', 52, 6),
    (demo, b, paper, 'A4 Paper (Ream)', 100, 'ream', 'carton of 5', 9.8, 6);
  insert into public.payments_out (org_id, payment_no, bill_id, paid_on, method, amount)
    values (demo, 'PAY-0119', b, current_date - 2, 'bank_transfer', 1000);

  -- Paid in full
  insert into public.supplier_bills (org_id, bill_no, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0230', printhub, current_date - 11, current_date + 19, 'posted') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, description, quantity, uom, unit_price)
    values (demo, b, 'Brochure printing, A5 full colour', 5000, 'piece', 0.29);
  insert into public.payments_out (org_id, payment_no, bill_id, paid_on, method, amount)
    values (demo, 'PAY-0118', b, current_date - 5, 'fpx', 1450);

  -- Overdue
  insert into public.supplier_bills (org_id, bill_no, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0229', suria, current_date - 19, current_date - 5, 'posted') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, description, quantity, uom, unit_price)
    values (demo, b, 'Electricity, September', 1, 'month', 1800);

  -- Pending, payment scheduled
  insert into public.supplier_bills (org_id, bill_no, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0228', maju, current_date - 23, current_date + 7, 'posted') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, description, quantity, uom, unit_price)
    values (demo, b, 'Office partition works', 1, 'job', 4300);
  insert into public.payments_out (org_id, payment_no, bill_id, paid_on, method, amount, status)
    values (demo, 'PAY-0120', b, current_date + 5, 'bank_transfer', 4300, 'scheduled');

  -- Paid in full
  insert into public.supplier_bills (org_id, bill_no, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0227', unifi, current_date - 31, current_date - 1, 'posted') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, description, quantity, uom, unit_price)
    values (demo, b, 'Business fibre 300Mbps, September', 1, 'month', 299);
  insert into public.payments_out (org_id, payment_no, bill_id, paid_on, method, amount)
    values (demo, 'PAY-0117', b, current_date - 3, 'fpx', 299);

  -- Draft
  insert into public.supplier_bills (org_id, bill_no, supplier_id, bill_date, due_date, status)
    values (demo, 'BILL-0226', ahseng, current_date - 2, current_date + 28, 'draft') returning id into b;
  insert into public.supplier_bill_lines (org_id, bill_id, product_id, description, quantity, uom, pack_size, unit_price) values
    (demo, b, roll, 'Thermal Receipt Roll', 200, 'roll', 'pack of 10', 2.35),
    (demo, b, paper, 'A4 Paper (Ream)', 32, 'ream', 'carton of 5', 9.70);
end $$;
