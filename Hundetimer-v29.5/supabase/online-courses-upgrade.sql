-- MVP v14: built-in online course authoring, purchasing and learning
-- Run once after the v13 discovery migration.

create table if not exists public.online_courses (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer_profiles(id) on delete cascade,
  slug text not null unique,
  title text not null,
  summary text,
  description text,
  cover_image_url text,
  price_nok integer not null default 0 check (price_nok >= 0),
  tags text[] not null default '{}',
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  estimated_minutes integer not null default 0 check (estimated_minutes >= 0),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.online_courses(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.online_course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.online_courses(id) on delete cascade,
  module_id uuid not null references public.online_course_modules(id) on delete cascade,
  title text not null,
  summary text,
  position integer not null default 0,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private lesson payload is separate from the public outline.
create table if not exists public.online_course_lesson_content (
  lesson_id uuid primary key references public.online_course_lessons(id) on delete cascade,
  course_id uuid not null references public.online_courses(id) on delete cascade,
  body_text text,
  video_path text,
  attachment_path text,
  attachment_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.online_course_purchases (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.online_courses(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  dog_id uuid references public.dogs(id) on delete set null,
  dog_name text,
  status text not null default 'checkout_pending' check (status in ('checkout_pending','active','refunded','cancelled')),
  payment_status text not null default 'checkout_pending' check (payment_status in ('checkout_pending','captured','refunded','cancelled')),
  subtotal_nok integer not null default 0,
  service_fee_nok integer not null default 29,
  platform_fee_nok integer not null default 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  checkout_expires_at timestamptz,
  purchased_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists online_course_purchase_active_uidx
  on public.online_course_purchases(course_id, customer_id)
  where status in ('checkout_pending','active');

create table if not exists public.online_course_progress (
  purchase_id uuid not null references public.online_course_purchases(id) on delete cascade,
  lesson_id uuid not null references public.online_course_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (purchase_id, lesson_id)
);

alter table public.trainer_ledger add column if not exists online_course_purchase_id uuid references public.online_course_purchases(id) on delete restrict;
create unique index if not exists trainer_ledger_online_course_purchase_earning_uidx
  on public.trainer_ledger(online_course_purchase_id)
  where online_course_purchase_id is not null and entry_type = 'earning';

alter table public.online_courses enable row level security;
alter table public.online_course_modules enable row level security;
alter table public.online_course_lessons enable row level security;
alter table public.online_course_lesson_content enable row level security;
alter table public.online_course_purchases enable row level security;
alter table public.online_course_progress enable row level security;

create or replace function public.can_access_online_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.online_courses c
    where c.id = p_course_id
      and (
        c.trainer_id = auth.uid()
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
        or exists (
          select 1 from public.online_course_purchases p
          where p.course_id = c.id and p.customer_id = auth.uid() and p.status = 'active' and p.payment_status = 'captured'
        )
      )
  );
$$;

grant execute on function public.can_access_online_course(uuid) to public;

-- Published course structure is public. Private lesson payload requires preview/ownership/purchase.
drop policy if exists "online_courses_public_read" on public.online_courses;
drop policy if exists "online_courses_trainer_insert" on public.online_courses;
drop policy if exists "online_courses_trainer_update" on public.online_courses;
create policy "online_courses_public_read" on public.online_courses
  for select to public using (published = true or trainer_id = auth.uid() or public.can_access_online_course(id));
create policy "online_courses_trainer_insert" on public.online_courses
  for insert to authenticated with check (trainer_id = auth.uid());
create policy "online_courses_trainer_update" on public.online_courses
  for update to authenticated using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

drop policy if exists "online_course_modules_read" on public.online_course_modules;
drop policy if exists "online_course_modules_write" on public.online_course_modules;
drop policy if exists "online_course_modules_delete" on public.online_course_modules;
create policy "online_course_modules_read" on public.online_course_modules
  for select to public using (exists (select 1 from public.online_courses c where c.id = course_id and (c.published or c.trainer_id = auth.uid() or public.can_access_online_course(c.id))));
create policy "online_course_modules_write" on public.online_course_modules
  for all to authenticated using (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()))
  with check (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()));

drop policy if exists "online_course_lessons_read" on public.online_course_lessons;
drop policy if exists "online_course_lessons_write" on public.online_course_lessons;
create policy "online_course_lessons_read" on public.online_course_lessons
  for select to public using (exists (select 1 from public.online_courses c where c.id = course_id and (c.published or c.trainer_id = auth.uid() or public.can_access_online_course(c.id))));
create policy "online_course_lessons_write" on public.online_course_lessons
  for all to authenticated using (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()))
  with check (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()));

drop policy if exists "online_course_content_read" on public.online_course_lesson_content;
drop policy if exists "online_course_content_write" on public.online_course_lesson_content;
create policy "online_course_content_read" on public.online_course_lesson_content
  for select to public using (
    public.can_access_online_course(course_id)
    or exists (
      select 1 from public.online_course_lessons l join public.online_courses c on c.id = l.course_id
      where l.id = lesson_id and l.is_preview = true and c.published = true
    )
  );
create policy "online_course_content_write" on public.online_course_lesson_content
  for all to authenticated using (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()))
  with check (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()));

drop policy if exists "online_course_purchases_owner_read" on public.online_course_purchases;
drop policy if exists "online_course_purchases_trainer_read" on public.online_course_purchases;
drop policy if exists "online_course_purchases_admin_read" on public.online_course_purchases;
create policy "online_course_purchases_owner_read" on public.online_course_purchases
  for select to authenticated using (customer_id = auth.uid());
create policy "online_course_purchases_trainer_read" on public.online_course_purchases
  for select to authenticated using (exists (select 1 from public.online_courses c where c.id = course_id and c.trainer_id = auth.uid()));
create policy "online_course_purchases_admin_read" on public.online_course_purchases
  for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "online_course_progress_owner_read" on public.online_course_progress;
drop policy if exists "online_course_progress_owner_insert" on public.online_course_progress;
drop policy if exists "online_course_progress_owner_delete" on public.online_course_progress;
create policy "online_course_progress_owner_read" on public.online_course_progress
  for select to authenticated using (exists (select 1 from public.online_course_purchases p where p.id = purchase_id and p.customer_id = auth.uid() and p.status = 'active'));
create policy "online_course_progress_owner_insert" on public.online_course_progress
  for insert to authenticated with check (exists (select 1 from public.online_course_purchases p where p.id = purchase_id and p.customer_id = auth.uid() and p.status = 'active'));
create policy "online_course_progress_owner_delete" on public.online_course_progress
  for delete to authenticated using (exists (select 1 from public.online_course_purchases p where p.id = purchase_id and p.customer_id = auth.uid() and p.status = 'active'));

-- Public covers and private lesson media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('online-course-covers','online-course-covers',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('online-course-content','online-course-content',false,524288000,array['video/mp4','video/webm','application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A trainer writes only inside <trainer uid>/...
drop policy if exists "course_covers_public_read" on storage.objects;
drop policy if exists "course_covers_own_write" on storage.objects;
drop policy if exists "course_covers_own_update" on storage.objects;
drop policy if exists "course_covers_own_delete" on storage.objects;
create policy "course_covers_public_read" on storage.objects for select to public using (bucket_id='online-course-covers');
create policy "course_covers_own_write" on storage.objects for insert to authenticated with check (bucket_id='online-course-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "course_covers_own_update" on storage.objects for update to authenticated using (bucket_id='online-course-covers' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id='online-course-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "course_covers_own_delete" on storage.objects for delete to authenticated using (bucket_id='online-course-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "course_content_own_insert" on storage.objects;
drop policy if exists "course_content_own_update" on storage.objects;
drop policy if exists "course_content_own_delete" on storage.objects;
create policy "course_content_own_insert" on storage.objects for insert to authenticated with check (bucket_id='online-course-content' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "course_content_own_update" on storage.objects for update to authenticated using (bucket_id='online-course-content' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id='online-course-content' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "course_content_own_delete" on storage.objects for delete to authenticated using (bucket_id='online-course-content' and (storage.foldername(name))[1] = auth.uid()::text);

-- Creates a pending purchase. Payment is captured immediately by Stripe Checkout.
create or replace function public.create_online_course_checkout_purchase(p_course_id uuid, p_dog_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course public.online_courses%rowtype;
  v_dog public.dogs%rowtype;
  v_purchase_id uuid;
  v_platform_fee integer;
begin
  if v_user_id is null then raise exception 'Du må være logget inn.'; end if;
  select * into v_course from public.online_courses where id = p_course_id for update;
  if not found or not v_course.published then raise exception 'Nettkurset er ikke tilgjengelig.'; end if;
  if v_course.trainer_id = v_user_id then raise exception 'Du kan ikke kjøpe ditt eget kurs.'; end if;

  if p_dog_id is not null then
    select * into v_dog from public.dogs where id = p_dog_id and owner_id = v_user_id;
    if not found then raise exception 'Velg en av hundene dine.'; end if;
  end if;

  update public.online_course_purchases set status='cancelled', payment_status='cancelled'
  where course_id=p_course_id and customer_id=v_user_id and status='checkout_pending' and checkout_expires_at is not null and checkout_expires_at <= now();

  if exists (select 1 from public.online_course_purchases where course_id=p_course_id and customer_id=v_user_id and status='active') then
    raise exception 'Du har allerede tilgang til dette kurset.';
  end if;

  v_platform_fee := ceil(v_course.price_nok * 0.075)::integer;
  insert into public.online_course_purchases (
    course_id, customer_id, dog_id, dog_name, subtotal_nok, service_fee_nok, platform_fee_nok, checkout_expires_at
  ) values (
    p_course_id, v_user_id, p_dog_id, case when p_dog_id is null then null else v_dog.name end,
    v_course.price_nok, 29, v_platform_fee, now() + interval '35 minutes'
  ) returning id into v_purchase_id;
  return v_purchase_id;
end;
$$;

-- Called only from the Stripe/service-role sync. Grants access and creates trainer earning once.
create or replace function public.system_confirm_online_course_purchase(
  p_purchase_id uuid,
  p_payment_intent_id text,
  p_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.online_course_purchases%rowtype;
  v_course public.online_courses%rowtype;
  v_paid_at timestamptz := now();
begin
  select * into v_purchase from public.online_course_purchases where id=p_purchase_id for update;
  if not found then return; end if;
  if v_purchase.status='active' and v_purchase.payment_status='captured' then return; end if;
  if v_purchase.status <> 'checkout_pending' then return; end if;
  select * into v_course from public.online_courses where id=v_purchase.course_id;
  if not found then return; end if;

  update public.online_course_purchases
  set status='active', payment_status='captured', stripe_payment_intent_id=p_payment_intent_id,
      stripe_checkout_session_id=p_checkout_session_id, purchased_at=v_paid_at, checkout_expires_at=null
  where id=p_purchase_id;

  insert into public.trainer_ledger (
    trainer_id, online_course_purchase_id, entry_type, description, gross_service_nok,
    platform_fee_nok, amount_nok, status, completed_at, scheduled_payout_date
  ) values (
    v_course.trainer_id, p_purchase_id, 'earning', 'Salg av nettkurs: ' || v_course.title,
    v_purchase.subtotal_nok, v_purchase.platform_fee_nok,
    greatest(0, v_purchase.subtotal_nok-v_purchase.platform_fee_nok),
    'eligible', v_paid_at, public.scheduled_trainer_payout_date(v_paid_at)
  ) on conflict do nothing;
end;
$$;

create or replace function public.system_expire_online_course_checkout(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.online_course_purchases
  set status='cancelled', payment_status='cancelled'
  where id=p_purchase_id and status='checkout_pending';
end;
$$;

-- Owner progress toggle.
create or replace function public.set_online_course_lesson_complete(p_purchase_id uuid, p_lesson_id uuid, p_complete boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_course_id uuid;
begin
  select course_id into v_course_id from public.online_course_purchases
  where id=p_purchase_id and customer_id=v_user_id and status='active' and payment_status='captured';
  if not found then raise exception 'Du har ikke tilgang til dette kurset.'; end if;
  if not exists (select 1 from public.online_course_lessons where id=p_lesson_id and course_id=v_course_id) then
    raise exception 'Leksjonen finnes ikke.';
  end if;
  if p_complete then
    insert into public.online_course_progress(purchase_id, lesson_id) values(p_purchase_id,p_lesson_id)
    on conflict (purchase_id,lesson_id) do update set completed_at=excluded.completed_at;
  else
    delete from public.online_course_progress where purchase_id=p_purchase_id and lesson_id=p_lesson_id;
  end if;
end;
$$;

revoke execute on function public.create_online_course_checkout_purchase(uuid, uuid) from public, anon;
grant execute on function public.create_online_course_checkout_purchase(uuid, uuid) to authenticated;
revoke execute on function public.set_online_course_lesson_complete(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_online_course_lesson_complete(uuid, uuid, boolean) to authenticated;
revoke execute on function public.system_confirm_online_course_purchase(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.system_expire_online_course_checkout(uuid) from public, anon, authenticated;
grant execute on function public.system_confirm_online_course_purchase(uuid,text,text) to service_role;
grant execute on function public.system_expire_online_course_checkout(uuid) to service_role;
