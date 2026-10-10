-- Kasturi CRM core schema: contacts, deals, activities and audit spine.
-- Depends on the tenancy spine and private.is_org_member/is_org_writer helpers.
--
-- Columns follow the Kasturi screens: crm_contacts carries what the Contacts
-- page lists, crm_deals what a card on the Deals board shows. Child rows point
-- at their parent with (id, org_id), so a row can never reference another
-- workspace's record, and a deal's stage always belongs to the deal's pipeline.

create table public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (id, org_id)
);
alter table public.crm_pipelines enable row level security;

create table public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  pipeline_id uuid not null,
  name text not null,
  position integer not null,
  probability_percent integer not null default 0 check (probability_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, position),
  unique (pipeline_id, name),
  unique (id, pipeline_id),
  foreign key (pipeline_id, org_id) references public.crm_pipelines(id, org_id) on delete cascade
);
alter table public.crm_pipeline_stages enable row level security;

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  first_name text not null,
  last_name text,
  company text,
  email text,
  phone text,
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  source text,
  status text not null default 'lead' check (status in ('lead','contacted','qualified','customer','archived')),
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  owner_user_id uuid references auth.users(id) on delete set null,
  tags text[] not null default '{}',
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
alter table public.crm_contacts enable row level security;

create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  title text not null,
  value_cents bigint not null default 0 check (value_cents >= 0),
  currency text not null default 'MYR',
  tag text,
  status text not null default 'open' check (status in ('open','won','lost')),
  expected_close_date date,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  owner_user_id uuid references auth.users(id) on delete set null,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (contact_id, org_id) references public.crm_contacts(id, org_id) on delete cascade,
  foreign key (pipeline_id, org_id) references public.crm_pipelines(id, org_id) on delete restrict,
  foreign key (stage_id, pipeline_id) references public.crm_pipeline_stages(id, pipeline_id) on delete restrict
);
alter table public.crm_deals enable row level security;

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  type text not null check (type in ('call','whatsapp','email','meeting','task','note')),
  title text not null,
  body text,
  due_at timestamptz,
  completed_at timestamptz,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_id is not null or deal_id is not null),
  foreign key (contact_id, org_id) references public.crm_contacts(id, org_id) on delete cascade,
  foreign key (deal_id, org_id) references public.crm_deals(id, org_id) on delete cascade
);
alter table public.crm_activities enable row level security;

create table public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_id is not null or deal_id is not null),
  foreign key (contact_id, org_id) references public.crm_contacts(id, org_id) on delete cascade,
  foreign key (deal_id, org_id) references public.crm_deals(id, org_id) on delete cascade
);
alter table public.crm_notes enable row level security;

create table public.crm_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  storage_path text not null,
  file_name text not null,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (contact_id is not null or deal_id is not null),
  foreign key (contact_id, org_id) references public.crm_contacts(id, org_id) on delete cascade,
  foreign key (deal_id, org_id) references public.crm_deals(id, org_id) on delete cascade
);
alter table public.crm_attachments enable row level security;

create table public.crm_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.crm_audit_logs enable row level security;

create index crm_pipelines_org_id_idx on public.crm_pipelines(org_id);
create index crm_pipeline_stages_org_id_idx on public.crm_pipeline_stages(org_id);
create index crm_pipeline_stages_pipeline_id_idx on public.crm_pipeline_stages(pipeline_id);
create index crm_contacts_org_id_idx on public.crm_contacts(org_id);
create index crm_contacts_owner_user_id_idx on public.crm_contacts(owner_user_id);
create index crm_contacts_status_idx on public.crm_contacts(status);
create index crm_deals_org_id_idx on public.crm_deals(org_id);
create index crm_deals_contact_id_idx on public.crm_deals(contact_id);
create index crm_deals_stage_id_idx on public.crm_deals(stage_id);
create index crm_deals_owner_user_id_idx on public.crm_deals(owner_user_id);
create index crm_deals_status_idx on public.crm_deals(status);
create index crm_activities_org_id_idx on public.crm_activities(org_id);
create index crm_activities_contact_id_idx on public.crm_activities(contact_id);
create index crm_activities_deal_id_idx on public.crm_activities(deal_id);
create index crm_activities_due_at_idx on public.crm_activities(due_at);
create index crm_notes_org_id_idx on public.crm_notes(org_id);
create index crm_notes_contact_id_idx on public.crm_notes(contact_id);
create index crm_notes_deal_id_idx on public.crm_notes(deal_id);
create index crm_attachments_org_id_idx on public.crm_attachments(org_id);
create index crm_audit_logs_org_id_created_at_idx on public.crm_audit_logs(org_id, created_at desc);

-- Members can read their org's CRM records. Writers can insert, update and delete.
create policy crm_pipelines_select on public.crm_pipelines
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_pipelines_insert on public.crm_pipelines
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_pipelines_update on public.crm_pipelines
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_pipelines_delete on public.crm_pipelines
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_pipeline_stages_select on public.crm_pipeline_stages
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_pipeline_stages_insert on public.crm_pipeline_stages
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_pipeline_stages_update on public.crm_pipeline_stages
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_pipeline_stages_delete on public.crm_pipeline_stages
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_contacts_select on public.crm_contacts
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_contacts_insert on public.crm_contacts
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_contacts_update on public.crm_contacts
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_contacts_delete on public.crm_contacts
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_deals_select on public.crm_deals
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_deals_insert on public.crm_deals
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_deals_update on public.crm_deals
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_deals_delete on public.crm_deals
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_activities_select on public.crm_activities
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_activities_insert on public.crm_activities
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_activities_update on public.crm_activities
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_activities_delete on public.crm_activities
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_notes_select on public.crm_notes
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_notes_insert on public.crm_notes
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_notes_update on public.crm_notes
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_notes_delete on public.crm_notes
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_attachments_select on public.crm_attachments
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_attachments_insert on public.crm_attachments
  for insert to authenticated with check (private.is_org_writer(org_id));
create policy crm_attachments_update on public.crm_attachments
  for update to authenticated using (private.is_org_writer(org_id)) with check (private.is_org_writer(org_id));
create policy crm_attachments_delete on public.crm_attachments
  for delete to authenticated using (private.is_org_writer(org_id));

create policy crm_audit_logs_select on public.crm_audit_logs
  for select to authenticated using (private.is_org_member(org_id));
create policy crm_audit_logs_insert on public.crm_audit_logs
  for insert to authenticated
  with check (private.is_org_writer(org_id) and actor_user_id = (select auth.uid()));

-- MFA belt-and-suspenders + explicit grants, identical per table (same shape as
-- the Jebat foundation). Tables created by a migration carry no usable grants
-- for authenticated, so without these every query is denied before RLS runs.
do $$
declare t text;
begin
  foreach t in array array[
    'crm_pipelines','crm_pipeline_stages','crm_contacts','crm_deals',
    'crm_activities','crm_notes','crm_attachments','crm_audit_logs'
  ] loop
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      || 'using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    if t = 'crm_audit_logs' then
      -- append-only: no update or delete, matching its policies
      execute format('grant select, insert on public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end $$;
