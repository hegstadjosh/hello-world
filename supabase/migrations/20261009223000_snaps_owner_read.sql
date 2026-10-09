-- Storage removal needs SELECT as well as DELETE. Owners may see only their own folder;
-- everyone else reaches a snap only through its public URL.
create policy "Read own snaps" on storage.objects for select to authenticated
  using (bucket_id = 'snaps' and (storage.foldername(name))[1] = (select auth.uid())::text);
