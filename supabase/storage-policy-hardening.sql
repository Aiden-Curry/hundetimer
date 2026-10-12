drop policy if exists "course_content_own_insert" on storage.objects;
drop policy if exists "course_content_own_update" on storage.objects;
drop policy if exists "course_content_own_delete" on storage.objects;

create policy "course_content_own_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'online-course-content'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
);

create policy "course_content_own_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'online-course-content'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
)
with check (
  bucket_id = 'online-course-content'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
);

create policy "course_content_own_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'online-course-content'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
);


drop policy if exists "course_covers_own_write" on storage.objects;
drop policy if exists "course_covers_own_update" on storage.objects;
drop policy if exists "course_covers_own_delete" on storage.objects;

create policy "course_covers_own_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'online-course-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
);

create policy "course_covers_own_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'online-course-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
)
with check (
  bucket_id = 'online-course-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
);

create policy "course_covers_own_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'online-course-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_trainer_verified(auth.uid())
);