alter table public.appointments
  add column status text not null default 'scheduled';
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('scheduled', 'completed', 'cancelled', 'no_show'));

create policy appointments_write on public.appointments for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));

grant insert on public.appointments to authenticated;
grant update (contact_name, kind, scheduled_at, via, status) on public.appointments to authenticated;
grant delete on public.appointments to authenticated;
