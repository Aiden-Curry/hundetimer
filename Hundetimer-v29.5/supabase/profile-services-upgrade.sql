-- MVP v9: trainer profile editor, media uploads and service management

alter table public.trainer_profiles add column if not exists profile_image_url text;
alter table public.trainer_profiles add column if not exists cover_image_url text;
alter table public.trainer_profiles add column if not exists website_url text;
alter table public.trainer_profiles add column if not exists instagram_url text;
alter table public.trainer_profiles add column if not exists languages text[] not null default '{}';

-- Public media bucket for trainer profile/cover images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trainer-media',
  'trainer-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- A trainer may only write inside trainer-media/<their auth uid>/...
drop policy if exists "trainer_media_public_read" on storage.objects;
drop policy if exists "trainer_media_insert_own" on storage.objects;
drop policy if exists "trainer_media_update_own" on storage.objects;
drop policy if exists "trainer_media_delete_own" on storage.objects;

create policy "trainer_media_public_read"
on storage.objects for select
to public
using (bucket_id = 'trainer-media');

create policy "trainer_media_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'trainer-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "trainer_media_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'trainer-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'trainer-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "trainer_media_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'trainer-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
