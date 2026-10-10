-- Saved chats with the Tuah assistant.
-- A thread belongs to one person in one workspace: nobody else can read it,
-- not even the workspace owner, and switching workspace switches history.
-- The chat route writes as the signed-in user, so row level security is the
-- whole rule; there are no SECURITY DEFINER writers here.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.chat_threads enable row level security;
create index chat_threads_user_org_updated_idx
  on public.chat_threads (user_id, org_id, updated_at desc);

-- `parts` holds the message parts exactly as the chat UI renders them, so a
-- saved thread loads straight back into the conversation.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.chat_messages enable row level security;
create index chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);

-- Own threads only, and only while still a member of that workspace
-- (`is_org_member` also requires the second factor when one is enrolled).
create policy chat_threads_select on public.chat_threads
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(org_id));

-- Demo guests are anonymous sessions; their chats are never saved.
create policy chat_threads_insert on public.chat_threads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_org_member(org_id)
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
  );

create policy chat_threads_update on public.chat_threads
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(org_id))
  with check (user_id = (select auth.uid()) and private.is_org_member(org_id));

create policy chat_threads_delete on public.chat_threads
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(org_id));

-- Messages follow their thread: visible and writable only through a thread
-- the caller can see.
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (exists (select 1 from public.chat_threads t where t.id = thread_id));

create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (exists (select 1 from public.chat_threads t where t.id = thread_id));

create policy mfa_required on public.chat_threads as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy mfa_required on public.chat_messages as restrictive
  for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- Messages are append-only; deleting a thread removes them by cascade.
revoke all on public.chat_threads from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
grant select, delete on public.chat_threads to authenticated;
grant insert (id, org_id, user_id, title) on public.chat_threads to authenticated;
grant update (title, updated_at) on public.chat_threads to authenticated;
grant select on public.chat_messages to authenticated;
grant insert (thread_id, role, parts) on public.chat_messages to authenticated;
