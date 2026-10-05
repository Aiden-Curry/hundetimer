-- MVP v15: trainer verification + admin approval
-- Run after online-courses-upgrade.sql.

alter table public.trainer_profiles add column if not exists verification_status text not null default 'not_submitted';
alter table public.trainer_profiles add column if not exists verification_submitted_at timestamptz;
alter table public.trainer_profiles add column if not exists verification_reviewed_at timestamptz;
alter table public.trainer_profiles add column if not exists verification_review_note text;

alter table public.trainer_profiles drop constraint if exists trainer_profiles_verification_status_check;
alter table public.trainer_profiles add constraint trainer_profiles_verification_status_check
  check (verification_status in ('not_submitted','pending','approved','rejected','suspended'));

update public.trainer_profiles
set verification_status = case when verified then 'approved' else verification_status end,
    verification_reviewed_at = case when verified and verification_reviewed_at is null then now() else verification_reviewed_at end;

create table if not exists public.trainer_verification_submissions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  legal_name text not null,
  organisation_number text,
  years_experience integer check (years_experience is null or years_experience between 0 and 80),
  qualifications text,
  note_to_admin text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  admin_note text
);

create index if not exists trainer_verification_submissions_trainer_idx
  on public.trainer_verification_submissions(trainer_id, submitted_at desc);
create index if not exists trainer_verification_submissions_status_idx
  on public.trainer_verification_submissions(status, submitted_at);

create table if not exists public.trainer_verification_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.trainer_verification_submissions(id) on delete cascade,
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  kind text not null default 'other' check (kind in ('qualification','business','insurance','identity','other')),
  file_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists trainer_verification_documents_submission_idx
  on public.trainer_verification_documents(submission_id);

alter table public.trainer_verification_submissions enable row level security;
alter table public.trainer_verification_documents enable row level security;

drop policy if exists "verification_submission_own_read" on public.trainer_verification_submissions;
drop policy if exists "verification_documents_own_read" on public.trainer_verification_documents;
create policy "verification_submission_own_read" on public.trainer_verification_submissions
  for select to authenticated using (trainer_id = auth.uid());
create policy "verification_documents_own_read" on public.trainer_verification_documents
  for select to authenticated using (trainer_id = auth.uid());

-- Private evidence files. Trainers can upload only into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trainer-verification',
  'trainer-verification',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "trainer_verification_own_upload" on storage.objects;
drop policy if exists "trainer_verification_own_read" on storage.objects;
drop policy if exists "trainer_verification_own_delete" on storage.objects;
create policy "trainer_verification_own_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trainer-verification' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "trainer_verification_own_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'trainer-verification' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "trainer_verification_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trainer-verification' and (storage.foldername(name))[1] = auth.uid()::text);

-- Helpers are SECURITY DEFINER so public RLS can safely ask whether a trainer is approved.
create or replace function public.is_trainer_verified(p_trainer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trainer_profiles t
    where t.id = p_trainer_id
      and t.verified = true
      and t.verification_status = 'approved'
  );
$$;

grant execute on function public.is_trainer_verified(uuid) to public;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

grant execute on function public.is_current_user_admin() to public;

-- Do not let a trainer self-approve by updating trainer_profiles directly.
create or replace function public.protect_trainer_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.verification_internal', true), '') = '1' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() = new.id and not public.is_current_user_admin() then
      new.verified := false;
      new.verification_status := 'not_submitted';
      new.verification_submitted_at := null;
      new.verification_reviewed_at := null;
      new.verification_review_note := null;
    end if;
  elsif auth.uid() = old.id and not public.is_current_user_admin() then
    new.verified := old.verified;
    new.verification_status := old.verification_status;
    new.verification_submitted_at := old.verification_submitted_at;
    new.verification_reviewed_at := old.verification_reviewed_at;
    new.verification_review_note := old.verification_review_note;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_trainer_verification_fields_trigger on public.trainer_profiles;
create trigger protect_trainer_verification_fields_trigger
  before insert or update on public.trainer_profiles
  for each row execute function public.protect_trainer_verification_fields();

-- One RPC submits the application after the browser has uploaded evidence files.
create or replace function public.submit_trainer_verification(
  p_legal_name text,
  p_organisation_number text default null,
  p_years_experience integer default null,
  p_qualifications text default null,
  p_note_to_admin text default null,
  p_documents jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_submission_id uuid;
  v_doc jsonb;
  v_path text;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;
  if nullif(trim(coalesce(p_legal_name,'')), '') is null then raise exception 'Skriv inn juridisk navn.'; end if;
  if p_years_experience is not null and (p_years_experience < 0 or p_years_experience > 80) then raise exception 'Ugyldig antall år erfaring.'; end if;

  select verification_status into v_status
  from public.trainer_profiles
  where id = v_user_id
  for update;

  if v_status is null then raise exception 'Fant ikke trenerprofilen.'; end if;
  if v_status = 'pending' then raise exception 'Du har allerede en søknad til vurdering.'; end if;
  if v_status = 'approved' then raise exception 'Trenerprofilen er allerede verifisert.'; end if;

  insert into public.trainer_verification_submissions (
    trainer_id, status, legal_name, organisation_number, years_experience,
    qualifications, note_to_admin
  ) values (
    v_user_id, 'pending', trim(p_legal_name), nullif(trim(coalesce(p_organisation_number,'')), ''),
    p_years_experience, nullif(trim(coalesce(p_qualifications,'')), ''),
    nullif(trim(coalesce(p_note_to_admin,'')), '')
  ) returning id into v_submission_id;

  for v_doc in select value from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb)) loop
    v_path := v_doc ->> 'file_path';
    if v_path is null or v_path not like (v_user_id::text || '/%') then
      raise exception 'Ugyldig dokumentsti.';
    end if;
    insert into public.trainer_verification_documents (
      submission_id, trainer_id, kind, file_path, file_name, mime_type
    ) values (
      v_submission_id,
      v_user_id,
      case when (v_doc ->> 'kind') in ('qualification','business','insurance','identity','other') then v_doc ->> 'kind' else 'other' end,
      v_path,
      coalesce(nullif(v_doc ->> 'file_name',''), 'Dokument'),
      nullif(v_doc ->> 'mime_type','')
    );
  end loop;

  perform set_config('app.verification_internal', '1', true);

  update public.trainer_profiles
  set verified = false,
      verification_status = 'pending',
      verification_submitted_at = now(),
      verification_reviewed_at = null,
      verification_review_note = null,
      updated_at = now()
  where id = v_user_id;

  return v_submission_id;
end;
$$;

revoke execute on function public.submit_trainer_verification(text,text,integer,text,text,jsonb) from public, anon;
grant execute on function public.submit_trainer_verification(text,text,integer,text,text,jsonb) to authenticated;

-- Public marketplace rows are visible only for approved trainers. Trainers can still
-- see and edit their own data, and existing customers retain access through bookings/purchases.
drop policy if exists "trainer_profiles_public_read" on public.trainer_profiles;
create policy "trainer_profiles_public_read" on public.trainer_profiles
  for select to public using (
    public.is_trainer_verified(id)
    or id = auth.uid()
    or public.is_current_user_admin()
  );

drop policy if exists "services_public_read" on public.services;
create policy "services_public_read" on public.services
  for select to public using (
    trainer_id = auth.uid()
    or public.is_current_user_admin()
    or (active = true and public.is_trainer_verified(trainer_id))
    or exists (select 1 from public.bookings b where b.service_id = services.id and b.customer_id = auth.uid())
  );

drop policy if exists "weekly_availability_public_read" on public.weekly_availability;
create policy "weekly_availability_public_read" on public.weekly_availability
  for select to public using (
    trainer_id = auth.uid()
    or (active = true and public.is_trainer_verified(trainer_id))
  );

drop policy if exists "availability_slots_public_read" on public.availability_slots;
create policy "availability_slots_public_read" on public.availability_slots
  for select to public using (
    trainer_id = auth.uid()
    or (status = 'open' and public.is_trainer_verified(trainer_id))
    or exists (select 1 from public.bookings b where b.slot_id = availability_slots.id and b.customer_id = auth.uid())
  );

-- Keep enrolled customers able to see a course/event even if a trainer is later suspended.
create or replace function public.can_read_group_offering(p_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_offerings o
    where o.id = p_offering_id
      and (
        (o.active = true and public.is_trainer_verified(o.trainer_id))
        or o.trainer_id = auth.uid()
        or public.is_current_user_admin()
        or exists (select 1 from public.group_enrollments e where e.offering_id = o.id and e.customer_id = auth.uid())
      )
  );
$$;

grant execute on function public.can_read_group_offering(uuid) to public;

-- Online courses are public only when published by an approved trainer. Owners who
-- already bought a course keep their access if the trainer is later hidden.
drop policy if exists "online_courses_public_read" on public.online_courses;
create policy "online_courses_public_read" on public.online_courses
  for select to public using (
    (published = true and public.is_trainer_verified(trainer_id))
    or trainer_id = auth.uid()
    or public.can_access_online_course(id)
    or public.is_current_user_admin()
  );

drop policy if exists "online_course_modules_read" on public.online_course_modules;
create policy "online_course_modules_read" on public.online_course_modules
  for select to public using (exists (
    select 1 from public.online_courses c
    where c.id = course_id and (
      (c.published = true and public.is_trainer_verified(c.trainer_id))
      or c.trainer_id = auth.uid()
      or public.can_access_online_course(c.id)
      or public.is_current_user_admin()
    )
  ));

drop policy if exists "online_course_lessons_read" on public.online_course_lessons;
create policy "online_course_lessons_read" on public.online_course_lessons
  for select to public using (exists (
    select 1 from public.online_courses c
    where c.id = course_id and (
      (c.published = true and public.is_trainer_verified(c.trainer_id))
      or c.trainer_id = auth.uid()
      or public.can_access_online_course(c.id)
      or public.is_current_user_admin()
    )
  ));

drop policy if exists "online_course_content_read" on public.online_course_lesson_content;
create policy "online_course_content_read" on public.online_course_lesson_content
  for select to public using (
    public.can_access_online_course(course_id)
    or exists (
      select 1
      from public.online_course_lessons l
      join public.online_courses c on c.id = l.course_id
      where l.id = lesson_id
        and l.is_preview = true
        and c.published = true
        and public.is_trainer_verified(c.trainer_id)
    )
  );

-- Final database-level commerce guard. Even if someone knows an RPC/UUID, a new
-- transaction cannot be created for an unapproved trainer.
create or replace function public.block_unverified_trainer_commerce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trainer_id uuid;
begin
  if tg_table_name = 'bookings' then
    v_trainer_id := new.trainer_id;
  elsif tg_table_name = 'group_enrollments' then
    select trainer_id into v_trainer_id from public.group_offerings where id = new.offering_id;
  elsif tg_table_name = 'online_course_purchases' then
    select trainer_id into v_trainer_id from public.online_courses where id = new.course_id;
  end if;

  if v_trainer_id is null or not public.is_trainer_verified(v_trainer_id) then
    raise exception 'Denne treneren er ikke godkjent for offentlige bestillinger ennå.';
  end if;
  return new;
end;
$$;

drop trigger if exists require_verified_trainer_booking on public.bookings;
create trigger require_verified_trainer_booking before insert on public.bookings
  for each row execute function public.block_unverified_trainer_commerce();
drop trigger if exists require_verified_trainer_group on public.group_enrollments;
create trigger require_verified_trainer_group before insert on public.group_enrollments
  for each row execute function public.block_unverified_trainer_commerce();
drop trigger if exists require_verified_trainer_online_course on public.online_course_purchases;
create trigger require_verified_trainer_online_course before insert on public.online_course_purchases
  for each row execute function public.block_unverified_trainer_commerce();
