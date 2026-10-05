-- MVP v24: moderation, reporting, suspensions and admin audit log
-- Run after certificates-upgrade.sql.

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active','suspended'));

-- A normal user may edit their own display profile, but may never clear their own suspension.
create or replace function public.protect_profile_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() = old.id and not public.is_current_user_admin() then
    new.account_status := old.account_status;
    new.suspended_at := old.suspended_at;
    new.suspended_by := old.suspended_by;
    new.suspension_reason := old.suspension_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_moderation_fields_trigger on public.profiles;
create trigger protect_profile_moderation_fields_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_moderation_fields();

alter table public.reviews add column if not exists moderation_status text not null default 'visible';
alter table public.reviews add column if not exists moderation_note text;
alter table public.reviews add column if not exists moderated_at timestamptz;
alter table public.reviews add column if not exists moderated_by uuid references public.profiles(id) on delete set null;
alter table public.reviews drop constraint if exists reviews_moderation_status_check;
alter table public.reviews add constraint reviews_moderation_status_check check (moderation_status in ('visible','hidden'));

alter table public.booking_messages add column if not exists moderation_status text not null default 'visible';
alter table public.booking_messages add column if not exists moderation_note text;
alter table public.booking_messages add column if not exists moderated_at timestamptz;
alter table public.booking_messages add column if not exists moderated_by uuid references public.profiles(id) on delete set null;
alter table public.booking_messages drop constraint if exists booking_messages_moderation_status_check;
alter table public.booking_messages add constraint booking_messages_moderation_status_check check (moderation_status in ('visible','hidden'));

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('trainer','review','message','user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','harassment','misleading','inappropriate','safety','other')),
  details text,
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  admin_note text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists moderation_reports_status_created_idx on public.moderation_reports(status, created_at desc);
create index if not exists moderation_reports_target_idx on public.moderation_reports(target_type, target_id, created_at desc);
create index if not exists moderation_reports_reporter_idx on public.moderation_reports(reporter_id, created_at desc);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null,
  target_type text not null,
  target_id uuid,
  report_id uuid references public.moderation_reports(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit_log(target_type, target_id, created_at desc);

alter table public.moderation_reports enable row level security;
alter table public.admin_audit_log enable row level security;

-- Reporting and admin writes are performed through trusted server actions.
revoke insert, update, delete on public.moderation_reports from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.moderation_reports to authenticated;

-- Reporters may see the reports they submitted. Admin screens use the service-role client.
drop policy if exists "moderation_reports_reporter_read" on public.moderation_reports;
create policy "moderation_reports_reporter_read"
  on public.moderation_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_current_user_admin());

-- Hidden reviews disappear from the public marketplace, while the customer/trainer involved
-- may still see that the review exists. Admins use the service-role client for moderation.
drop policy if exists "reviews_public_read" on public.reviews;
drop policy if exists "reviews_moderated_read" on public.reviews;
create policy "reviews_moderated_read"
  on public.reviews for select to anon, authenticated
  using (
    moderation_status = 'visible'
    or customer_id = auth.uid()
    or trainer_id = auth.uid()
    or public.is_current_user_admin()
  );

-- Message rows remain limited to booking participants. Hidden message bodies are replaced by
-- the admin action, preserving chronology while removing the original text from participant access.
drop policy if exists "booking_messages_select_participants" on public.booking_messages;
create policy "booking_messages_select_participants"
  on public.booking_messages for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_messages.booking_id
        and auth.uid() in (b.customer_id, b.trainer_id)
    )
  );
