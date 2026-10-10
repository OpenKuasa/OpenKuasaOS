-- Files sent with chat questions, kept so a chat opened again still shows
-- them and the assistant can still read them. Additive only.
--
-- Private bucket: nothing is public, the app hands out short-lived signed
-- links. Each signed-up user reads, writes and deletes only under
-- <user_id>/<thread_id>/. Types are checked in the app (browsers name CSV and
-- Markdown files loosely), so the bucket itself only caps the size.

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 10485760)
on conflict (id) do nothing;

create policy chat_attachments_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy chat_attachments_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  );
create policy chat_attachments_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
