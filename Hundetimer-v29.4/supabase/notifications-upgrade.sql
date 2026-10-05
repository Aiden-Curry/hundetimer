-- MVP v17 in-site notification centre
-- Run once after v16 messaging-upgrade.sql.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  href text,
  event_key text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_user_event_key_uidx
  on public.notifications(user_id, event_key);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Browser clients may not insert/update/delete notification rows directly.
revoke insert, update, delete on table public.notifications from authenticated, anon;

drop function if exists public.mark_notification_read(uuid);
create function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Du må være logget inn.'; end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and user_id = auth.uid();
end;
$$;

drop function if exists public.mark_all_notifications_read();
create function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn.'; end if;
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
revoke execute on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Realtime notification delivery. Ignore duplicate_object if the table is already added.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Let admins know when a trainer sends a new verification application.
create or replace function public.notify_admins_of_verification_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_name text;
begin
  if new.status <> 'pending' then return new; end if;
  select business_name into v_business_name from public.trainer_profiles where id = new.trainer_id;
  insert into public.notifications (user_id, type, title, body, href, event_key, metadata)
  select p.id,
         'verification',
         'Ny trenerverifisering',
         coalesce(v_business_name, new.legal_name) || ' har sendt inn en søknad.',
         '/admin/trainers',
         'verification-submitted/admin/' || new.id::text || '/' || p.id::text,
         jsonb_build_object('submission_id', new.id, 'trainer_id', new.trainer_id)
  from public.profiles p
  where p.role = 'admin'
  on conflict (user_id, event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trainer_verification_notification_trigger on public.trainer_verification_submissions;
create trigger trainer_verification_notification_trigger
after insert on public.trainer_verification_submissions
for each row execute function public.notify_admins_of_verification_submission();
