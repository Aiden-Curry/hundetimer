-- MVP v25: privacy preferences, data export support and account deletion workflow
-- Run once after v24 moderation-upgrade.sql.

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active','suspended','deletion_pending','deleted'));

create table if not exists public.privacy_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  marketing_email boolean not null default false,
  product_updates boolean not null default false,
  analytics_consent boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','requires_review','cancelled','completed','rejected')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  admin_note text,
  unique (user_id)
);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, scheduled_for);

alter table public.privacy_preferences enable row level security;
alter table public.account_deletion_requests enable row level security;

-- Preferences may be read by the owner. Writes are performed by trusted server actions.
drop policy if exists privacy_preferences_read_own on public.privacy_preferences;
create policy privacy_preferences_read_own
  on public.privacy_preferences for select to authenticated
  using (user_id = auth.uid());

-- Users can see their own deletion request. Admin screens use the service-role client.
drop policy if exists account_deletion_requests_read_own on public.account_deletion_requests;
create policy account_deletion_requests_read_own
  on public.account_deletion_requests for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.privacy_preferences from anon, authenticated;
revoke insert, update, delete on public.account_deletion_requests from anon, authenticated;
grant select on public.privacy_preferences to authenticated;
grant select on public.account_deletion_requests to authenticated;
