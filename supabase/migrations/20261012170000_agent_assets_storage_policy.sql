-- Org members may read (sign URLs for) their org's objects in the private
-- agent-assets bucket. Writes stay service-role only (worker uploads).
create policy agent_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'agent-assets' and private.is_org_member(((storage.foldername(name))[1])::uuid));
