-- MVP v21 calendar integration
-- Google Calendar + Microsoft Outlook/Calendar

create table if not exists public.calendar_connections (
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  account_email text,
  calendar_id text not null default 'primary',
  sync_busy boolean not null default true,
  sync_bookings boolean not null default true,
  connected_at timestamptz not null default now(),
  last_busy_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Secrets deliberately live in a separate table with no authenticated policies.
create table if not exists public.calendar_connection_secrets (
  trainer_id uuid primary key references public.calendar_connections(trainer_id) on delete cascade,
  encrypted_refresh_token text not null,
  token_version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  synced_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists calendar_busy_blocks_trainer_dates_idx
  on public.calendar_busy_blocks(trainer_id, starts_at, ends_at);

create table if not exists public.booking_calendar_events (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  external_event_id text not null,
  external_calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_connections enable row level security;
alter table public.calendar_connection_secrets enable row level security;
alter table public.calendar_busy_blocks enable row level security;
alter table public.booking_calendar_events enable row level security;

drop policy if exists calendar_connections_read_own on public.calendar_connections;
create policy calendar_connections_read_own
  on public.calendar_connections for select to authenticated
  using (trainer_id = auth.uid());

-- Writes are server-only because OAuth token handling happens through route handlers.
drop policy if exists calendar_busy_blocks_read_own on public.calendar_busy_blocks;
create policy calendar_busy_blocks_read_own
  on public.calendar_busy_blocks for select to authenticated
  using (trainer_id = auth.uid());

drop policy if exists booking_calendar_events_read_own on public.booking_calendar_events;
create policy booking_calendar_events_read_own
  on public.booking_calendar_events for select to authenticated
  using (trainer_id = auth.uid());

revoke all on public.calendar_connection_secrets from anon, authenticated;
revoke insert, update, delete on public.calendar_connections from anon, authenticated;
revoke insert, update, delete on public.calendar_busy_blocks from anon, authenticated;
revoke insert, update, delete on public.booking_calendar_events from anon, authenticated;

-- Rebuild future OPEN slots and remove times that overlap the trainer's external calendar.
create or replace function public.regenerate_service_slots(
  p_service_id uuid,
  p_days integer default 60
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trainer_id uuid;
  v_duration integer;
  v_interval integer;
  v_inserted integer := 0;
begin
  select s.trainer_id, s.duration_minutes, greatest(15, s.slot_interval_minutes)
    into v_trainer_id, v_duration, v_interval
  from public.services s
  where s.id = p_service_id
    and s.trainer_id = (select auth.uid())
    and s.active = true;

  if v_trainer_id is null then
    raise exception 'Tjenesten finnes ikke, er inaktiv eller tilhører ikke brukeren.';
  end if;

  p_days := greatest(1, least(coalesce(p_days, 60), 120));

  delete from public.availability_slots sl
  where sl.trainer_id = v_trainer_id
    and sl.service_id = p_service_id
    and sl.status = 'open'
    and sl.starts_at >= now();

  with local_days as (
    select gs::date as local_day
    from generate_series(
      (now() at time zone 'Europe/Oslo')::date,
      (now() at time zone 'Europe/Oslo')::date + p_days,
      interval '1 day'
    ) gs
  ),
  recurring_candidates as (
    select
      wa.trainer_id,
      wa.service_id,
      candidate_start as starts_at,
      candidate_start + make_interval(mins => v_duration) as ends_at
    from public.weekly_availability wa
    join local_days d
      on extract(dow from d.local_day)::smallint = wa.weekday
    cross join lateral generate_series(
      ((d.local_day + wa.start_time) at time zone wa.timezone),
      ((d.local_day + wa.end_time) at time zone wa.timezone) - make_interval(mins => v_duration),
      make_interval(mins => v_interval)
    ) candidate_start
    where wa.trainer_id = v_trainer_id
      and wa.service_id = p_service_id
      and wa.active = true
  ),
  filtered as (
    select c.*
    from recurring_candidates c
    where c.starts_at > now()
      and not exists (
        select 1
        from public.availability_exceptions e
        where e.trainer_id = v_trainer_id
          and (e.service_id is null or e.service_id = p_service_id)
          and e.kind = 'blocked'
          and c.starts_at < e.ends_at
          and c.ends_at > e.starts_at
      )
      and not exists (
        select 1
        from public.calendar_busy_blocks cb
        where cb.trainer_id = v_trainer_id
          and c.starts_at < cb.ends_at
          and c.ends_at > cb.starts_at
      )
      and not exists (
        select 1
        from public.availability_slots existing
        where existing.trainer_id = v_trainer_id
          and existing.status in ('held','booked','blocked')
          and c.starts_at < existing.ends_at
          and c.ends_at > existing.starts_at
      )
  )
  insert into public.availability_slots (trainer_id, service_id, starts_at, ends_at, status)
  select trainer_id, service_id, starts_at, ends_at, 'open'
  from filtered
  on conflict (service_id, starts_at) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke execute on function public.regenerate_service_slots(uuid, integer) from public, anon;
grant execute on function public.regenerate_service_slots(uuid, integer) to authenticated;
