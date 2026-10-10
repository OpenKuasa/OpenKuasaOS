-- Slice 3: make leads writable (two-layer: grant + is_org_writer policy) and add the
-- promote marker. leads_select + mfa_required already exist (slice 1). No updated_at (as campaigns).
alter table public.leads add column promoted_contact_id uuid;  -- set when promoted to a crm_contact; no FK (module-decoupled)
create policy leads_write on public.leads for all to authenticated
  using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
grant insert on public.leads to authenticated;
grant update (name, channel, stage, source, promoted_contact_id) on public.leads to authenticated;
grant delete on public.leads to authenticated;
