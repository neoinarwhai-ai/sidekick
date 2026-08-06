-- ============================================================
-- 0003_soundboard.sql
-- Storage bucket for sound clips, scoped by broadcaster folder
-- ============================================================

insert into storage.buckets (id, name, public)
values ('sounds', 'sounds', true)
on conflict (id) do nothing;

-- Files are stored as sounds/{broadcaster_id}/{filename}.
-- Bucket is public for read (so the overlay page, which is not
-- logged in, can play them), but writes are locked to the owner's
-- own folder.

create policy "broadcaster uploads own sound files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "broadcaster updates own sound files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "broadcaster deletes own sound files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
